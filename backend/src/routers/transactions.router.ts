import { Router } from 'express';
import { transactionsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant, { authorize } from '../middleware/tenant.middleware';

const router = Router();
router.use(requireTenant);
router.use('/', authorize('transactions'), resourceRouter(transactionsController));

export default router;
