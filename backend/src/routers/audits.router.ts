import { Router } from 'express';
import { AuditController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant, { authorize } from '../middleware/tenant.middleware';

const router = Router();
router.use(requireTenant);
router.use('/', authorize('audits'), resourceRouter(new AuditController()));

export default router;
