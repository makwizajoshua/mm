BEGIN;

-- Employee roles used for role-based access (see src/access/permissions.ts).
INSERT INTO roles (name) VALUES ('manager'), ('cashier'), ('stock_clerk'), ('accountant')
ON CONFLICT (name) DO NOTHING;

COMMIT;
