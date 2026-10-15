import { Router } from 'express';
import { categoriesController, productsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant from '../middleware/tenant.middleware';

const router = Router();
router.use(requireTenant);
router.use('/products', resourceRouter(productsController));
router.use('/categories', resourceRouter(categoriesController));

export default router;
