import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fetchPlaylistVideos } from './youtube.js';
import { enqueue, queueSize } from './src/automation/queue.js';
import { parseSelection, buildSelectionResponse } from './src/automation/selection_parser.js';
import { runWithRetry } from './src/automation/playwright_worker.js';
import { isCDPAvailable } from './src/automation/chrome_connection.js';

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

        // Give helpful error messages
        if (err.message.includes('Chrome did not start') || err.message.includes('Chrome not found')) {
            payload.message = 'Please close ALL Chrome windows completely and try again. TubeTome needs to connect to Chrome.';
        }

        res.status(500).json(payload);
    }
});

app.get('/api/automation/diagnostics', async (_req, res) => {
    const cdpReady = await isCDPAvailable();
    res.json({
        cdpAvailable: cdpReady,
        queueDepth: queueSize(),
    });
});

/* ── Start ─────────────────────────────────────────── */

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✓ TubeTome backend → http://localhost:${PORT}`));
