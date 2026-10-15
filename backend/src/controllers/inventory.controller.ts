import type { Request, Response } from 'express';
import dbConnection from '../db/connection';

const MOVEMENT_TYPES = ['opening', 'purchase', 'return', 'transfer_in', 'transfer_out', 'adjustment', 'damage'];

export default class InventoryController {
    async adjust(req: Request, res: Response): Promise<void> {
        const tenantId = req.tenantId;
        const { store_id: storeId, product_id: productId, quantity_delta: quantityDelta, movement_type: movementType, note } = req.body ?? {};
        if (!tenantId || !positiveInteger(storeId) || !positiveInteger(productId) ||
            !Number.isSafeInteger(Number(quantityDelta)) || Math.abs(Number(quantityDelta)) > 2147483647 || Number(quantityDelta) === 0 ||
            typeof movementType !== 'string' || !MOVEMENT_TYPES.includes(movementType) ||
            (note !== undefined && note !== null && typeof note !== 'string')) {
            res.status(400).json({ message: 'Store, product, non-zero quantity change, and valid movement type are required' });
            return;
        }
        const delta = Number(quantityDelta);
        const mustBePositive = ['opening', 'purchase', 'return', 'transfer_in'].includes(movementType);
        const mustBeNegative = ['transfer_out', 'damage'].includes(movementType);
        if ((mustBePositive && delta < 0) || (mustBeNegative && delta > 0)) {
            res.status(400).json({ message: 'Quantity change sign does not match the selected movement reason' });
            return;
        }

        const client = await dbConnection.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO stock_items (tenant_id, store_id, product_id, quantity)
                 VALUES ($1, $2, $3, 0) ON CONFLICT (store_id, product_id) DO NOTHING`,
                [tenantId, Number(storeId), Number(productId)],
            );
            const stock = await client.query<{ id: number; quantity: number }>(
                `SELECT id, quantity FROM stock_items
                 WHERE tenant_id = $1 AND store_id = $2 AND product_id = $3 FOR UPDATE`,
                [tenantId, Number(storeId), Number(productId)],
            );
            const row = stock.rows[0];
            if (!row) {
                await client.query('ROLLBACK');
                res.status(404).json({ message: 'Store or product not found in this company' });
                return;
            }
            const nextQuantity = Number(row.quantity) + delta;
            if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 0 || nextQuantity > 2147483647) {
                await client.query('ROLLBACK');
                res.status(409).json({ message: 'Stock cannot be reduced below zero' });
                return;
            }
            await client.query(
                'UPDATE stock_items SET quantity = $1 WHERE id = $2 AND tenant_id = $3',
                [nextQuantity, row.id, tenantId],
            );
            await client.query(
                `INSERT INTO inventory_movements
                 (tenant_id, store_id, product_id, movement_type, quantity_delta, note)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [tenantId, Number(storeId), Number(productId), movementType, delta, note?.trim() || null],
            );
            await client.query(
                `INSERT INTO audits (tenant_id, title, body, user_id, entity_type, entity_id, action)
                 VALUES ($1, $2, $3::jsonb, $4, 'inventory', $5, 'update')`,
                [tenantId, 'Inventory adjusted', JSON.stringify({ store_id: Number(storeId), product_id: Number(productId), quantity_delta: delta, movement_type: movementType }), req.user.id, String(row.id)],
            );
            await client.query('COMMIT');
            res.status(201).json({ store_id: Number(storeId), product_id: Number(productId), quantity: nextQuantity });
        } catch (error) {
            await client.query('ROLLBACK');
            const code = getPostgresCode(error);
            if (code === '23503' || code === '23514' || code === '22P02') {
                res.status(400).json({ message: 'Store or product is invalid for this company' });
                return;
            }
            console.error('Adjust inventory error:', error);
            res.status(500).json({ message: 'Unable to adjust inventory' });
        } finally {
            client.release();
        }
    }
}

function positiveInteger(value: unknown): boolean {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0;
}

function getPostgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error &&
        typeof error.code === 'string' ? error.code : undefined;
}
