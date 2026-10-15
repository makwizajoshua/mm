import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbConnection: Pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mm'
});

export default dbConnection;

