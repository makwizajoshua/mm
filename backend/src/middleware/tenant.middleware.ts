import type { Request, Response, NextFunction } from 'express';
import dbConnection from '../db/connection';

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

    try {
        const membership = await dbConnection.query(
            'SELECT 1 FROM user_tenants WHERE user_id = $1 AND tenant_id = $2',
            [req.user.id, tenantId],
        );
        if (!membership.rows[0]) {
            res.status(403).json({ message: 'You do not have access to this company' });
            return;
        }
        req.tenantId = tenantId;
        next();
    } catch (error) {
        console.error('Company access check error:', error);
        res.status(500).json({ message: 'Unable to verify company access' });
    }
}
