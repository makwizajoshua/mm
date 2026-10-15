import { Router } from 'express';
import { stockItemsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';

const router = Router();
router.use('/stock-items', resourceRouter(stockItemsController));

export default router;
