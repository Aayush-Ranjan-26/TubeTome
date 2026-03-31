/**
 * Persistent security event logger.
 *
 * Writes structured JSONL (one JSON object per line) to `logs/security.log`
 * in addition to console output. Provides a durable audit trail that
 * survives server restarts.
 *
 * Features:
 *   - Append-only JSONL format (easy to grep, ingest, parse)
 *   - Auto-creates log directory
 *   - Includes request ID for correlation
 *   - Non-blocking writes (won't crash server on I/O failure)
 */
import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.resolve('logs');
const LOG_FILE = path.join(LOG_DIR, 'security.log');

// Ensure log directory exists (sync, runs once at import)
try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
} catch { /* directory may already exist */ }

/**
 * Log a security event to both console and file.
 *
 * @param {string} type — event type (AUTH_FAIL, RATE_LIMIT, CSRF_REJECT, etc.)
 * @param {object} req — Express request object (optional, can be null)
 * @param {string} detail — human-readable description (truncated to 500 chars)
 */
export function logSecurityEvent(type, req, detail = '') {
    const entry = {
        timestamp: new Date().toISOString(),
        type,
        requestId: req?.requestId || null,
        ip: req?.ip || 'unknown',
        method: req?.method || '',
        path: req?.path?.substring(0, 200) || '',
        userAgent: req?.headers?.['user-agent']?.substring(0, 200) || '',
        userId: req?.user?.id || null,
        detail: typeof detail === 'string' ? detail.substring(0, 500) : '',
    };

    // Console output
    console.warn(`[SECURITY] ${JSON.stringify(entry)}`);

    // File output (non-blocking, fire-and-forget)
    try {
        fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', (err) => {
            if (err) console.error('[SECURITY_LOG] Write failed:', err.message);
        });
    } catch {
        // Swallow — never crash the server due to logging
    }
}
