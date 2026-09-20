/** Structured security-event logger. Output goes to stdout, which Vercel captures. */

/**
 * @param {string} type   event type (AUTH_FAIL, RATE_LIMIT, CSRF_REJECT, ...)
 * @param {object} req    Express request (may be null)
 * @param {string} detail human-readable description (truncated to 500 chars)
 */
export function logSecurityEvent(type, req, detail = '') {
    console.warn(`[SECURITY] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        type,
        requestId: req?.requestId || null,
        ip: req?.ip || 'unknown',
        method: req?.method || '',
        path: req?.path?.substring(0, 200) || '',
        userAgent: req?.headers?.['user-agent']?.substring(0, 200) || '',
        userId: req?.user?.id || null,
        detail: typeof detail === 'string' ? detail.substring(0, 500) : '',
    })}`);
}
