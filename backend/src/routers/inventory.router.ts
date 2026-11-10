import { Router } from 'express';
import { inventoryMovementsController, stockItemsController } from '../controllers/domain.controller';
import resourceRouter from './resource.router';
import requireTenant, { authorize } from '../middleware/tenant.middleware';
import InventoryController from '../controllers/inventory.controller';

const router = Router();
const controller = new InventoryController();
router.use(requireTenant);
router.post('/stock-adjustments', authorize('stock-adjustments'), controller.adjust.bind(controller));
router.use('/stock-items', authorize('stock-items'), resourceRouter(stockItemsController));
router.use('/inventory-movements', authorize('inventory-movements'), resourceRouter(inventoryMovementsController));

export default router;
