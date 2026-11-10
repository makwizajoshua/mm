// Role-based access tests: employees sign in with their own login and are limited by role and store.
// Requires the API running against a seeded database (`npm run seed`).
import test from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.API_URL || 'http://localhost:3000/api'
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD || 'Employee!2026'

async function call(path, { method = 'GET', body, token, tenant } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (tenant) headers['X-Tenant-Id'] = String(tenant)
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-JSON */ }
  return { status: res.status, json }
}

async function signIn(username, password = STAFF_PASSWORD) {
  const login = await call('/auth/login', { method: 'POST', body: { username, password } })
  assert.equal(login.status, 200, `login ${username}: ${JSON.stringify(login.json)}`)
  const tenants = await call('/users/me/tenants', { token: login.json.accessToken })
  const session = { token: login.json.accessToken, tenant: tenants.json.data[0].id }
  session.access = (await call('/access', session)).json
  return session
}

const who = {}
const unique = `a${Date.now()}`

test('each seeded employee signs in and sees their own access profile', async () => {
  who.cashier = await signIn('cashier-llw')
  who.stock = await signIn('stock-llw')
  who.accounts = await signIn('accounts')
  who.manager = await signIn('manager-blz')
  who.owner = await signIn('demo-manager', process.env.SEED_PASSWORD || 'MarketMesh!2026')
  assert.deepEqual(who.cashier.access.roles, ['cashier'])
  assert.equal(who.cashier.access.isAdmin, false)
  assert.equal(who.cashier.access.employee.employeeNumber, 'EMP-002')
  assert.equal(who.cashier.access.storeIds.length, 1)
  assert.equal(who.accounts.access.storeIds, null, 'accountants are company-wide')
  assert.equal(who.owner.access.isAdmin, true)
  assert.equal(who.cashier.access.permissions.sales.write, true)
  assert.equal(who.cashier.access.permissions.transactions.read, false)
})

test('cashier: sees only assigned store data, can sell, cannot adjust stock or see finance', async () => {
  const c = who.cashier
  const stores = (await call('/stores?limit=100', c)).json.data
  assert.deepEqual(stores.map((s) => s.id), c.access.storeIds)
  const stock = (await call('/stock-items?limit=100', c)).json.data
  assert.ok(stock.length > 0 && stock.every((s) => c.access.storeIds.includes(s.store_id)))
  const orders = (await call('/orders?limit=100', c)).json.data
  assert.ok(orders.every((o) => c.access.storeIds.includes(o.store_id)))
  for (const forbidden of ['/transactions', '/payments', '/order-items', '/audits', '/employees', '/inventory-movements']) {
    assert.equal((await call(forbidden, c)).status, 403, forbidden)
  }
  assert.equal((await call('/products', { method: 'POST', ...c, body: { name: `x${unique}`, price: 1 } })).status, 403)
  const adj = await call('/stock-adjustments', { method: 'POST', ...c, body: { store_id: c.access.storeIds[0], product_id: stock[0].product_id, quantity_delta: 1, movement_type: 'adjustment' } })
  assert.equal(adj.status, 403)

  const item = stock.find((s) => s.quantity >= 2)
  const product = (await call(`/products/${item.product_id}`, c)).json
  const sale = await call('/sales', { method: 'POST', ...c, body: {
    store_id: item.store_id, receipt_number: `C-${unique}`, items: [{ product_id: item.product_id, quantity: 1 }],
    payments: [{ amount: Number(product.price).toFixed(2), method: 'cash' }],
    employee_id: 999999, // a cashier cannot sell as someone else
  } })
  assert.equal(sale.status, 201, JSON.stringify(sale.json))
  const order = (await call(`/orders?search=C-${unique}`, c)).json.data[0]
  assert.equal(order.employee_id, c.access.employee.id)

  const otherStore = (await call('/stores?limit=100', who.owner)).json.data.find((s) => !c.access.storeIds.includes(s.id))
  const elsewhere = await call('/sales', { method: 'POST', ...c, body: {
    store_id: otherStore.id, receipt_number: `D-${unique}`, items: [{ product_id: item.product_id, quantity: 1 }],
    payments: [{ amount: Number(product.price).toFixed(2), method: 'cash' }],
  } })
  assert.equal(elsewhere.status, 403, 'selling in an unassigned store must be refused')
  assert.equal((await call(`/stores/${otherStore.id}`, c)).status, 404)
})

test('stock clerk: can take stock in their store, cannot sell or see finance', async () => {
  const s = who.stock
  const stock = (await call('/stock-items?limit=100', s)).json.data
  assert.ok(stock.every((row) => s.access.storeIds.includes(row.store_id)))
  const ok = await call('/stock-adjustments', { method: 'POST', ...s, body: { store_id: stock[0].store_id, product_id: stock[0].product_id, quantity_delta: 1, movement_type: 'purchase', note: unique } })
  assert.equal(ok.status, 201, JSON.stringify(ok.json))
  const moves = (await call('/inventory-movements?limit=5', s)).json.data
  assert.ok(moves.every((m) => s.access.storeIds.includes(m.store_id)))
  const otherStore = (await call('/stores?limit=100', who.owner)).json.data.find((x) => !s.access.storeIds.includes(x.id))
  assert.equal((await call('/stock-adjustments', { method: 'POST', ...s, body: { store_id: otherStore.id, product_id: stock[0].product_id, quantity_delta: 1, movement_type: 'purchase' } })).status, 403)
  assert.equal((await call('/sales', { method: 'POST', ...s, body: { store_id: stock[0].store_id, receipt_number: `S-${unique}`, items: [{ product_id: stock[0].product_id, quantity: 1 }], payments: [{ amount: '1.00', method: 'cash' }] } })).status, 403)
  assert.equal((await call('/transactions', s)).status, 403)
})

test('accountant: reads sales and payments company-wide, records finance, cannot sell or adjust stock', async () => {
  const a = who.accounts
  assert.equal((await call('/payments', a)).status, 200)
  assert.equal((await call('/orders', a)).status, 200)
  const tx = await call('/transactions', { method: 'POST', ...a, body: { amount: 5000, transaction_type: 'expense', category: `Rent ${unique}`, description: 'Market stall rent' } })
  assert.equal(tx.status, 201, JSON.stringify(tx.json))
  assert.equal(tx.json.recorded_by_user_id, (await call('/users/me', a)).json.id)
  assert.equal((await call('/stock-adjustments', { method: 'POST', ...a, body: { store_id: 1, product_id: 1, quantity_delta: 1, movement_type: 'purchase' } })).status, 403)
  assert.equal((await call('/sales', { method: 'POST', ...a, body: {} })).status, 403)
  assert.equal((await call('/products', { method: 'POST', ...a, body: { name: `y${unique}`, price: 1 } })).status, 403)
})

test('manager: runs the catalog and finance, but cannot manage logins or company structure', async () => {
  const m = who.manager
  const p = await call('/products', { method: 'POST', ...m, body: { name: `Mgr ${unique}`, price: 100 } })
  assert.equal(p.status, 201)
  assert.equal((await call(`/products/${p.json.id}`, { method: 'DELETE', ...m })).status, 200)
  assert.equal((await call('/audits', m)).status, 200)
  assert.equal((await call('/stores', { method: 'POST', ...m, body: { location_id: 1, name: 'n', store_code: unique } })).status, 403)
  assert.equal((await call('/employees/1/account', { method: 'POST', ...m, body: { username: unique, email: `${unique}@x.test`, password: 'Passw0rd!x', roles: ['cashier'] } })).status, 403)
})

test('owner creates an employee login, which works immediately and can be revoked', async () => {
  const o = who.owner
  const emp = await call('/employees', { method: 'POST', ...o, body: { employee_number: `E-${unique}`, first_name: 'Test', last_name: 'Clerk' } })
  assert.equal(emp.status, 201, JSON.stringify(emp.json))
  const stores = (await call('/stores?limit=100', o)).json.data
  const account = (overrides) => ({ method: 'POST', ...o, body: { username: unique, email: `${unique}@x.test`, password: 'Passw0rd!x', roles: ['cashier'], ...overrides } })
  assert.equal((await call(`/employees/${emp.json.id}/account`, account({ password: 'short' }))).status, 400)
  assert.equal((await call(`/employees/${emp.json.id}/account`, account({ roles: ['superuser'] }))).status, 400)
  const made = await call(`/employees/${emp.json.id}/account`, account({ store_ids: [stores[0].id] }))
  assert.equal(made.status, 201, JSON.stringify(made.json))
  assert.equal((await call(`/employees/${emp.json.id}/account`, account({ username: `${unique}2`, email: `${unique}2@x.test` }))).status, 409)

  const me = await signIn(unique, 'Passw0rd!x')
  assert.deepEqual(me.access.storeIds, [stores[0].id])
  assert.equal((await call('/products', me)).status, 200)

  const upd = await call(`/employees/${emp.json.id}/access`, { method: 'PUT', ...o, body: { roles: ['stock_clerk'], store_ids: [stores[0].id] } })
  assert.equal(upd.status, 200)
  assert.deepEqual((await call('/access', me)).json.roles, ['stock_clerk'])
  assert.equal((await call(`/employees/${emp.json.id}/access`, o)).json.hasAccount, true)

  // Deactivating the employee blocks access straight away.
  await call(`/employees/${emp.json.id}`, { method: 'PATCH', ...o, body: { employment_status: 'terminated' } })
  assert.equal((await call('/products', { ...me })).status, 403)
  await call(`/employees/${emp.json.id}`, { method: 'PATCH', ...o, body: { employment_status: 'active' } })
  assert.equal((await call('/products', me)).status, 200)

  assert.equal((await call(`/employees/${emp.json.id}/account`, { method: 'DELETE', ...o })).status, 200)
  assert.equal((await call('/products', me)).status, 403, 'a removed login has no company access')
})

test('staff cannot reach another company', async () => {
  const reg = await call('/auth/register', { method: 'POST', body: { username: `o${unique}`, email: `o${unique}@x.test`, password: 'Sup3rSecret!', companyName: `Other ${unique}` } })
  const mine = await call('/users/me/tenants', { token: reg.json.accessToken })
  assert.equal((await call('/products', { token: who.cashier.token, tenant: mine.json.data[0].id })).status, 403)
})
