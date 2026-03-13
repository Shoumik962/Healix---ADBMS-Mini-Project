// middleware/auth.js — JWT verification + RBAC middleware
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';
import { ApiResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

// ── authenticate ──────────────────────────────────────────────
// Verifies the JWT access token from Authorization header.
// Attaches decoded user to req.user.
// Also validates the user is still active in DB (not suspended).
export async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            return ApiResponse.unauthorized(res, 'No token provided');
        }

        const token = authHeader.split(' ')[1];

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return ApiResponse.unauthorized(res, 'Token expired');
            }
            return ApiResponse.unauthorized(res, 'Invalid token');
        }

        // Verify user still exists and is active (detect suspended accounts)
        const { rows } = await query(
            `SELECT u.id, u.email, u.is_active, u.role_id,
              r.name AS role
       FROM   users u
       JOIN   roles r ON u.role_id = r.id
       WHERE  u.id = $1`,
            [decoded.userId]
        );

        if (!rows.length || !rows[0].is_active) {
            return ApiResponse.unauthorized(res, 'Account not found or suspended');
        }

        // Attach full user context to request
        req.user = {
            id: rows[0].id,
            email: rows[0].email,
            role: rows[0].role,       // 'patient' | 'doctor' | 'admin'
            roleId: rows[0].role_id,
        };

        next();
    } catch (err) {
        logger.error('Auth middleware error:', err);
        return ApiResponse.serverError(res, 'Authentication error', err);
    }
}

// ── authorize(...roles) ───────────────────────────────────────
// Role-based access control middleware factory.
// Usage: router.get('/admin-only', authenticate, authorize('admin'), handler)
// Usage: router.get('/doc-or-admin', authenticate, authorize('doctor','admin'), handler)
export function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return ApiResponse.unauthorized(res);
        }

        if (!allowedRoles.includes(req.user.role)) {
            logger.warn('Forbidden access attempt', {
                userId: req.user.id,
                userRole: req.user.role,
                requiredRoles: allowedRoles,
                path: req.path,
            });
            return ApiResponse.forbidden(
                res,
                `Access restricted to: ${allowedRoles.join(', ')}`
            );
        }

        next();
    };
}

// ── optionalAuth ──────────────────────────────────────────────
// Like authenticate but doesn't reject if no token present.
// Attaches req.user if valid token provided, else req.user = null.
export async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        const { rows } = await query(
            `SELECT u.id, u.email, u.is_active, r.name AS role
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
            [decoded.userId]
        );

        req.user = rows.length && rows[0].is_active ? rows[0] : null;
    } catch {
        req.user = null;
    }

    next();
}

// ── requireOwnership ──────────────────────────────────────────
// Ensures the requesting user owns the resource, OR is an admin.
// Designed for routes like GET /patients/:patientId
// Usage: router.get('/:id', authenticate, requireOwnership('patientId'), handler)
//
// The resolver param is a function: (req) => userId to compare against.
export function requireOwnership(paramName, resolver = null) {
    return async (req, res, next) => {
        if (!req.user) return ApiResponse.unauthorized(res);

        // Admins bypass ownership checks
        if (req.user.role === 'admin') return next();

        let targetUserId;

        if (resolver) {
            try {
                targetUserId = await resolver(req);
            } catch (err) {
                return ApiResponse.serverError(res, 'Ownership check failed', err);
            }
        } else {
            // Default: compare req.params[paramName] directly to req.user.id
            targetUserId = req.params[paramName];
        }

        if (!targetUserId || targetUserId !== req.user.id) {
            return ApiResponse.forbidden(res, 'You do not have access to this resource');
        }

        next();
    };
}