// sockets/handlers/notificationHandler.js
// =============================================================
// Handles the /notifications namespace.
//
// On connect: auto-join user's personal room, deliver unread count.
// Server pushes: notification:new  (from HTTP controllers via pushNotification())
// Client emits:  notification:mark_read, notification:mark_all_read
// =============================================================
import { query } from '../../db/index.js';
import logger from '../../utils/logger.js';

export const NOTIFY_EVENTS = {
    NEW: 'notification:new',
    MARK_READ: 'notification:mark_read',
    MARK_ALL_READ: 'notification:mark_all_read',
    UNREAD_COUNT: 'notification:unread_count',
    LIST: 'notification:list',
    ERROR: 'notification:error',
};

export function notificationHandler(socket, nsp) {
    const { user } = socket;

    // Every user joins their personal room immediately on connect.
    // HTTP controllers call  io.to(`user:${userId}`).emit(...)  to push.
    socket.join(`user:${user.id}`);

    logger.info(`Notification socket connected: ${user.role} ${user.id}`);

    // ── Deliver unread count on connect ───────────────────────
    sendUnreadCount(socket, user.id);

    // ── notification:mark_read ────────────────────────────────
    socket.on(NOTIFY_EVENTS.MARK_READ, async ({ notificationId }) => {
        try {
            const { rowCount } = await query(
                `UPDATE notifications
         SET    is_read = TRUE
         WHERE  id = $1 AND user_id = $2 AND is_read = FALSE`,
                [notificationId, user.id]
            );

            if (rowCount > 0) {
                // Re-emit updated unread count
                await sendUnreadCount(socket, user.id);
            }
        } catch (err) {
            logger.error('notification:mark_read error', err);
            socket.emit(NOTIFY_EVENTS.ERROR, { message: 'Failed to mark notification as read' });
        }
    });

    // ── notification:mark_all_read ────────────────────────────
    socket.on(NOTIFY_EVENTS.MARK_ALL_READ, async () => {
        try {
            await query(
                `UPDATE notifications SET is_read = TRUE
         WHERE  user_id = $1 AND is_read = FALSE`,
                [user.id]
            );
            socket.emit(NOTIFY_EVENTS.UNREAD_COUNT, { count: 0 });
        } catch (err) {
            logger.error('notification:mark_all_read error', err);
            socket.emit(NOTIFY_EVENTS.ERROR, { message: 'Failed to mark all as read' });
        }
    });

    // ── notification:list (paginated fetch) ───────────────────
    socket.on(NOTIFY_EVENTS.LIST, async ({ page = 1, pageSize = 20, unreadOnly = false }) => {
        try {
            const offset = (page - 1) * pageSize;
            const { rows } = await query(
                `SELECT *, COUNT(*) OVER() AS total_count
         FROM   notifications
         WHERE  user_id = $1
           AND  ($2::boolean = FALSE OR is_read = FALSE)
         ORDER  BY created_at DESC
         LIMIT  $3 OFFSET $4`,
                [user.id, unreadOnly, pageSize, offset]
            );

            const totalCount = parseInt(rows[0]?.total_count || 0);
            socket.emit(NOTIFY_EVENTS.LIST, {
                notifications: rows.map(({ total_count, ...r }) => r),
                pagination: {
                    page, pageSize,
                    totalCount,
                    totalPages: Math.ceil(totalCount / pageSize),
                },
            });
        } catch (err) {
            logger.error('notification:list error', err);
            socket.emit(NOTIFY_EVENTS.ERROR, { message: 'Failed to fetch notifications' });
        }
    });

    socket.on('disconnect', () => {
        logger.info(`Notification socket disconnected: ${user.id}`);
    });
}

// ── Helper: emit unread count to a specific socket ────────────
async function sendUnreadCount(socket, userId) {
    try {
        const { rows } = await query(
            `SELECT COUNT(*) AS count FROM notifications
       WHERE  user_id = $1 AND is_read = FALSE`,
            [userId]
        );
        socket.emit(NOTIFY_EVENTS.UNREAD_COUNT, { count: parseInt(rows[0].count) });
    } catch (err) {
        logger.error('sendUnreadCount error', err);
    }
}