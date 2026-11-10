import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import dbConnection from '../db/connection';
import { isStaffRole, STAFF_ROLES } from '../access/permissions';

// Only company owners manage employee logins, roles and store assignments.
function requireOwner(req: Request, res: Response): boolean {
    if (req.access?.isAdmin) return true;
    res.status(403).json({ message: 'Only company owners can manage employee accounts' });
    return false;
}

function parseId(value: unknown): number | null {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseRoles(value: unknown): string[] | null {
    if (!Array.isArray(value) || !value.length || !value.every(isStaffRole)) return null;
    return [...new Set(value as string[])];
}

function parseStoreIds(value: unknown): number[] | null {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return null;
    const ids = value.map(parseId);
    return ids.every((id): id is number => id !== null) ? [...new Set(ids)] : null;
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export default class StaffController {
    async getAccess(req: Request, res: Response): Promise<void> {
        if (!requireOwner(req, res)) return;
        const employeeId = parseId(req.params.id);
        if (!employeeId) { res.status(400).json({ message: 'A valid employee id is required' }); return; }
        try {
            const employee = await dbConnection.query<{ user_id: number | null; username: string | null }>(
                `SELECT e.user_id, u.username FROM employees e LEFT JOIN users u ON u.id = e.user_id
                 WHERE e.id = $1 AND e.tenant_id = $2`,
                [employeeId, req.tenantId],
            );
            if (!employee.rows[0]) { res.status(404).json({ message: 'Employee not found' }); return; }
            const roles = await dbConnection.query<{ name: string }>(
                'SELECT r.name FROM employee_roles er JOIN roles r ON r.id = er.role_id WHERE er.employee_id = $1 ORDER BY r.name',
                [employeeId],
            );
            const stores = await dbConnection.query<{ store_id: number }>(
                'SELECT store_id FROM employee_stores WHERE employee_id = $1 AND tenant_id = $2 ORDER BY store_id',
                [employeeId, req.tenantId],
            );
            res.json({
                hasAccount: employee.rows[0].user_id !== null,
                username: employee.rows[0].username,
                roles: roles.rows.map((row) => row.name),
                store_ids: stores.rows.map((row) => row.store_id),
                availableRoles: STAFF_ROLES,
            });
        } catch (error) {
            console.error('Read employee access error:', error);
            res.status(500).json({ message: 'Unable to load employee access' });
        }
    }

    async createAccount(req: Request, res: Response): Promise<void> {
        if (!requireOwner(req, res)) return;
        const employeeId = parseId(req.params.id);
        const { username, email, password } = req.body ?? {};
        const roles = parseRoles(req.body?.roles);
        const storeIds = parseStoreIds(req.body?.store_ids);
        if (!employeeId || typeof username !== 'string' || !username.trim() || username.trim().length > 50 ||
            typeof email !== 'string' || !email.trim() || email.trim().length > 100 ||
            typeof password !== 'string' || password.length < 8 || !roles || !storeIds) {
            res.status(400).json({
                message: 'Username, email, a password of at least 8 characters, and at least one valid role are required',
            });
            return;
        }

        const client = await dbConnection.connect();
        try {
            await client.query('BEGIN');
            const employee = await client.query<{ user_id: number | null }>(
                'SELECT user_id FROM employees WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
                [employeeId, req.tenantId],
            );
            if (!employee.rows[0]) {
                await client.query('ROLLBACK');
                res.status(404).json({ message: 'Employee not found' });
                return;
            }
            if (employee.rows[0].user_id !== null) {
                await client.query('ROLLBACK');
                res.status(409).json({ message: 'This employee already has a login' });
                return;
            }
            const user = await client.query<{ id: number }>(
                `INSERT INTO users (username, email, password, email_verified)
                 VALUES ($1, $2, $3, TRUE) RETURNING id`,
                [username.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 12)],
            );
            const userId = user.rows[0]!.id;
            await client.query('INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)', [userId, req.tenantId]);
            await client.query('UPDATE employees SET user_id = $1 WHERE id = $2', [userId, employeeId]);
            await this.writeAccess(client, req.tenantId!, employeeId, roles, storeIds);
            await client.query(
                `INSERT INTO audits (tenant_id, title, body, user_id, entity_type, entity_id, action)
                 VALUES ($1, 'Employee login created', $2::jsonb, $3, 'employees', $4, 'update')`,
                [req.tenantId, JSON.stringify({ employee_id: employeeId, roles, store_ids: storeIds }), req.user.id, String(employeeId)],
            );
            await client.query('COMMIT');
            res.status(201).json({ employee_id: employeeId, user_id: userId, username: username.trim(), roles, store_ids: storeIds });
        } catch (error) {
            await client.query('ROLLBACK');
            if (isUniqueViolation(error)) {
                res.status(409).json({ message: 'That username or email is already in use' });
                return;
            }
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
                res.status(400).json({ message: 'A store in the list does not belong to this company' });
                return;
            }
            console.error('Create employee login error:', error);
            res.status(500).json({ message: 'Unable to create the employee login' });
        } finally {
            client.release();
        }
    }

    async setAccess(req: Request, res: Response): Promise<void> {
        if (!requireOwner(req, res)) return;
        const employeeId = parseId(req.params.id);
        const roles = parseRoles(req.body?.roles);
        const storeIds = parseStoreIds(req.body?.store_ids);
        if (!employeeId || !roles || !storeIds) {
            res.status(400).json({ message: 'At least one valid role and a list of store ids are required' });
            return;
        }
        const client = await dbConnection.connect();
        try {
            await client.query('BEGIN');
            const employee = await client.query('SELECT 1 FROM employees WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [employeeId, req.tenantId]);
            if (!employee.rows[0]) {
                await client.query('ROLLBACK');
                res.status(404).json({ message: 'Employee not found' });
                return;
            }
            await this.writeAccess(client, req.tenantId!, employeeId, roles, storeIds);
            await client.query('COMMIT');
            res.json({ employee_id: employeeId, roles, store_ids: storeIds });
        } catch (error) {
            await client.query('ROLLBACK');
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
                res.status(400).json({ message: 'A store in the list does not belong to this company' });
                return;
            }
            console.error('Update employee access error:', error);
            res.status(500).json({ message: 'Unable to update employee access' });
        } finally {
            client.release();
        }
    }

    async removeAccount(req: Request, res: Response): Promise<void> {
        if (!requireOwner(req, res)) return;
        const employeeId = parseId(req.params.id);
        if (!employeeId) { res.status(400).json({ message: 'A valid employee id is required' }); return; }
        const client = await dbConnection.connect();
        try {
            await client.query('BEGIN');
            const employee = await client.query<{ user_id: number | null }>(
                'SELECT user_id FROM employees WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
                [employeeId, req.tenantId],
            );
            const userId = employee.rows[0]?.user_id;
            if (!employee.rows[0]) {
                await client.query('ROLLBACK');
                res.status(404).json({ message: 'Employee not found' });
                return;
            }
            if (userId === null || userId === undefined) {
                await client.query('ROLLBACK');
                res.status(404).json({ message: 'This employee has no login' });
                return;
            }
            await client.query('UPDATE employees SET user_id = NULL WHERE id = $1', [employeeId]);
            await client.query('DELETE FROM user_tenants WHERE user_id = $1 AND tenant_id = $2', [userId, req.tenantId]);
            await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
            await client.query('COMMIT');
            res.json({ message: 'Employee login removed' });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Remove employee login error:', error);
            res.status(500).json({ message: 'Unable to remove the employee login' });
        } finally {
            client.release();
        }
    }

    private async writeAccess(
        client: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
        tenantId: number,
        employeeId: number,
        roles: string[],
        storeIds: number[],
    ): Promise<void> {
        await client.query('DELETE FROM employee_roles WHERE employee_id = $1', [employeeId]);
        await client.query(
            `INSERT INTO employee_roles (employee_id, role_id)
             SELECT $1, id FROM roles WHERE name = ANY($2::text[])`,
            [employeeId, roles],
        );
        await client.query('DELETE FROM employee_stores WHERE employee_id = $1 AND tenant_id = $2', [employeeId, tenantId]);
        for (const storeId of storeIds) {
            await client.query(
                'INSERT INTO employee_stores (employee_id, store_id, tenant_id) VALUES ($1, $2, $3)',
                [employeeId, storeId, tenantId],
            );
        }
    }
}
