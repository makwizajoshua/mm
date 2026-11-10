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
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function one(client, query, values = []) {
  const result = await client.query(query, values)
  if (!result.rows[0]) throw new Error('Seed operation did not return a database row.')
  return result.rows[0]
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

  const tenant = await one(client, `
    INSERT INTO tenants (name) VALUES ('Northstar Market Co.')
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id
  `)
  const tenantId = tenant.id
  await client.query('INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, tenantId])
  await client.query('INSERT INTO admins (user_id, tenant_id) VALUES ($1, $2) ON CONFLICT (user_id, tenant_id) DO NOTHING', [user.id, tenantId])

  const market = await one(client, `
    INSERT INTO markets (tenant_id, name) VALUES ($1, 'Central & Southern Malawi')
    ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id
  `, [tenantId])

  const locationIds = []
  for (const location of [
    ['Area 3 Market', 'Area 3 Main Road', 'Lilongwe', 'Central'],
    ['Limbe Market', 'Livingstone Avenue, Limbe', 'Blantyre', 'Southern'],
  ]) {
    locationIds.push(await one(client, `
      INSERT INTO locations (tenant_id, name, address_line1, city, region)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, name) DO UPDATE SET address_line1 = EXCLUDED.address_line1
      RETURNING id
    `, [tenantId, ...location]).then((row) => row.id))
  }

  const stores = []
  for (const [code, name, locationId] of [
    ['LLW-001', 'Area 3 Store', locationIds[0]],
    ['BLZ-001', 'Limbe Market Store', locationIds[1]],
  ]) {
    stores.push(await one(client, `
      INSERT INTO stores (tenant_id, market_id, location_id, name, store_code)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, store_code) DO UPDATE SET location_id = EXCLUDED.location_id, name = EXCLUDED.name
      RETURNING id
    `, [tenantId, market.id, locationId, name, code]).then((row) => row.id))
  }

  const employee = await one(client, `
    INSERT INTO employees (tenant_id, employee_number, first_name, last_name, job_title)
    VALUES ($1, 'EMP-001', 'Chikondi', 'Banda', 'Store manager')
    ON CONFLICT (tenant_id, employee_number) DO UPDATE SET job_title = EXCLUDED.job_title
    RETURNING id
  `, [tenantId])
  for (const storeId of stores) {
    await client.query(`
      INSERT INTO employee_stores (employee_id, store_id, tenant_id) VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [employee.id, storeId, tenantId])
  }

  // Demo employee logins, one per role. Staff roles limited to a store only see that store.
  await client.query(`INSERT INTO roles (name) VALUES ('manager'), ('cashier'), ('stock_clerk'), ('accountant') ON CONFLICT (name) DO NOTHING`)
  const staffPassword = process.env.SEED_STAFF_PASSWORD || 'Employee!2026'
  const staffHash = await bcrypt.hash(staffPassword, 12)
  for (const [number, first, last, title, login, role, storeIndexes] of [
    ['EMP-002', 'Mphatso', 'Phiri', 'Cashier', 'cashier-llw', 'cashier', [0]],
    ['EMP-003', 'Tiwonge', 'Mwale', 'Stock clerk', 'stock-llw', 'stock_clerk', [0]],
    ['EMP-004', 'Grace', 'Kachingwe', 'Accountant', 'accounts', 'accountant', []],
    ['EMP-005', 'Yamikani', 'Chirwa', 'Store manager', 'manager-blz', 'manager', [1]],
  ]) {
    const staffUser = await one(client, `
      INSERT INTO users (username, email, password, email_verified) VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password RETURNING id
    `, [login, `${login}@marketmesh.test`, staffHash])
    await client.query('INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [staffUser.id, tenantId])
    const staff = await one(client, `
      INSERT INTO employees (tenant_id, user_id, employee_number, first_name, last_name, job_title)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id
    `, [tenantId, staffUser.id, number, first, last, title])
    await client.query(`INSERT INTO employee_roles (employee_id, role_id) SELECT $1, id FROM roles WHERE name = $2 ON CONFLICT DO NOTHING`, [staff.id, role])
    for (const index of storeIndexes) {
      await client.query('INSERT INTO employee_stores (employee_id, store_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [staff.id, stores[index], tenantId])
    }
  }

  const catalog = [
    ['Everyday Tote', 'Recycled cotton carryall with reinforced handles.', 18000.00],
    ['Field Notes Set', 'Three pocket notebooks made from responsibly sourced paper.', 9500.00],
    ['Ceramic Travel Mug', 'Double-wall ceramic mug with a splash-resistant lid.', 24000.00],
    ['Canvas Market Bag', 'Roomy canvas tote for weekly market runs.', 13500.00],
    ['Pour-over Kit', 'Compact dripper and reusable stainless filter.', 35000.00],
    ['Alpine Water Bottle', 'Insulated stainless steel bottle, 650 ml.', 21000.00],
  ]
  const products = []
  for (const [name, description, price] of catalog) {
    products.push(await one(client, `
      INSERT INTO products (tenant_id, name, description, price) VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, name) DO UPDATE SET description = EXCLUDED.description, price = EXCLUDED.price
      RETURNING id
    `, [tenantId, name, description, price]).then((row) => row.id))
  }

  const categories = []
  for (const name of ['Bags & totes', 'Stationery', 'Drinkware', 'Coffee & tea']) {
    categories.push(await one(client, `
      INSERT INTO categories (tenant_id, name) VALUES ($1, $2)
      ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id
    `, [tenantId, name]).then((row) => row.id))
  }
  for (const [productIndex, categoryIndex] of [[0, 0], [1, 1], [2, 2], [3, 0], [4, 3], [5, 2]]) {
    await client.query(`
      INSERT INTO product_categories (tenant_id, product_id, category_id) VALUES ($1, $2, $3)
      ON CONFLICT (product_id, category_id) DO NOTHING
    `, [tenantId, products[productIndex], categories[categoryIndex]])
  }

  const stockLevels = [
    [stores[0], products[0], 18], [stores[0], products[1], 4], [stores[0], products[2], 12], [stores[0], products[4], 2],
    [stores[1], products[0], 6], [stores[1], products[2], 3], [stores[1], products[3], 22], [stores[1], products[5], 9],
  ]
  for (const [storeId, productId, quantity] of stockLevels) {
    await client.query(`
      INSERT INTO stock_items (tenant_id, store_id, product_id, quantity) VALUES ($1, $2, $3, $4)
      ON CONFLICT (store_id, product_id) DO NOTHING
    `, [tenantId, storeId, productId, quantity])
  }

  const existingSales = await client.query('SELECT 1 FROM orders WHERE tenant_id = $1 LIMIT 1', [tenantId])
  if (!existingSales.rowCount) {
    const fixtures = [
      { store: stores[0], receipt: 'DEMO-1001', items: [[0, 2], [1, 1]] },
      { store: stores[1], receipt: 'DEMO-1002', items: [[2, 1], [3, 1]] },
      { store: stores[0], receipt: 'DEMO-1003', items: [[4, 1]] },
      { store: stores[1], receipt: 'DEMO-1004', items: [[5, 2]] },
    ]
    for (const fixture of fixtures) {
      const total = fixture.items.reduce((sum, [index, quantity]) => sum + catalog[index][2] * quantity, 0)
      const sale = await one(client, `
        INSERT INTO orders (tenant_id, store_id, employee_id, receipt_number, total, status)
        VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING id
      `, [tenantId, fixture.store, employee.id, fixture.receipt, total])
      for (const [index, quantity] of fixture.items) {
        const productId = products[index]
        await client.query(`
          INSERT INTO order_items (tenant_id, order_id, product_id, product_name, quantity, price)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [tenantId, sale.id, productId, catalog[index][0], quantity, catalog[index][2]])
        await client.query(`
          UPDATE stock_items SET quantity = quantity - $1
          WHERE tenant_id = $2 AND store_id = $3 AND product_id = $4
        `, [quantity, tenantId, fixture.store, productId])
        await client.query(`
          INSERT INTO inventory_movements (tenant_id, store_id, product_id, employee_id, order_id, movement_type, quantity_delta, note)
          VALUES ($1, $2, $3, $4, $5, 'sale', $6, $7)
        `, [tenantId, fixture.store, productId, employee.id, sale.id, -quantity, `Receipt ${fixture.receipt}`])
      }
      await client.query(`
        INSERT INTO payments (tenant_id, order_id, amount, method, status)
        VALUES ($1, $2, $3, 'card', 'completed')
      `, [tenantId, sale.id, total])
      await client.query(`
        INSERT INTO transactions (tenant_id, store_id, employee_id, order_id, recorded_by_user_id, amount, transaction_type, category, status, description)
        VALUES ($1, $2, $3, $4, $5, $6, 'income', 'Sales', 'posted', $7)
      `, [tenantId, fixture.store, employee.id, sale.id, user.id, total, `Sale receipt ${fixture.receipt}`])
      await client.query(`
        INSERT INTO audits (tenant_id, title, body, user_id, employee_id, entity_type, entity_id, action)
        VALUES ($1, $2, $3::jsonb, $4, $5, 'sale', $6, 'create')
      `, [tenantId, `Sale recorded: ${fixture.receipt}`, JSON.stringify({ total }), user.id, employee.id, String(sale.id)])
    }
  }

  await client.query('COMMIT')
  console.log(`Seeded MarketMesh demo company and data for ${username} (${email}).`)
  console.log(`Staff logins (password "${staffPassword}"): cashier-llw, stock-llw, accounts, manager-blz`)
} catch (error) {
  await client.query('ROLLBACK')
  console.error('Demo data seed failed. Check the database schema and DATABASE_URL.')
  console.error(error)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
