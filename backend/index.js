// =============================================================
// index.js — HEALIX Backend Entry Point
// Express application bootstrap: middleware, routes, sockets.
// =============================================================
import 'dotenv/config';
import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import logger from './utils/logger.js';
import { testConnection }         from './db/index.js';
import { initSocketServer }       from './sockets/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter }             from './middleware/rateLimiter.js';

// ── Route modules ──────────────────────────────────────────────
import authRouter                 from './routes/auth.js';
import appointmentsRouter         from './routes/appointments.js';
import doctorsRouter              from './routes/doctors.js';
import { patientsRouter }         from './routes/patients.js';
import { prescriptionsRouter }    from './routes/prescriptions.js';
import { adminRouter }            from './routes/admin.js';
import { notificationsRouter }    from './routes/notification.js';

// ── Express app ────────────────────────────────────────────────
const app = express();

// ── Security & utility middleware ──────────────────────────────
app.use(helmet());

app.use(cors({
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── HTTP request logging ───────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}

// ── Rate limiting ──────────────────────────────────────────────
app.use('/api', apiLimiter);

// ── Health check ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ─────────────────────────────────────────────────
const API = '/api/v1';
app.use(`${API}/auth`,           authRouter);
app.use(`${API}/appointments`,   appointmentsRouter);
app.use(`${API}/doctors`,        doctorsRouter);
app.use(`${API}/patients`,       patientsRouter);
app.use(`${API}/prescriptions`,  prescriptionsRouter);
app.use(`${API}/admin`,          adminRouter);
app.use(`${API}/notifications`,  notificationsRouter);

// ── 404 & error handlers (must be last) ───────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── HTTP + Socket.io server ────────────────────────────────────
const PORT   = parseInt(process.env.PORT  || '5000');
const HOST   = process.env.HOST           || '0.0.0.0';

const httpServer = http.createServer(app);
const io = initSocketServer(httpServer);

// Make io accessible inside controllers via req.app.get('io')
app.set('io', io);

// ── Start ──────────────────────────────────────────────────────
async function start() {
    // Verify DB connection before accepting traffic
    const dbOk = await testConnection();
    if (!dbOk) {
        logger.error('❌ Could not connect to the database. Exiting.');
        process.exit(1);
    }

    httpServer.listen(PORT, HOST, () => {
        logger.info(`🚀 HEALIX API running at http://${HOST}:${PORT}`);
        logger.info(`   Environment : ${process.env.NODE_ENV || 'development'}`);
        logger.info(`   API prefix  : ${API}`);
    });
}

// ── Graceful shutdown ──────────────────────────────────────────
function shutdown(signal) {
    logger.info(`${signal} received — shutting down gracefully…`);
    httpServer.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
    });
    // Force exit after 10 s if connections are hanging
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    process.exit(1);
});

start();
