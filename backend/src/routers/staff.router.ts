import { Router } from 'express';
import StaffController from '../controllers/staff.controller';
import requireTenant from '../middleware/tenant.middleware';

const controller = new StaffController();
export const staffRouter = Router();
staffRouter.use(requireTenant);
staffRouter.get('/:id/access', controller.getAccess.bind(controller));
staffRouter.put('/:id/access', controller.setAccess.bind(controller));
staffRouter.post('/:id/account', controller.createAccount.bind(controller));
staffRouter.delete('/:id/account', controller.removeAccount.bind(controller));
