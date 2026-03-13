// controllers/authController.js (v2 - uses authService)
import { ApiResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';
import * as authService from '../services/authService.js';
import { query } from '../db/index.js';

const COOKIE_OPTS = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/v1/auth',
});

export async function register(req, res, next) {
  try {
    const result = await authService.registerUser(req.body);
    return ApiResponse.created(res, {
      user_id: result.userId, profile_id: result.profileId, role: result.role,
      message: result.role === 'doctor'
        ? 'Account created. Pending admin approval.'
        : 'Account created successfully.',
    });
  } catch (err) { next(err); }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await authService.findUserForAuth(email);
    if (!user) return ApiResponse.unauthorized(res, 'Invalid email or password');

    const valid = await authService.verifyPassword(password, user.password_hash);
    if (!valid) { logger.warn('Failed login', { email, ip: req.ip }); return ApiResponse.unauthorized(res, 'Invalid email or password'); }
    if (!user.is_active) return ApiResponse.unauthorized(res, 'Account suspended.');
    if (user.role === 'doctor' && user.doctor_status === 'pending_approval')
      return ApiResponse.forbidden(res, 'Doctor account pending approval.');
    if (user.role === 'doctor' && user.doctor_status === 'rejected')
      return ApiResponse.forbidden(res, 'Doctor account rejected.');

    const payload = { userId: user.id, role: user.role };
    const accessToken = authService.generateAccessToken(payload);
    const refreshTok = authService.generateRefreshToken(payload);
    await authService.storeRefreshToken(user.id, refreshTok);
    await query(`UPDATE users SET last_login=NOW() WHERE id=$1`, [user.id]);
    await query(
      `INSERT INTO activity_logs(user_id,action,entity_type,entity_id,ip_address,user_agent)
       VALUES($1,'login','user',$1,$2,$3)`,
      [user.id, req.ip || null, req.headers['user-agent'] || null]
    );

    res.cookie('refreshToken', refreshTok, COOKIE_OPTS());
    return ApiResponse.success(res, {
      access_token: accessToken, token_type: 'Bearer',
      expires_in: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      user: authService.buildUserPayload(user),
    }, 'Login successful');
  } catch (err) { next(err); }
}

export async function refreshToken(req, res, next) {
  try {
    const raw = req.cookies?.refreshToken || req.body?.refresh_token;
    if (!raw) return ApiResponse.unauthorized(res, 'No refresh token');

    let decoded;
    try { decoded = authService.verifyRefreshToken(raw); }
    catch (err) {
      res.clearCookie('refreshToken');
      return ApiResponse.unauthorized(res, err.name === 'TokenExpiredError' ? 'Refresh token expired' : 'Invalid refresh token');
    }

    const { accessToken, refreshToken: newRefresh } = await authService.rotateTokens(decoded.userId, decoded.role, raw);
    res.cookie('refreshToken', newRefresh, COOKIE_OPTS());
    return ApiResponse.success(res, { access_token: accessToken, token_type: 'Bearer' }, 'Token refreshed');
  } catch (err) {
    if (err.statusCode === 401) { res.clearCookie('refreshToken'); return ApiResponse.unauthorized(res, err.message); }
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const raw = req.cookies?.refreshToken || req.body?.refresh_token;
    if (raw && req.user?.id) {
      await authService.revokeRefreshToken(req.user.id, raw);
      await query(`INSERT INTO activity_logs(user_id,action,entity_type,entity_id) VALUES($1,'logout','user',$1)`, [req.user.id]);
    }
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    return ApiResponse.success(res, {}, 'Logged out');
  } catch (err) { next(err); }
}

export async function logoutAll(req, res, next) {
  try {
    const count = await authService.revokeAllUserTokens(req.user.id);
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    return ApiResponse.success(res, { sessions_revoked: count }, 'Logged out from all devices');
  } catch (err) { next(err); }
}

export async function getMe(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT u.id,u.email,u.created_at,u.last_login,u.is_verified,r.name AS role,
              COALESCE(p.id,d.id,a.id) AS profile_id,
              COALESCE(p.first_name,d.first_name,a.first_name) AS first_name,
              COALESCE(p.last_name, d.last_name, a.last_name)  AS last_name,
              COALESCE(p.profile_photo_url,d.profile_photo_url) AS photo,
              d.status AS doctor_status, d.specialization_id, d.rating,
              s.name AS specialization_name
       FROM users u JOIN roles r ON u.role_id=r.id
       LEFT JOIN patients p ON p.user_id=u.id
       LEFT JOIN doctors  d ON d.user_id=u.id
       LEFT JOIN admins   a ON a.user_id=u.id
       LEFT JOIN specializations s ON s.id=d.specialization_id
       WHERE u.id=$1`, [req.user.id]
    );
    if (!rows.length) return ApiResponse.notFound(res, 'User not found');
    return ApiResponse.success(res, rows[0]);
  } catch (err) { next(err); }
}

export async function getSessions(req, res, next) {
  try {
    const sessions = await authService.getActiveSessions(req.user.id);
    return ApiResponse.success(res, sessions);
  } catch (err) { next(err); }
}

export async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    const { rows } = await query(`SELECT password_hash FROM users WHERE id=$1`, [req.user.id]);
    if (!rows.length) return ApiResponse.notFound(res);
    const valid = await authService.verifyPassword(current_password, rows[0].password_hash);
    if (!valid) return ApiResponse.badRequest(res, 'Current password incorrect');
    const hash = await authService.hashPassword(new_password);
    await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, req.user.id]);
    await authService.revokeAllUserTokens(req.user.id);
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    return ApiResponse.success(res, {}, 'Password changed. Please log in again.');
  } catch (err) { next(err); }
}