import { Router } from 'express';
import { inventoryMovementsController, stockItemsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant from '../middleware/tenant.middleware';
import InventoryController from '../controllers/inventory.controller';

const router = Router();
const controller = new InventoryController();
router.use(requireTenant);
router.post('/stock-adjustments', controller.adjust.bind(controller));
router.use('/stock-items', resourceRouter(stockItemsController));
router.use('/inventory-movements', resourceRouter(inventoryMovementsController));

export default router;
