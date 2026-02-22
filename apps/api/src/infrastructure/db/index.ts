import 'dotenv/config';
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import logger from '../logger';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
}

// Connection pool configuration for optimal performance
// Design requirement: min 5, max 20 connections
const pool = new Pool({
    connectionString,
    min: 5,                    // Minimum number of connections in pool
    max: 20,                   // Maximum number of connections in pool
    idleTimeoutMillis: 30000,  // Close idle connections after 30 seconds
    connectionTimeoutMillis: 2000, // Timeout for acquiring connection
});

// Log pool errors
pool.on('error', (err) => {
    logger.error('Unexpected database pool error', { error: err.message });
});

// Log pool connection events for monitoring
pool.on('connect', () => {
    logger.debug('New database connection established');
});

pool.on('remove', () => {
    logger.debug('Database connection removed from pool');
});

export const db = drizzle(pool, { schema });
