# MarketMesh

MarketMesh is a multi-company business operations platform. Each subscribing company has an isolated workspace for its locations, stores, employees, catalog, stock, sales, payments, finances, and audit history.

## Features

- Company-scoped overview of sales, payments, products, and stock.
- Searchable, sortable, paginated resource tables with create, edit, details, and delete flows.
- Company locations, markets, stores, employees, products, categories, stock levels, financial transactions, and audit trail.
- Sale recording that checks stock and records sale lines, payments, finance, stock movements, and an audit event atomically.
- Company switching for users who belong to more than one workspace, with company currency formatting.
- Company membership and active-company switching.
- Registration, sign-in, refresh-token rotation, sign-out, password recovery, email verification, and profile management.
- Responsive layouts with actionable errors, loading states, and empty states.

## Run locally

Requirements: Node.js 20.19+ (or 22.12+) and PostgreSQL.

1. Create a local PostgreSQL database and apply the repository schema to a fresh database:

   ```sh
   createdb mm
   psql postgres://localhost:5432/mm -f backend/db.sql
   ```

   If your checkout has moved the schema to another path, apply that schema file instead. The schema is not automatically reset by the seed command.

   For an existing database already on the previous company schema, apply `backend/src/sql/migrations/20261015_add_company_currency.sql` instead of rerunning the create-only schema. Older schemas need a separate migration or a fresh local database.

2. Configure and start the API:

   ```sh
   cp backend/.env.example backend/.env
   # Set DATABASE_URL and replace JWT_SECRET with a long, random value.
   cd backend
   npm install
   npm run dev
   ```

   The API is available at `http://localhost:3000/api`; its public process-health endpoint is `/api/health`.

3. Seed the development company in a separate terminal:

   ```sh
   cd backend
   npm run seed
   ```

   The seed is repeatable for the demo company, catalog, inventory, and sales. `SEED_USERNAME`, `SEED_EMAIL`, and `SEED_PASSWORD` can override the development credentials.

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

## Backend contract

The frontend follows the company-scoped API documented in [backend/README.md](./backend/README.md). Protected operational requests include an `X-Tenant-Id`; the backend verifies the signed-in user belongs to that company and scopes operational records to it. Account registration creates the initial company and assigns the registering user as its administrator.

One-time email-verification and password-reset tokens are shown by the UI only when the backend exposes them (development by default). A production deployment should deliver them via an email provider and set `EXPOSE_AUTH_TOKENS=false`.
