const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const fs = require('fs');
const path = require('path');

function safeStringify(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      return val;
    });
  } catch {
    return '[Unserializable meta]';
  }
}

const logsDir = path.join(__dirname, '..', 'logs');
try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch {}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'trading-intercom' },
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxSize: '50m',
      maxFiles: process.env.LOG_RETENTION_DAYS ? `${process.env.LOG_RETENTION_DAYS}d` : '14d'
    }),
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      zippedArchive: false,
      maxSize: '50m',
      maxFiles: process.env.LOG_RETENTION_DAYS ? `${process.env.LOG_RETENTION_DAYS}d` : '14d'
    })
  ]
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaKeys = meta && Object.keys(meta).length > 0 ? ` ${safeStringify(meta)}` : '';
        return `${timestamp} ${level}: ${message}${metaKeys}`;
      })
    )
  }));
}

module.exports = logger;