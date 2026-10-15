import 'dotenv/config'
import bcrypt from 'bcrypt'
import { Pool } from 'pg'

const username = process.env.SEED_USERNAME || 'demo-manager'
const email = process.env.SEED_EMAIL || 'demo@marketmesh.test'
const password = process.env.SEED_PASSWORD || 'MarketMesh!2026'
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL to your local development database before seeding.')
  process.exit(1)
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function one(client, query, values = []) {
  const result = await client.query(query, values)
  if (!result.rows[0]) throw new Error('Seed operation did not return a database row.')
  return result.rows[0]
}

async function named(client, table, name) {
  const returned = await client.query(
    `INSERT INTO ${table} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id`,
    [name],
  )
  if (returned.rows[0]) return returned.rows[0].id
  return one(client, `SELECT id FROM ${table} WHERE name = $1`, [name]).then((row) => row.id)
}

async function linked(client, table, leftKey, leftId, rightKey, rightId) {
  await client.query(
    `INSERT INTO ${table} (${leftKey}, ${rightKey}) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [leftId, rightId],
  )
}

const client = await pool.connect()
try {
  await client.query('BEGIN')
  const passwordHash = await bcrypt.hash(password, 12)
  const user = await one(client, `
    INSERT INTO users (username, email, password, email_verified)
    VALUES ($1, $2, $3, TRUE)
    ON CONFLICT (username) DO UPDATE SET
      email = EXCLUDED.email, password = EXCLUDED.password, email_verified = TRUE
    RETURNING id
  `, [username, email.toLowerCase(), passwordHash])

  const tenantId = await named(client, 'tenants', 'Northstar Market Co.')
  const ownerRoleId = await named(client, 'roles', 'Workspace owner')
  const managerRoleId = await named(client, 'roles', 'Store manager')
  const permissionIds = []
  for (const name of ['catalog:read', 'catalog:write', 'orders:manage', 'inventory:manage', 'users:manage']) {
    permissionIds.push(await named(client, 'permissions', name))
  }

  await linked(client, 'user_roles', 'user_id', user.id, 'role_id', ownerRoleId)
  await linked(client, 'user_roles', 'user_id', user.id, 'role_id', managerRoleId)
  await linked(client, 'user_tenants', 'user_id', user.id, 'tenant_id', tenantId)
  for (const permissionId of permissionIds) {
    await linked(client, 'user_permissions', 'user_id', user.id, 'permission_id', permissionId)
  }
  await client.query(
    'INSERT INTO admins (user_id, tenant_id) VALUES ($1, $2) ON CONFLICT (user_id, tenant_id) DO NOTHING',
    [user.id, tenantId],
  )

  const marketId = await one(client, `
    INSERT INTO markets (tenant_id, name) VALUES ($1, 'Pacific Northwest')
    ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id
  `, [tenantId]).then((row) => row.id)
  const downtownStoreId = await one(client, `
    INSERT INTO stores (market_id, name, location, longitude, latitude)
    VALUES ($1, 'Pioneer Square', '101 First Avenue, Seattle, WA', -122.3345, 47.6026)
    ON CONFLICT (market_id, name) DO UPDATE SET location = EXCLUDED.location RETURNING id
  `, [marketId]).then((row) => row.id)
  const fremontStoreId = await one(client, `
    INSERT INTO stores (market_id, name, location, longitude, latitude)
    VALUES ($1, 'Fremont Market', '3501 Fremont Avenue N, Seattle, WA', -122.3500, 47.6510)
    ON CONFLICT (market_id, name) DO UPDATE SET location = EXCLUDED.location RETURNING id
  `, [marketId]).then((row) => row.id)
  await linked(client, 'user_markets', 'user_id', user.id, 'market_id', marketId)

  const catalog = [
    ['Everyday Tote', 'Recycled cotton carryall with reinforced handles.', 24.00],
    ['Field Notes Set', 'Three pocket notebooks made from responsibly sourced paper.', 12.50],
    ['Ceramic Travel Mug', 'Double-wall ceramic mug with a splash-resistant lid.', 32.00],
    ['Canvas Market Bag', 'Roomy canvas tote for weekly market runs.', 18.00],
    ['Pour-over Kit', 'Compact dripper and reusable stainless filter.', 46.00],
    ['Alpine Water Bottle', 'Insulated stainless steel bottle, 650 ml.', 28.00],
  ]
  const products = []
  for (const [name, description, price] of catalog) {
    products.push(await one(client, `
      INSERT INTO products (tenant_id, name, description, price) VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, name) DO UPDATE SET description = EXCLUDED.description, price = EXCLUDED.price
      RETURNING id
    `, [tenantId, name, description, price]).then((row) => row.id))
  }
  const categoryIds = []
  for (const name of ['Bags & totes', 'Stationery', 'Drinkware', 'Coffee & tea']) {
    categoryIds.push(await one(client, `
      INSERT INTO categories (tenant_id, name) VALUES ($1, $2)
      ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id
    `, [tenantId, name]).then((row) => row.id))
  }
  for (const [productIndex, categoryIndexes] of [[0, [0]], [1, [1]], [2, [2]], [3, [0]], [4, [3]], [5, [2]]]) {
    for (const categoryIndex of categoryIndexes) {
      await linked(client, 'product_categories', 'product_id', products[productIndex], 'category_id', categoryIds[categoryIndex])
    }
  }

  const inventory = [
    [downtownStoreId, products[0], 18], [downtownStoreId, products[1], 4],
    [downtownStoreId, products[2], 12], [downtownStoreId, products[4], 0],
    [fremontStoreId, products[0], 6], [fremontStoreId, products[2], 3],
    [fremontStoreId, products[3], 22], [fremontStoreId, products[5], 9],
  ]
  for (const [storeId, productId, quantity] of inventory) {
    await client.query(`
      INSERT INTO stock_items (store_id, product_id, quantity) VALUES ($1, $2, $3)
      ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity
    `, [storeId, productId, quantity])
  }

  const hasOrders = await client.query('SELECT 1 FROM orders WHERE user_id = $1 LIMIT 1', [user.id])
  if (!hasOrders.rowCount) {
    const orderFixtures = [
      { storeId: downtownStoreId, status: 'completed', items: [[0, 2], [1, 1]] },
      { storeId: fremontStoreId, status: 'processing', items: [[2, 1], [3, 1]] },
      { storeId: downtownStoreId, status: 'pending', items: [[4, 1]] },
      { storeId: fremontStoreId, status: 'completed', items: [[5, 2]] },
    ]
    for (const fixture of orderFixtures) {
      const total = fixture.items.reduce((sum, [productIndex, quantity]) => {
        const item = catalog[productIndex]
        return sum + item[2] * quantity
      }, 0)
      const orderId = await one(client, `
        INSERT INTO orders (user_id, store_id, total, status) VALUES ($1, $2, $3, $4) RETURNING id
      `, [user.id, fixture.storeId, total, fixture.status]).then((row) => row.id)
      for (const [productIndex, quantity] of fixture.items) {
        await client.query(
          'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
          [orderId, products[productIndex], quantity, catalog[productIndex][2]],
        )
      }
    }
  }
  const hasTransactions = await client.query('SELECT 1 FROM transactions WHERE user_id = $1 LIMIT 1', [user.id])
  if (!hasTransactions.rowCount) {
    for (const [amount, type, status] of [[60.50, 'payment', 'completed'], [50.00, 'payment', 'completed'], [18.00, 'refund', 'pending']]) {
      await client.query('INSERT INTO transactions (user_id, amount, type, status) VALUES ($1, $2, $3, $4)', [user.id, amount, type, status])
    }
  }
  await client.query(`
    INSERT INTO audits (title, body, user_id)
    SELECT 'Demo workspace seeded', '{"source":"seed","version":1}'::jsonb, $1
    WHERE NOT EXISTS (SELECT 1 FROM audits WHERE title = 'Demo workspace seeded' AND user_id = $1)
  `, [user.id])
  await client.query('COMMIT')
  console.log(`Seeded MarketMesh demo data for ${username} (${email}).`)
} catch (error) {
  await client.query('ROLLBACK')
  console.error('Demo data seed failed. Check the database schema and DATABASE_URL.')
  console.error(error)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
