import type { Request, Response } from 'express';
import dbConnection from '../db/connection';

export interface ResourceSpec {
    table: string;
    fields: readonly string[];
    requiredOnCreate?: readonly string[];
    readFields?: readonly string[];
    filterFields?: readonly string[];
    searchFields?: readonly string[];
    sortableFields?: readonly string[];
    readOnly?: boolean;
}

const MAX_PAGE_SIZE = 100;

export default class ResourceController {
    constructor(private readonly spec: ResourceSpec) {}

    async list(req: Request, res: Response): Promise<void> {
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = parsePositiveInteger(req.query.limit, 25);
        if (page === null || limit === null || limit > MAX_PAGE_SIZE) {
            res.status(400).json({ message: `page must be positive and limit must be between 1 and ${MAX_PAGE_SIZE}` });
            return;
        }

        const filters: string[] = [];
        const values: unknown[] = [];
        for (const field of this.spec.filterFields ?? []) {
            const value = req.query[field];
            if (typeof value !== 'string') continue;
            values.push(value);
            filters.push(`"${field}" = $${values.length}`);
        }
        const search = req.query.search;
        if (typeof search === 'string' && this.spec.searchFields?.length) {
            values.push(`%${search}%`);
            const searchParam = `$${values.length}`;
            filters.push(`(${this.spec.searchFields
                .map((field) => `"${field}" ILIKE ${searchParam}`)
                .join(' OR ')})`);
        }

        const sort = req.query.sort;
        const sortField = typeof sort === 'string' && this.spec.sortableFields?.includes(sort)
            ? sort
            : 'id';
        const direction = req.query.order === 'asc' ? 'ASC' : 'DESC';
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const offset = (page - 1) * limit;
        try {
            const count = await dbConnection.query(
                `SELECT COUNT(*)::int AS total FROM "${this.spec.table}" ${where}`,
                values,
            );
            const result = await dbConnection.query(
                `SELECT ${this.columns()} FROM "${this.spec.table}" ${where}
                 ORDER BY "${sortField}" ${direction} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
                [...values, limit, offset],
            );
            res.json({
                data: result.rows,
                pagination: { page, limit, total: count.rows[0].total },
            });
        } catch (error) {
            this.handleError(res, error, 'List');
        }
    }

    async get(req: Request, res: Response): Promise<void> {
        const id = parsePositiveInteger(req.params.id, null);
        if (id === null) {
            res.status(400).json({ message: 'A valid resource id is required' });
            return;
        }
        try {
            const result = await dbConnection.query(
                `SELECT ${this.columns()} FROM "${this.spec.table}" WHERE id = $1`,
                [id],
            );
            if (!result.rows[0]) {
                res.status(404).json({ message: 'Resource not found' });
                return;
            }
            res.json(result.rows[0]);
        } catch (error) {
            this.handleError(res, error, 'Get');
        }
    }

    async create(req: Request, res: Response): Promise<void> {
        const body = req.body as Record<string, unknown>;
        const validation = this.validateBody(body, true);
        if (validation) {
            res.status(400).json({ message: validation });
            return;
        }

        const keys = Object.keys(body);
        const values = keys.map((key) => body[key]);
        try {
            const result = await dbConnection.query(
                `INSERT INTO "${this.spec.table}" (${keys.map((key) => `"${key}"`).join(', ')})
                 VALUES (${keys.map((_, index) => `$${index + 1}`).join(', ')})
                 RETURNING ${this.columns()}`,
                values,
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            this.handleError(res, error, 'Create');
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        if (this.spec.readOnly) {
            res.status(405).json({ message: 'This resource is read-only' });
            return;
        }
        const id = parsePositiveInteger(req.params.id, null);
        const body = req.body as Record<string, unknown>;
        if (id === null) {
            res.status(400).json({ message: 'A valid resource id is required' });
            return;
        }
        const validation = this.validateBody(body, false);
        if (validation) {
            res.status(400).json({ message: validation });
            return;
        }
        const keys = Object.keys(body);
        const values = keys.map((key) => body[key]);
        values.push(id);
        try {
            const result = await dbConnection.query(
                `UPDATE "${this.spec.table}"
                 SET ${keys.map((key, index) => `"${key}" = $${index + 1}`).join(', ')}
                 WHERE id = $${values.length} RETURNING ${this.columns()}`,
                values,
            );
            if (!result.rows[0]) {
                res.status(404).json({ message: 'Resource not found' });
                return;
            }
            res.json(result.rows[0]);
        } catch (error) {
            this.handleError(res, error, 'Update');
        }
    }

    async delete(req: Request, res: Response): Promise<void> {
        if (this.spec.readOnly) {
            res.status(405).json({ message: 'This resource is read-only' });
            return;
        }
        const id = parsePositiveInteger(req.params.id, null);
        if (id === null) {
            res.status(400).json({ message: 'A valid resource id is required' });
            return;
        }
        try {
            const result = await dbConnection.query(
                `DELETE FROM "${this.spec.table}" WHERE id = $1 RETURNING ${this.columns()}`,
                [id],
            );
            if (!result.rows[0]) {
                res.status(404).json({ message: 'Resource not found' });
                return;
            }
            res.json({ message: 'Resource deleted', data: result.rows[0] });
        } catch (error) {
            this.handleError(res, error, 'Delete');
        }
    }

    protected validateBody(body: Record<string, unknown>, creating: boolean): string | null {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return 'A JSON object body is required';
        }
        const keys = Object.keys(body);
        if (!keys.length) return 'At least one field is required';
        const invalid = keys.find((key) => !this.spec.fields.includes(key));
        if (invalid) return `Field "${invalid}" cannot be written`;
        if (creating) {
            const missing = this.spec.requiredOnCreate?.find((key) =>
                body[key] === undefined || body[key] === null || body[key] === '');
            if (missing) return `Field "${missing}" is required`;
        }
        return null;
    }

    protected columns(): string {
        return [...new Set(['id', ...this.spec.fields, ...(this.spec.readFields ?? [])])]
            .map((field) => `"${field}"`).join(', ');
    }

    protected handleError(res: Response, error: unknown, operation: string): void {
        const code = getPostgresCode(error);
        if (code === '23505') {
            res.status(409).json({ message: 'A resource with these unique fields already exists' });
            return;
        }
        if (code === '23503' || code === '23514' || code === '22P02' || code === '22003') {
            res.status(400).json({ message: 'The provided values violate a database constraint' });
            return;
        }
        console.error(`${operation} ${this.spec.table} error:`, error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

function parsePositiveInteger(value: unknown, fallback: number | null): number | null {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getPostgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error &&
        typeof error.code === 'string' ? error.code : undefined;
}
