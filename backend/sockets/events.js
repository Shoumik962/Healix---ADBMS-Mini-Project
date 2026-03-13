// sockets/events.js
// =============================================================
// Single source of truth for all Socket.io event names.
// Import this on BOTH server and client so event names
// never drift out of sync between the two codebases.
// =============================================================

// ── /meeting namespace ────────────────────────────────────────
export const MEETING = {
    // Client → Server
    START: 'meeting:start',       // doctor starts the room
    JOIN: 'meeting:join',        // patient joins the room
    LEAVE: 'meeting:leave',       // either party leaves (still running)
    END: 'meeting:end',         // doctor terminates session
    MESSAGE: 'meeting:message',     // in-room chat message
    SIGNAL: 'meeting:signal',      // WebRTC offer/answer/ICE relay
    TYPING: 'meeting:typing',      // typing indicator (client → server)
    STATUS_CHECK: 'meeting:status_check',// ask server for room state

    // Server → Client
    STARTED: 'meeting:started',          // doctor: room is open
    JOINED: 'meeting:joined',            // patient: you joined
    PARTICIPANT_JOINED: 'meeting:participant_joined',// other party arrived
    PARTICIPANT_LEFT: 'meeting:participant_left',  // other party left/disconnected
    ENDED: 'meeting:ended',             // session terminated
    WAITING: 'meeting:waiting',           // patient arrived before doctor
    MESSAGE_RECV: 'meeting:message_received',  // broadcast chat message
    SIGNAL_RECV: 'meeting:signal_received',   // forwarded WebRTC signal
    TYPING_RECV: 'meeting:typing',            // typing indicator (server → client)
    STATUS: 'meeting:status',            // room state snapshot
    ERROR: 'meeting:error',             // error response
};

// ── /notifications namespace ──────────────────────────────────
export const NOTIFY = {
    // Server → Client (push)
    NEW: 'notification:new',       // new notification pushed

    // Client → Server
    MARK_READ: 'notification:mark_read',     // mark one as read
    MARK_ALL_READ: 'notification:mark_all_read', // mark all as read
    LIST: 'notification:list',          // paginated fetch

    // Server → Client (response)
    UNREAD_COUNT: 'notification:unread_count',  // badge count
    ERROR: 'notification:error',
};

// ── Default namespace ─────────────────────────────────────────
export const SYSTEM = {
    PING: 'ping',
    PONG: 'pong',
};

// ── Meeting error codes ───────────────────────────────────────
export const MEETING_ERROR = {
    FORBIDDEN: 'FORBIDDEN',
    INVALID_ROOM: 'INVALID_ROOM',
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    PEER_NOT_CONNECTED: 'PEER_NOT_CONNECTED',
    SERVER_ERROR: 'SERVER_ERROR',
    NOT_STARTED: 'NOT_STARTED',
};

// ── Meeting room status values ────────────────────────────────
export const MEETING_STATUS = {
    WAITING: 'waiting',   // room exists, doctor not yet in
    ACTIVE: 'active',    // doctor has started
    ENDED: 'ended',     // doctor terminated
};