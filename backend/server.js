import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { fetchPlaylistVideos } from './youtube.js';
import { enqueue, queueSize } from './src/automation/queue.js';
import { parseSelection, buildSelectionResponse } from './src/automation/selection_parser.js';
import { runWithRetry } from './src/automation/playwright_worker.js';
import { hasGoogleSession, runSetup, close as closeBrowser } from './src/automation/chrome_connection.js';
import { requestIdMiddleware } from './src/security/requestId.js';
import { csrfProtection } from './src/security/csrf.js';
import { logSecurityEvent } from './src/security/logger.js';

dotenv.config();

/* ══════════════════════════════════════════════════════
   STARTUP VALIDATION — fail fast on missing config
   ══════════════════════════════════════════════════════ */
const REQUIRED_ENV = ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingVars = REQUIRED_ENV.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.error(`\n✗ FATAL: Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('  Copy backend/.env.example → backend/.env and fill in your values.\n');
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
   Accepts any HTTPS origin + localhost dev servers.
   HTTP origins (except localhost) are rejected.
   Primary security is JWT — CORS is defence-in-depth.
   ══════════════════════════════════════════════════════ */

// Explicit allow-list (always permitted regardless of protocol)
const ALLOWED_ORIGINS_EXPLICIT = [
    'http://localhost:5173',            // Vite dev server
    'http://localhost:4173',            // Vite preview
    'http://localhost:3001',            // Vite proxy changeOrigin target
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
 *   1. Explicit allow-list match (includes localhost)
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

// Stricter limiter for heavy automation routes — 10 per 15 min
const automationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Automation rate limit reached — try again later.' },
    // Key by authenticated user ID when available, fallback to IP
    keyGenerator: (req) => req.user?.id || req.ip,
    // Intentional: we use req.ip as fallback; suppress IPv6 false-positive
    validate: false,
    handler: (req, res, _next, options) => {
        logSecurityEvent('RATE_LIMIT_AUTOMATION', req, `Automation rate limit exceeded for user ${req.user?.id || 'unknown'}`);
        res.status(options.statusCode).json(options.message);
    },
});

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

// Apply automation rate limiter AFTER auth (so we can key by user ID)
app.use('/api/automation/import-playlist', automationLimiter);
app.use('/api/automation/setup', automationLimiter);

/* ══════════════════════════════════════════════════════
   5. SECURITY LOGGING — imported from src/security/logger.js
      Writes to both console and logs/security.log (JSONL)
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

/** Validate that a link looks like a YouTube video URL. */
function isValidYouTubeLink(link) {
    if (typeof link !== 'string' || link.length > 2048) return false;
    try {
        const url = new URL(link);
        const host = url.hostname.replace('www.', '');
        return host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com';
    } catch {
        return false;
    }
}

/** Sanitise an error message so internal details never leak to clients. */
function safeErrorMessage(err, fallback = 'An unexpected error occurred.') {
    // Known safe codes — let their messages through
    const safeCodes = ['NEEDS_SETUP', 'UI_SELECTOR_FAIL', 'EMPTY_SELECTION', 'YT_API_FAIL'];
    if (safeCodes.includes(err.code)) return err.message;
    // Specific known-safe patterns
    if (err.message?.includes('Playlist not found')) return err.message;
    if (err.message?.includes('Queue full')) return err.message;
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

// POST /api/playlist/select — parse selection + return structured JSON with warnings
app.post('/api/playlist/select', async (req, res) => {
    const { url, mode = 'all', selection = '' } = req.body ?? {};
    if (!url) return res.status(400).json({ error: 'Missing playlist URL.' });

    // Validate mode against allowlist
    const VALID_MODES = ['all', 'indices', 'specific', 'range'];
    if (!VALID_MODES.includes(mode)) {
        return res.status(400).json({ error: `Invalid mode. Use one of: ${VALID_MODES.join(', ')}` });
    }

    const playlistId = extractPlaylistId(url);
    if (!playlistId) return res.status(400).json({ error: 'Invalid YouTube playlist URL.' });

    try {
        const data = await fetchPlaylistVideos(playlistId);
        const videos = data.videos || [];
        const parsed = parseSelection(mode, selection, videos.length);
        const response = buildSelectionResponse(parsed, videos, selection, mode, url);
        res.json(response);
    } catch (err) {
        console.error('[playlist/select]', err.message);
        res.status(500).json({ error: safeErrorMessage(err, 'Failed to process selection.') });
    }
});

/* ══════════════════════════════════════════════════════
   AUTOMATION ROUTES
   ══════════════════════════════════════════════════════ */

/**
 * Check if there's a saved Google session in the persistent profile.
 * SECURITY: Requires auth — session existence is sensitive operational info.
 */
app.get('/api/automation/session-check', requireAuth, async (_req, res) => {
    try {
        const loggedIn = await hasGoogleSession();
        res.json({ loggedIn });
    } catch (err) {
        console.error('[session-check]', err.message);
        res.json({ loggedIn: false });
    }
});

/**
 * One-time setup: opens a VISIBLE Chrome window for Google login.
 * The user signs in once, then all subsequent imports run headless.
 */
app.post('/api/automation/setup', async (req, res) => {
    try {
        logSecurityEvent('SETUP_START', req, `User ${req.user.id} initiating Google setup`);
        console.log('[setup] Starting one-time Google login setup...');
        await runSetup();
        logSecurityEvent('SETUP_SUCCESS', req, `User ${req.user.id} completed Google setup`);
        res.json({ success: true, message: 'Google login successful! You can now import playlists.' });
    } catch (err) {
        console.error('[setup]', err.message);
        res.status(500).json({ error: safeErrorMessage(err, 'Setup failed.') });
    }
});

/**
 * Import a playlist into NotebookLM (runs headless in background).
 * Includes a hard timeout to prevent indefinite hangs.
 */
app.post('/api/automation/import-playlist', async (req, res) => {
    const { playlistUrl, selectedLinks, selectionMode = 'all', selectionInput = '' } = req.body ?? {};

    if (!playlistUrl) {
        return res.status(400).json({ code: 'YT_API_FAIL', message: 'Missing playlist URL.' });
    }
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
        return res.status(400).json({ code: 'YT_API_FAIL', message: 'Invalid YouTube playlist URL.' });
    }

    /* ── Validate selectedLinks array ────────────────── */
    if (selectedLinks !== undefined) {
        if (!Array.isArray(selectedLinks)) {
            return res.status(400).json({ code: 'BAD_INPUT', message: 'selectedLinks must be an array.' });
        }
        if (selectedLinks.length > 500) {
            return res.status(400).json({ code: 'BAD_INPUT', message: 'Too many links (max 500).' });
        }
        const badLink = selectedLinks.find(l => !isValidYouTubeLink(l));
        if (badLink) {
            return res.status(400).json({ code: 'BAD_INPUT', message: 'selectedLinks contains invalid YouTube URL(s).' });
        }
    }

    /* ── Validate selectionInput length ──────────────── */
    if (typeof selectionInput === 'string' && selectionInput.length > 5000) {
        return res.status(400).json({ code: 'BAD_INPUT', message: 'selectionInput too long.' });
    }

    let playlistTitle, videos;
    try {
        const data = await fetchPlaylistVideos(playlistId);
        playlistTitle = data.title;
        videos = data.videos;
    } catch (err) {
        console.error('[yt-fetch]', err.message);
        return res.status(500).json({ code: 'YT_API_FAIL', message: safeErrorMessage(err, 'Failed to fetch playlist.') });
    }

    try {
        let links;
        let parsed = null;
        let warnings = [];

        if (Array.isArray(selectedLinks) && selectedLinks.length > 0) {
            links = selectedLinks;
            console.log(`[automation] Using ${links.length} pre-filtered links from frontend`);
        } else if (selectionMode && selectionMode !== 'all') {
            parsed = parseSelection(selectionMode, selectionInput, videos.length);
            warnings = parsed.warnings;
            links = parsed.valid_indices.map(idx => videos[idx - 1]?.url).filter(Boolean);
            console.log(`[automation] Parser: ${parsed.valid_indices.length} valid`);
        } else {
            links = videos.map(v => v.url);
        }

        if (links.length === 0) {
            return res.status(400).json({
                code: 'EMPTY_SELECTION',
                message: 'No valid videos selected.',
                warnings,
            });
        }

        logSecurityEvent('IMPORT_START', req, `User ${req.user.id} importing ${links.length} videos from playlist ${playlistId}`);
        console.log(`[automation] Importing ${links.length} of ${videos.length} total videos`);

        // Hard timeout for the automation job (3 minutes max)
        const AUTOMATION_TIMEOUT = 180_000;
        const result = await enqueue(async () => {
            return await Promise.race([
                runWithRetry(playlistTitle, links),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Automation timed out after 3 minutes.')), AUTOMATION_TIMEOUT)
                ),
            ]);
        });

        const response = {
            createdName: result.notebookName,
            notebookUrl: result.notebookUrl,
            itemsCount: links.length,
            videos,
            warnings,
        };

        if (parsed) {
            response.parsed_selection = {
                valid_indices: parsed.valid_indices,
                ignored_duplicates: parsed.ignored_duplicates,
                ignored_out_of_range: parsed.ignored_out_of_range,
                unparsable_items: parsed.unparsable_items,
            };
        }

        response.notebooklm_import_status = {
            attempted: true,
            imported_count: links.length,
        };

        logSecurityEvent('IMPORT_SUCCESS', req, `User ${req.user.id} imported ${links.length} videos`);
        res.json(response);
    } catch (err) {
        console.error('[automation]', err.message);
        const code = err.code || 'CREATION_FAILED';
        const payload = { code, message: safeErrorMessage(err, 'Automation failed.') };
        // Never expose filesystem paths — even in dev
        if (err.screenshot && !IS_PRODUCTION) {
            payload._debugScreenshot = '[check server logs]';
        }
        if (err.code) {
            logSecurityEvent('IMPORT_FAIL', req, `User ${req.user?.id} — ${code}: ${err.message?.substring(0, 200)}`);
        }
        const status = code === 'NEEDS_SETUP' ? 401 : 500;
        res.status(status).json(payload);
    }
});

app.get('/api/automation/diagnostics', requireAuth, async (_req, res) => {
    try {
        const loggedIn = await hasGoogleSession();
        res.json({
            googleSession: loggedIn,
            queueDepth: queueSize(),
        });
    } catch (err) {
        console.error('[diagnostics]', err.message);
        res.json({ googleSession: false, queueDepth: queueSize() });
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

/* ── Cleanup on exit ───────────────────────────────── */

process.on('SIGINT', async () => {
    await closeBrowser();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeBrowser();
    process.exit(0);
});

/* ── Catch unhandled rejections ────────────────────── */
process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED_REJECTION]', reason);
    logSecurityEvent('UNHANDLED_REJECTION', null, String(reason).substring(0, 500));
});

/* ── Start ─────────────────────────────────────────── */

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✓ TubeTome backend → http://localhost:${PORT}`);
    console.log(`  Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'development'}`);
    console.log(`  Security logging → logs/security.log`);
    if (!IS_PRODUCTION) {
        console.log('  ⚠  Set NODE_ENV=production for production deployments');
    }
});
