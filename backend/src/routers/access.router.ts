import { Router } from 'express';
import requireTenant from '../middleware/tenant.middleware';
import { permissionsFor } from '../access/permissions';

const router = Router();
router.use(requireTenant);

// What the signed-in user may do in the active company; clients use it to decide which screens to show.
router.get('/', (req, res) => {
    const access = req.access!;
    res.json({
        isAdmin: access.isAdmin,
        roles: access.roles,
        employee: access.employee,
        storeIds: access.storeIds,
        permissions: permissionsFor(access.roles, access.isAdmin),
    });
});

export default router;
