import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { fetchPlaylistVideos } from './youtube.js';
import { authExists, deleteAuth, ensureProfileDir, CHROME_PROFILE_DIR } from './src/automation/auth.js';
import { enqueue, queueSize } from './src/automation/queue.js';
import { parseSelection, buildSelectionResponse } from './src/automation/selection_parser.js';
import { runWithRetry } from './src/automation/playwright_worker.js';

dotenv.config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

/* ── Helpers ───────────────────────────────────────── */

function extractPlaylistId(raw) {
    try {
        const url = new URL(raw);
        return url.searchParams.get('list') || null;
    } catch {
        return null;
    }
}

/* ══════════════════════════════════════════════════════
   AUTH ROUTES
   ══════════════════════════════════════════════════════ */

app.get('/auth/status', (_req, res) => {
    try {
        res.json({ configured: authExists() });
    } catch (err) {
        res.json({ configured: false });
    }
});

// GET /auth/playwright-login — opens Chrome with persistent profile to sign in to Google
let loginInProgress = false;

app.get('/auth/playwright-login', async (_req, res) => {
    if (authExists()) {
        return res.json({ success: true, message: 'Already configured. Reset session first to reconfigure.' });
    }
    if (loginInProgress) {
        return res.json({ success: true, message: 'Login already in progress.' });
    }

    loginInProgress = true;
    let context;

    try {
        // Launch Chrome with PERSISTENT profile — cookies saved automatically
        const profileDir = ensureProfileDir();
        context = await chromium.launchPersistentContext(profileDir, {
            channel: 'chrome',
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
            ignoreDefaultArgs: ['--enable-automation'],
        });

        const page = context.pages()[0] || await context.newPage();

        // Tell the frontend we're ready
        res.json({ success: true, message: 'Chrome opened. Sign in to Google in the opened window.' });

        await page.goto('https://notebooklm.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log('⏳ Waiting for user to log in to NotebookLM...');

        // Poll for up to 5 minutes
        let loggedIn = false;
        for (let i = 0; i < 100; i++) {
            await page.waitForTimeout(3000);

            const currentUrl = page.url();
            if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
                continue;
            }

            if (currentUrl.includes('notebooklm.google.com')) {
                const hasApp = await page.evaluate(() => {
                    const body = document.body?.innerText || '';
                    return body.includes('notebook') || body.includes('Notebook')
                        || body.includes('New') || body.includes('Create');
                }).catch(() => false);

                if (hasApp) {
                    loggedIn = true;
                    console.log('✓ NotebookLM dashboard detected.');
                    break;
                }
            }
        }

        if (!loggedIn) {
            console.warn('⚠ Login timeout — profile saved anyway.');
        }

        await page.waitForTimeout(3000);

        // Close login browser — cookies are persisted in the profile directory
        await context.close();
        console.log('✓ Login browser closed. Google cookies saved in persistent profile.');

    } catch (err) {
        console.error('Login flow error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: `Login failed: ${err.message}` });
        }
        if (context) await context.close().catch(() => { });
    } finally {
        loginInProgress = false;
    }
});

// DELETE /auth
app.delete('/auth', (_req, res) => {
    try {
        deleteAuth();
        res.json({ success: true });
    } catch (err) {
        console.error('[auth/delete]', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

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
        res.status(status).json({ error: err.message });
    }
});

// POST /api/playlist/select — parse selection + return structured JSON with warnings
app.post('/api/playlist/select', async (req, res) => {
    const { url, mode = 'all', selection = '' } = req.body ?? {};
    if (!url) return res.status(400).json({ error: 'Missing playlist URL.' });

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
        res.status(500).json({ error: err.message });
    }
});

/* ══════════════════════════════════════════════════════
   AUTOMATION ROUTES
   ══════════════════════════════════════════════════════ */

app.post('/api/automation/import-playlist', async (req, res) => {
    const { playlistUrl, selectedLinks, selectionMode = 'all', selectionInput = '' } = req.body ?? {};

    if (!playlistUrl) {
        return res.status(400).json({ code: 'YT_API_FAIL', message: 'Missing playlist URL.' });
    }
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
        return res.status(400).json({ code: 'YT_API_FAIL', message: 'Invalid YouTube playlist URL.' });
    }
    if (!authExists()) {
        return res.status(401).json({ code: 'AUTH_MISSING', message: 'Automation not configured. Run onboarding first.' });
    }

    let playlistTitle, videos;
    try {
        const data = await fetchPlaylistVideos(playlistId);
        playlistTitle = data.title;
        videos = data.videos;
    } catch (err) {
        console.error('[yt-fetch]', err.message);
        return res.status(500).json({ code: 'YT_API_FAIL', message: err.message });
    }

    try {
        // Frontend already filters correctly — use selectedLinks when provided
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
                parsed_selection: parsed,
                warnings,
            });
        }

        console.log(`[automation] Importing ${links.length} of ${videos.length} total videos`);

        // runWithRetry no longer takes authPath — uses persistent profile automatically
        const result = await enqueue(async () => {
            return await runWithRetry(playlistTitle, links);
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

        res.json(response);
    } catch (err) {
        console.error('[automation]', err.message);
        const code = err.code || 'CREATION_FAILED';
        const payload = { code, message: err.message };
        if (err.screenshot) payload.screenshot = err.screenshot;
        res.status(500).json(payload);
    }
    // No temp file cleanup needed — persistent profile handles everything
});

app.get('/api/automation/diagnostics', (_req, res) => {
    res.json({
        configured: authExists(),
        profileDir: CHROME_PROFILE_DIR,
        profileExists: fs.existsSync(CHROME_PROFILE_DIR),
        queueDepth: queueSize(),
        headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
    });
});

/* ── Start ─────────────────────────────────────────── */

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✓ TubeTome backend → http://localhost:${PORT}`));
