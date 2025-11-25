import { checkRateLimit } from '../security/rate-limiter.js';
import { logToolExecution, type AuditLogEntry } from '../security/audit-logger.js';
import { normalizeError } from '../utils/error-handlers.js';

export function applyMiddleware(
  toolName: string,
  handler: (params: any) => Promise<any>
): (params: any) => Promise<any> {
  return async (params: any) => {
    const startTime = Date.now();
    let error: any = null;
    let result: any = null;
    let rateLimitHit = false;

    try {
      // 1. Rate limiting
      const rateLimitCheck = checkRateLimit(toolName);
      if (!rateLimitCheck.allowed) {
        rateLimitHit = true;
        throw new Error(
          `Rate limit exceeded for ${toolName}. Retry after ${rateLimitCheck.retryAfter} seconds.`
        );
      }

      // 2. Execute tool
      result = await handler(params);
    } catch (err) {
      error = normalizeError(err);
      throw error;
    } finally {
      // 3. Audit logging
      const duration = Date.now() - startTime;
      const auditEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        toolName,
        parameters: sanitizeParams(params),
        executionDurationMs: duration,
        resultCount: Array.isArray(result) ? result.length : undefined,
        errorOccurred: error !== null,
        errorType: error?.code,
        rateLimitHit,
      };

      logToolExecution(auditEntry);
    }

    return result;
  };
}

function sanitizeParams(params: any): any {
  if (!params) return {};

  const sanitized = { ...params };
  // Remove PII from params before logging
  delete sanitized.phone;
  delete sanitized.name;
  delete sanitized.fcmToken;

  return sanitized;
}
