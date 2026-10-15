import { Router } from 'express';
import { orderItemsController, ordersController, paymentsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant from '../middleware/tenant.middleware';
import SalesController from '../controllers/sales.controller';

const router = Router();
const salesController = new SalesController();
router.use(requireTenant);
router.post('/sales', salesController.create.bind(salesController));
router.use('/orders', resourceRouter(ordersController));
router.use('/order-items', resourceRouter(orderItemsController));
router.use('/payments', resourceRouter(paymentsController));

export default router;
