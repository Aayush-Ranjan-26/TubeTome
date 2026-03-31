/**
 * Browser management — Playwright persistent context.
 *
 * Uses a DEDICATED profile directory (separate from the user's Chrome).
 * Google session cookies persist across runs.
 *
 * FLOW:
 *   1. First time → user clicks "Setup" → Chrome opens VISIBLY → user logs into Google
 *   2. Cookies saved to  data/browser-profile/
 *   3. All subsequent imports run HEADLESS in the background (invisible)
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const PROFILE_DIR = path.resolve('data', 'browser-profile');

let activeContext = null;

/* ── Find Chrome on Windows ──────────────────────── */

function findChromePath() {
    const candidates = [
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/* ── Launch / get context ────────────────────────── */

async function launch(headless = true) {
    await close();
    fs.mkdirSync(PROFILE_DIR, { recursive: true });

    const chromePath = findChromePath();
    const opts = {
        headless,
        args: [
            '--no-first-run',
            '--no-default-browser-check',
        ],
        viewport: { width: 1280, height: 800 },
        ignoreDefaultArgs: ['--enable-automation'],
    };

    if (chromePath) {
        opts.executablePath = chromePath;
        console.log(`[browser] Using Chrome: ${chromePath}`);
    }

    console.log(`[browser] Launching (headless: ${headless})`);
    activeContext = await chromium.launchPersistentContext(PROFILE_DIR, opts);
    console.log('[browser] ✓ Ready');
    return activeContext;
}

/**
 * Get the persistent context (or launch one).
 * @param {boolean} headless
 */
export async function getContext(headless = true) {
    if (activeContext) {
        try {
            activeContext.pages(); // check if alive
            return activeContext;
        } catch {
            activeContext = null;
        }
    }
    return launch(headless);
}

/**
 * Close the context (but keep the profile on disk).
 */
export async function close() {
    if (activeContext) {
        try { await activeContext.close(); } catch { /* ok */ }
        activeContext = null;
    }
}

/* ── Session helpers ─────────────────────────────── */

/**
 * Check if the persistent profile has a valid Google session.
 */
export async function hasGoogleSession() {
    try {
        const ctx = await getContext(true);
        const page = await ctx.newPage();
        try {
            await page.goto('https://notebooklm.google.com', {
                waitUntil: 'domcontentloaded',
                timeout: 25000,
            });
            await page.waitForTimeout(5000);
            const url = page.url();
            const loggedIn = url.includes('notebooklm.google.com')
                && !url.includes('accounts.google.com')
                && !url.includes('signin');
            console.log(`[session] Google session: ${loggedIn ? 'active ✓' : 'not found ✗'}`);
            return loggedIn;
        } finally {
            await page.close();
        }
    } catch (err) {
        console.error('[session]', err.message);
        return false;
    }
}

/**
 * Open a VISIBLE Chrome window so the user can log into Google once.
 * Resolves when login is complete. Rejects on timeout (5 min).
 */
export async function runSetup() {
    await close(); // close headless if running

    const ctx = await launch(false); // headed = visible
    const page = ctx.pages()[0] || await ctx.newPage();

    console.log('[setup] Opening NotebookLM — please sign into Google in the Chrome window...');
    await page.goto('https://notebooklm.google.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
    });

    // Wait up to 5 minutes for user to finish Google login
    for (let i = 0; i < 100; i++) {
        await page.waitForTimeout(3000);
        const url = page.url();
        if (
            url.includes('notebooklm.google.com')
            && !url.includes('accounts.google.com')
            && !url.includes('signin')
        ) {
            console.log('[setup] ✓ Google login completed!');
            // Close pages but cookies are saved in the profile dir
            for (const p of ctx.pages()) await p.close().catch(() => { });
            await close();
            return true;
        }
        if (i > 0 && i % 10 === 0) {
            console.log(`[setup] Still waiting for login… (${(i + 1) * 3}s)`);
        }
    }

    await close();
    throw new Error('Login timed out after 5 minutes. Please try the setup again.');
}

export { PROFILE_DIR };
