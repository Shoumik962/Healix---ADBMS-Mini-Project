// services/authService.js
// =============================================================
// HEALIX Auth Service
// Centralises all token logic, password ops, and session mgmt.
// Used by authController — keeps controllers thin.
// =============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, withTransaction } from '../db/index.js';
import logger from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_SECRET = () => process.env.JWT_ACCESS_SECRET;
const REFRESH_TOKEN_SECRET = () => process.env.JWT_REFRESH_SECRET;

// ── Password utilities ─────────────────────────────────────────
export async function hashPassword(plain) {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

// ── Token utilities ────────────────────────────────────────────
export function generateAccessToken(payload) {
    if (!ACCESS_TOKEN_SECRET()) throw new Error('JWT_ACCESS_SECRET not configured');
    return jwt.sign(
        { userId: payload.userId, role: payload.role, type: 'access' },
        ACCESS_TOKEN_SECRET(),
        { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m', issuer: 'healix-api' }
    );
}

export function generateRefreshToken(payload) {
    if (!REFRESH_TOKEN_SECRET()) throw new Error('JWT_REFRESH_SECRET not configured');
    return jwt.sign(
        { userId: payload.userId, role: payload.role, type: 'refresh' },
        REFRESH_TOKEN_SECRET(),
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', issuer: 'healix-api' }
    );
}

export function verifyAccessToken(token) {
    return jwt.verify(token, ACCESS_TOKEN_SECRET());
}

export function verifyRefreshToken(token) {
    return jwt.verify(token, REFRESH_TOKEN_SECRET());
}

// Hash refresh token before DB storage — never store raw JWT
export function hashToken(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── Refresh token DB helpers ───────────────────────────────────
export async function storeRefreshToken(userId, rawToken) {
    const hash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
        [userId, hash, expiresAt]
    );
}

export async function validateStoredRefreshToken(userId, rawToken) {
    const hash = hashToken(rawToken);

    const { rows } = await query(
        `SELECT id, expires_at FROM refresh_tokens
     WHERE  token_hash = $1
       AND  user_id    = $2
       AND  revoked    = FALSE
       AND  expires_at > NOW()`,
        [hash, userId]
    );

    return rows.length > 0 ? rows[0] : null;
}

export async function revokeRefreshToken(userId, rawToken) {
    const hash = hashToken(rawToken);
    const { rowCount } = await query(
        `UPDATE refresh_tokens
     SET    revoked = TRUE
     WHERE  token_hash = $1 AND user_id = $2 AND revoked = FALSE`,
        [hash, userId]
    );
    return rowCount > 0;
}

// Revoke ALL refresh tokens for a user (force logout everywhere)
export async function revokeAllUserTokens(userId) {
    const { rowCount } = await query(
        `UPDATE refresh_tokens SET revoked = TRUE
     WHERE  user_id = $1 AND revoked = FALSE`,
        [userId]
    );
    logger.info(`Revoked ${rowCount} tokens for user ${userId}`);
    return rowCount;
}

// ── Token rotation ─────────────────────────────────────────────
// On every refresh: revoke old token, issue a new pair.
// This is "refresh token rotation" — if a stolen token is
// replayed after the legitimate user already refreshed,
// the old hash won't be found (revoked=TRUE) → reject.
export async function rotateTokens(userId, role, oldRawRefreshToken) {
    // 1. Verify the old refresh token is valid in DB
    const stored = await validateStoredRefreshToken(userId, oldRawRefreshToken);
    if (!stored) {
        throw Object.assign(
            new Error('Refresh token invalid, expired, or already used'),
            { statusCode: 401 }
        );
    }

    // 2. Revoke the old token (one-time use)
    await revokeRefreshToken(userId, oldRawRefreshToken);

    // 3. Issue new pair
    const payload = { userId, role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // 4. Store the new refresh token
    await storeRefreshToken(userId, refreshToken);

    return { accessToken, refreshToken };
}

// ── Session info ───────────────────────────────────────────────
export async function getActiveSessions(userId) {
    const { rows } = await query(
        `SELECT id, created_at, expires_at
     FROM   refresh_tokens
     WHERE  user_id = $1 AND revoked = FALSE AND expires_at > NOW()
     ORDER  BY created_at DESC`,
        [userId]
    );
    return rows;
}

// ── Cleanup expired tokens (run as a periodic job) ────────────
export async function purgeExpiredTokens() {
    const { rowCount } = await query(
        `DELETE FROM refresh_tokens
     WHERE  expires_at < NOW() OR revoked = TRUE`
    );
    logger.info(`Purged ${rowCount} expired/revoked refresh tokens`);
    return rowCount;
}

// ── Full user lookup for login ─────────────────────────────────
export async function findUserForAuth(email) {
    const { rows } = await query(
        `SELECT
       u.id,
       u.email,
       u.password_hash,
       u.is_active,
       u.last_login,
       r.name           AS role,
       COALESCE(p.id, d.id, a.id)                             AS profile_id,
       COALESCE(p.first_name, d.first_name, a.first_name)     AS first_name,
       COALESCE(p.last_name,  d.last_name,  a.last_name)      AS last_name,
       COALESCE(p.profile_photo_url, d.profile_photo_url)     AS photo,
       d.status                                               AS doctor_status,
       d.specialization_id
     FROM   users u
     JOIN   roles r  ON u.role_id  = r.id
     LEFT   JOIN patients p ON p.user_id = u.id
     LEFT   JOIN doctors  d ON d.user_id = u.id
     LEFT   JOIN admins   a ON a.user_id = u.id
     WHERE  u.email = $1`,
        [email.toLowerCase().trim()]
    );
    return rows[0] || null;
}

// ── Register a new user (full transactional) ───────────────────
export async function registerUser(data) {
    const {
        email, password, role,
        first_name, last_name,
        // patient
        date_of_birth, gender, phone, blood_group, city, country,
        // doctor
        specialization_id, license_number, years_of_experience,
        consultation_fee, hospital_name, state, bio,
    } = data;

    return withTransaction(async (client) => {
        // Duplicate email check
        const { rows: existing } = await client.query(
            `SELECT id FROM users WHERE email = $1`,
            [email.toLowerCase().trim()]
        );
        if (existing.length) {
            throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
        }

        // Resolve role ID
        const { rows: roleRows } = await client.query(
            `SELECT id FROM roles WHERE name = $1`, [role]
        );
        if (!roleRows.length) {
            throw Object.assign(new Error('Invalid role specified'), { statusCode: 400 });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create base user
        const { rows: userRows } = await client.query(
            `INSERT INTO users (email, password_hash, role_id)
       VALUES ($1, $2, $3) RETURNING id`,
            [email.toLowerCase().trim(), passwordHash, roleRows[0].id]
        );
        const userId = userRows[0].id;

        let profileId;

        // Create role-specific profile
        if (role === 'patient') {
            const { rows } = await client.query(
                `INSERT INTO patients
           (user_id, first_name, last_name, date_of_birth, gender,
            phone, blood_group, city, country)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [userId, first_name, last_name,
                    date_of_birth, gender || 'prefer_not_to_say',
                    phone || null, blood_group || null,
                    city || null, country || 'US']
            );
            profileId = rows[0].id;

        } else if (role === 'doctor') {
            // Validate required doctor fields
            if (!specialization_id || !license_number) {
                throw Object.assign(
                    new Error('Doctors require specialization_id and license_number'),
                    { statusCode: 400 }
                );
            }
            const { rows } = await client.query(
                `INSERT INTO doctors
           (user_id, specialization_id, first_name, last_name,
            license_number, years_of_experience, consultation_fee,
            hospital_name, city, state, country, bio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
                [userId, specialization_id, first_name, last_name,
                    license_number, years_of_experience || 0,
                    consultation_fee || 0.00,
                    hospital_name || null, city || null,
                    state || null, country || 'US', bio || null]
            );
            profileId = rows[0].id;

        } else if (role === 'admin') {
            const { rows } = await client.query(
                `INSERT INTO admins (user_id, first_name, last_name)
         VALUES ($1,$2,$3) RETURNING id`,
                [userId, first_name, last_name]
            );
            profileId = rows[0].id;
        }

        logger.info(`New ${role} registered`, { userId, profileId });
        return { userId, profileId, role };
    });
}

// ── Build safe user payload (no password hash) ─────────────────
export function buildUserPayload(user) {
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        profile_id: user.profile_id,
        first_name: user.first_name,
        last_name: user.last_name,
        photo: user.photo,
        doctor_status: user.doctor_status || null,
        last_login: user.last_login,
    };
}