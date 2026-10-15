import { Router } from 'express';
import { AuditController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';

const router = Router();
router.use('/', resourceRouter(new AuditController()));

export default router;
