import { Router } from 'express';
import { orderItemsController, ordersController, paymentsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant, { authorize } from '../middleware/tenant.middleware';
import SalesController from '../controllers/sales.controller';

const router = Router();
const salesController = new SalesController();
router.use(requireTenant);
router.post('/sales', authorize('sales'), salesController.create.bind(salesController));
router.use('/orders', authorize('orders'), resourceRouter(ordersController));
router.use('/order-items', authorize('order-items'), resourceRouter(orderItemsController));
router.use('/payments', authorize('payments'), resourceRouter(paymentsController));

export default router;
