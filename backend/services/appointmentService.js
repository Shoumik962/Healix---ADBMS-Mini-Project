// services/appointmentService.js
// =============================================================
// HEALIX Appointment Service
// All booking logic runs through this service.
// Every state-changing operation uses withTransaction() so that:
//   1. Advisory lock is acquired BEFORE the INSERT
//   2. Trigger validation fires INSIDE the transaction
//   3. Notifications + audit log are part of the same commit
//   4. Any failure rolls back everything atomically
// =============================================================
import { query, withTransaction, getClient } from '../db/index.js';
import logger from '../utils/logger.js';

// ── CONSTANTS ──────────────────────────────────────────────────
export const APPOINTMENT_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    NO_SHOW: 'no_show',
};

export const MEETING_STATUS = {
    WAITING: 'waiting',
    ACTIVE: 'active',
    ENDED: 'ended',
};

// ── bookAppointment() ─────────────────────────────────────────
// Full transactional booking with advisory locking.
//
// Flow inside the transaction:
//   1. SET LOCAL session context     → audit triggers know who acted
//   2. pg_advisory_xact_lock         → serialize concurrent bookings
//      for the same doctor (also fires in the DB trigger, but we
//      acquire it here too so the Node layer controls timing)
//   3. Validate doctor + patient     → fast checks before INSERT
//   4. Compute end_dt                → from doctor's slot_duration
//   5. INSERT appointment            → triggers fire:
//        - trg_enforce_approved_doctor
//        - trg_prevent_double_booking
//        - trg_validate_doctor_availability
//        - trg_generate_meeting_room
//        - trg_log_appointment_changes
//        - trg_notify_appointment_booked
//   6. COMMIT                        → all side-effects committed
// =============================================================
export async function bookAppointment({
    patientUserId,
    doctorId,
    appointmentDt,
    reason,
}) {
    return withTransaction(async (client) => {

        // ── 1. Resolve patient profile ──────────────────────────
        const { rows: patRows } = await client.query(
            `SELECT id FROM patients WHERE user_id = $1`,
            [patientUserId]
        );
        if (!patRows.length) {
            throw Object.assign(new Error('Patient profile not found'), { statusCode: 404 });
        }
        const patientId = patRows[0].id;

        // ── 2. Validate doctor exists + is approved ─────────────
        const { rows: docRows } = await client.query(
            `SELECT d.id, d.first_name, d.last_name, d.status, d.consultation_fee
       FROM   doctors d
       WHERE  d.id = $1`,
            [doctorId]
        );
        if (!docRows.length) {
            throw Object.assign(new Error('Doctor not found'), { statusCode: 404 });
        }
        const doctor = docRows[0];
        if (doctor.status !== 'approved') {
            throw Object.assign(
                new Error(`Doctor account is ${doctor.status}. Cannot book appointments.`),
                { statusCode: 400 }
            );
        }

        // ── 3. Validate appointment is in the future ────────────
        const apptDate = new Date(appointmentDt);
        if (apptDate <= new Date()) {
            throw Object.assign(
                new Error('Appointment must be scheduled in the future'),
                { statusCode: 400 }
            );
        }

        // ── 4. Reason validation ────────────────────────────────
        const trimmedReason = (reason || '').trim();
        if (trimmedReason.length < 5) {
            throw Object.assign(
                new Error('Please provide a reason (minimum 5 characters)'),
                { statusCode: 400 }
            );
        }

        // ── 5. Acquire advisory lock on doctor ──────────────────
        // hashtext() maps doctor UUID → int32 for pg_advisory_xact_lock.
        // This serialises all concurrent booking attempts for this doctor.
        // The lock is automatically released when the transaction commits/rolls back.
        await client.query(
            `SELECT pg_advisory_xact_lock(hashtext($1))`,
            [doctorId]
        );
        logger.debug(`Advisory lock acquired for doctor ${doctorId}`);

        // ── 6. Compute slot end time ────────────────────────────
        const { rows: slotRows } = await client.query(
            `SELECT fn_get_slot_end_time($1, $2::timestamptz) AS end_dt`,
            [doctorId, appointmentDt]
        );
        const endDt = slotRows[0].end_dt;

        // ── 7. INSERT — all 6 triggers fire here ────────────────
        // Any trigger RAISE EXCEPTION rolls back automatically.
        const { rows: apptRows } = await client.query(
            `INSERT INTO appointments
         (patient_id, doctor_id, appointment_dt, end_dt, status, reason)
       VALUES ($1, $2, $3::timestamptz, $4::timestamptz, 'pending', $5)
       RETURNING
         id,
         appointment_dt,
         end_dt,
         status,
         meeting_room_id,
         created_at`,
            [patientId, doctorId, appointmentDt, endDt, trimmedReason]
        );

        const appointment = apptRows[0];

        logger.info('Appointment booked', {
            appointmentId: appointment.id,
            patientId,
            doctorId,
            appointmentDt,
        });

        return {
            appointment_id: appointment.id,
            patient_id: patientId,
            doctor_id: doctorId,
            doctor_name: `Dr. ${doctor.first_name} ${doctor.last_name}`,
            consultation_fee: doctor.consultation_fee,
            appointment_dt: appointment.appointment_dt,
            end_dt: appointment.end_dt,
            status: appointment.status,
            meeting_room_id: appointment.meeting_room_id,
            created_at: appointment.created_at,
        };

    }, patientUserId);   // userId passed to withTransaction for SET LOCAL
}

// ── confirmAppointment() ──────────────────────────────────────
// Doctor confirms a pending appointment.
// Typically called by the doctor or an automated system.
export async function confirmAppointment({ appointmentId, doctorUserId }) {
    return withTransaction(async (client) => {

        // Verify ownership
        const { rows } = await client.query(
            `SELECT a.id, a.status, d.user_id AS doctor_user_id
       FROM   appointments a
       JOIN   doctors d ON a.doctor_id = d.id
       WHERE  a.id = $1`,
            [appointmentId]
        );
        if (!rows.length) {
            throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });
        }
        const appt = rows[0];

        if (appt.doctor_user_id !== doctorUserId) {
            throw Object.assign(new Error('Forbidden — not your appointment'), { statusCode: 403 });
        }
        if (appt.status !== APPOINTMENT_STATUS.PENDING) {
            throw Object.assign(
                new Error(`Cannot confirm an appointment with status: ${appt.status}`),
                { statusCode: 400 }
            );
        }

        const { rows: updated } = await client.query(
            `UPDATE appointments
       SET    status = 'confirmed'
       WHERE  id = $1
       RETURNING id, status, appointment_dt, meeting_room_id`,
            [appointmentId]
        );

        return updated[0];

    }, doctorUserId);
}

// ── cancelAppointment() ───────────────────────────────────────
// Cancels with full role-permission checks and time-window guard.
// trg_appointment_status_timestamps fires to set cancelled_at.
// trg_notify_appointment_cancelled fires to push notifications.
export async function cancelAppointment({
    appointmentId,
    callerUserId,
    callerRole,
    cancelReason,
}) {
    return withTransaction(async (client) => {

        // Fetch appointment with both owner IDs
        const { rows } = await client.query(
            `SELECT
         a.id,
         a.status,
         a.appointment_dt,
         a.patient_id,
         a.doctor_id,
         p.user_id AS patient_user_id,
         d.user_id AS doctor_user_id
       FROM  appointments a
       JOIN  patients p ON a.patient_id = p.id
       JOIN  doctors  d ON a.doctor_id  = d.id
       WHERE a.id = $1
       FOR   UPDATE`,
            [appointmentId]
        );

        if (!rows.length) {
            throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });
        }
        const appt = rows[0];

        // ── Terminal state guard ──────────────────────────────
        if ([APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.COMPLETED]
            .includes(appt.status)) {
            throw Object.assign(
                new Error(`Appointment is already ${appt.status}`),
                { statusCode: 409 }
            );
        }

        // ── Role-based ownership check ────────────────────────
        if (callerRole === 'patient' && appt.patient_user_id !== callerUserId) {
            throw Object.assign(new Error('Forbidden — not your appointment'), { statusCode: 403 });
        }
        if (callerRole === 'doctor' && appt.doctor_user_id !== callerUserId) {
            throw Object.assign(new Error('Forbidden — not your appointment'), { statusCode: 403 });
        }

        // ── Patient cancellation time window ──────────────────
        // Patients must cancel at least 1 hour before the appointment.
        if (callerRole === 'patient') {
            const cutoff = new Date(appt.appointment_dt);
            cutoff.setHours(cutoff.getHours() - 1);
            if (new Date() > cutoff) {
                throw Object.assign(
                    new Error('Patients must cancel at least 1 hour before the scheduled time'),
                    { statusCode: 400 }
                );
            }
        }

        // ── UPDATE — triggers fire ────────────────────────────
        // trg_appointment_status_timestamps validates transition + sets cancelled_at
        // trg_log_appointment_changes writes audit entry
        // trg_notify_appointment_cancelled sends notifications to both parties
        const { rows: updated } = await client.query(
            `UPDATE appointments
       SET
         status        = 'cancelled',
         cancelled_by  = $2,
         cancel_reason = $3,
         cancelled_at  = NOW()
       WHERE id = $1
       RETURNING id, status, cancelled_at, cancel_reason`,
            [appointmentId, callerUserId, cancelReason?.trim() || 'No reason provided']
        );

        logger.info('Appointment cancelled', {
            appointmentId,
            cancelledBy: callerUserId,
            role: callerRole,
        });

        return updated[0];

    }, callerUserId);
}

// ── completeAppointment() ─────────────────────────────────────
// Marks an appointment as completed.
// Triggers: trg_auto_create_medical_record, trg_log_appointment_changes
export async function completeAppointment({
    appointmentId,
    doctorUserId,
    callerRole,
    notes,
}) {
    return withTransaction(async (client) => {

        const { rows } = await client.query(
            `SELECT a.id, a.status, d.user_id AS doctor_user_id
       FROM   appointments a
       JOIN   doctors d ON a.doctor_id = d.id
       WHERE  a.id = $1
       FOR    UPDATE`,
            [appointmentId]
        );

        if (!rows.length) {
            throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });
        }
        const appt = rows[0];

        // Only the treating doctor or admin can complete
        if (callerRole === 'doctor' && appt.doctor_user_id !== doctorUserId) {
            throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
        }

        if (![APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED]
            .includes(appt.status)) {
            throw Object.assign(
                new Error(`Cannot complete appointment with status: ${appt.status}`),
                { statusCode: 400 }
            );
        }

        const { rows: updated } = await client.query(
            `UPDATE appointments
       SET
         status         = 'completed',
         meeting_status = 'ended',
         completed_at   = NOW(),
         notes          = COALESCE($2, notes)
       WHERE id = $1
       RETURNING id, status, completed_at, notes, meeting_room_id`,
            [appointmentId, notes?.trim() || null]
        );

        logger.info('Appointment completed', { appointmentId, doctorUserId });
        return updated[0];

    }, doctorUserId);
}

// ── markNoShow() ──────────────────────────────────────────────
// Doctor or admin marks patient as no-show after appointment time passes.
export async function markNoShow({ appointmentId, doctorUserId, callerRole }) {
    return withTransaction(async (client) => {

        const { rows } = await client.query(
            `SELECT a.id, a.status, a.appointment_dt, d.user_id AS doctor_user_id
       FROM   appointments a
       JOIN   doctors d ON a.doctor_id = d.id
       WHERE  a.id = $1 FOR UPDATE`,
            [appointmentId]
        );

        if (!rows.length) throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });
        const appt = rows[0];

        if (callerRole === 'doctor' && appt.doctor_user_id !== doctorUserId) {
            throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
        }

        // Can only mark no-show after the scheduled time
        if (new Date() < new Date(appt.appointment_dt)) {
            throw Object.assign(
                new Error('Cannot mark as no-show before the scheduled appointment time'),
                { statusCode: 400 }
            );
        }

        if (appt.status !== APPOINTMENT_STATUS.CONFIRMED &&
            appt.status !== APPOINTMENT_STATUS.PENDING) {
            throw Object.assign(
                new Error(`Cannot mark no-show for status: ${appt.status}`),
                { statusCode: 400 }
            );
        }

        const { rows: updated } = await client.query(
            `UPDATE appointments
       SET status = 'no_show', updated_at = NOW()
       WHERE id = $1
       RETURNING id, status`,
            [appointmentId]
        );

        return updated[0];
    }, doctorUserId);
}

// ── rescheduleAppointment() ───────────────────────────────────
// Atomically cancel + re-book in one transaction.
// Only callable by the patient or admin.
export async function rescheduleAppointment({
    appointmentId,
    newAppointmentDt,
    patientUserId,
    reason,
}) {
    return withTransaction(async (client) => {

        // Fetch original appointment
        const { rows } = await client.query(
            `SELECT a.*, p.user_id AS patient_user_id, d.id AS doc_id
       FROM   appointments a
       JOIN   patients p ON a.patient_id = p.id
       JOIN   doctors  d ON a.doctor_id  = d.id
       WHERE  a.id = $1 FOR UPDATE`,
            [appointmentId]
        );

        if (!rows.length) throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });
        const orig = rows[0];

        if (orig.patient_user_id !== patientUserId) {
            throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
        }

        if ([APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.COMPLETED]
            .includes(orig.status)) {
            throw Object.assign(
                new Error(`Cannot reschedule a ${orig.status} appointment`),
                { statusCode: 409 }
            );
        }

        // 1hr window guard
        const cutoff = new Date(orig.appointment_dt);
        cutoff.setHours(cutoff.getHours() - 1);
        if (new Date() > cutoff) {
            throw Object.assign(
                new Error('Cannot reschedule within 1 hour of the appointment'),
                { statusCode: 400 }
            );
        }

        // Step 1: Cancel original
        await client.query(
            `UPDATE appointments
       SET status='cancelled', cancelled_by=$2, cancel_reason='Rescheduled by patient',
           cancelled_at=NOW()
       WHERE id=$1`,
            [appointmentId, patientUserId]
        );

        // Step 2: Acquire advisory lock for new slot
        await client.query(
            `SELECT pg_advisory_xact_lock(hashtext($1))`,
            [orig.doc_id]
        );

        // Step 3: Compute new end time
        const { rows: slotRows } = await client.query(
            `SELECT fn_get_slot_end_time($1, $2::timestamptz) AS end_dt`,
            [orig.doc_id, newAppointmentDt]
        );

        // Step 4: Insert new appointment
        const { rows: newAppt } = await client.query(
            `INSERT INTO appointments
         (patient_id, doctor_id, appointment_dt, end_dt, status, reason)
       VALUES ($1, $2, $3::timestamptz, $4::timestamptz, 'pending', $5)
       RETURNING id, appointment_dt, end_dt, status, meeting_room_id`,
            [orig.patient_id, orig.doctor_id,
                newAppointmentDt, slotRows[0].end_dt,
            reason?.trim() || orig.reason]
        );

        logger.info('Appointment rescheduled', {
            originalId: appointmentId,
            newId: newAppt[0].id,
            patientUserId,
        });

        return {
            original_appointment_id: appointmentId,
            new_appointment: newAppt[0],
        };

    }, patientUserId);
}

// ── getAppointmentById() ──────────────────────────────────────
// Fetches from the view + enforces ownership.
export async function getAppointmentById(appointmentId, callerId, callerRole) {
    const { rows } = await query(
        `SELECT * FROM v_appointment_details WHERE appointment_id = $1`,
        [appointmentId]
    );

    if (!rows.length) return null;

    const appt = rows[0];

    // Ownership check (admin bypasses)
    if (callerRole !== 'admin') {
        const { rows: profile } = await query(
            callerRole === 'patient'
                ? 'SELECT id FROM patients WHERE user_id=$1'
                : 'SELECT id FROM doctors  WHERE user_id=$1',
            [callerId]
        );
        const pid = profile[0]?.id;
        const owns = callerRole === 'patient'
            ? appt.patient_id === pid
            : appt.doctor_id === pid;

        if (!owns) {
            throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
        }
    }

    return appt;
}

// ── getPatientAppointments() ───────────────────────────────────
export async function getPatientAppointments({
    patientUserId, status, page = 1, pageSize = 10,
}) {
    const { rows: profile } = await query(
        `SELECT id FROM patients WHERE user_id=$1`, [patientUserId]
    );
    if (!profile.length) throw Object.assign(new Error('Patient not found'), { statusCode: 404 });

    const { rows } = await query(
        `SELECT * FROM get_patient_history($1, $2::appt_status, $3, $4)`,
        [profile[0].id, status || null, page, pageSize]
    );

    const totalCount = parseInt(rows[0]?.total_count || 0);
    return {
        data: rows.map(({ total_count, ...r }) => r),
        totalCount,
    };
}

// ── getDoctorAppointments() ────────────────────────────────────
export async function getDoctorAppointments({
    doctorUserId, status, dateFrom, dateTo, page = 1, pageSize = 20,
}) {
    const { rows: profile } = await query(
        `SELECT id FROM doctors WHERE user_id=$1`, [doctorUserId]
    );
    if (!profile.length) throw Object.assign(new Error('Doctor not found'), { statusCode: 404 });

    const { rows } = await query(
        `SELECT * FROM get_doctor_appointments($1, $2::appt_status, $3::date, $4::date, $5, $6)`,
        [profile[0].id, status || null, dateFrom || null, dateTo || null, page, pageSize]
    );

    const totalCount = parseInt(rows[0]?.total_count || 0);
    return {
        data: rows.map(({ total_count, ...r }) => r),
        totalCount,
    };
}

// ── getTodaysAppointments() ────────────────────────────────────
// Used by the doctor dashboard to show today's schedule.
export async function getTodaysAppointments(doctorUserId) {
    const { rows: profile } = await query(
        `SELECT id FROM doctors WHERE user_id=$1`, [doctorUserId]
    );
    if (!profile.length) return [];

    const today = new Date().toISOString().split('T')[0];

    const { rows } = await query(
        `SELECT
       a.id, a.appointment_dt, a.end_dt, a.status,
       a.reason, a.meeting_status, a.meeting_room_id,
       p.first_name || ' ' || p.last_name AS patient_name,
       u.email AS patient_email, p.phone, p.blood_group,
       p.allergies,
       EXISTS(SELECT 1 FROM prescriptions rx WHERE rx.appointment_id = a.id)
         AS has_prescription
     FROM  appointments a
     JOIN  patients p ON a.patient_id = p.id
     JOIN  users    u ON p.user_id    = u.id
     WHERE a.doctor_id      = $1
       AND a.appointment_dt::date = $2::date
       AND a.status NOT IN ('cancelled','no_show')
     ORDER BY a.appointment_dt ASC`,
        [profile[0].id, today]
    );

    return rows;
}

// ── getUpcomingForPatient() ────────────────────────────────────
// Returns next N upcoming appointments for the patient dashboard.
export async function getUpcomingForPatient(patientUserId, limit = 3) {
    const { rows: profile } = await query(
        `SELECT id FROM patients WHERE user_id=$1`, [patientUserId]
    );
    if (!profile.length) return [];

    const { rows } = await query(
        `SELECT
       a.id, a.appointment_dt, a.end_dt, a.status,
       a.reason, a.meeting_room_id,
       'Dr. '||d.first_name||' '||d.last_name AS doctor_name,
       s.name  AS specialization,
       d.hospital_name,
       d.profile_photo_url AS doctor_photo
     FROM  appointments a
     JOIN  doctors d        ON a.doctor_id         = d.id
     JOIN  specializations s ON d.specialization_id = s.id
     WHERE a.patient_id    = $1
       AND a.appointment_dt > NOW()
       AND a.status IN ('pending','confirmed')
     ORDER BY a.appointment_dt ASC
     LIMIT $2`,
        [profile[0].id, limit]
    );

    return rows;
}

// ── getAppointmentStats() ─────────────────────────────────────
// Summary counts for dashboards (patient or doctor).
export async function getAppointmentStats(userId, role) {
    let profileId;

    if (role === 'patient') {
        const { rows } = await query(`SELECT id FROM patients WHERE user_id=$1`, [userId]);
        if (!rows.length) return null;
        profileId = rows[0].id;

        const { rows: stats } = await query(
            `SELECT
         COUNT(*)                                          AS total,
         COUNT(*) FILTER (WHERE status='pending')         AS pending,
         COUNT(*) FILTER (WHERE status='confirmed')       AS confirmed,
         COUNT(*) FILTER (WHERE status='completed')       AS completed,
         COUNT(*) FILTER (WHERE status='cancelled')       AS cancelled,
         COUNT(*) FILTER (WHERE status='no_show')         AS no_show,
         COUNT(*) FILTER (
           WHERE appointment_dt > NOW()
           AND   status IN ('pending','confirmed')
         )                                                AS upcoming
       FROM appointments
       WHERE patient_id = $1`,
            [profileId]
        );
        return stats[0];

    } else if (role === 'doctor') {
        const { rows } = await query(`SELECT id FROM doctors WHERE user_id=$1`, [userId]);
        if (!rows.length) return null;
        profileId = rows[0].id;

        const { rows: stats } = await query(
            `SELECT
         COUNT(*)                                         AS total,
         COUNT(*) FILTER (WHERE status='pending')        AS pending,
         COUNT(*) FILTER (WHERE status='confirmed')      AS confirmed,
         COUNT(*) FILTER (WHERE status='completed')      AS completed,
         COUNT(*) FILTER (WHERE status='cancelled')      AS cancelled,
         COUNT(*) FILTER (WHERE status='no_show')        AS no_show,
         COUNT(*) FILTER (
           WHERE appointment_dt::date = CURRENT_DATE
           AND   status IN ('pending','confirmed','completed')
         )                                               AS today_count,
         COUNT(*) FILTER (
           WHERE appointment_dt > NOW()
           AND   status IN ('pending','confirmed')
         )                                               AS upcoming
       FROM appointments
       WHERE doctor_id = $1`,
            [profileId]
        );
        return stats[0];
    }

    return null;
}

// ── adminGetAllAppointments() ─────────────────────────────────
export async function adminGetAllAppointments({
    status, date, page = 1, pageSize = 20,
}) {
    const offset = (page - 1) * pageSize;

    const { rows } = await query(
        `SELECT *, COUNT(*) OVER() AS total_count
     FROM v_appointment_details
     WHERE ($1::appt_status IS NULL OR status = $1::appt_status)
       AND ($2::date IS NULL OR appointment_dt::date = $2::date)
     ORDER BY appointment_dt DESC
     LIMIT $3 OFFSET $4`,
        [status || null, date || null, pageSize, offset]
    );

    const totalCount = parseInt(rows[0]?.total_count || 0);
    return {
        data: rows.map(({ total_count, ...r }) => r),
        totalCount,
    };
}