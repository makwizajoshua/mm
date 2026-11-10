import { Router } from 'express';
import { categoriesController, productsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant, { authorize } from '../middleware/tenant.middleware';

const router = Router();
router.use(requireTenant);
router.use('/products', authorize('products'), resourceRouter(productsController));
router.use('/categories', authorize('categories'), resourceRouter(categoriesController));

export default router;
