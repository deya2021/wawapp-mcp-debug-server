import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, '../../logs');

// Ensure logs directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'audit.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 30, // 30 days retention
    }),
  ],
});

export interface AuditLogEntry {
  timestamp: string;
  toolName: string;
  parameters: Record<string, any>; // Sanitized (no PII)
  executionDurationMs: number;
  resultCount?: number;
  errorOccurred: boolean;
  errorType?: string;
  rateLimitHit: boolean;
}

export function logToolExecution(entry: AuditLogEntry): void {
  auditLogger.info(entry);
}
