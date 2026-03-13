// services/socketService.js
// =============================================================
// Bridge between HTTP controllers and Socket.io.
// Controllers call these functions after DB writes so that
// real-time events are pushed without controllers needing to
// know anything about Socket.io internals.
//
// Usage in a controller:
//   import * as socketService from '../services/socketService.js';
//   socketService.notifyAppointmentBooked(req.app.get('io'), { ... });
// =============================================================
import { NOTIFY, MEETING } from '../sockets/events.js';
import logger from '../utils/logger.js';

// ── getIO() ───────────────────────────────────────────────────
// Safely retrieves the Socket.io instance attached to the HTTP server.
// Returns null if not initialised (e.g. during tests).
function getIO(app) {
    return app?.get('io') || null;
}

// ── pushToUser() ──────────────────────────────────────────────
// Emit an event directly to a user's personal room across ALL namespaces.
export function pushToUser(io, userId, event, payload) {
    if (!io) return;
    try {
        io.to(`user:${userId}`).emit(event, {
            ...payload,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error('pushToUser error', { userId, event, err: err.message });
    }
}

// ── pushToRoom() ──────────────────────────────────────────────
// Emit an event to everyone in a meeting room.
export function pushToRoom(io, roomId, event, payload) {
    if (!io) return;
    try {
        io.of('/meeting').to(roomId).emit(event, {
            ...payload,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error('pushToRoom error', { roomId, event, err: err.message });
    }
}

// ── Notification push helpers ─────────────────────────────────

export function notifyAppointmentBooked(io, { patientUserId, doctorUserId, appointment }) {
    const base = {
        type: 'appointment_booked',
        appointment_id: appointment.id,
        appointment_dt: appointment.appointment_dt,
        meeting_room_id: appointment.meeting_room_id,
    };

    pushToUser(io, patientUserId, NOTIFY.NEW, {
        ...base,
        title: 'Appointment Confirmed',
        message: `Your appointment with ${appointment.doctor_name} is booked for ${formatDt(appointment.appointment_dt)}.`,
    });

    pushToUser(io, doctorUserId, NOTIFY.NEW, {
        ...base,
        title: 'New Appointment',
        message: `${appointment.patient_name} has booked an appointment on ${formatDt(appointment.appointment_dt)}.`,
    });
}

export function notifyAppointmentCancelled(io, { patientUserId, doctorUserId, appointment, cancelledBy }) {
    const base = {
        type: 'appointment_cancelled',
        appointment_id: appointment.id,
        appointment_dt: appointment.appointment_dt,
        cancelled_by: cancelledBy,
    };

    pushToUser(io, patientUserId, NOTIFY.NEW, {
        ...base,
        title: 'Appointment Cancelled',
        message: cancelledBy === 'doctor'
            ? `Your appointment on ${formatDt(appointment.appointment_dt)} was cancelled by the doctor.`
            : `Your appointment on ${formatDt(appointment.appointment_dt)} has been cancelled.`,
    });

    pushToUser(io, doctorUserId, NOTIFY.NEW, {
        ...base,
        title: 'Appointment Cancelled',
        message: cancelledBy === 'patient'
            ? `Patient cancelled their appointment on ${formatDt(appointment.appointment_dt)}.`
            : `Appointment on ${formatDt(appointment.appointment_dt)} has been cancelled.`,
    });
}

export function notifyAppointmentCompleted(io, { patientUserId, doctorUserId, appointment }) {
    pushToUser(io, patientUserId, NOTIFY.NEW, {
        type: 'appointment_completed',
        title: 'Appointment Completed',
        message: `Your appointment with ${appointment.doctor_name} has been completed.`,
        appointment_id: appointment.id,
    });
}

export function notifyPrescriptionIssued(io, { patientUserId, prescription }) {
    pushToUser(io, patientUserId, NOTIFY.NEW, {
        type: 'prescription_issued',
        title: 'New Prescription',
        message: `A prescription has been issued for you. Diagnosis: ${prescription.diagnosis}`,
        prescription_id: prescription.id,
    });
}

export function notifyDoctorStatusChanged(io, { doctorUserId, status }) {
    const messages = {
        approved: 'Your doctor account has been approved. You can now accept appointments.',
        rejected: 'Your doctor account application was not approved. Contact support.',
        suspended: 'Your doctor account has been suspended. Contact support.',
    };

    pushToUser(io, doctorUserId, NOTIFY.NEW, {
        type: 'doctor_status_changed',
        title: status === 'approved' ? '🎉 Account Approved' : 'Account Status Changed',
        message: messages[status] || `Your account status changed to: ${status}`,
        status,
    });
}

export function notifyMeetingStarted(io, { patientUserId, roomId, doctorName, appointmentDt }) {
    pushToUser(io, patientUserId, NOTIFY.NEW, {
        type: 'meeting_started',
        title: 'Your Doctor is Ready',
        message: `Dr. ${doctorName} has started your consultation. Join now.`,
        room_id: roomId,
    });
}

// ── Meeting room push helpers ─────────────────────────────────
export function broadcastMeetingStatus(io, roomId, status, participants) {
    pushToRoom(io, roomId, MEETING.STATUS, { roomId, status, participants });
}

// ── Utility ───────────────────────────────────────────────────
function formatDt(dt) {
    if (!dt) return 'your scheduled time';
    return new Date(dt).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}