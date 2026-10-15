# MarketMesh

MarketMesh is a full-stack commerce operations workspace for organizations, markets, stores, products, inventory, orders, transactions, access control, and audit history.

## Features

- Overview dashboard with live sales, order, catalog, and inventory indicators.
- Searchable, sortable, paginated resource tables with create, edit, details, and delete flows.
- Organization, market, store, product, category, order, order-item, inventory, transaction, role, permission, administrator, and audit management.
- Relationship management for user roles, organizations, permissions, markets, and product categories.
- Registration, sign-in, refresh-token rotation, sign-out, password recovery, email verification, and profile management.
- Responsive layouts with actionable errors, loading states, and empty states.

## Run locally

Requirements: Node.js 20.19+ (or 22.12+) and PostgreSQL.

1. Create a local PostgreSQL database and apply the repository schema:

   ```sh
   createdb mm
   psql postgres://localhost:5432/mm -f backend/db.sql
   ```

   If your checkout has moved the schema to another path, apply that schema file instead. The schema is not automatically reset by the seed command.

2. Configure and start the API:

   ```sh
   cp backend/.env.example backend/.env
   # Set DATABASE_URL and replace JWT_SECRET with a long, random value.
   cd backend
   npm install
   npm run dev
   ```

   The API is available at `http://localhost:3000/api`; its public process-health endpoint is `/api/health`.

3. Seed the development workspace in a separate terminal:

   ```sh
   cd backend
   npm run seed
   ```

   The seed is repeatable for catalog, inventory, and relationship data. It avoids duplicating the demo user's orders or transactions on subsequent runs. `SEED_USERNAME`, `SEED_EMAIL`, and `SEED_PASSWORD` can override the development credentials.

4. Start the web app:

   ```sh
   cd frontend/mm_web_frontend
   npm install
   npm run dev
   ```

   Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The development server proxies `/api` to `http://localhost:3000`. Set `VITE_API_URL` to an absolute API URL when the API is hosted elsewhere.

## Development test account

Use this account only with a local, development database after running `npm run seed`:

| Username | Email | Password |
| --- | --- | --- |
| `demo-manager` | `demo@marketmesh.test` | `MarketMesh!2026` |

The seed script marks this demo email verified and grants the account demo workspace access. These are public sample credentials; never use the defaults on a public or production deployment. Set `SEED_PASSWORD` before seeding if the local database is shared.

## Backend contract and limitations

The frontend follows the existing API contract documented in [backend/README.md](./backend/README.md). User accounts are managed through `/api/users/me`; user association pickers use the currently authenticated account because the API does not expose a general user directory. Authorization is token-based; the current API schema does not enforce tenant-level row isolation. Deployments serving multiple customer organizations must add server-side tenant authorization before exposing shared resources.

One-time email-verification and password-reset tokens are shown by the UI only when the backend exposes them (development by default). A production deployment should deliver them via an email provider and set `EXPOSE_AUTH_TOKENS=false`.
