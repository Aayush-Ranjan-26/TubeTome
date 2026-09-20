/**
 * Origin-based CSRF protection middleware.
 *
 * For state-changing requests (POST, PUT, DELETE, PATCH), validates that
 * the `Origin` or `Referer` header matches allowed origins.
 *
 * This is the recommended CSRF defence for APIs that don't use cookies
 * for authentication (we use Bearer tokens), but it adds defence-in-depth
 * against cross-origin form submissions and fetch() from malicious sites.
 *
 * @param {string[] | function} allowedOrigins
 *   Either an array of allowed origin strings (legacy), or a function
 *   `(origin: string) => boolean` for dynamic origin validation.
 * @param {function} logFn — security logging function (type, req, detail)
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(allowedOrigins, logFn = () => {}) {
    // Support both legacy array and new dynamic function
    const checkOrigin = typeof allowedOrigins === 'function'
        ? allowedOrigins
        : ((o) => {
            const set = new Set(allowedOrigins.map(x => x.toLowerCase()));
            return set.has(o.toLowerCase());
        });

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
            // No Origin or Referer — reject state-changing requests.
            // Blocks curl/Postman in production (desired) and prevents
            // null-origin attacks from sandboxed iframes.
            logFn('CSRF_REJECT', req, 'Missing Origin/Referer header on state-changing request');
            return res.status(403).json({ error: 'Forbidden: missing origin.' });
        }

        if (!checkOrigin(effectiveOrigin)) {
            logFn('CSRF_REJECT', req, `Origin mismatch: ${effectiveOrigin.substring(0, 200)}`);
            return res.status(403).json({ error: 'Forbidden: origin not allowed.' });
        }

        next();
    };
}
