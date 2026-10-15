import express, { type Express } from 'express';
import dotenv from 'dotenv';
import authRouter from './routers/auth.router';
import usersRouter from './routers/users.router';
import adminRouter from './routers/admin.router';
import marketRouter from './routers/market.router';
import catalogRouter from './routers/catalog.router';
import ordersRouter from './routers/orders.router';
import inventoryRouter from './routers/inventory.router';
import transactionsRouter from './routers/transactions.router';
import auditsRouter from './routers/audits.router';
import associationsRouter from './routers/associations.router';
import authenticate from './middleware/auth.middleware';

dotenv.config();

const app: Express = express();
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);

app.use('/api/users', authenticate, usersRouter);
app.use('/api', authenticate, adminRouter);
app.use('/api', authenticate, marketRouter);
app.use('/api', authenticate, catalogRouter);
app.use('/api', authenticate, ordersRouter);
app.use('/api', authenticate, inventoryRouter);
app.use('/api/transactions', authenticate, transactionsRouter);
app.use('/api/audits', authenticate, auditsRouter);
app.use('/api/associations', authenticate, associationsRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled request error:', error);
    res.status(500).json({ message: 'Internal server error' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Server is running on port ${port}`));