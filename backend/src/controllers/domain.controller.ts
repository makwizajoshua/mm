import ResourceController, { type ResourceSpec } from './resource.controller';
import type { Request, Response } from 'express';

function resource(spec: ResourceSpec): ResourceController {
    return new ResourceController(spec);
}

export const tenantsController = resource({
    table: 'tenants',
    fields: ['name'],
    requiredOnCreate: ['name'],
    readFields: ['created_at'],
    searchFields: ['name'],
    sortableFields: ['id', 'name', 'created_at'],
});

export const rolesController = resource({
    table: 'roles',
    fields: ['name'],
    requiredOnCreate: ['name'],
    searchFields: ['name'],
    sortableFields: ['id', 'name'],
});

export const permissionsController = resource({
    table: 'permissions',
    fields: ['name'],
    requiredOnCreate: ['name'],
    searchFields: ['name'],
    sortableFields: ['id', 'name'],
});

export const adminsController = resource({
    table: 'admins',
    fields: ['user_id', 'tenant_id'],
    requiredOnCreate: ['user_id', 'tenant_id'],
    readFields: ['created_at'],
    filterFields: ['user_id', 'tenant_id'],
    sortableFields: ['id', 'user_id', 'tenant_id', 'created_at'],
});

export const marketsController = resource({
    table: 'markets',
    fields: ['tenant_id', 'name'],
    requiredOnCreate: ['tenant_id', 'name'],
    readFields: ['created_at'],
    filterFields: ['tenant_id'],
    searchFields: ['name'],
    sortableFields: ['id', 'tenant_id', 'name', 'created_at'],
});

export const storesController = resource({
    table: 'stores',
    fields: ['market_id', 'name', 'location', 'longitude', 'latitude'],
    requiredOnCreate: ['market_id', 'name'],
    readFields: ['created_at'],
    filterFields: ['market_id'],
    searchFields: ['name', 'location'],
    sortableFields: ['id', 'market_id', 'name', 'created_at'],
});

export const productsController = resource({
    table: 'products',
    fields: ['tenant_id', 'name', 'description', 'price'],
    requiredOnCreate: ['tenant_id', 'name', 'price'],
    readFields: ['created_at'],
    filterFields: ['tenant_id'],
    searchFields: ['name', 'description'],
    sortableFields: ['id', 'tenant_id', 'name', 'price', 'created_at'],
});

export const categoriesController = resource({
    table: 'categories',
    fields: ['tenant_id', 'name'],
    requiredOnCreate: ['tenant_id', 'name'],
    readFields: ['created_at'],
    filterFields: ['tenant_id'],
    searchFields: ['name'],
    sortableFields: ['id', 'tenant_id', 'name', 'created_at'],
});

export const ordersController = resource({
    table: 'orders',
    fields: ['user_id', 'store_id', 'total', 'status'],
    requiredOnCreate: ['store_id', 'total', 'status'],
    readFields: ['created_at'],
    filterFields: ['user_id', 'store_id', 'status'],
    sortableFields: ['id', 'user_id', 'store_id', 'total', 'status', 'created_at'],
});

export const orderItemsController = resource({
    table: 'order_items',
    fields: ['order_id', 'product_id', 'quantity', 'price'],
    requiredOnCreate: ['order_id', 'product_id', 'quantity', 'price'],
    readFields: ['created_at'],
    filterFields: ['order_id', 'product_id'],
    sortableFields: ['id', 'order_id', 'product_id', 'quantity', 'price', 'created_at'],
});

export const stockItemsController = resource({
    table: 'stock_items',
    fields: ['store_id', 'product_id', 'quantity'],
    requiredOnCreate: ['store_id', 'product_id', 'quantity'],
    readFields: ['created_at'],
    filterFields: ['store_id', 'product_id'],
    sortableFields: ['id', 'store_id', 'product_id', 'quantity', 'created_at'],
});

export const transactionsController = resource({
    table: 'transactions',
    fields: ['user_id', 'amount', 'type', 'status'],
    requiredOnCreate: ['amount', 'type', 'status'],
    readFields: ['created_at'],
    filterFields: ['user_id', 'type', 'status'],
    sortableFields: ['id', 'user_id', 'amount', 'type', 'status', 'created_at'],
});

export class AuditController extends ResourceController {
    constructor() {
        super({
            table: 'audits',
            fields: ['title', 'body', 'user_id'],
            requiredOnCreate: ['title', 'body'],
            readFields: ['created_at'],
            filterFields: ['user_id'],
            searchFields: ['title'],
            sortableFields: ['id', 'title', 'user_id', 'created_at'],
            readOnly: true,
        });
    }

    override async create(req: Request, res: Response): Promise<void> {
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            res.status(400).json({ message: 'A JSON object body is required' });
            return;
        }
        req.body = { ...body, user_id: req.user.id };
        await super.create(req, res);
    }
}
