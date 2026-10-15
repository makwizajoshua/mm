import { Router } from 'express';
import { marketsController, storesController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';

const router = Router();
router.use('/markets', resourceRouter(marketsController));
router.use('/stores', resourceRouter(storesController));

export default router;
