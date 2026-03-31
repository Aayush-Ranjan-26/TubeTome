/**
 * Request ID middleware — attaches a unique ID to every request
 * for log correlation and incident tracing.
 */
import crypto from 'node:crypto';

/**
 * Generates a compact, URL-safe request ID.
 * Format: timestamp prefix + random suffix for uniqueness + ordering.
 */
function generateRequestId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex');
    return `${timestamp}-${random}`;
}

/**
 * Express middleware: attaches `req.requestId` and sets
 * the `X-Request-Id` response header for client correlation.
 */
export function requestIdMiddleware(req, res, next) {
    const id = req.headers['x-request-id']?.substring(0, 64) || generateRequestId();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
}
