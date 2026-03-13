import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* ── 1. Playlist ID Extraction ─────────────────────── */

function extractPlaylistId(raw) {
    try {
        const url = new URL(raw);
        return url.searchParams.get('list') || null;
    } catch {
        return null;
    }
}

describe('extractPlaylistId', () => {
    it('extracts from standard playlist URL', () => {
        assert.equal(
            extractPlaylistId('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'),
            'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
        );
    });

    it('extracts from watch URL with list param', () => {
        assert.equal(
            extractPlaylistId('https://www.youtube.com/watch?v=abc&list=PLtest123'),
            'PLtest123'
        );
    });

    it('returns null for URL without list param', () => {
        assert.equal(extractPlaylistId('https://www.youtube.com/watch?v=abc'), null);
    });

    it('returns null for invalid URL', () => {
        assert.equal(extractPlaylistId('not-a-url'), null);
    });

    it('returns null for empty string', () => {
        assert.equal(extractPlaylistId(''), null);
    });

    it('handles m.youtube.com URLs', () => {
        assert.equal(
            extractPlaylistId('https://m.youtube.com/playlist?list=PLmobile'),
            'PLmobile'
        );
    });
});

/* ── 2. Unique Name Algorithm ──────────────────────── */

function uniqueName(baseName, existingNames) {
    const names = new Set(existingNames);
    let candidate = baseName;
    let suffix = 0;
    while (names.has(candidate)) {
        suffix += 1;
        candidate = `${baseName}-${suffix}`;
    }
    return candidate;
}

describe('uniqueName', () => {
    it('returns baseName when no conflict', () => {
        assert.equal(uniqueName('My Playlist', []), 'My Playlist');
    });

    it('appends -1 on first collision', () => {
        assert.equal(uniqueName('React', ['React']), 'React-1');
    });

    it('appends -2 when -1 also exists', () => {
        assert.equal(uniqueName('React', ['React', 'React-1']), 'React-2');
    });

    it('handles many collisions', () => {
        const existing = Array.from({ length: 10 }, (_, i) => i === 0 ? 'A' : `A-${i}`);
        assert.equal(uniqueName('A', existing), 'A-10');
    });

    it('is case-sensitive', () => {
        assert.equal(uniqueName('react', ['React']), 'react');
    });
});

/* ── 3. Auth Encryption Round-Trip ─────────────────── */

import crypto from 'node:crypto';

function encryptRoundTrip(plaintext, passphrase) {
    const key = crypto.scryptSync(passphrase, 'tubetome-salt', 32);

    // Encrypt
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let enc = cipher.update(plaintext, 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');

    return dec;
}

describe('auth encryption', () => {
    it('round-trips a JSON payload', () => {
        const payload = JSON.stringify({ cookies: [{ name: 'sid', value: '123' }] });
        const result = encryptRoundTrip(payload, 'test-key-abc');
        assert.equal(result, payload);
    });

    it('round-trips an empty object', () => {
        const payload = '{}';
        assert.equal(encryptRoundTrip(payload, 'k'), payload);
    });

    it('produces different ciphertext with different keys', () => {
        const plain = '{"a":1}';
        const key1 = crypto.scryptSync('key1', 'tubetome-salt', 32);
        const key2 = crypto.scryptSync('key2', 'tubetome-salt', 32);
        const iv = crypto.randomBytes(16);

        const c1 = crypto.createCipheriv('aes-256-gcm', key1, iv);
        const e1 = c1.update(plain, 'utf8', 'hex') + c1.final('hex');

        const c2 = crypto.createCipheriv('aes-256-gcm', key2, iv);
        const e2 = c2.update(plain, 'utf8', 'hex') + c2.final('hex');

        assert.notEqual(e1, e2);
    });
});

/* ── 4. Queue Concurrency ──────────────────────────── */

describe('queue', () => {
    it('runs tasks serially', async () => {
        const order = [];
        let running = false;
        const pending = [];

        // Simple inline queue for testing
        function enqueue(fn) {
            return new Promise((resolve, reject) => {
                pending.push({ fn, resolve, reject });
                processNext();
            });
        }

        async function processNext() {
            if (running || pending.length === 0) return;
            running = true;
            const { fn, resolve, reject } = pending.shift();
            try { resolve(await fn()); } catch (e) { reject(e); }
            finally { running = false; processNext(); }
        }

        const p1 = enqueue(async () => {
            order.push('start-1');
            await new Promise(r => setTimeout(r, 50));
            order.push('end-1');
        });

        const p2 = enqueue(async () => {
            order.push('start-2');
            await new Promise(r => setTimeout(r, 10));
            order.push('end-2');
        });

        await Promise.all([p1, p2]);
        assert.deepEqual(order, ['start-1', 'end-1', 'start-2', 'end-2']);
    });
});
