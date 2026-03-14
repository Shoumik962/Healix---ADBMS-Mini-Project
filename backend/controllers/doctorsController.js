// controllers/doctorsController.js
import { query } from '../db/index.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { callProcedure } from '../db/index.js';

export async function searchDoctors(req, res, next) {
  try {
    const {
      specialization_id, city, q,
      min_rating, max_fee, available_day,
      page = 1, page_size = 10,
    } = req.query;

    const { rows } = await query(
      `SELECT * FROM search_doctors($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        specialization_id ? parseInt(specialization_id) : null,
        city          || null,
        q             || null,
        min_rating    ? parseFloat(min_rating) : null,
        max_fee       ? parseFloat(max_fee) : null,
        available_day || null,
        parseInt(page),
        parseInt(page_size),
      ]
    );

    const totalCount = rows[0]?.total_count || 0;
    // rename doctor_id → id for consistent frontend usage
    const data = rows.map(({ total_count, doctor_id, ...rest }) => ({ id: doctor_id, ...rest }));

    return ApiResponse.paginated(res, data, {
      page: parseInt(page), pageSize: parseInt(page_size),
      totalCount: parseInt(totalCount),
    });
  } catch (err) { next(err); }
}

export async function getDoctorProfile(req, res, next) {
  try {
    const { rows } = await query(
      'SELECT * FROM v_doctor_public_profile WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return ApiResponse.notFound(res, 'Doctor not found');
    return ApiResponse.success(res, rows[0]);
  } catch (err) { next(err); }
}

export async function getDoctorSchedule(req, res, next) {
  try {
    const { date } = req.query;
    let doctorId = req.params.id;

    // Called via /doctors/me/schedule — resolve the authenticated doctor's UUID
    if (!doctorId && req.user) {
      const { rows } = await query('SELECT id FROM doctors WHERE user_id=$1', [req.user.id]);
      if (!rows.length) return ApiResponse.notFound(res, 'Doctor profile not found');
      doctorId = rows[0].id;
    }

    const { rows } = await query(
      `SELECT * FROM get_doctor_schedule($1, $2::date)`,
      [doctorId, date || new Date().toISOString().split('T')[0]]
    );
    return ApiResponse.success(res, rows);
  } catch (err) { next(err); }
}

export async function getAvailableSlots(req, res, next) {
  try {
    const { from_date, to_date } = req.query;
    const { rows } = await query(
      `SELECT * FROM get_available_slots($1, $2::date, $3::date)`,
      [req.params.id, from_date || null, to_date || null]
    );
    return ApiResponse.success(res, rows);
  } catch (err) { next(err); }
}

export async function updateDoctorProfile(req, res, next) {
  try {
    const fields = ['bio','hospital_name','city','state','country',
                    'consultation_fee','years_of_experience','phone'];
    const updates = [];
    const vals = [];
    let i = 1;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        vals.push(req.body[f]);
      }
    }
    if (!updates.length) return ApiResponse.badRequest(res, 'No fields to update');

    vals.push(req.user.id);
    await query(
      `UPDATE doctors SET ${updates.join(', ')} WHERE user_id = $${i}`,
      vals
    );
    return ApiResponse.success(res, {}, 'Profile updated');
  } catch (err) { next(err); }
}

export async function setAvailability(req, res, next) {
  try {
    const { rows: doc } = await query(
      'SELECT id FROM doctors WHERE user_id=$1', [req.user.id]
    );
    if (!doc.length) return ApiResponse.notFound(res);

    const { availability } = req.body; // array of {day_of_week, start_time, end_time, slot_duration}

    // Upsert each day
    for (const slot of availability) {
      await query(
        `INSERT INTO doctor_availability
           (doctor_id, day_of_week, start_time, end_time, slot_duration, is_active)
         VALUES ($1,$2,$3,$4,$5,TRUE)
         ON CONFLICT (doctor_id, day_of_week)
         DO UPDATE SET start_time=$3, end_time=$4, slot_duration=$5, is_active=TRUE`,
        [doc[0].id, slot.day_of_week, slot.start_time, slot.end_time, slot.slot_duration || 30]
      );
    }
    return ApiResponse.success(res, {}, 'Availability updated');
  } catch (err) { next(err); }
}

export async function getSpecializations(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM specializations ORDER BY name');
    return ApiResponse.success(res, rows);
  } catch (err) { next(err); }
}

// ── controllers/patientsController.js (inline) ────────────────
export async function getPatientProfile(req, res, next) {
  try {
    const userId = req.params.userId || req.user.id;
    const { rows } = await query(
      'SELECT * FROM v_patient_profile WHERE user_id=$1', [userId]
    );
    if (!rows.length) return ApiResponse.notFound(res, 'Patient not found');

    if (req.user.role === 'patient' && rows[0].user_id !== req.user.id) {
      return ApiResponse.forbidden(res);
    }
    return ApiResponse.success(res, rows[0]);
  } catch (err) { next(err); }
}

export async function updatePatientProfile(req, res, next) {
  try {
    const fields = ['first_name','last_name','phone','address','city',
                    'state','blood_group','allergies','emergency_contact_name',
                    'emergency_contact_phone'];
    const updates = []; const vals = []; let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f}=$${i++}`); vals.push(req.body[f]); }
    }
    if (!updates.length) return ApiResponse.badRequest(res, 'No fields to update');
    vals.push(req.user.id);
    await query(`UPDATE patients SET ${updates.join(',')} WHERE user_id=$${i}`, vals);
    return ApiResponse.success(res, {}, 'Profile updated');
  } catch (err) { next(err); }
}

// ── controllers/prescriptionsController.js (inline) ───────────
export async function issuePrescription(req, res, next) {
  try {
    const { appointment_id, diagnosis, notes, medications, expires_at } = req.body;

    const result = await callProcedure(
      'issue_prescription',
      [appointment_id, req.user.id, diagnosis, notes || null,
       JSON.stringify(medications), expires_at || null],
      req.user.id
    );

    if (!result.success) return ApiResponse.badRequest(res, result.error);
    return ApiResponse.created(res, result, 'Prescription issued');
  } catch (err) { next(err); }
}

export async function getPrescription(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT * FROM get_prescription_detail($1, $2, $3::user_role)`,
      [req.params.id, req.user.id, req.user.role]
    );
    if (!rows.length) return ApiResponse.notFound(res, 'Prescription not found or access denied');
    return ApiResponse.success(res, rows);
  } catch (err) { next(err); }
}

export async function getMyPrescriptions(req, res, next) {
  try {
    const { page = 1, page_size = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    const isPatient = req.user.role === 'patient';
    const idField   = isPatient ? 'patient_id' : 'doctor_id';

    const { rows: profile } = await query(
      isPatient
        ? 'SELECT id FROM patients WHERE user_id=$1'
        : 'SELECT id FROM doctors  WHERE user_id=$1',
      [req.user.id]
    );
    if (!profile.length) return ApiResponse.notFound(res);

    const { rows } = await query(
      `SELECT p.*, COUNT(*) OVER() AS total_count
       FROM prescriptions p
       WHERE p.${idField} = $1
       ORDER BY p.issued_at DESC
       LIMIT $2 OFFSET $3`,
      [profile[0].id, parseInt(page_size), offset]
    );

    const totalCount = rows[0]?.total_count || 0;
    const data = rows.map(({ total_count, ...rest }) => rest);
    return ApiResponse.paginated(res, data, {
      page: parseInt(page), pageSize: parseInt(page_size),
      totalCount: parseInt(totalCount),
    });
  } catch (err) { next(err); }
}

// ── controllers/adminController.js (inline) ───────────────────
export async function adminApproveDoctor(req, res, next) {
  try {
    const result = await callProcedure(
      'approve_doctor',
      [req.params.doctorId, req.user.id, req.body.status],
      req.user.id
    );
    if (!result.success) return ApiResponse.badRequest(res, result.error);
    return ApiResponse.success(res, result, `Doctor ${req.body.status}`);
  } catch (err) { next(err); }
}

export async function adminManageUser(req, res, next) {
  try {
    const result = await callProcedure(
      'manage_user',
      [req.params.userId, req.user.id, req.body.action],
      req.user.id
    );
    if (!result.success) return ApiResponse.badRequest(res, result.error);
    return ApiResponse.success(res, result);
  } catch (err) { next(err); }
}

export async function adminGetReport(req, res, next) {
  try {
    const { from_date, to_date } = req.query;
    const { rows } = await query(
      `SELECT get_admin_report($1::date, $2::date) AS report`,
      [from_date || null, to_date || null]
    );
    return ApiResponse.success(res, rows[0].report);
  } catch (err) { next(err); }
}

export async function adminGetDashboard(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM v_admin_dashboard');
    return ApiResponse.success(res, rows[0]);
  } catch (err) { next(err); }
}

export async function adminListUsers(req, res, next) {
  try {
    const { role, is_active, page = 1, page_size = 20, q } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    const { rows } = await query(
      `SELECT u.id, u.email, u.is_active, u.created_at, u.last_login,
              r.name AS role,
              COALESCE(p.first_name, d.first_name, a.first_name) AS first_name,
              COALESCE(p.last_name,  d.last_name,  a.last_name)  AS last_name,
              d.status AS doctor_status,
              COUNT(*) OVER() AS total_count
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN patients p ON p.user_id = u.id
       LEFT JOIN doctors  d ON d.user_id = u.id
       LEFT JOIN admins   a ON a.user_id = u.id
       WHERE ($1::text   IS NULL OR r.name::text = $1)
         AND ($2::boolean IS NULL OR u.is_active = $2)
         AND ($3::text IS NULL
              OR u.email ILIKE '%'||$3||'%'
              OR COALESCE(p.first_name,d.first_name,'') ILIKE '%'||$3||'%')
       ORDER BY u.created_at DESC
       LIMIT $4 OFFSET $5`,
      [role || null, is_active !== undefined ? is_active === 'true' : null,
       q || null, parseInt(page_size), offset]
    );

    const totalCount = rows[0]?.total_count || 0;
    const data = rows.map(({ total_count, ...rest }) => rest);
    return ApiResponse.paginated(res, data, {
      page: parseInt(page), pageSize: parseInt(page_size),
      totalCount: parseInt(totalCount),
    });
  } catch (err) { next(err); }
}

export async function adminListDoctors(req, res, next) {
  try {
    const { status, q, page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    const { rows } = await query(
      `SELECT
         d.id, d.first_name, d.last_name, d.license_number,
         d.status, d.years_of_experience, d.consultation_fee,
         d.hospital_name, d.city, d.rating, d.total_reviews,
         u.email, u.is_active, u.created_at,
         s.name AS specialization_name,
         COUNT(*) OVER() AS total_count
       FROM doctors d
       JOIN users u            ON d.user_id           = u.id
       JOIN specializations s  ON d.specialization_id = s.id
       WHERE ($1::text IS NULL OR d.status::text = $1)
         AND ($2::text IS NULL
              OR u.email ILIKE '%'||$2||'%'
              OR (d.first_name || ' ' || d.last_name) ILIKE '%'||$2||'%')
       ORDER BY d.created_at DESC
       LIMIT $3 OFFSET $4`,
      [status || null, q || null, parseInt(page_size), offset]
    );

    const totalCount = rows[0]?.total_count || 0;
    const data = rows.map(({ total_count, ...rest }) => rest);
    return ApiResponse.paginated(res, data, {
      page: parseInt(page), pageSize: parseInt(page_size),
      totalCount: parseInt(totalCount),
    });
  } catch (err) { next(err); }
}

export async function adminGetActivityLogs(req, res, next) {
  try {
    const { action, page = 1, page_size = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    const { rows } = await query(
      `SELECT l.*, u.email, COUNT(*) OVER() AS total_count
       FROM activity_logs l
       LEFT JOIN users u ON l.user_id = u.id
       WHERE ($1::log_action IS NULL OR l.action = $1::log_action)
       ORDER BY l.created_at DESC
       LIMIT $2 OFFSET $3`,
      [action || null, parseInt(page_size), offset]
    );

    const totalCount = rows[0]?.total_count || 0;
    const data = rows.map(({ total_count, ...rest }) => rest);
    return ApiResponse.paginated(res, data, {
      page: parseInt(page), pageSize: parseInt(page_size),
      totalCount: parseInt(totalCount),
    });
  } catch (err) { next(err); }
}

export async function adminGetPendingDoctors(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT d.*, s.name AS specialization_name, u.email, u.created_at AS registered_at
       FROM doctors d
       JOIN specializations s ON d.specialization_id = s.id
       JOIN users u ON d.user_id = u.id
       WHERE d.status = 'pending_approval'
       ORDER BY d.created_at ASC`
    );
    return ApiResponse.success(res, rows);
  } catch (err) { next(err); }
}

export async function getNotifications(req, res, next) {
  try {
    const { page = 1, page_size = 20, unread_only } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    const { rows } = await query(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM notifications
       WHERE user_id = $1
         AND ($2::boolean IS NULL OR is_read = NOT $2::boolean)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [req.user.id, unread_only === 'true' ? true : null,
       parseInt(page_size), offset]
    );

    const totalCount = rows[0]?.total_count || 0;
    const data = rows.map(({ total_count, ...rest }) => rest);
    return ApiResponse.paginated(res, data, {
      page: parseInt(page), pageSize: parseInt(page_size),
      totalCount: parseInt(totalCount),
    });
  } catch (err) { next(err); }
}

export async function markNotificationRead(req, res, next) {
  try {
    await query(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    return ApiResponse.success(res, {}, 'Marked as read');
  } catch (err) { next(err); }
}
