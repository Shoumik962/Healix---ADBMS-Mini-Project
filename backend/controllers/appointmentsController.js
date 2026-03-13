// controllers/appointmentsController.js
import { query, callProcedure } from '../db/index.js';
import { ApiResponse } from '../utils/apiResponse.js';

// ── POST /appointments — book ──────────────────────────────────
export async function bookAppointment(req, res, next) {
  try {
    const { doctor_id, appointment_dt, reason } = req.body;

    // Resolve patient_id from the authenticated user
    const { rows } = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user.id]
    );
    if (!rows.length) return ApiResponse.notFound(res, 'Patient profile not found');

    const result = await callProcedure(
      'book_appointment',
      [rows[0].id, doctor_id, appointment_dt, reason, req.user.id],
      req.user.id
    );

    if (!result.success) {
      return ApiResponse.badRequest(res, result.error);
    }

    return ApiResponse.created(res, result, 'Appointment booked successfully');
  } catch (err) {
    next(err);
  }
}

// ── PUT /appointments/:id/cancel ───────────────────────────────
export async function cancelAppointment(req, res, next) {
  try {
    const { id } = req.params;
    const { cancel_reason } = req.body;

    const result = await callProcedure(
      'cancel_appointment',
      [id, req.user.id, cancel_reason || 'No reason provided', req.user.role],
      req.user.id
    );

    if (!result.success) {
      const status = result.error?.startsWith('FORBIDDEN') ? 403 : 400;
      return res.status(status).json({ success: false, message: result.error });
    }

    return ApiResponse.success(res, result, 'Appointment cancelled');
  } catch (err) {
    next(err);
  }
}

// ── PUT /appointments/:id/complete ─────────────────────────────
export async function completeAppointment(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await callProcedure(
      'complete_appointment',
      [id, req.user.id, req.user.role, notes || null],
      req.user.id
    );

    if (!result.success) {
      return ApiResponse.badRequest(res, result.error);
    }

    return ApiResponse.success(res, result, 'Appointment completed');
  } catch (err) {
    next(err);
  }
}

// ── GET /appointments/:id ──────────────────────────────────────
export async function getAppointment(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT * FROM v_appointment_details WHERE appointment_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return ApiResponse.notFound(res, 'Appointment not found');

    // Ownership check: patient or doctor of this appointment, or admin
    const appt = rows[0];
    if (req.user.role !== 'admin') {
      const isPatient = req.user.role === 'patient';
      const { rows: profile } = await query(
        isPatient
          ? 'SELECT id FROM patients WHERE user_id=$1'
          : 'SELECT id FROM doctors WHERE user_id=$1',
        [req.user.id]
      );
      const profileId = profile[0]?.id;
      const owns = isPatient
        ? appt.patient_id === profileId
        : appt.doctor_id  === profileId;

      if (!owns) return ApiResponse.forbidden(res);
    }

    return ApiResponse.success(res, appt);
  } catch (err) {
    next(err);
  }
}

// ── GET /appointments/my — patient's own appointments ──────────
export async function getMyAppointments(req, res, next) {
  try {
    const { status, page = 1, page_size = 10 } = req.query;

    const { rows: profile } = await query(
      'SELECT id FROM patients WHERE user_id=$1', [req.user.id]
    );
    if (!rows.length) return ApiResponse.notFound(res, 'Patient profile not found');

    const { rows } = await query(
      `SELECT * FROM get_patient_history($1, $2, $3, $4)`,
      [profile[0].id, status || null, parseInt(page), parseInt(page_size)]
    );

    const totalCount = rows[0]?.total_count || 0;
    const data = rows.map(({ total_count, ...rest }) => rest);

    return ApiResponse.paginated(res, data, {
      page: parseInt(page),
      pageSize: parseInt(page_size),
      totalCount: parseInt(totalCount),
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /appointments/doctor — doctor's own appointments ────────
export async function getDoctorAppointments(req, res, next) {
  try {
    const { status, date_from, date_to, page = 1, page_size = 20 } = req.query;

    const { rows: profile } = await query(
      'SELECT id FROM doctors WHERE user_id=$1', [req.user.id]
    );
    if (!profile.length) return ApiResponse.notFound(res, 'Doctor profile not found');

    const { rows } = await query(
      `SELECT * FROM get_doctor_appointments($1, $2, $3, $4, $5, $6)`,
      [
        profile[0].id,
        status   || null,
        date_from || null,
        date_to   || null,
        parseInt(page),
        parseInt(page_size),
      ]
    );

    const totalCount = rows[0]?.total_count || 0;
    const data = rows.map(({ total_count, ...rest }) => rest);

    return ApiResponse.paginated(res, data, {
      page: parseInt(page),
      pageSize: parseInt(page_size),
      totalCount: parseInt(totalCount),
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /appointments/admin/all — admin view ───────────────────
export async function getAllAppointments(req, res, next) {
  try {
    const { status, page = 1, page_size = 20, date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    const { rows } = await query(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM v_appointment_details
       WHERE ($1::appt_status IS NULL OR status = $1::appt_status)
         AND ($2::date IS NULL OR appointment_dt::date = $2::date)
       ORDER BY appointment_dt DESC
       LIMIT $3 OFFSET $4`,
      [status || null, date || null, parseInt(page_size), offset]
    );

    const totalCount = rows[0]?.total_count || 0;
    const data = rows.map(({ total_count, ...rest }) => rest);

    return ApiResponse.paginated(res, data, {
      page: parseInt(page),
      pageSize: parseInt(page_size),
      totalCount: parseInt(totalCount),
    });
  } catch (err) {
    next(err);
  }
}
