// index.js — HEALIX Server Entry Point
import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { testConnection } from './db/index.js';
import logger from './utils/logger.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import appointmentRoutes from './routes/appointments.js';
import doctorRoutes from './routes/doctors.js';
import { patientsRouter } from './routes/patients.js';
import { prescriptionsRouter } from './routes/prescriptions.js';
import { adminRouter } from './routes/admin.js';
import { notificationsRouter } from './routes/notification.js';
import { initSocketServer } from './sockets/index.js';

const app = express();
const server = http.createServer(app);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.http(msg.trim()) },
}));
app.use('/api/', apiLimiter);

app.get('/health', async (req, res) => {
    const dbOk = await testConnection();
    res.status(dbOk ? 200 : 503).json({
        status: dbOk ? 'ok' : 'degraded', service: 'HEALIX API',
        timestamp: new Date().toISOString(), uptime: process.uptime(),
    });
});

const API = '/api/v1';
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/appointments`, appointmentRoutes);
app.use(`${API}/doctors`, doctorRoutes);
app.use(`${API}/patients`, patientsRouter);
app.use(`${API}/prescriptions`, prescriptionsRouter);
app.use(`${API}/admin`, adminRouter);
app.use(`${API}/notifications`, notificationsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

// Init Socket.io and attach io to app for use in controllers
const io = initSocketServer(server);
app.set('io', io);

const PORT = parseInt(process.env.PORT || '5000');

async function start() {
    const dbOk = await testConnection();
    if (!dbOk) { logger.error('Cannot connect to database. Exiting.'); process.exit(1); }
    server.listen(PORT, () => {
        logger.info(`HEALIX API running on http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
        logger.info(`WebSocket server ready on ws://localhost:${PORT}`);
    });
}

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('unhandledRejection', (err) => { logger.error('Unhandled rejection:', err); process.exit(1); });

start();
export { app, server, io };