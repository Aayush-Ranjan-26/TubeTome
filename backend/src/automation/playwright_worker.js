/**
 * Playwright worker — creates a NotebookLM notebook and adds video URLs.
 *
 * Uses Chrome DevTools Protocol (CDP) to connect to the USER'S OWN Chrome
 * browser. Since the user is already logged into Google in their Chrome,
 * NotebookLM works immediately — NO separate login needed.
 *
 * Opens a NEW TAB in the user's Chrome. Does NOT close it when done.
 *
 * FLOW:
 *   1. Connect to user's Chrome via CDP (or launch it with debug port)
 *   2. Open new tab → notebooklm.google.com
 *   3. Click "+ Create notebook"
 *   4. Add all video URLs as sources
 *   5. Rename the notebook to playlist title
 *   6. Leave the tab open for the user
 */
import fs from 'node:fs';
import path from 'node:path';
import { SELECTORS } from './selectors.js';
import { getConnectedBrowser } from './chrome_connection.js';

const NOTEBOOK_LM_URL = 'https://notebooklm.google.com';
const LOGS_DIR = path.resolve('logs', 'screenshots');

/* ── Helpers ───────────────────────────────────────── */

async function screenshot(page, label) {
    try {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
        const file = path.join(LOGS_DIR, `${label}-${Date.now()}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`📸 Screenshot saved: ${file}`);
        return file;
    } catch (e) {
        console.error('Screenshot failed:', e.message);
        return null;
    }
}

async function findElement(page, selectorArray, timeout = 5000) {
    for (const sel of selectorArray) {
        try {
            const el = await page.waitForSelector(sel, { timeout: Math.min(timeout, 3000) });
            if (el) {
                console.log(`  ✓ Found element: ${sel}`);
                return el;
            }
        } catch { /* try next */ }
    }
    return null;
}

async function clickElement(page, selectorArray, label, timeout = 5000) {
    const el = await findElement(page, selectorArray, timeout);
    if (!el) {
        const screenshotFile = await screenshot(page, `click-fail-${label}`);
        const err = new Error(`UI_SELECTOR_FAIL: Could not find "${label}". Selectors tried: ${selectorArray.join(', ')}`);
        err.code = 'UI_SELECTOR_FAIL';
        err.screenshot = screenshotFile;
        throw err;
    }
    await el.click({ force: true });
    return el;
}

async function waitForStable(page, ms = 2000) {
    try {
        await page.waitForLoadState('networkidle', { timeout: ms });
    } catch { /* ok */ }
}

/* ── Main worker ───────────────────────────────────── */

export async function createNotebookAndAddSources(playlistTitle, links = []) {
    console.log('\n═══════════════════════════════════════');
    console.log(`🚀 Starting automation: "${playlistTitle}" (${links.length} links)`);
    console.log('═══════════════════════════════════════\n');

    // Connect to user's real Chrome via CDP
    const { browser, isOwned } = await getConnectedBrowser();
    const context = browser.contexts()[0];

    if (!context) {
        const err = new Error('No browser context found. Please close Chrome and try again.');
        err.code = 'CHROME_CONNECTION_FAIL';
        throw err;
    }

    // Open a NEW TAB in the user's Chrome
    const page = await context.newPage();

    try {
        // ─── Step 1: Navigate to NotebookLM ───────────────────
        console.log('Step 1: Navigating to NotebookLM...');
        await page.goto(NOTEBOOK_LM_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        console.log(`  Current URL: ${page.url()}`);

        // Check if redirected to Google login (shouldn't happen — user's Chrome is logged in)
        const currentUrl = page.url();
        if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
            console.log('  ⚠ Redirected to Google login — user may not be signed in to this Chrome.');
            console.log('  Waiting for user to sign in (they should already be logged into Google)...');

            for (let i = 0; i < 100; i++) {
                await page.waitForTimeout(3000);
                const url = page.url();
                if (url.includes('notebooklm.google.com') && !url.includes('accounts.google.com')) {
                    console.log('  ✓ Google sign-in completed!');
                    break;
                }
                if (i % 10 === 0) console.log(`  … still waiting for login (${(i + 1) * 3}s)...`);
            }
        }

        // Wait for the SPA to fully load
        console.log('  Waiting for NotebookLM SPA to finish loading...');
        let homeReady = false;
        for (let i = 0; i < 20; i++) {
            await page.waitForTimeout(3000);
            const hasContent = await page.evaluate(() => {
                const body = document.body?.innerText || '';
                return body.includes('Create') || body.includes('New notebook')
                    || body.includes('notebook') || body.includes('Recent')
                    || body.includes('My notebooks') || body.includes('My Notebooks');
            }).catch(() => false);

            if (hasContent) {
                console.log(`  ✓ Page content detected after ${(i + 1) * 3}s`);
                homeReady = true;
                break;
            }
            console.log(`  … still loading (${(i + 1) * 3}s)...`);
        }

        if (!homeReady) {
            console.warn('  ⚠ Page may not be fully loaded — attempting anyway...');
        }

        await page.waitForTimeout(2000);
        await screenshot(page, 'step1-homepage');

        // ─── Step 2: Create notebook ──────────────────────────
        console.log('Step 2: Clicking "Create notebook"...');
        await clickElement(page, SELECTORS.createNotebookBtn, 'Create notebook', 30000);
        await page.waitForTimeout(3000);
        await waitForStable(page, 8000);
        console.log(`  Current URL: ${page.url()}`);
        await screenshot(page, 'step2-notebook-created');

        // ─── Step 3: Close any auto-opened dialog ─────────────
        console.log('Step 3: Handling auto-opened source dialog...');
        const closeBtn = await findElement(page, SELECTORS.sourceDialogClose, 3000);
        if (closeBtn) {
            await closeBtn.click({ force: true });
            await page.waitForTimeout(1000);
            console.log('  ✓ Closed auto-opened source dialog');
        }

        // ─── Step 4: Add all sources at once ───────────────────
        console.log(`Step 4: Adding ${links.length} sources in bulk...`);

        await clickElement(page, SELECTORS.addSourcesBtn, 'Add sources', 8000);
        await page.waitForTimeout(1500);

        await clickElement(page, SELECTORS.websitesBtn, 'Websites button', 5000);
        await page.waitForTimeout(1000);
        await screenshot(page, `step4b-websites-tab`);

        const bulkLinks = links.join('\n');

        const urlInput = await findElement(page, SELECTORS.sourceUrlInput, 8000);
        if (!urlInput) {
            const anyInput = await findElement(page, [
                'input[type="text"]',
                'input:not([type="hidden"])',
                'textarea',
            ], 3000);

            if (anyInput) {
                console.log('  ⚠ Using fallback input');
                await anyInput.click({ force: true });
                await anyInput.fill(bulkLinks, { force: true });
            } else {
                const screenshotFile = await screenshot(page, `url-input-fail`);
                const err = new Error('UI_SELECTOR_FAIL: Cannot find URL input for adding source.');
                err.code = 'UI_SELECTOR_FAIL';
                err.screenshot = screenshotFile;
                throw err;
            }
        } else {
            await urlInput.click({ force: true });
            await page.waitForTimeout(200);
            await urlInput.fill(bulkLinks, { force: true });
        }

        await page.waitForTimeout(500);
        await screenshot(page, `step4c-url-filled`);

        console.log('  Clicking "Insert" button...');
        await clickElement(page, SELECTORS.sourceSubmitBtn, 'Insert submit button', 5000);
        console.log('  ✓ Clicked submit button');

        console.log('  Waiting for NotebookLM to process links...');
        await page.waitForTimeout(5000);
        await waitForStable(page, 15000);

        const closeAfterAdd = await findElement(page, SELECTORS.sourceDialogClose, 1500);
        if (closeAfterAdd) {
            await closeAfterAdd.click({ force: true });
            await page.waitForTimeout(500);
        }

        console.log(`  ✓ Sources submitted successfully!`);
        await screenshot(page, 'step4-all-sources-added');

        // ─── Step 5: Rename the notebook ──────────────────────
        console.log(`Step 5: Renaming to "${playlistTitle}"...`);

        let renamed = false;

        const allInputs = await page.locator('input, textarea, [contenteditable="true"]').all();
        console.log(`  Scanning ${allInputs.length} potential input/editable fields for the title...`);
        for (const input of allInputs) {
            try {
                let val = '';
                try { val = await input.inputValue(); } catch (e) { val = await input.textContent(); }

                if (val && val.includes('Untitled')) {
                    await input.click({ force: true, clickCount: 3 });
                    await page.waitForTimeout(200);
                    await page.keyboard.press('Backspace');
                    await page.waitForTimeout(100);

                    await input.fill(playlistTitle, { force: true }).catch(async () => {
                        await page.keyboard.type(playlistTitle, { delay: 30 });
                    });
                    await page.keyboard.press('Enter');
                    console.log('  ✓ Successfully renamed via editable field match');
                    renamed = true;
                }
            } catch (e) { /* ignore */ }
        }

        if (!renamed) {
            const textLocators = await page.getByText('Untitled notebook').all();
            console.log(`  Scanning ${textLocators.length} literal text elements...`);
            for (let i = 0; i < textLocators.length; i++) {
                try {
                    await textLocators[i].click({ force: true, clickCount: 3 });
                    await page.waitForTimeout(500);

                    const focused = await page.locator('*:focus');
                    if (await focused.count() > 0) {
                        await focused.first().fill(playlistTitle, { force: true }).catch(async () => {
                            await page.keyboard.type(playlistTitle, { delay: 30 });
                        });
                        await page.keyboard.press('Enter');
                        console.log(`  ✓ Successfully renamed via clicked text field`);
                        renamed = true;
                    }
                } catch (e) { /* ignore */ }
            }
        }

        if (!renamed) {
            console.warn('  ⚠ Could not rename — will remain "Untitled notebook"');
        }

        await page.waitForTimeout(1000);
        await screenshot(page, 'step5-renamed');

        // ─── Step 6: Done — leave the tab OPEN ────────────────
        const notebookUrl = page.url();
        console.log(`\n✓ Done! Notebook URL: ${notebookUrl}`);
        console.log('✓ Tab left open in your Chrome.');

        // DO NOT close browser or page — user keeps the tab
        return { notebookName: renamed ? playlistTitle : 'Untitled notebook', notebookUrl };

    } catch (err) {
        console.error(`\n✗ Worker error: ${err.message}`);
        if (page) await screenshot(page, 'worker-error');
        // On error, close only the tab we opened (not the browser!)
        if (page) await page.close().catch(() => { });
        throw err;
    }
}

/**
 * Run the worker with retry + exponential backoff.
 */
export async function runWithRetry(playlistTitle, links, maxRetries = 2) {
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n── Attempt ${attempt}/${maxRetries} ──`);
            return await createNotebookAndAddSources(playlistTitle, links);
        } catch (err) {
            lastErr = err;
            if (err.code === 'UI_SELECTOR_FAIL') throw err;
            if (attempt < maxRetries) {
                const delay = 2000 * attempt;
                console.log(`  Retrying in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastErr;
}
