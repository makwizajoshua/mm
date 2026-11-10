import { Router } from 'express';
import { staffRouter } from './staff.router';
import { employeesController, locationsController, marketsController, storesController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant, { authorize } from '../middleware/tenant.middleware';

const router = Router();
router.use(requireTenant);
router.use('/markets', authorize('markets'), resourceRouter(marketsController));
router.use('/locations', authorize('locations'), resourceRouter(locationsController));
router.use('/stores', authorize('stores'), resourceRouter(storesController));
router.use('/employees', staffRouter);
router.use('/employees', authorize('employees'), resourceRouter(employeesController));

export default router;
