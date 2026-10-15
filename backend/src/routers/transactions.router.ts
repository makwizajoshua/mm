import { Router } from 'express';
import { transactionsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant from '../middleware/tenant.middleware';

const router = Router();
router.use(requireTenant);
router.use('/', resourceRouter(transactionsController));

export default router;
