// utils/logger.js — Winston structured logger
import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logDir = 'logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Custom console format for development
const devFormat = combine(
    colorize(),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
    })
);

// JSON format for production / log files
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: prodFormat,
    transports: [
        // Console: human-readable in dev, JSON in prod
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
        }),
        // Rotating file transport (all levels)
        new winston.transports.File({
            filename: path.join(logDir, 'healix.log'),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            tailable: true,
        }),
        // Separate error log
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
        }),
    ],
});

export default logger;