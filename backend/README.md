# Backend API

The API is rooted at `/api`. JSON resource endpoints return a resource or a
`{ data, pagination }` list response. Resource lists accept `page` (default
`1`), `limit` (default `25`, maximum `100`), `search` where supported, declared
database-field filters, and `sort` / `order` (`asc` or `desc`).

## Authentication

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account and issue access / refresh tokens |
| POST | `/api/auth/login` | Authenticate with username or email |
| POST | `/api/auth/refresh-token` | Rotate a refresh token |
| POST | `/api/auth/logout` | Revoke a refresh token |
| POST | `/api/auth/forgot-password` | Create a password-reset token |
| POST | `/api/auth/reset-password` | Consume a reset token and change password |
| POST | `/api/auth/verify-email` | Consume an email-verification token |
| POST | `/api/auth/send-verification` | Create a verification token for the signed-in user |
| GET | `/api/users/me` | Read the signed-in user's profile |
| PATCH / PUT | `/api/users/me` | Update the signed-in user's profile |
| DELETE | `/api/users/me` | Delete the signed-in user's account |

Set `JWT_SECRET` before using login or protected endpoints. One-time reset and
verification tokens are returned only outside production unless
`EXPOSE_AUTH_TOKENS=false`; production deployments should deliver those tokens
through an email provider before exposing the flows to users.

All resource routes below require `Authorization: Bearer <accessToken>`.

## Resources

The standard resource routes support `GET /`, `GET /:id`, `POST /`, `PUT /:id`,
`PATCH /:id`, and `DELETE /:id` unless otherwise noted.

| Endpoint | Database resource |
| --- | --- |
| `/api/tenants` | `tenants` |
| `/api/roles` | `roles` |
| `/api/permissions` | `permissions` |
| `/api/admins` | `admins` |
| `/api/markets` | `markets` |
| `/api/stores` | `stores` |
| `/api/products` | `products` |
| `/api/categories` | `categories` |
| `/api/orders` | `orders` |
| `/api/order-items` | `order_items` |
| `/api/stock-items` | `stock_items` |
| `/api/transactions` | `transactions` |
| `/api/audits` | `audits` (create and list/read only) |

Join tables are managed with `GET /api/associations/{resource}` (optionally
filtered with the corresponding foreign-key query parameters), `POST` to add a
link, and `DELETE /api/associations/{resource}/:leftId/:rightId` to remove one:
`user-roles`, `user-tenants`, `user-permissions`, `user-markets`, and
`product-categories`.

`GET /api/health` is a public process-health check. The current schema does not
define a row-level tenant authorization policy; deployments should enforce
tenant-specific access at the service or gateway layer before exposing
cross-tenant resources to multiple customer organizations.
