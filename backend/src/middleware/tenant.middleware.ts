import type { Request, Response, NextFunction } from 'express';
import dbConnection from '../db/connection';
import { COMPANY_WIDE_ROLES, PERMISSIONS } from '../access/permissions';

export default async function requireTenant(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const rawTenantId = req.header('x-tenant-id');
    const tenantId = Number(rawTenantId);
    if (!rawTenantId || !Number.isSafeInteger(tenantId) || tenantId <= 0) {
        res.status(400).json({ message: 'A valid active company is required in the X-Tenant-Id header' });
        return;
    }

    // Several routers share the /api prefix; resolve access once per request.
    if (req.access && req.tenantId === tenantId) {
        next();
        return;
    }

    try {
        const membership = await dbConnection.query(
            'SELECT 1 FROM user_tenants WHERE user_id = $1 AND tenant_id = $2',
            [req.user.id, tenantId],
        );
        if (!membership.rows[0]) {
            res.status(403).json({ message: 'You do not have access to this company' });
            return;
        }

        const admin = await dbConnection.query(
            'SELECT 1 FROM admins WHERE user_id = $1 AND tenant_id = $2',
            [req.user.id, tenantId],
        );
        const isAdmin = Boolean(admin.rows[0]);
        const employee = await dbConnection.query<{ id: number; employment_status: string; first_name: string; last_name: string; employee_number: string }>(
            `SELECT id, employment_status, first_name, last_name, employee_number
             FROM employees WHERE user_id = $1 AND tenant_id = $2`,
            [req.user.id, tenantId],
        );
        const staff = employee.rows[0];
        if (!isAdmin && (!staff || staff.employment_status !== 'active')) {
            res.status(403).json({ message: 'Your employee account is not active for this company' });
            return;
        }

        let roles: string[] = [];
        let storeIds: number[] | null = null;
        if (staff) {
            const roleRows = await dbConnection.query<{ name: string }>(
                'SELECT r.name FROM employee_roles er JOIN roles r ON r.id = er.role_id WHERE er.employee_id = $1',
                [staff.id],
            );
            roles = roleRows.rows.map((row) => row.name);
            if (!isAdmin && !roles.some((role) => (COMPANY_WIDE_ROLES as readonly string[]).includes(role))) {
                const storeRows = await dbConnection.query<{ store_id: number }>(
                    'SELECT store_id FROM employee_stores WHERE employee_id = $1 AND tenant_id = $2',
                    [staff.id, tenantId],
                );
                storeIds = storeRows.rows.map((row) => row.store_id);
            }
        }

        req.tenantId = tenantId;
        req.access = {
            isAdmin,
            roles,
            storeIds: isAdmin ? null : storeIds,
            employee: staff ? { id: staff.id, firstName: staff.first_name, lastName: staff.last_name, employeeNumber: staff.employee_number } : null,
        };
        next();
    } catch (error) {
        console.error('Company access check error:', error);
        res.status(500).json({ message: 'Unable to verify company access' });
    }
}

/** Gate a route group on the role matrix: GET/HEAD need `read`, everything else `write`. */
export function authorize(resource: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const access = req.access;
        const rule = PERMISSIONS[resource];
        if (!access || !rule) {
            res.status(403).json({ message: 'You do not have permission to do this' });
            return;
        }
        const needed = req.method === 'GET' || req.method === 'HEAD' ? rule.read : rule.write;
        if (access.isAdmin || access.roles.some((role) => (needed as readonly string[]).includes(role))) {
            next();
            return;
        }
        res.status(403).json({ message: 'Your role does not allow this action' });
    };
}
