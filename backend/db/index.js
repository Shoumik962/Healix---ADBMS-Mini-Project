// =============================================================
// db/index.js — PostgreSQL Connection Pool
// Uses the `pg` library directly (no ORM).
// Exposes: pool, query(), getClient(), withTransaction()
// =============================================================

import pg from 'pg';
import logger from '../utils/logger.js';

const { Pool } = pg;

// ── Pool configuration ─────────────────────────────────────────
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'healix_db',
    user: process.env.DB_USER || 'healix_user',
    password: process.env.DB_PASSWORD,
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000'),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    // Always set search_path so healix schema is default
    options: '-c search_path=healix,public',
});

// ── Pool event listeners ───────────────────────────────────────
pool.on('connect', (client) => {
    logger.debug('New DB client connected to pool');
    // Ensure every new connection uses healix schema
    client.query("SET search_path TO healix, public").catch(err =>
        logger.error('Failed to set search_path:', err)
    );
});

pool.on('error', (err) => {
    logger.error('Unexpected DB pool error:', err);
    process.exit(1);
});

pool.on('remove', () => {
    logger.debug('DB client removed from pool');
});

// ── query() ───────────────────────────────────────────────────
// Simple wrapper for one-off queries. Auto-releases connection.
// Usage: const { rows } = await query('SELECT * FROM users WHERE id=$1', [id])
export async function query(text, params) {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug('DB query executed', {
            query: text.substring(0, 80),
            duration_ms: duration,
            rows: result.rowCount,
        });
        return result;
    } catch (err) {
        logger.error('DB query error', {
            query: text.substring(0, 80),
            params,
            error: err.message,
        });
        throw err;
    }
}

// ── getClient() ───────────────────────────────────────────────
// Returns a raw client for manual transaction control.
// IMPORTANT: caller must call client.release() when done.
// Wraps release() to log long-held clients (connection leaks).
export async function getClient() {
    const client = await pool.connect();
    const release = client.release.bind(client);
    const acquiredAt = Date.now();

    // Monkey-patch release to detect leaks
    client.release = () => {
        const held = Date.now() - acquiredAt;
        if (held > 5000) {
            logger.warn(`DB client held for ${held}ms — possible connection leak`);
        }
        return release();
    };

    return client;
}

// ── withTransaction() ─────────────────────────────────────────
// Executes a callback inside a PostgreSQL transaction.
// Automatically commits on success, rolls back on error.
// Sets session variable for audit triggers.
//
// Usage:
//   const result = await withTransaction(async (client) => {
//     await client.query('...');
//     return something;
//   }, userId);
export async function withTransaction(callback, userId = null) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Inject user context for audit triggers
        // Triggers read this via current_setting('healix.current_user_id', true)
        if (userId) {
            await client.query(
                `SELECT set_config('healix.current_user_id', $1, TRUE)`,
                [userId]
            );
        }

        const result = await callback(client);

        await client.query('COMMIT');
        return result;

    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Transaction rolled back:', {
            error: err.message,
            userId,
        });
        throw err;
    } finally {
        client.release();
    }
}

// ── callProcedure() ───────────────────────────────────────────
// Calls a PostgreSQL stored procedure that returns a JSONB OUT param.
// All our procedures follow the pattern:
//   CALL proc_name(param1, param2, ..., NULL)
// The last parameter is the OUT result.
export async function callProcedure(procName, params = [], userId = null) {
    return withTransaction(async (client) => {
        // Build: CALL proc_name($1, $2, ..., NULL)
        const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `CALL ${procName}(${placeholders ? placeholders + ', ' : ''}NULL)`;

        const { rows } = await client.query(sql, params);

        // Procedures return OUT param as p_result in row[0]
        const result = rows[0]?.p_result;

        if (!result) {
            throw new Error(`Procedure ${procName} returned no result`);
        }

        return result;
    }, userId);
}

// ── testConnection() ──────────────────────────────────────────
export async function testConnection() {
    try {
        const { rows } = await query('SELECT NOW() AS now, current_database() AS db');
        logger.info(`✅ Database connected: ${rows[0].db} at ${rows[0].now}`);
        return true;
    } catch (err) {
        logger.error('❌ Database connection failed:', err.message);
        return false;
    }
}

export default pool;