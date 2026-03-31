/**
 * Origin-based CSRF protection middleware.
 *
 * For state-changing requests (POST, PUT, DELETE, PATCH), validates that
 * the `Origin` or `Referer` header matches the list of allowed origins.
 *
 * This is the recommended CSRF defence for APIs that don't use cookies
 * for authentication (we use Bearer tokens), but it adds defence-in-depth
 * against cross-origin form submissions and fetch() from malicious sites.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * @param {string[]} allowedOrigins — array of allowed origin strings
 * @param {function} logFn — security logging function (type, req, detail)
 */
export function csrfProtection(allowedOrigins, logFn = () => {}) {
    const origins = new Set(allowedOrigins.map(o => o.toLowerCase()));

    return (req, res, next) => {
        // Safe methods don't need origin validation
        if (SAFE_METHODS.has(req.method)) return next();

        const origin = req.headers['origin'];
        const referer = req.headers['referer'];

        // Extract origin from Referer if Origin header is missing
        let effectiveOrigin = origin;
        if (!effectiveOrigin && referer) {
            try {
                const url = new URL(referer);
                effectiveOrigin = url.origin;
            } catch {
                // Malformed referer — reject
            }
        }

        if (!effectiveOrigin) {
            // No Origin or Referer — reject state-changing requests
            // This blocks curl/Postman in production (which is desired)
            // and prevents null-origin attacks from sandboxed iframes
            logFn('CSRF_REJECT', req, 'Missing Origin/Referer header on state-changing request');
            return res.status(403).json({ error: 'Forbidden: missing origin.' });
        }

        if (!origins.has(effectiveOrigin.toLowerCase())) {
            logFn('CSRF_REJECT', req, `Origin mismatch: ${effectiveOrigin.substring(0, 200)}`);
            return res.status(403).json({ error: 'Forbidden: origin not allowed.' });
        }

        next();
    };
}
