/**
 * Simple single-concurrency in-memory job queue.
 * Ensures only one Playwright automation runs at a time.
 */

let running = false;
const queue = [];
const MAX_QUEUE = 3;

/**
 * Enqueue an async function. Resolves/rejects with the function's result.
 * Rejects immediately if the queue is full.
 */
export function enqueue(fn) {
    if (queue.length >= MAX_QUEUE) {
        return Promise.reject(new Error('Queue full. Try again later.'));
    }

    return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        processNext();
    });
}

async function processNext() {
    if (running || queue.length === 0) return;
    running = true;
    const { fn, resolve, reject } = queue.shift();
    try {
        const result = await fn();
        resolve(result);
    } catch (err) {
        reject(err);
    } finally {
        running = false;
        processNext();
    }
}

/** Current queue depth (for diagnostics). */
export function queueSize() {
    return queue.length + (running ? 1 : 0);
}
