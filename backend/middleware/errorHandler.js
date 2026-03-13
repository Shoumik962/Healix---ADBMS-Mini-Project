// middleware/errorHandler.js — Global Express error handler
// Must be registered LAST in app.use() chain.
import logger from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
    // PostgreSQL-specific error codes
    const pgErrors = {
        '23505': { status: 409, message: 'Duplicate entry — resource already exists' },
        '23503': { status: 400, message: 'Referenced resource does not exist' },
        '23514': { status: 400, message: 'Value violates a check constraint' },
        '23502': { status: 400, message: 'Required field is missing' },
        '42P01': { status: 500, message: 'Database table not found' },
        'P0001': { status: 409, message: err.message },   // double booking
        'P0002': { status: 409, message: err.message },   // patient conflict
        'P0003': { status: 400, message: err.message },   // availability
        'P0004': { status: 400, message: err.message },   // blocked
        'P0005': { status: 400, message: err.message },   // cancel error
        'P0006': { status: 400, message: err.message },   // re-open completed
        'P0007': { status: 400, message: err.message },   // re-open cancelled
        'P0008': { status: 400, message: err.message },   // unapproved doctor
        'P0009': { status: 400, message: err.message },   // prescription on incomplete
        'P0010': { status: 400, message: err.message },   // invalid medication
    };

    logger.error('Unhandled error:', {
        message: err.message,
        stack: err.stack,
        code: err.code,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
    });

    if (err.code && pgErrors[err.code]) {
        const { status, message } = pgErrors[err.code];
        return res.status(status).json({
            success: false,
            message,
            timestamp: new Date().toISOString(),
        });
    }

    // Generic fallback
    res.status(err.statusCode || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
        ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
        timestamp: new Date().toISOString(),
    });
}

// 404 handler — register before errorHandler
export function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString(),
    });
}