// utils/apiResponse.js — Standardised API response helpers
// All endpoints use these to ensure consistent response shape.

export const ApiResponse = {

    // 200 OK
    success(res, data = {}, message = 'Success') {
        return res.status(200).json({
            success: true,
            message,
            data,
            timestamp: new Date().toISOString(),
        });
    },

    // 201 Created
    created(res, data = {}, message = 'Resource created') {
        return res.status(201).json({
            success: true,
            message,
            data,
            timestamp: new Date().toISOString(),
        });
    },

    // 400 Bad Request
    badRequest(res, message = 'Bad request', errors = null) {
        return res.status(400).json({
            success: false,
            message,
            errors,
            timestamp: new Date().toISOString(),
        });
    },

    // 401 Unauthorized
    unauthorized(res, message = 'Unauthorized') {
        return res.status(401).json({
            success: false,
            message,
            timestamp: new Date().toISOString(),
        });
    },

    // 403 Forbidden
    forbidden(res, message = 'Forbidden — insufficient permissions') {
        return res.status(403).json({
            success: false,
            message,
            timestamp: new Date().toISOString(),
        });
    },

    // 404 Not Found
    notFound(res, message = 'Resource not found') {
        return res.status(404).json({
            success: false,
            message,
            timestamp: new Date().toISOString(),
        });
    },

    // 409 Conflict
    conflict(res, message = 'Conflict') {
        return res.status(409).json({
            success: false,
            message,
            timestamp: new Date().toISOString(),
        });
    },

    // 422 Unprocessable Entity (validation errors)
    validationError(res, errors) {
        return res.status(422).json({
            success: false,
            message: 'Validation failed',
            errors,
            timestamp: new Date().toISOString(),
        });
    },

    // 500 Internal Server Error
    serverError(res, message = 'Internal server error', err = null) {
        if (err && process.env.NODE_ENV !== 'production') {
            console.error(err);
        }
        return res.status(500).json({
            success: false,
            message,
            ...(process.env.NODE_ENV !== 'production' && err ? { debug: err.message } : {}),
            timestamp: new Date().toISOString(),
        });
    },

    // Paginated response
    paginated(res, data, pagination) {
        return res.status(200).json({
            success: true,
            data,
            pagination: {
                page: pagination.page,
                page_size: pagination.pageSize,
                total_count: pagination.totalCount,
                total_pages: Math.ceil(pagination.totalCount / pagination.pageSize),
                has_next: pagination.page * pagination.pageSize < pagination.totalCount,
                has_prev: pagination.page > 1,
            },
            timestamp: new Date().toISOString(),
        });
    },
};