import type { Request, Response } from 'express';
import dbConnection from '../db/connection';

export interface AssociationSpec {
    table: string;
    leftKey: string;
    rightKey: string;
    leftParam?: string;
    rightParam?: string;
}

export default class AssociationController {
    constructor(private readonly spec: AssociationSpec) {}

    async list(req: Request, res: Response): Promise<void> {
        const filters: string[] = [];
        const values: number[] = [];
        const filterKeys = [
            { key: this.spec.leftKey, queryName: this.spec.leftParam ?? this.spec.leftKey },
            { key: this.spec.rightKey, queryName: this.spec.rightParam ?? this.spec.rightKey },
        ];
        for (const { key, queryName } of filterKeys) {
            const value = req.query[queryName];
            if (value === undefined) continue;
            const id = parseId(value);
            if (id === null) {
                res.status(400).json({ message: `${queryName} must be a positive integer` });
                return;
            }
            values.push(id);
            filters.push(`"${key}" = $${values.length}`);
        }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        try {
            const result = await dbConnection.query(
                `SELECT "${this.spec.leftKey}", "${this.spec.rightKey}"
                 FROM "${this.spec.table}" ${where}
                 ORDER BY "${this.spec.leftKey}", "${this.spec.rightKey}"`,
                values,
            );
            res.json({ data: result.rows });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async add(req: Request, res: Response): Promise<void> {
        const left = parseId(req.body?.[this.spec.leftKey]);
        const right = parseId(req.body?.[this.spec.rightKey]);
        if (left === null || right === null) {
            res.status(400).json({
                message: `${this.spec.leftKey} and ${this.spec.rightKey} must be positive integers`,
            });
            return;
        }
        try {
            const result = await dbConnection.query(
                `INSERT INTO "${this.spec.table}" ("${this.spec.leftKey}", "${this.spec.rightKey}")
                 VALUES ($1, $2)
                 ON CONFLICT ("${this.spec.leftKey}", "${this.spec.rightKey}") DO NOTHING
                 RETURNING "${this.spec.leftKey}", "${this.spec.rightKey}"`,
                [left, right],
            );
            res.status(result.rows[0] ? 201 : 200).json({
                data: result.rows[0] ?? {
                    [this.spec.leftKey]: left,
                    [this.spec.rightKey]: right,
                },
                created: result.rows.length > 0,
            });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async remove(req: Request, res: Response): Promise<void> {
        const left = parseId(req.params.leftId);
        const right = parseId(req.params.rightId);
        if (left === null || right === null) {
            res.status(400).json({ message: 'Both association ids must be positive integers' });
            return;
        }
        try {
            const result = await dbConnection.query(
                `DELETE FROM "${this.spec.table}"
                 WHERE "${this.spec.leftKey}" = $1 AND "${this.spec.rightKey}" = $2
                 RETURNING "${this.spec.leftKey}", "${this.spec.rightKey}"`,
                [left, right],
            );
            if (!result.rows[0]) {
                res.status(404).json({ message: 'Association not found' });
                return;
            }
            res.json({ data: result.rows[0] });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    private handleError(res: Response, error: unknown): void {
        if (getPostgresCode(error) === '23503') {
            res.status(404).json({ message: 'One or more referenced records do not exist' });
            return;
        }
        console.error(`Association ${this.spec.table} error:`, error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

function parseId(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function getPostgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error &&
        typeof error.code === 'string' ? error.code : undefined;
}
