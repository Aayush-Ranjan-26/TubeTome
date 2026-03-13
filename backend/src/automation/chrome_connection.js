/**
 * Chrome connection utility via Chrome DevTools Protocol (CDP).
 *
 * Instead of launching separate browser windows, this module:
 * 1. Finds the user's installed Chrome executable
 * 2. Launches it with --remote-debugging-port (or connects to an already-running one)
 * 3. Uses the user's real Chrome profile (so they're already logged into Google)
 * 4. Returns a Playwright browser instance connected via CDP
 *
 * This way all automation happens in new tabs of the user's own browser.
 */
import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const CDP_PORT = 9222;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;

/**
 * Find the Chrome executable on Windows.
 */
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

/**
 * Get the user's default Chrome user data directory.
 */
function getChromeProfileDir() {
    return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
}

/**
 * Check if Chrome is already running with a debugging port.
 */
function isCDPAvailable() {
    return new Promise((resolve) => {
        const req = http.get(`${CDP_URL}/json/version`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    JSON.parse(data);
                    resolve(true);
                } catch {
                    resolve(false);
                }
            });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
}

/**
 * Launch Chrome with debugging port enabled using the user's real profile.
 * If Chrome is already running WITHOUT the debugging port, this will fail —
 * the user needs to close Chrome first.
 */
async function launchChromeWithCDP() {
    const chromePath = findChromePath();
    if (!chromePath) {
        throw new Error('Chrome not found. Please install Google Chrome.');
    }

    const profileDir = getChromeProfileDir();
    console.log(`[chrome] Launching Chrome with CDP on port ${CDP_PORT}`);
    console.log(`[chrome] Profile: ${profileDir}`);
    console.log(`[chrome] Executable: ${chromePath}`);

    // Spawn Chrome detached so it stays open after our process
    const child = execFile(chromePath, [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
    ], { detached: true, stdio: 'ignore' });
    child.unref();

    // Wait for Chrome to start accepting CDP connections
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (await isCDPAvailable()) {
            console.log('[chrome] ✓ CDP connection available');
            return;
        }
    }
    throw new Error(
        'Chrome did not start with debugging port. ' +
        'Please close ALL Chrome windows completely and try again.'
    );
}

/**
 * Get a Playwright browser instance connected to the user's Chrome via CDP.
 * Launches Chrome with debugging port if not already running.
 *
 * @returns {{ browser: import('playwright').Browser, isOwned: boolean }}
 *   browser: The connected browser instance
 *   isOwned: false (we don't own the browser — never close it!)
 */
export async function getConnectedBrowser() {
    const alreadyRunning = await isCDPAvailable();

    if (!alreadyRunning) {
        await launchChromeWithCDP();
    }

    const browser = await chromium.connectOverCDP(CDP_URL);
    console.log(`[chrome] ✓ Connected to Chrome via CDP (contexts: ${browser.contexts().length})`);
    return { browser, isOwned: false };
}

export { isCDPAvailable, CDP_PORT, CDP_URL };
