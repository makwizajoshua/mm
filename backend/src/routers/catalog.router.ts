import { Router } from 'express';
import { categoriesController, productsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';

const router = Router();
router.use('/products', resourceRouter(productsController));
router.use('/categories', resourceRouter(categoriesController));

export default router;
