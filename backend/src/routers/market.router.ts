import { Router } from 'express';
import { employeesController, locationsController, marketsController, storesController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant from '../middleware/tenant.middleware';

const router = Router();
router.use(requireTenant);
router.use('/markets', resourceRouter(marketsController));
router.use('/locations', resourceRouter(locationsController));
router.use('/stores', resourceRouter(storesController));
router.use('/employees', resourceRouter(employeesController));

export default router;
