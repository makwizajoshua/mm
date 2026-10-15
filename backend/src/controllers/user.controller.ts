import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import dbConnection from '../db/connection';

export default class UserController {
    async createTenant(req: Request, res: Response): Promise<void> {
        const name = req.body?.name;
        const currency = typeof req.body?.currency === 'string' ? req.body.currency.toUpperCase() : 'MWK';
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
            res.status(400).json({ message: 'A company name of 1 to 100 characters is required' });
            return;
        }
        if (!/^[A-Z]{3}$/.test(currency)) {
            res.status(400).json({ message: 'Currency must be a three-letter ISO code' });
            return;
        }
        const client = await dbConnection.connect();
        try {
            await client.query('BEGIN');
            const tenant = await client.query<{ id: number; name: string; currency: string }>(
                'INSERT INTO tenants (name, currency) VALUES ($1, $2) RETURNING id, name, currency', [name.trim(), currency],
            );
            const company = tenant.rows[0];
            if (!company) throw new Error('Company insert did not return a company');
            await client.query('INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)', [req.user.id, company.id]);
            await client.query('INSERT INTO admins (user_id, tenant_id) VALUES ($1, $2)', [req.user.id, company.id]);
            await client.query('COMMIT');
            res.status(201).json(company);
        } catch (error) {
            await client.query('ROLLBACK');
            if (isUniqueViolation(error)) {
                res.status(409).json({ message: 'A company with this name already exists' });
                return;
            }
            console.error('Create company error:', error);
            res.status(500).json({ message: 'Unable to create company' });
        } finally {
            client.release();
        }
    }

    async listTenants(req: Request, res: Response): Promise<void> {
        try {
            const result = await dbConnection.query(
                `SELECT t.id, t.name, t.currency
                 FROM tenants t
                 INNER JOIN user_tenants ut ON ut.tenant_id = t.id
                 WHERE ut.user_id = $1
                 ORDER BY t.name`,
                [req.user.id],
            );
            res.json({ data: result.rows });
        } catch (error) {
            console.error('List user companies error:', error);
            res.status(500).json({ message: 'Unable to load your companies' });
        }
    }

    async getProfile(req: Request, res: Response): Promise<void> {
        try {
            const result = await dbConnection.query(
                `SELECT id, username, email, email_verified, created_at, updated_at
                 FROM users WHERE id = $1`,
                [req.user.id],
            );
            if (!result.rows[0]) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    async updateProfile(req: Request, res: Response): Promise<void> {
        const body = req.body as Record<string, unknown>;
        const allowed = ['username', 'email', 'password'];
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            Object.keys(body).some((key) => !allowed.includes(key)) ||
            Object.keys(body).length === 0) {
            res.status(400).json({ message: 'Provide username, email, or password to update' });
            return;
        }
        for (const key of ['username', 'email', 'password']) {
            const value = body[key];
            if (value !== undefined && (typeof value !== 'string' || value.trim() === '' ||
                (key === 'password' && value.length < 8))) {
                res.status(400).json({ message: `${key} must be a non-empty string` });
                return;
            }
        }

        try {
            const values: unknown[] = [];
            const updates: string[] = [];
            for (const field of ['username', 'email', 'password'] as const) {
                const value = body[field];
                if (typeof value !== 'string') continue;
                values.push(field === 'password'
                    ? await bcrypt.hash(value, 12)
                    : field === 'email' ? value.trim().toLowerCase() : value.trim());
                updates.push(`"${field}" = $${values.length}`);
                if (field === 'email') updates.push('email_verified = FALSE');
            }
            values.push(req.user.id);
            const result = await dbConnection.query(
                `UPDATE users SET ${updates.join(', ')}
                 WHERE id = $${values.length}
                 RETURNING id, username, email, email_verified, created_at, updated_at`,
                values,
            );
            if (!result.rows[0]) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            res.json({ user: result.rows[0] });
        } catch (error) {
            if (isUniqueViolation(error)) {
                res.status(409).json({ message: 'Username or email is already in use' });
                return;
            }
            console.error('Update profile error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    async deleteProfile(req: Request, res: Response): Promise<void> {
        try {
            const result = await dbConnection.query(
                `DELETE FROM users
                 WHERE id = $1
                 RETURNING id, username, email`,
                [req.user.id],
            );
            if (!result.rows[0]) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            res.json({ message: 'Account deleted', user: result.rows[0] });
        } catch (error) {
            console.error('Delete profile error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error &&
        error.code === '23505';
}
