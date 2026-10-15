import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import dbConnection from '../db/connection';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_DAYS = 30;
const ONE_TIME_TOKEN_MINUTES = 30;

interface UserRow {
    id: number;
    username: string;
    email: string;
    password?: string;
    email_verified?: boolean;
}

export default class AuthController {
    async register(req: Request, res: Response): Promise<void> {
        const { username, email, password, companyName } = req.body ?? {};
        const companyCurrency = typeof req.body?.companyCurrency === 'string'
            ? req.body.companyCurrency.toUpperCase() : 'MWK';
        if (typeof username !== 'string' || typeof email !== 'string' ||
            typeof password !== 'string' || !username.trim() || !email.trim() ||
            typeof companyName !== 'string' || !companyName.trim() || companyName.trim().length > 100 ||
            !/^[A-Z]{3}$/.test(companyCurrency) ||
            username.trim().length > 50 || email.trim().length > 100 ||
            password.length < 8) {
            res.status(400).json({
                message: 'Company name, username, email, and a password of at least 8 characters are required',
            });
            return;
        }

        const client = await dbConnection.connect();
        try {
            await client.query('BEGIN');
            const hashedPassword = await bcrypt.hash(password, 12);
            const result = await client.query<UserRow>(
                `INSERT INTO users (username, email, password)
                 VALUES ($1, $2, $3)
                 RETURNING id, username, email, email_verified`,
                [username.trim(), email.trim().toLowerCase(), hashedPassword],
            );
            const user = result.rows[0];
            if (!user) throw new Error('User insert did not return a user');
            const tenantResult = await client.query<{ id: number }>(
                'INSERT INTO tenants (name, currency) VALUES ($1, $2) RETURNING id',
                [companyName.trim(), companyCurrency],
            );
            const tenant = tenantResult.rows[0];
            if (!tenant) throw new Error('Company insert did not return a company');
            await client.query(
                'INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)',
                [user.id, tenant.id],
            );
            await client.query(
                'INSERT INTO admins (user_id, tenant_id) VALUES ($1, $2)',
                [user.id, tenant.id],
            );
            const session = await issueSession(client, user);
            const verificationToken = await createOneTimeToken(
                client, 'email_verification_tokens', user.id,
            );
            await client.query('COMMIT');
            res.status(201).json({
                user,
                ...session,
                ...(shouldExposeOneTimeTokens() ? { emailVerificationToken: verificationToken } : {}),
            });
        } catch (error) {
            await client.query('ROLLBACK');
            if (getPostgresCode(error) === '23505') {
                res.status(409).json({ message: 'Username, email, or company name is already in use' });
                return;
            }
            console.error('Registration error:', error);
            res.status(500).json({ message: 'Internal server error' });
        } finally {
            client.release();
        }
    }

    async login(req: Request, res: Response): Promise<void> {
        const { username, email, password } = req.body ?? {};
        if ((typeof username !== 'string' && typeof email !== 'string') ||
            typeof password !== 'string' || !password) {
            res.status(400).json({ message: 'Username or email and password are required' });
            return;
        }
        try {
            const identifier = typeof email === 'string'
                ? email.trim().toLowerCase()
                : username.trim();
            const field = typeof email === 'string' ? 'email' : 'username';
            const result = await dbConnection.query<UserRow>(
                `SELECT id, username, email, password, email_verified
                 FROM users WHERE "${field}" = $1`,
                [identifier],
            );
            const user = result.rows[0];
            if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
                res.status(401).json({ message: 'Invalid credentials' });
                return;
            }
            const client = await dbConnection.connect();
            try {
                const session = await issueSession(client, user);
                res.json({ user: publicUser(user), ...session });
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    async refreshToken(req: Request, res: Response): Promise<void> {
        const { refreshToken } = req.body ?? {};
        if (typeof refreshToken !== 'string' || !refreshToken) {
            res.status(400).json({ message: 'Refresh token is required' });
            return;
        }
        const client = await dbConnection.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<{ id: number; user_id: number }>(
                `SELECT id, user_id FROM refresh_tokens
                 WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP
                 FOR UPDATE`,
                [hashToken(refreshToken)],
            );
            const stored = result.rows[0];
            if (!stored) {
                await client.query('ROLLBACK');
                res.status(401).json({ message: 'Invalid or expired refresh token' });
                return;
            }
            await client.query('DELETE FROM refresh_tokens WHERE id = $1', [stored.id]);
            const userResult = await client.query<UserRow>(
                'SELECT id, username, email FROM users WHERE id = $1',
                [stored.user_id],
            );
            const user = userResult.rows[0];
            if (!user) {
                await client.query('ROLLBACK');
                res.status(401).json({ message: 'Invalid or expired refresh token' });
                return;
            }
            const session = await issueSession(client, user);
            await client.query('COMMIT');
            res.json(session);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Refresh token error:', error);
            res.status(500).json({ message: 'Internal server error' });
        } finally {
            client.release();
        }
    }

    async logout(req: Request, res: Response): Promise<void> {
        const { refreshToken } = req.body ?? {};
        if (typeof refreshToken !== 'string' || !refreshToken) {
            res.status(400).json({ message: 'Refresh token is required' });
            return;
        }
        try {
            await dbConnection.query(
                'DELETE FROM refresh_tokens WHERE token_hash = $1',
                [hashToken(refreshToken)],
            );
            res.json({ message: 'Logged out successfully' });
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    async forgotPassword(req: Request, res: Response): Promise<void> {
        const email = req.body?.email;
        if (typeof email !== 'string' || !email.trim()) {
            res.status(400).json({ message: 'Email is required' });
            return;
        }
        try {
            const result = await dbConnection.query<{ id: number }>(
                'SELECT id FROM users WHERE email = $1',
                [email.trim().toLowerCase()],
            );
            let resetToken: string | undefined;
            if (result.rows[0]) {
                const client = await dbConnection.connect();
                try {
                    resetToken = await createOneTimeToken(
                        client, 'password_reset_tokens', result.rows[0].id,
                    );
                } finally {
                    client.release();
                }
            }
            res.json({
                message: 'If an account exists for that email, reset instructions will be sent',
                ...(resetToken && shouldExposeOneTimeTokens() ? { resetToken } : {}),
            });
        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    async resetPassword(req: Request, res: Response): Promise<void> {
        const { resetToken, newPassword } = req.body ?? {};
        if (typeof resetToken !== 'string' || !resetToken ||
            typeof newPassword !== 'string' || newPassword.length < 8) {
            res.status(400).json({
                message: 'Reset token and a new password of at least 8 characters are required',
            });
            return;
        }
        const client = await dbConnection.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<{ user_id: number }>(
                `DELETE FROM password_reset_tokens
                 WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP
                 RETURNING user_id`,
                [hashToken(resetToken)],
            );
            const userId = result.rows[0]?.user_id;
            if (!userId) {
                await client.query('ROLLBACK');
                res.status(401).json({ message: 'Invalid or expired reset token' });
                return;
            }
            const password = await bcrypt.hash(newPassword, 12);
            await client.query('UPDATE users SET password = $1 WHERE id = $2', [password, userId]);
            await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
            await client.query('COMMIT');
            res.json({ message: 'Password reset successfully' });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Reset password error:', error);
            res.status(500).json({ message: 'Internal server error' });
        } finally {
            client.release();
        }
    }

    async verifyEmail(req: Request, res: Response): Promise<void> {
        const { token } = req.body ?? {};
        if (typeof token !== 'string' || !token) {
            res.status(400).json({ message: 'Verification token is required' });
            return;
        }
        const client = await dbConnection.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<{ user_id: number }>(
                `DELETE FROM email_verification_tokens
                 WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP
                 RETURNING user_id`,
                [hashToken(token)],
            );
            const userId = result.rows[0]?.user_id;
            if (!userId) {
                await client.query('ROLLBACK');
                res.status(401).json({ message: 'Invalid or expired verification token' });
                return;
            }
            await client.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
            await client.query('COMMIT');
            res.json({ message: 'Email verified successfully' });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Email verification error:', error);
            res.status(500).json({ message: 'Internal server error' });
        } finally {
            client.release();
        }
    }

    async sendVerification(req: Request, res: Response): Promise<void> {
        const client = await dbConnection.connect();
        try {
            const result = await client.query<{ email_verified: boolean }>(
                'SELECT email_verified FROM users WHERE id = $1',
                [req.user.id],
            );
            if (!result.rows[0]) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            if (result.rows[0].email_verified) {
                res.json({ message: 'Email is already verified' });
                return;
            }
            const token = await createOneTimeToken(
                client, 'email_verification_tokens', req.user.id,
            );
            res.json({
                message: 'If email delivery is configured, verification instructions will be sent',
                ...(shouldExposeOneTimeTokens() ? { verificationToken: token } : {}),
            });
        } catch (error) {
            console.error('Send verification error:', error);
            res.status(500).json({ message: 'Internal server error' });
        } finally {
            client.release();
        }
    }
}

export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET must be configured');
    return secret;
}

export function verifyAccessToken(token: string): JwtPayload {
    const payload = jwt.verify(token, getJwtSecret());
    if (typeof payload === 'string') throw new Error('Invalid access token payload');
    return payload;
}

async function issueSession(
    client: PoolClient,
    user: UserRow,
): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        getJwtSecret(),
        { expiresIn: ACCESS_TOKEN_TTL },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 day'))`,
        [user.id, hashToken(refreshToken), REFRESH_TOKEN_DAYS],
    );
    return { accessToken, refreshToken };
}

async function createOneTimeToken(
    client: PoolClient,
    table: 'password_reset_tokens' | 'email_verification_tokens',
    userId: number,
): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await client.query(
        `INSERT INTO "${table}" (user_id, token_hash, expires_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute'))`,
        [userId, hashToken(token), ONE_TIME_TOKEN_MINUTES],
    );
    return token;
}

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function shouldExposeOneTimeTokens(): boolean {
    return process.env.NODE_ENV !== 'production' &&
        process.env.EXPOSE_AUTH_TOKENS !== 'false';
}

function publicUser(user: UserRow): Omit<UserRow, 'password'> {
    const { password: _password, ...publicFields } = user;
    return publicFields;
}

function getPostgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error &&
        typeof error.code === 'string' ? error.code : undefined;
}
