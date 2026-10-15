import { Router } from 'express';
import { orderItemsController, ordersController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';

const router = Router();
router.use('/orders', resourceRouter(ordersController));
router.use('/order-items', resourceRouter(orderItemsController));

export default router;
