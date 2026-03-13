// routes/auth.js (v2)
import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, refreshToken, logout, logoutAll, getMe, getSessions, changePassword } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter, sensitiveActionsLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter,
    [body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/),
    body('role').isIn(['patient', 'doctor', 'admin']),
    body('first_name').trim().notEmpty(), body('last_name').trim().notEmpty(),
    body('date_of_birth').if(body('role').equals('patient')).isISO8601(),
    body('license_number').if(body('role').equals('doctor')).trim().notEmpty(),
    body('specialization_id').if(body('role').equals('doctor')).isInt({ min: 1 })],
    validate, register);

router.post('/login', authLimiter,
    [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
    validate, login);

router.post('/refresh', refreshToken);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/me', authenticate, getMe);
router.get('/sessions', authenticate, getSessions);
router.post('/change-password', authenticate, sensitiveActionsLimiter,
    [body('current_password').notEmpty(), body('new_password').isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/)],
    validate, changePassword);

export default router;