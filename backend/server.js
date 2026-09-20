import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { fetchPlaylistVideos } from './youtube.js';
import { requestIdMiddleware } from './src/security/requestId.js';
import { csrfProtection } from './src/security/csrf.js';
import { logSecurityEvent } from './src/security/logger.js';

/* ══════════════════════════════════════════════════════
   STARTUP VALIDATION — fail fast on missing config
   ══════════════════════════════════════════════════════ */
const REQUIRED_ENV = ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingVars = REQUIRED_ENV.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.error(`\n✗ FATAL: Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('  Set them in the Vercel project settings (see backend/.env.example).\n');
    process.exit(1);
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const app = express();

// Explicitly remove X-Powered-By header (Helmet does this, but be explicit)
app.disable('x-powered-by');

/* ══════════════════════════════════════════════════════
   0. TRUST PROXY (required behind reverse proxy / load balancer)
   ══════════════════════════════════════════════════════ */
if (IS_PRODUCTION) {
    app.set('trust proxy', 1);
}

/* ══════════════════════════════════════════════════════
   0.5. REQUEST ID (must be first middleware for log correlation)
   ══════════════════════════════════════════════════════ */
app.use(requestIdMiddleware);
// Health check + keepalive (Render/HF probes have no Origin, so this sits before CORS). A daily Vercel cron hits it:
// pings the Space (free Spaces sleep after 48h idle) and Supabase (free projects pause after 7 days idle).
app.get('/healthz', async (_req, res) => {
    const pings = [];
    if (process.env.KEEPALIVE_URL) pings.push(fetch(process.env.KEEPALIVE_URL));
    if (process.env.SUPABASE_URL) pings.push(fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, { headers: { apikey: process.env.SUPABASE_ANON_KEY } }));
    await Promise.allSettled(pings);
    res.send('ok');
});

/* ══════════════════════════════════════════════════════
   1. SECURITY HEADERS (Helmet + custom)
   ══════════════════════════════════════════════════════ */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

// Additional security headers not covered by Helmet
app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY'); // legacy browsers (CSP frame-ancestors covers modern)
    next();
});

/* ══════════════════════════════════════════════════════
   2. CORS – dynamic origin validation
   Accepts any HTTPS origin; plain-HTTP origins are rejected.
   Primary security is JWT — CORS is defence-in-depth.
   ══════════════════════════════════════════════════════ */

// Explicit allow-list (always permitted regardless of protocol)
const ALLOWED_ORIGINS_EXPLICIT = [
    'https://tube-tome.vercel.app',     // Production Vercel frontend
    ...(process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
        : []),
];

// Optional compiled regex patterns for fine-grained control
// Example: ALLOWED_ORIGIN_PATTERNS=^https://tubetome-[a-z0-9-]+\.vercel\.app$
const ALLOWED_ORIGIN_PATTERNS = (process.env.ALLOWED_ORIGIN_PATTERNS || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => { try { return new RegExp(p); } catch { return null; } })
    .filter(Boolean);

/**
 * Returns true if the origin should be allowed.
 * Rules (in order):
 *   1. Explicit allow-list match
 *   2. Any HTTPS origin — safe because every route requires a valid JWT;
 *      a cross-origin attacker cannot forge the Authorization header.
 *   3. Optional regex pattern match from ALLOWED_ORIGIN_PATTERNS env var.
 *   4. Everything else → rejected.
 */
function isOriginAllowed(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS_EXPLICIT.includes(origin)) return true;
    if (origin.startsWith('https://')) return true;
    if (ALLOWED_ORIGIN_PATTERNS.some(re => re.test(origin))) return true;
    return false;
}

app.use(cors({
    origin(origin, cb) {
        // In development, Vite proxy forwards requests server-to-server without
        // an Origin header — allow these through so local dev works.
        if (!origin) {
            if (!IS_PRODUCTION) return cb(null, true);
            // SECURITY: In production, reject no-origin requests (blocks null-origin
            // attacks from sandboxed iframes, file:// protocol, etc.)
            return cb(new Error('CORS: origin required'));
        }
        if (isOriginAllowed(origin)) return cb(null, true);
        cb(new Error('CORS: origin not allowed'));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

// Limit JSON body to 1 MB to prevent payload bombs
app.use(express.json({ limit: '1mb' }));

/* ══════════════════════════════════════════════════════
   2.5. CSRF PROTECTION (origin-based, defence-in-depth)
   ══════════════════════════════════════════════════════ */
// In development, skip CSRF — CORS already gates requests and Vite proxy
// strips Origin headers making CSRF always reject legitimate dev requests.
// In production, CSRF remain fully enforced.
app.use('/api', (req, res, next) =>
    IS_PRODUCTION
        ? csrfProtection(isOriginAllowed, logSecurityEvent)(req, res, next)
        : next()
);

/* ══════════════════════════════════════════════════════
   3. RATE LIMITING
   ══════════════════════════════════════════════════════ */

// General limiter — 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — try again later.' },
    handler: (req, res, _next, options) => {
        logSecurityEvent('RATE_LIMIT', req, 'General rate limit exceeded');
        res.status(options.statusCode).json(options.message);
    },
});
app.use('/api', generalLimiter);

/* ══════════════════════════════════════════════════════
   4. SUPABASE JWT AUTHENTICATION MIDDLEWARE
   ══════════════════════════════════════════════════════ */
const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseAnon = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
    console.error('⚠  Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env — auth will reject all requests.');
}

const supabase = createClient(supabaseUrl || '', supabaseAnon || '');

/**
 * Middleware: verify the Supabase JWT from the Authorization header.
 * Attaches `req.user` on success; returns 401 on failure.
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        logSecurityEvent('AUTH_FAIL', req, 'Missing or invalid Authorization header');
        return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }

    const token = authHeader.slice(7);

    // Reject obviously malformed tokens (must be 3-part JWT)
    if (token.split('.').length !== 3 || token.length > 4096) {
        logSecurityEvent('AUTH_FAIL', req, 'Malformed JWT token');
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        logSecurityEvent('AUTH_FAIL', req, `JWT verification failed: ${error?.message || 'no user'}`);
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    req.user = user;
    next();
}

// Protect ALL /api routes
app.use('/api', requireAuth);


/* ══════════════════════════════════════════════════════
   5. SECURITY LOGGING — imported from src/security/logger.js
      Writes JSONL to stdout (captured by Vercel)
   ══════════════════════════════════════════════════════ */

/* ── Helpers ───────────────────────────────────────── */

/** Validate that a string is a proper YouTube URL and extract playlist ID. */
function extractPlaylistId(raw) {
    if (typeof raw !== 'string' || raw.length > 2048) return null;
    try {
        const url = new URL(raw);
        // Only accept YouTube domains
        const host = url.hostname.replace('www.', '');
        if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'music.youtube.com') {
            return null;
        }
        const listId = url.searchParams.get('list');
        // Playlist IDs are alphanumeric with hyphens/underscores, 10-80 chars
        if (!listId || !/^[A-Za-z0-9_-]{10,80}$/.test(listId)) return null;
        return listId;
    } catch {
        return null;
    }
}

/** Sanitise an error message so internal details never leak to clients. */
function safeErrorMessage(err, fallback = 'An unexpected error occurred.') {
    // Known safe codes — let their messages through
    const safeCodes = ['EMPTY_SELECTION', 'YT_API_FAIL'];
    if (safeCodes.includes(err.code)) return err.message;
    // Specific known-safe patterns
    if (err.message?.includes('Playlist not found')) return err.message;
    if (err.message?.includes('YouTube API error')) return err.message;
    if (err.message?.includes('YouTube API unreachable')) return err.message;
    return fallback;
}

/* ══════════════════════════════════════════════════════
   PLAYLIST ROUTES
   ══════════════════════════════════════════════════════ */

app.post('/api/playlist', async (req, res) => {
    const { url } = req.body ?? {};
    if (!url) return res.status(400).json({ error: 'Missing playlist URL.' });

    const playlistId = extractPlaylistId(url);
    if (!playlistId) return res.status(400).json({ error: 'Invalid YouTube playlist URL.' });

    try {
        const data = await fetchPlaylistVideos(playlistId);
        res.json(data);
    } catch (err) {
        console.error('[playlist]', err.message);
        const status = err.message.includes('not found') ? 404 : 500;
        res.status(status).json({ error: safeErrorMessage(err, 'Failed to fetch playlist.') });
    }
});

/* ── Catch-all for unmatched routes ────────────────── */
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
});

/* ── Global error handler ──────────────────────────── */
app.use((err, req, res, _next) => {
    // CORS errors
    if (err.message?.includes('CORS')) {
        logSecurityEvent('CORS_REJECT', req, err.message);
        return res.status(403).json({ error: 'Forbidden.' });
    }
    // JSON parse errors
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    // Payload too large
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large.' });
    }
    console.error('[unhandled]', err.message);
    res.status(500).json({ error: 'An unexpected error occurred.' });
});

/* ── Catch unhandled rejections ────────────────────── */
process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED_REJECTION]', reason);
    logSecurityEvent('UNHANDLED_REJECTION', null, String(reason).substring(0, 500));
});

// Vercel imports the app (api/index.js); there is no local listener.
export default app;
