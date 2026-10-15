import { Router } from 'express';
import { transactionsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';

const router = Router();
router.use('/', resourceRouter(transactionsController));

export default router;
