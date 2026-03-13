// middleware/validate.js — express-validator result handler
import { validationResult } from 'express-validator';
import { ApiResponse } from '../utils/apiResponse.js';

// Reads express-validator errors and returns 422 if any exist.
// Always place this AFTER your validation chain middleware.
export function validate(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return ApiResponse.validationError(
            res,
            errors.array().map(e => ({ field: e.path, message: e.msg }))
        );
    }
    next();
}