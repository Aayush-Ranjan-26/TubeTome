/**
 * Auth state management — persistent Chrome profile approach.
 *
 * Instead of encrypting/decrypting storageState JSON, we now use a
 * dedicated Chrome profile directory. Google cookies persist on disk
 * automatically between Playwright sessions.
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('data');
export const CHROME_PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');
const LEGACY_AUTH_FILE = path.join(DATA_DIR, 'auth.json.enc');

/**
 * Check if the persistent Chrome profile has been used (i.e. user logged in at least once).
 * We check for the Default directory that Chrome creates after first use.
 */
export function authExists() {
    const defaultDir = path.join(CHROME_PROFILE_DIR, 'Default');
    return fs.existsSync(defaultDir);
}

/**
 * Ensure the profile directory exists (created on first use).
 */
export function ensureProfileDir() {
    fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
    return CHROME_PROFILE_DIR;
}

/**
 * Delete the Chrome profile (full reset).
 */
export function deleteAuth() {
    // Delete persistent profile
    if (fs.existsSync(CHROME_PROFILE_DIR)) {
        fs.rmSync(CHROME_PROFILE_DIR, { recursive: true, force: true });
        console.log('✓ Chrome profile deleted.');
    }
    // Clean up legacy encrypted file if it exists
    if (fs.existsSync(LEGACY_AUTH_FILE)) {
        fs.unlinkSync(LEGACY_AUTH_FILE);
        console.log('✓ Legacy auth.json.enc removed.');
    }
}

// ── Legacy exports (no-ops, kept for backward compat) ──

/** @deprecated No longer used — profile handles cookies automatically. */
export function saveAuthState() {
    console.warn('saveAuthState() is deprecated — persistent profile handles cookies.');
}

/** @deprecated No longer used — profile handles cookies automatically. */
export function loadAuthState() {
    console.warn('loadAuthState() is deprecated — use CHROME_PROFILE_DIR instead.');
    return CHROME_PROFILE_DIR;
}
