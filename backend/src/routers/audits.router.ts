import { Router } from 'express';
import { AuditController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant from '../middleware/tenant.middleware';

const router = Router();
router.use(requireTenant);
router.use('/', resourceRouter(new AuditController()));

export default router;
