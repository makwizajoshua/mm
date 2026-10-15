import type { Request, Response } from 'express';
import ResourceController, { type ResourceSpec } from './resource.controller';

function resource(spec: ResourceSpec): ResourceController {
    return new ResourceController(spec);
}

export const tenantsController = resource({
    table: 'tenants', fields: ['name'], requiredOnCreate: ['name'],
    readFields: ['created_at'], searchFields: ['name'], sortableFields: ['id', 'name', 'created_at'],
});

export const rolesController = resource({
    table: 'roles', fields: ['name'], requiredOnCreate: ['name'],
    searchFields: ['name'], sortableFields: ['id', 'name'],
});

export const permissionsController = resource({
    table: 'permissions', fields: ['name'], requiredOnCreate: ['name'],
    searchFields: ['name'], sortableFields: ['id', 'name'],
});

export const adminsController = resource({
    table: 'admins', fields: ['user_id', 'tenant_id'], requiredOnCreate: ['user_id', 'tenant_id'],
    readFields: ['created_at'], filterFields: ['user_id', 'tenant_id'],
    sortableFields: ['id', 'user_id', 'tenant_id', 'created_at'],
});

export const marketsController = resource({
    table: 'markets', tenantScoped: true, fields: ['name'], requiredOnCreate: ['name'],
    readFields: ['created_at'], searchFields: ['name'], sortableFields: ['id', 'name', 'created_at'],
});

export const locationsController = resource({
    table: 'locations', tenantScoped: true,
    fields: ['name', 'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country_code', 'latitude', 'longitude'],
    requiredOnCreate: ['name', 'address_line1', 'city', 'country_code'],
    readFields: ['created_at'], searchFields: ['name', 'city', 'region'],
    sortableFields: ['id', 'name', 'city', 'region', 'created_at'],
});

export const storesController = resource({
    table: 'stores', tenantScoped: true,
    fields: ['market_id', 'location_id', 'name', 'store_code', 'status'],
    requiredOnCreate: ['location_id', 'name', 'store_code'],
    readFields: ['created_at'], filterFields: ['market_id', 'location_id', 'status'],
    searchFields: ['name', 'store_code'], sortableFields: ['id', 'name', 'store_code', 'status', 'created_at'],
});

export const employeesController = resource({
    table: 'employees', tenantScoped: true,
    fields: ['employee_number', 'first_name', 'last_name', 'email', 'phone', 'job_title', 'employment_status', 'hired_at'],
    requiredOnCreate: ['employee_number', 'first_name', 'last_name'],
    readFields: ['created_at', 'updated_at'], filterFields: ['employment_status'],
    searchFields: ['employee_number', 'first_name', 'last_name', 'email', 'job_title'],
    sortableFields: ['id', 'employee_number', 'first_name', 'last_name', 'employment_status', 'hired_at', 'created_at'],
});

export const productsController = resource({
    table: 'products', tenantScoped: true,
    fields: ['name', 'description', 'price'], requiredOnCreate: ['name', 'price'],
    readFields: ['created_at'], searchFields: ['name', 'description'],
    sortableFields: ['id', 'name', 'price', 'created_at'],
});

export const categoriesController = resource({
    table: 'categories', tenantScoped: true, fields: ['name'], requiredOnCreate: ['name'],
    readFields: ['created_at'], searchFields: ['name'], sortableFields: ['id', 'name', 'created_at'],
});

export const ordersController = resource({
    table: 'orders', tenantScoped: true,
    fields: ['store_id', 'employee_id', 'user_id', 'receipt_number', 'total', 'status', 'sold_at'],
    requiredOnCreate: ['store_id', 'receipt_number', 'total'],
    readFields: ['created_at'], filterFields: ['store_id', 'status'],
    searchFields: ['receipt_number'], sortableFields: ['id', 'store_id', 'receipt_number', 'total', 'status', 'sold_at'],
    readOnly: true,
});

export const orderItemsController = resource({
    table: 'order_items', tenantScoped: true,
    fields: ['order_id', 'product_id', 'product_name', 'quantity', 'price'],
    requiredOnCreate: ['order_id', 'product_id', 'product_name', 'quantity', 'price'],
    readFields: ['created_at'], filterFields: ['order_id', 'product_id'],
    sortableFields: ['id', 'order_id', 'product_id', 'quantity', 'price', 'created_at'],
    readOnly: true,
});

export const stockItemsController = resource({
    table: 'stock_items', tenantScoped: true,
    fields: ['store_id', 'product_id', 'quantity'], requiredOnCreate: ['store_id', 'product_id', 'quantity'],
    readFields: ['created_at', 'updated_at'], filterFields: ['store_id', 'product_id'],
    sortableFields: ['id', 'store_id', 'product_id', 'quantity', 'updated_at'], readOnly: true,
});

export const inventoryMovementsController = resource({
    table: 'inventory_movements', tenantScoped: true,
    fields: ['store_id', 'product_id', 'employee_id', 'order_id', 'movement_type', 'quantity_delta', 'note', 'occurred_at'],
    requiredOnCreate: ['store_id', 'product_id', 'movement_type', 'quantity_delta'],
    readFields: [], filterFields: ['store_id', 'product_id', 'movement_type'],
    searchFields: ['note'], sortableFields: ['id', 'store_id', 'product_id', 'movement_type', 'quantity_delta', 'occurred_at'],
    readOnly: true,
});

export const paymentsController = resource({
    table: 'payments', tenantScoped: true,
    fields: ['order_id', 'amount', 'method', 'status', 'reference', 'paid_at'],
    requiredOnCreate: ['order_id', 'amount', 'method'],
    readFields: [], filterFields: ['order_id', 'method', 'status'],
    sortableFields: ['id', 'order_id', 'amount', 'method', 'status', 'paid_at'],
    readOnly: true,
});

class FinanceTransactionsController extends ResourceController {
    constructor() {
        super({
            table: 'transactions', tenantScoped: true,
            fields: ['store_id', 'employee_id', 'order_id', 'amount', 'transaction_type', 'category', 'status', 'description', 'occurred_at'],
            serverManagedFields: ['recorded_by_user_id'],
            requiredOnCreate: ['amount', 'transaction_type', 'category'],
            readFields: ['created_at'], filterFields: ['store_id', 'transaction_type', 'status', 'category'],
            searchFields: ['category', 'description'],
            sortableFields: ['id', 'store_id', 'amount', 'transaction_type', 'status', 'occurred_at'],
            deletionDisabled: true,
        });
    }

    override async create(req: Request, res: Response): Promise<void> {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            res.status(400).json({ message: 'A JSON object body is required' });
            return;
        }
        req.body = { ...req.body, recorded_by_user_id: req.user.id };
        await super.create(req, res);
    }
}

export const transactionsController = new FinanceTransactionsController();

export class AuditController extends ResourceController {
    constructor() {
        super({
            table: 'audits', tenantScoped: true,
            fields: ['title', 'body', 'user_id', 'employee_id', 'entity_type', 'entity_id', 'action'],
            requiredOnCreate: ['title', 'body', 'entity_type', 'entity_id', 'action'],
            readFields: ['created_at'], filterFields: ['user_id', 'entity_type', 'action'],
            searchFields: ['title', 'entity_type', 'entity_id'],
            sortableFields: ['id', 'title', 'entity_type', 'action', 'created_at'], readOnly: true,
        });
    }

    override async create(req: Request, res: Response): Promise<void> {
        res.status(405).json({ message: 'Audit events are written by the system' });
    }
}
