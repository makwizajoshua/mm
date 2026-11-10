export const STAFF_ROLES = ['manager', 'cashier', 'stock_clerk', 'accountant'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// Roles whose work spans every store of the company; other roles only see the
// stores they are assigned to.
export const COMPANY_WIDE_ROLES: readonly StaffRole[] = ['manager', 'accountant'];

type Rule = { read: readonly StaffRole[]; write: readonly StaffRole[] };

const everyone = STAFF_ROLES;

// Company owners (rows in `admins`) can do everything; this matrix is for employees.
export const PERMISSIONS: Record<string, Rule> = {
    products: { read: everyone, write: ['manager'] },
    categories: { read: everyone, write: ['manager'] },
    markets: { read: everyone, write: [] },
    locations: { read: everyone, write: [] },
    stores: { read: everyone, write: [] },
    employees: { read: ['manager'], write: [] },
    orders: { read: ['manager', 'cashier', 'accountant'], write: [] },
    'order-items': { read: ['manager', 'accountant'], write: [] },
    payments: { read: ['manager', 'accountant'], write: [] },
    sales: { read: [], write: ['manager', 'cashier'] },
    'stock-items': { read: ['manager', 'cashier', 'stock_clerk', 'accountant'], write: [] },
    'inventory-movements': { read: ['manager', 'stock_clerk', 'accountant'], write: [] },
    'stock-adjustments': { read: [], write: ['manager', 'stock_clerk'] },
    transactions: { read: ['manager', 'accountant'], write: ['manager', 'accountant'] },
    audits: { read: ['manager'], write: [] },
};

export function isStaffRole(value: unknown): value is StaffRole {
    return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

export function permissionsFor(roles: readonly string[], isAdmin: boolean): Record<string, { read: boolean; write: boolean }> {
    return Object.fromEntries(Object.entries(PERMISSIONS).map(([resource, rule]) => [resource, {
        read: isAdmin || roles.some((role) => (rule.read as readonly string[]).includes(role)),
        write: isAdmin || roles.some((role) => (rule.write as readonly string[]).includes(role)),
    }]));
}
