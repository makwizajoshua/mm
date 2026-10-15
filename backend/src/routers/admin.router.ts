import { Router } from 'express';
import {
    adminsController,
    permissionsController,
    rolesController,
    tenantsController,
} from '../controllers/domain.controller';
import resourceRouter from './resource.router';

const router = Router();
router.use('/tenants', resourceRouter(tenantsController));
router.use('/roles', resourceRouter(rolesController));
router.use('/permissions', resourceRouter(permissionsController));
router.use('/admins', resourceRouter(adminsController));

export default router;
