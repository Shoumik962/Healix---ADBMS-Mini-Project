// middleware/rateLimiter.js — express-rate-limit configs
import rateLimit from 'express-rate-limit';

// General API rate limit
export const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 min
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests — please try again later',
    },
});

// Stricter limit for auth endpoints
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10'),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many auth attempts — please try again in 15 minutes',
    },
});

// Very strict for password reset (not yet implemented but stubbed)
export const sensitiveActionsLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 5,
    message: {
        success: false,
        message: 'Action limit reached — please try again in an hour',
    },
});