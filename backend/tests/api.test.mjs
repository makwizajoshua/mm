// End-to-end API tests. Requires the API running on API_URL (default http://localhost:3000/api)
// against a seeded database: `npm run seed`, then `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.API_URL || 'http://localhost:3000/api'
const SEED_EMAIL = process.env.SEED_EMAIL || 'demo@marketmesh.test'
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'MarketMesh!2026'

async function call(path, { method = 'GET', body, token, tenant } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (tenant) headers['X-Tenant-Id'] = String(tenant)
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-JSON body */ }
  return { status: res.status, json }
}

const is4xx = (r) => r.status >= 400 && r.status < 500
const ctx = {}
const unique = `t${Date.now()}`

test('health endpoint is public', async () => {
  const r = await call('/health')
  assert.equal(r.status, 200)
  assert.equal(r.json.status, 'ok')
})

test('login rejects bad password and unknown user', async () => {
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: SEED_EMAIL, password: 'wrong-password' } })).status, 401)
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'nobody@nowhere.test', password: 'x' } })).status, 401)
})

test('login with seeded user, profile and companies', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { email: SEED_EMAIL, password: SEED_PASSWORD } })
  assert.equal(r.status, 200)
  assert.ok(r.json.accessToken && r.json.refreshToken)
  ctx.token = r.json.accessToken
  ctx.refresh = r.json.refreshToken
  const me = await call('/users/me', { token: ctx.token })
  assert.equal(me.status, 200)
  assert.equal(me.json.email, SEED_EMAIL)
  assert.equal(me.json.password, undefined, 'password hash must not leak')
  const t = await call('/users/me/tenants', { token: ctx.token })
  assert.equal(t.status, 200)
  assert.ok(t.json.data.length >= 1)
  ctx.tenant = t.json.data[0].id
})

test('protected routes require auth and a valid tenant', async () => {
  assert.equal((await call('/products')).status, 401)
  assert.ok(is4xx(await call('/products', { token: ctx.token })), 'missing tenant header must be a 4xx')
  assert.equal((await call('/products', { token: ctx.token, tenant: 999999 })).status, 403)
})

test('refresh token rotation: old token is revoked', async () => {
  const r = await call('/auth/refresh-token', { method: 'POST', body: { refreshToken: ctx.refresh } })
  assert.equal(r.status, 200)
  ctx.token = r.json.accessToken
  const reuse = await call('/auth/refresh-token', { method: 'POST', body: { refreshToken: ctx.refresh } })
  assert.equal(reuse.status, 401)
  ctx.refresh = r.json.refreshToken
})

const listEndpoints = ['orders', 'order-items', 'payments', 'transactions', 'products', 'categories', 'stock-items', 'inventory-movements', 'employees', 'markets', 'locations', 'stores', 'audits']
for (const endpoint of listEndpoints) {
  test(`GET /${endpoint} returns a paginated list`, async () => {
    const r = await call(`/${endpoint}?limit=5&page=1`, { token: ctx.token, tenant: ctx.tenant })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.ok(Array.isArray(r.json.data))
    assert.ok(r.json.data.length <= 5)
    assert.equal(typeof r.json.pagination.total, 'number')
  })
}

test('limit is capped and sort/order are validated', async () => {
  const big = await call('/products?limit=100000', { token: ctx.token, tenant: ctx.tenant })
  assert.ok(is4xx(big) || big.json.pagination.limit <= 100)
  const inj = await call('/products?sort=id;drop%20table%20products', { token: ctx.token, tenant: ctx.tenant })
  assert.ok(inj.status === 400 || inj.status === 200)
  assert.equal((await call('/products', { token: ctx.token, tenant: ctx.tenant })).status, 200)
})

test('search narrows product results', async () => {
  const all = await call('/products?limit=100', { token: ctx.token, tenant: ctx.tenant })
  const name = all.json.data[0].name
  const r = await call(`/products?search=${encodeURIComponent(name)}`, { token: ctx.token, tenant: ctx.tenant })
  assert.equal(r.status, 200)
  assert.ok(r.json.data.some((p) => p.name === name))
})

test('product CRUD', async () => {
  const opts = { token: ctx.token, tenant: ctx.tenant }
  const created = await call('/products', { method: 'POST', ...opts, body: { name: `Test ${unique}`, price: 12.5 } })
  assert.equal(created.status, 201, JSON.stringify(created.json))
  const id = created.json.id
  assert.equal((await call(`/products/${id}`, opts)).status, 200)
  const upd = await call(`/products/${id}`, { method: 'PATCH', ...opts, body: { price: 15 } })
  assert.equal(upd.status, 200)
  assert.equal(Number(upd.json.price), 15)
  const dup = await call('/products', { method: 'POST', ...opts, body: { name: `Test ${unique}`, price: 1 } })
  assert.ok(is4xx(dup), `duplicate name should be a 4xx, got ${dup.status}`)
  const bad = await call('/products', { method: 'POST', ...opts, body: { name: `Neg ${unique}`, price: -1 } })
  assert.ok(is4xx(bad), `negative price should be a 4xx, got ${bad.status}`)
  const del = await call(`/products/${id}`, { method: 'DELETE', ...opts })
  assert.ok([200, 204].includes(del.status))
  assert.equal((await call(`/products/${id}`, opts)).status, 404)
})

test('sale: records order and reduces stock; oversell and duplicate receipt are rejected', async () => {
  const opts = { token: ctx.token, tenant: ctx.tenant }
  const stock = (await call('/stock-items?limit=100', opts)).json.data.find((s) => Number(s.quantity) >= 4)
  assert.ok(stock, 'seed should include a stock row with >=4 units')
  const product = (await call(`/products/${stock.product_id}`, opts)).json
  const price = Number(product.price)
  const sale = await call('/sales', { method: 'POST', ...opts, body: {
    store_id: stock.store_id, receipt_number: `T-${unique}`, items: [{ product_id: stock.product_id, quantity: 2 }],
    payments: [{ amount: (price * 2).toFixed(2), method: 'cash' }],
  } })
  assert.equal(sale.status, 201, JSON.stringify(sale.json))
  const after = (await call(`/stock-items/${stock.id}`, opts)).json
  assert.equal(Number(after.quantity), Number(stock.quantity) - 2)
  const over = await call('/sales', { method: 'POST', ...opts, body: {
    store_id: stock.store_id, receipt_number: `O-${unique}`, items: [{ product_id: stock.product_id, quantity: 999999 }],
    payments: [{ amount: '1.00', method: 'cash' }],
  } })
  assert.ok(is4xx(over), `oversell must be rejected, got ${over.status}`)
  const same = (await call(`/stock-items/${stock.id}`, opts)).json
  assert.equal(Number(same.quantity), Number(after.quantity), 'failed sale must not change stock')
  const dupReceipt = await call('/sales', { method: 'POST', ...opts, body: {
    store_id: stock.store_id, receipt_number: `T-${unique}`, items: [{ product_id: stock.product_id, quantity: 1 }],
    payments: [{ amount: price.toFixed(2), method: 'cash' }],
  } })
  assert.ok(is4xx(dupReceipt), `duplicate receipt must be rejected, got ${dupReceipt.status}`)
})

test('stock adjustment records a movement and refuses negative stock', async () => {
  const opts = { token: ctx.token, tenant: ctx.tenant }
  const stock = (await call('/stock-items?limit=1', opts)).json.data[0]
  const r = await call('/stock-adjustments', { method: 'POST', ...opts, body: { store_id: stock.store_id, product_id: stock.product_id, quantity_delta: 1, movement_type: 'adjustment', note: unique } })
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.json))
  const neg = await call('/stock-adjustments', { method: 'POST', ...opts, body: { store_id: stock.store_id, product_id: stock.product_id, quantity_delta: -999999, movement_type: 'adjustment' } })
  assert.ok(is4xx(neg), `negative stock must be rejected, got ${neg.status}`)
})

test('registration creates an isolated company', async () => {
  const body = { username: unique, email: `${unique}@example.test`, password: 'Sup3rSecret!', companyName: `Co ${unique}` }
  const reg = await call('/auth/register', { method: 'POST', body })
  assert.equal(reg.status, 201, JSON.stringify(reg.json))
  const token = reg.json.accessToken
  const tenants = (await call('/users/me/tenants', { token })).json.data
  assert.equal(tenants.length, 1)
  assert.equal(tenants[0].currency, undefined)
  assert.equal((await call('/products', { token, tenant: tenants[0].id })).json.pagination.total, 0)
  assert.equal((await call('/products', { token, tenant: ctx.tenant })).status, 403)
  assert.ok(is4xx(await call('/auth/register', { method: 'POST', body: { ...body, companyName: `Co2 ${unique}` } })), 'duplicate username')
  assert.equal((await call('/auth/register', { method: 'POST', body: { ...body, username: `${unique}b`, email: `${unique}b@example.test`, password: 'short' } })).status, 400)
  ctx.other = { token, tenant: tenants[0].id }
})

test('logout revokes the refresh token', async () => {
  const r = await call('/auth/logout', { method: 'POST', body: { refreshToken: ctx.refresh } })
  assert.ok([200, 204].includes(r.status))
  assert.equal((await call('/auth/refresh-token', { method: 'POST', body: { refreshToken: ctx.refresh } })).status, 401)
})

test('profile update and account deletion', async () => {
  const upd = await call('/users/me', { method: 'PATCH', token: ctx.other.token, body: { email: `${unique}new@example.test` } })
  assert.equal(upd.status, 200, JSON.stringify(upd.json))
  const del = await call('/users/me', { method: 'DELETE', token: ctx.other.token })
  assert.ok([200, 204].includes(del.status), JSON.stringify(del.json))
})

test('Malawi-only: companies have no currency and locations only carry town details', async () => {
  const opts = { token: ctx.token, tenant: ctx.tenant }
  const tenants = (await call('/users/me/tenants', { token: ctx.token })).json.data
  assert.equal(tenants[0].currency, undefined)
  const loc = (await call('/locations?limit=1', opts)).json.data[0]
  for (const gone of ['country_code', 'postal_code', 'latitude', 'longitude', 'address_line2']) assert.equal(loc[gone], undefined, gone)
  const created = await call('/locations', { method: 'POST', ...opts, body: { name: `Mzuzu ${unique}`, address_line1: 'Main Street', city: 'Mzuzu', region: 'Northern' } })
  assert.equal(created.status, 201, JSON.stringify(created.json))
  assert.equal((await call(`/locations/${created.json.id}`, { method: 'DELETE', ...opts })).status < 300, true)
})
