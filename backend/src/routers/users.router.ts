import { Router } from 'express';
import UserController from '../controllers/user.controller';

const router = Router();
const controller = new UserController();

router.get('/me', controller.getProfile.bind(controller));
router.get('/me/tenants', controller.listTenants.bind(controller));
router.post('/me/tenants', controller.createTenant.bind(controller));
router.patch('/me', controller.updateProfile.bind(controller));
router.put('/me', controller.updateProfile.bind(controller));
router.delete('/me', controller.deleteProfile.bind(controller));

export default router;
