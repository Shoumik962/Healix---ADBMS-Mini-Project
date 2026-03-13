// sockets/handlers/meetingHandler.js
// =============================================================
// Handles all events inside the /meeting namespace.
//
// Room lifecycle:
//   1. Doctor emits  meeting:start    → room status = 'active'
//   2. Patient emits meeting:join     → both parties connected
//   3. Both emit     meeting:message  → relayed to other party
//   4. Both can emit meeting:signal   → WebRTC signalling relay
//   5. Either emits  meeting:leave    → graceful exit
//   6. Doctor emits  meeting:end      → room status = 'ended', DB updated
//
// WebRTC signalling (offer/answer/ICE) is relayed through this
// server — the server never inspects the signal payload, just
// forwards it to the other participant in the room.
// =============================================================
import { query } from '../../db/index.js';
import logger from '../../utils/logger.js';

// ── Event name constants ───────────────────────────────────────
export const MEETING_EVENTS = {
  // Client → Server
  START: 'meeting:start',
  JOIN: 'meeting:join',
  LEAVE: 'meeting:leave',
  END: 'meeting:end',
  MESSAGE: 'meeting:message',
  SIGNAL: 'meeting:signal',       // WebRTC offer/answer/ICE
  TYPING: 'meeting:typing',
  STATUS_CHECK: 'meeting:status_check',

  // Server → Client
  STARTED: 'meeting:started',
  JOINED: 'meeting:joined',
  PARTICIPANT_JOINED: 'meeting:participant_joined',
  PARTICIPANT_LEFT: 'meeting:participant_left',
  ENDED: 'meeting:ended',
  MESSAGE_RECV: 'meeting:message_received',
  SIGNAL_RECV: 'meeting:signal_received',
  TYPING_RECV: 'meeting:typing',
  STATUS: 'meeting:status',
  ERROR: 'meeting:error',
  WAITING: 'meeting:waiting',
};

// ── Validate appointment ownership ────────────────────────────
async function validateAppointmentAccess(roomId, userId, role) {
  const { rows } = await query(
    `SELECT
       a.id,
       a.status,
       a.meeting_status,
       a.appointment_dt,
       a.end_dt,
       p.user_id AS patient_user_id,
       d.user_id AS doctor_user_id,
       p.first_name || ' ' || p.last_name AS patient_name,
       'Dr. ' || d.first_name || ' ' || d.last_name AS doctor_name
     FROM   appointments a
     JOIN   patients p ON a.patient_id = p.id
     JOIN   doctors  d ON a.doctor_id  = d.id
     WHERE  a.meeting_room_id = $1`,
    [roomId]
  );

  if (!rows.length) return { valid: false, error: 'Room not found' };

  const appt = rows[0];

  // Check appointment belongs to this user
  const isDoctor = role === 'doctor' && appt.doctor_user_id === userId;
  const isPatient = role === 'patient' && appt.patient_user_id === userId;
  const isAdmin = role === 'admin';

  if (!isDoctor && !isPatient && !isAdmin) {
    return { valid: false, error: 'Not authorised for this room' };
  }

  // Check appointment is not cancelled or expired
  if (appt.status === 'cancelled') {
    return { valid: false, error: 'Appointment has been cancelled' };
  }

  // Patients can only join within 15 min before → end of slot
  if (role === 'patient') {
    const windowStart = new Date(appt.appointment_dt);
    windowStart.setMinutes(windowStart.getMinutes() - 15);
    const windowEnd = new Date(appt.end_dt);
    windowEnd.setMinutes(windowEnd.getMinutes() + 30); // grace period

    const now = new Date();
    if (now < windowStart) {
      return { valid: false, error: 'Meeting has not started yet. You can join 15 minutes before.' };
    }
    if (now > windowEnd) {
      return { valid: false, error: 'Meeting window has passed' };
    }
  }

  return { valid: true, appointment: appt };
}

// ── Update meeting_status in DB ───────────────────────────────
async function updateMeetingStatus(roomId, status) {
  await query(
    `UPDATE appointments
     SET    meeting_status = $2::meeting_status
     WHERE  meeting_room_id = $1`,
    [roomId, status]
  );
}

// ── meetingHandler ────────────────────────────────────────────
export function meetingHandler(socket, nsp, activeRooms) {
  const { user } = socket;

  logger.info(`Meeting socket connected: ${user.role} ${user.id} [${socket.id}]`);

  // ── meeting:start (Doctor only) ──────────────────────────
  socket.on(MEETING_EVENTS.START, async ({ roomId }) => {
    try {
      if (user.role !== 'doctor' && user.role !== 'admin') {
        return socket.emit(MEETING_EVENTS.ERROR, {
          code: 'FORBIDDEN', message: 'Only doctors can start meetings',
        });
      }

      const { valid, error, appointment } = await validateAppointmentAccess(
        roomId, user.id, user.role
      );
      if (!valid) {
        return socket.emit(MEETING_EVENTS.ERROR, { code: 'INVALID_ROOM', message: error });
      }

      // Join the socket room
      socket.join(roomId);

      // Register in activeRooms
      const roomState = {
        roomId,
        appointmentId: appointment.id,
        doctorSocketId: socket.id,
        patientSocketId: null,
        startedAt: new Date().toISOString(),
        status: 'active',
        messages: [],
        participants: {
          doctor: { socketId: socket.id, name: appointment.doctor_name, joined: true },
          patient: { socketId: null, name: appointment.patient_name, joined: false },
        },
      };
      activeRooms.set(roomId, roomState);

      // Update DB
      await updateMeetingStatus(roomId, 'active');

      // Confirm to doctor
      socket.emit(MEETING_EVENTS.STARTED, {
        roomId,
        appointmentId: appointment.id,
        appointment_dt: appointment.appointment_dt,
        end_dt: appointment.end_dt,
        patient_name: appointment.patient_name,
        message: 'Meeting started. Waiting for patient to join.',
      });

      logger.info(`Meeting started: room=${roomId} doctor=${user.id}`);

    } catch (err) {
      logger.error('meeting:start error', err);
      socket.emit(MEETING_EVENTS.ERROR, { code: 'SERVER_ERROR', message: err.message });
    }
  });

  // ── meeting:join (Patient) ───────────────────────────────
  socket.on(MEETING_EVENTS.JOIN, async ({ roomId }) => {
    try {
      const { valid, error, appointment } = await validateAppointmentAccess(
        roomId, user.id, user.role
      );
      if (!valid) {
        return socket.emit(MEETING_EVENTS.ERROR, { code: 'INVALID_ROOM', message: error });
      }

      // Join socket room
      socket.join(roomId);

      const room = activeRooms.get(roomId);

      if (!room) {
        // Doctor hasn't started yet — inform patient to wait
        socket.emit(MEETING_EVENTS.WAITING, {
          roomId,
          message: 'Doctor has not started the meeting yet. Please wait.',
          doctor_name: appointment.doctor_name,
        });
        // Still track the patient as waiting
        activeRooms.set(roomId, {
          roomId,
          appointmentId: appointment.id,
          doctorSocketId: null,
          patientSocketId: socket.id,
          status: 'waiting',
          messages: [],
          participants: {
            doctor: { socketId: null, name: appointment.doctor_name, joined: false },
            patient: { socketId: socket.id, name: `${user.firstName} ${user.lastName}`, joined: true },
          },
        });
        return;
      }

      // Update room state
      room.patientSocketId = socket.id;
      room.participants.patient.socketId = socket.id;
      room.participants.patient.joined = true;
      activeRooms.set(roomId, room);

      // Confirm to patient
      socket.emit(MEETING_EVENTS.JOINED, {
        roomId,
        appointmentId: appointment.id,
        appointment_dt: appointment.appointment_dt,
        end_dt: appointment.end_dt,
        doctor_name: appointment.doctor_name,
        message: 'Successfully joined the meeting.',
      });

      // Notify doctor that patient has joined
      nsp.to(roomId).except(socket.id).emit(MEETING_EVENTS.PARTICIPANT_JOINED, {
        role: 'patient',
        name: `${user.firstName} ${user.lastName}`,
        socketId: socket.id,
        joined_at: new Date().toISOString(),
      });

      // Broadcast updated room status to both
      nsp.to(roomId).emit(MEETING_EVENTS.STATUS, {
        roomId,
        status: 'active',
        participants: room.participants,
      });

      logger.info(`Patient joined meeting: room=${roomId} patient=${user.id}`);

    } catch (err) {
      logger.error('meeting:join error', err);
      socket.emit(MEETING_EVENTS.ERROR, { code: 'SERVER_ERROR', message: err.message });
    }
  });

  // ── meeting:signal (WebRTC relay) ────────────────────────
  // Forwards WebRTC offer / answer / ICE candidates to the
  // other participant. Server never reads signal content.
  socket.on(MEETING_EVENTS.SIGNAL, ({ roomId, signal, targetSocketId }) => {
    try {
      const room = activeRooms.get(roomId);
      if (!room) {
        return socket.emit(MEETING_EVENTS.ERROR, { code: 'ROOM_NOT_FOUND' });
      }

      // Determine target: relay to the OTHER participant
      const target = targetSocketId ||
        (socket.id === room.doctorSocketId
          ? room.patientSocketId
          : room.doctorSocketId);

      if (!target) {
        return socket.emit(MEETING_EVENTS.ERROR, {
          code: 'PEER_NOT_CONNECTED',
          message: 'Other participant is not connected yet',
        });
      }

      // Relay signal to target socket
      nsp.to(target).emit(MEETING_EVENTS.SIGNAL_RECV, {
        signal,
        fromSocketId: socket.id,
        fromRole: user.role,
        roomId,
      });

    } catch (err) {
      logger.error('meeting:signal error', err);
    }
  });

  // ── meeting:message (in-room chat) ───────────────────────
  socket.on(MEETING_EVENTS.MESSAGE, ({ roomId, text }) => {
    try {
      if (!text?.trim()) return;

      const room = activeRooms.get(roomId);
      if (!room) {
        return socket.emit(MEETING_EVENTS.ERROR, { code: 'ROOM_NOT_FOUND' });
      }

      const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        senderId: user.id,
        senderName: `${user.firstName} ${user.lastName}`,
        role: user.role,
        text: text.trim().substring(0, 1000), // cap at 1000 chars
        timestamp: new Date().toISOString(),
      };

      // Store in memory (for reconnect replay)
      room.messages.push(message);
      if (room.messages.length > 100) room.messages.shift(); // rolling buffer

      // Broadcast to everyone in the room including sender
      nsp.to(roomId).emit(MEETING_EVENTS.MESSAGE_RECV, message);

    } catch (err) {
      logger.error('meeting:message error', err);
    }
  });

  // ── meeting:typing ───────────────────────────────────────
  socket.on(MEETING_EVENTS.TYPING, ({ roomId, isTyping }) => {
    socket.to(roomId).emit(MEETING_EVENTS.TYPING_RECV, {
      userId: user.id,
      role: user.role,
      name: `${user.firstName} ${user.lastName}`,
      isTyping: !!isTyping,
    });
  });

  // ── meeting:status_check ─────────────────────────────────
  socket.on(MEETING_EVENTS.STATUS_CHECK, ({ roomId }) => {
    const room = activeRooms.get(roomId);
    socket.emit(MEETING_EVENTS.STATUS, {
      roomId,
      status: room?.status || 'not_started',
      participants: room?.participants || null,
      startedAt: room?.startedAt || null,
    });
  });

  // ── meeting:leave ────────────────────────────────────────
  socket.on(MEETING_EVENTS.LEAVE, async ({ roomId }) => {
    try {
      socket.leave(roomId);

      const room = activeRooms.get(roomId);
      if (room) {
        // Update participant state
        if (socket.id === room.doctorSocketId) {
          room.participants.doctor.joined = false;
          room.participants.doctor.socketId = null;
          room.doctorSocketId = null;
        } else if (socket.id === room.patientSocketId) {
          room.participants.patient.joined = false;
          room.participants.patient.socketId = null;
          room.patientSocketId = null;
        }
        activeRooms.set(roomId, room);
      }

      // Notify remaining participants
      nsp.to(roomId).emit(MEETING_EVENTS.PARTICIPANT_LEFT, {
        role: user.role,
        name: `${user.firstName} ${user.lastName}`,
        socketId: socket.id,
        left_at: new Date().toISOString(),
      });

      logger.info(`${user.role} left meeting: room=${roomId}`);

    } catch (err) {
      logger.error('meeting:leave error', err);
    }
  });

  // ── meeting:end (Doctor only — terminates session) ───────
  socket.on(MEETING_EVENTS.END, async ({ roomId, notes }) => {
    try {
      if (user.role !== 'doctor' && user.role !== 'admin') {
        return socket.emit(MEETING_EVENTS.ERROR, {
          code: 'FORBIDDEN', message: 'Only the doctor can end a meeting',
        });
      }

      const room = activeRooms.get(roomId);

      // Notify all in room that meeting ended
      nsp.to(roomId).emit(MEETING_EVENTS.ENDED, {
        roomId,
        endedBy: user.role,
        endedAt: new Date().toISOString(),
        message: 'The meeting has ended.',
        duration: room?.startedAt
          ? Math.round((Date.now() - new Date(room.startedAt).getTime()) / 1000)
          : null,
      });

      // Update DB: meeting_status → ended
      await updateMeetingStatus(roomId, 'ended');

      // Save any meeting notes to appointment
      if (notes?.trim()) {
        await query(
          `UPDATE appointments SET notes = $1 WHERE meeting_room_id = $2`,
          [notes.trim(), roomId]
        );
      }

      // Clean up in-memory state
      activeRooms.delete(roomId);

      // Remove all sockets from the room
      const socketsInRoom = await nsp.in(roomId).fetchSockets();
      for (const s of socketsInRoom) {
        s.leave(roomId);
      }

      logger.info(`Meeting ended: room=${roomId} by ${user.role} ${user.id}`);

    } catch (err) {
      logger.error('meeting:end error', err);
      socket.emit(MEETING_EVENTS.ERROR, { code: 'SERVER_ERROR', message: err.message });
    }
  });

  // ── Disconnect handler ────────────────────────────────────
  socket.on('disconnect', async (reason) => {
    logger.info(`Meeting socket disconnected: ${user.role} ${user.id} — ${reason}`);

    // Find any rooms this socket was part of and notify peers
    for (const [roomId, room] of activeRooms.entries()) {
      const wasDoctor = socket.id === room.doctorSocketId;
      const wasPatient = socket.id === room.patientSocketId;

      if (!wasDoctor && !wasPatient) continue;

      // Mark as disconnected (not removed — may reconnect)
      if (wasDoctor) { room.participants.doctor.joined = false; room.doctorSocketId = null; }
      if (wasPatient) { room.participants.patient.joined = false; room.patientSocketId = null; }
      activeRooms.set(roomId, room);

      nsp.to(roomId).emit(MEETING_EVENTS.PARTICIPANT_LEFT, {
        role: user.role,
        name: `${user.firstName} ${user.lastName}`,
        socketId: socket.id,
        reason,
        left_at: new Date().toISOString(),
      });
    }
  });
}