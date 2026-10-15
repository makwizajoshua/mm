# Backend API

The API is rooted at `/api` and uses PostgreSQL. Apply `db.sql` to a fresh
database before starting the API. For a database on the previous company schema,
apply `src/sql/migrations/20261015_add_company_currency.sql`. Older schemas need
their own migration or a fresh local database; do not rerun the create-only schema over existing tables.
Each tenant is a subscribing company; operational records are always
scoped to the selected company.

## Authentication and company setup

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create a user and their first company (`companyName`, optional `companyCurrency`) |
| POST | `/api/auth/login` | Authenticate with username or email |
| POST | `/api/auth/refresh-token` | Rotate a refresh token |
| POST | `/api/auth/logout` | Revoke a refresh token |
| GET | `/api/users/me` | Read the signed-in user's profile |
| GET | `/api/users/me/tenants` | List companies the user belongs to |
| POST | `/api/users/me/tenants` | Create another company for the signed-in user |
| PATCH / PUT | `/api/users/me` | Update the signed-in user's profile |
| DELETE | `/api/users/me` | Delete the signed-in user's account |

Protected operations require `Authorization: Bearer <accessToken>` and an
`X-Tenant-Id` header containing a company returned by `/api/users/me/tenants`.
The API verifies membership before accessing company data and applies that
company ID to reads and writes on the server. Never accept a company ID from a
request body as authorization.

Registration requires `username`, `email`, `password`, and `companyName`;
`companyCurrency` defaults to `MWK` and must be a three-letter currency code.

## Company operations

The standard resource endpoints support paginated `GET /`, `GET /:id`,
`POST /`, `PATCH /:id`, and `DELETE /:id` where writes are allowed. Lists accept
`page`, `limit` (maximum `100`), supported filters, `search`, and declared
`sort` / `order` parameters.

| Endpoint | Purpose |
| --- | --- |
| `/api/markets` | Company operating regions |
| `/api/locations` | Company addresses and geographic coordinates |
| `/api/stores` | Stores assigned to company locations and optional markets |
| `/api/employees` | Employee records and employment status |
| `/api/products` | Company product catalog and prices |
| `/api/categories` | Company product categories |
| `/api/stock-items` | Read current stock by store and product |
| `/api/inventory-movements` | Read immutable inventory history |
| `/api/orders` | Read sales and receipts |
| `/api/order-items` | Read sale line items |
| `/api/payments` | Read payment records |
| `/api/transactions` | Manage company income, expense, and transfer records |
| `/api/audits` | Read the company audit trail |

Sales must be recorded with `POST /api/sales`. The request includes a
`store_id`, unique `receipt_number`, `items` (`product_id`, `quantity`), and
`payments` (`amount`, `method`). The backend uses catalog prices, verifies
available stock and payment totals, then writes the sale, line items, stock
movements, payments, finance transactions, and audit event in one database
transaction.

Use `POST /api/stock-adjustments` to receive, transfer, correct, or write off
stock. The endpoint updates the stock balance and writes the corresponding
movement and audit events atomically. Direct writes to orders, payments, stock
balances, inventory movements, and audit events are disabled.

`GET /api/health` is a public process-health check. Set `JWT_SECRET` and
`DATABASE_URL` before starting the service. One-time password-reset and
verification tokens are only exposed outside production unless explicitly
configured; production deployments should deliver them through an email
provider.
