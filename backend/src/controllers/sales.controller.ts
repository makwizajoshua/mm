import type { Request, Response } from 'express';
import dbConnection from '../db/connection';

type ProductRow = { id: number; name: string; price: string };

export default class SalesController {
    async create(req: Request, res: Response): Promise<void> {
        const tenantId = req.tenantId;
        const { store_id: storeId, employee_id: employeeId, receipt_number: receipt, items, payments } = req.body ?? {};
        if (!tenantId || !isPositiveInteger(storeId) || typeof receipt !== 'string' || !receipt.trim() ||
            receipt.trim().length > 80 || !Array.isArray(items) || !items.length || items.length > 100 ||
            !Array.isArray(payments) || !payments.length) {
            res.status(400).json({ message: 'Store, receipt number, sale items, and payments are required' });
            return;
        }
        if (employeeId !== undefined && employeeId !== null && !isPositiveInteger(employeeId)) {
            res.status(400).json({ message: 'Employee must be a positive integer' });
            return;
        }
        const normalizedItems: Array<{ productId: number; quantity: number }> = [];
        for (const item of items) {
            if (!isPositiveInteger(item?.product_id) || !isPositiveInteger(item?.quantity) || Number(item.quantity) > 2147483647) {
                res.status(400).json({ message: 'Each item requires a valid product_id and positive quantity' });
                return;
            }
            normalizedItems.push({ productId: Number(item.product_id), quantity: Number(item.quantity) });
        }
        const normalizedPayments: Array<{ method: string; amountCents: number; reference: string | null }> = [];
        for (const payment of payments) {
            const amountCents = toCents(payment?.amount);
            if (typeof payment?.method !== 'string' || !payment.method.trim() || payment.method.trim().length > 30 ||
                amountCents === null || amountCents <= 0) {
                res.status(400).json({ message: 'Each payment requires a method and a positive amount' });
                return;
            }
            normalizedPayments.push({
                method: payment.method.trim(),
                amountCents,
                reference: typeof payment.reference === 'string' && payment.reference.trim()
                    ? payment.reference.trim().slice(0, 120) : null,
            });
        }

        const client = await dbConnection.connect();
        let transactionStarted = false;
        try {
            await client.query('BEGIN');
            transactionStarted = true;

            const store = await client.query('SELECT id FROM stores WHERE id = $1 AND tenant_id = $2', [storeId, tenantId]);
            if (!store.rows[0]) {
                await client.query('ROLLBACK');
                res.status(404).json({ message: 'Store not found in this company' });
                return;
            }

            const productIds = [...new Set(normalizedItems.map((item) => item.productId))].sort((a, b) => a - b);
            const products = await client.query<ProductRow>(
                'SELECT id, name, price FROM products WHERE tenant_id = $1 AND id = ANY($2::int[])',
                [tenantId, productIds],
            );
            if (products.rows.length !== productIds.length) {
                await client.query('ROLLBACK');
                res.status(400).json({ message: 'One or more products do not belong to this company' });
                return;
            }
            const productById = new Map(products.rows.map((product) => [Number(product.id), product]));
            const requiredByProduct = new Map<number, number>();
            let totalCents = 0;
            for (const item of normalizedItems) {
                const product = productById.get(item.productId);
                if (!product) throw new Error('Product lookup failed');
                const priceCents = toCents(product.price);
                if (priceCents === null) throw new Error('Invalid product price in database');
                totalCents += priceCents * item.quantity;
                requiredByProduct.set(item.productId, (requiredByProduct.get(item.productId) ?? 0) + item.quantity);
            }
            if (!Number.isSafeInteger(totalCents) || totalCents > 9999999999) {
                await client.query('ROLLBACK');
                res.status(400).json({ message: 'Sale total is too large' });
                return;
            }
            if (normalizedPayments.reduce((sum, payment) => sum + payment.amountCents, 0) !== totalCents) {
                await client.query('ROLLBACK');
                res.status(400).json({ message: 'Payment amounts must equal the sale total' });
                return;
            }

            for (const productId of productIds) {
                const stock = await client.query<{ quantity: number }>(
                    `SELECT quantity FROM stock_items
                     WHERE tenant_id = $1 AND store_id = $2 AND product_id = $3 FOR UPDATE`,
                    [tenantId, storeId, productId],
                );
                const required = requiredByProduct.get(productId) ?? 0;
                if (!stock.rows[0] || Number(stock.rows[0].quantity) < required) {
                    await client.query('ROLLBACK');
                    res.status(409).json({ message: `Insufficient stock for ${productById.get(productId)?.name ?? 'a product'}` });
                    return;
                }
            }

            const order = await client.query<{ id: number }>(
                `INSERT INTO orders (tenant_id, store_id, employee_id, receipt_number, total, status)
                 VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING id`,
                [tenantId, storeId, employeeId ?? null, receipt.trim(), (totalCents / 100).toFixed(2)],
            );
            const orderId = order.rows[0]?.id;
            if (!orderId) throw new Error('Sale insert did not return an id');

            for (const item of normalizedItems) {
                const product = productById.get(item.productId)!;
                await client.query(
                    `INSERT INTO order_items (tenant_id, order_id, product_id, product_name, quantity, price)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [tenantId, orderId, item.productId, product.name, item.quantity, product.price],
                );
            }

            for (const productId of productIds) {
                const quantity = requiredByProduct.get(productId)!;
                await client.query(
                    `UPDATE stock_items SET quantity = quantity - $1
                     WHERE tenant_id = $2 AND store_id = $3 AND product_id = $4`,
                    [quantity, tenantId, storeId, productId],
                );
                await client.query(
                    `INSERT INTO inventory_movements
                     (tenant_id, store_id, product_id, employee_id, order_id, movement_type, quantity_delta, note)
                     VALUES ($1, $2, $3, $4, $5, 'sale', $6, $7)`,
                    [tenantId, storeId, productId, employeeId ?? null, orderId, -quantity, `Receipt ${receipt.trim()}`],
                );
            }

            for (const payment of normalizedPayments) {
                const amount = (payment.amountCents / 100).toFixed(2);
                await client.query(
                    `INSERT INTO payments (tenant_id, order_id, amount, method, status, reference)
                     VALUES ($1, $2, $3, $4, 'completed', $5)`,
                    [tenantId, orderId, amount, payment.method, payment.reference],
                );
                await client.query(
                    `INSERT INTO transactions
                     (tenant_id, store_id, employee_id, order_id, recorded_by_user_id, amount, transaction_type, category, status, description)
                     VALUES ($1, $2, $3, $4, $5, $6, 'income', 'Sales', 'posted', $7)`,
                    [tenantId, storeId, employeeId ?? null, orderId, req.user.id, amount, `Sale receipt ${receipt.trim()}`],
                );
            }

            await client.query(
                `INSERT INTO audits (tenant_id, title, body, user_id, employee_id, entity_type, entity_id, action)
                 VALUES ($1, $2, $3::jsonb, $4, $5, 'sale', $6, 'create')`,
                [tenantId, `Sale recorded: ${receipt.trim()}`, JSON.stringify({ store_id: storeId, total: (totalCents / 100).toFixed(2), item_count: normalizedItems.length }), req.user.id, employeeId ?? null, String(orderId)],
            );

            await client.query('COMMIT');
            res.status(201).json({ id: orderId, receipt_number: receipt.trim(), total: (totalCents / 100).toFixed(2), status: 'completed' });
        } catch (error) {
            if (transactionStarted) await client.query('ROLLBACK');
            const code = getPostgresCode(error);
            if (code === '23505') {
                res.status(409).json({ message: 'That receipt number is already in use for this store' });
                return;
            }
            if (code === '23503' || code === '23514' || code === '22P02' || code === '22003') {
                res.status(400).json({ message: 'Sale data references an invalid company, store, or employee' });
                return;
            }
            console.error('Create sale error:', error);
            res.status(500).json({ message: 'Unable to record sale' });
        } finally {
            client.release();
        }
    }
}

function isPositiveInteger(value: unknown): boolean {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isSafeInteger(number) && number > 0;
}

function toCents(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    const cents = Math.round(number * 100);
    return Math.abs(number * 100 - cents) < 0.000001 ? cents : null;
}

function getPostgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error &&
        typeof error.code === 'string' ? error.code : undefined;
}
