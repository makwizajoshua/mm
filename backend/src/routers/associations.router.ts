import { Router } from 'express';
import AssociationController from '../controllers/association.controller';

const router = Router();

function mountAssociation(
    path: string,
    table: string,
    leftKey: string,
    rightKey: string,
): void {
    const controller = new AssociationController({ table, leftKey, rightKey });
    const routes = Router();
    routes.get('/', controller.list.bind(controller));
    routes.post('/', controller.add.bind(controller));
    routes.delete('/:leftId/:rightId', controller.remove.bind(controller));
    router.use(path, routes);
}

mountAssociation('/user-roles', 'user_roles', 'user_id', 'role_id');
mountAssociation('/user-tenants', 'user_tenants', 'user_id', 'tenant_id');
mountAssociation('/user-permissions', 'user_permissions', 'user_id', 'permission_id');
mountAssociation('/user-markets', 'user_markets', 'user_id', 'market_id');
mountAssociation('/product-categories', 'product_categories', 'product_id', 'category_id');

export default router;
