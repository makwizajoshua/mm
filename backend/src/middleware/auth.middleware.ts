import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../controllers/auth.controller';

export default function authenticate(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const authorization = req.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
        res.status(401).json({ message: 'A bearer access token is required' });
        return;
    }
    if (!process.env.JWT_SECRET) {
        console.error('Authentication error: JWT_SECRET is not configured');
        res.status(500).json({ message: 'Authentication is not configured' });
        return;
    }
    try {
        const payload = verifyAccessToken(match[1]);
        const id = Number(payload.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            res.status(401).json({ message: 'Invalid access token' });
            return;
        }
        req.user = { id };
        next();
    } catch {
        res.status(401).json({ message: 'Invalid or expired access token' });
    }
}
