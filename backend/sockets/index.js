// sockets/index.js — Socket.io server (stub for Step 4)
// Full implementation in Step 7
import { Server } from 'socket.io';
import logger from '../utils/logger.js';

export function initSocketServer(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    io.on('connection', (socket) => {
        logger.info(`Socket connected: ${socket.id}`);
        socket.on('disconnect', () => {
            logger.info(`Socket disconnected: ${socket.id}`);
        });
    });

    logger.info('Socket.io server initialised');
    return io;
}