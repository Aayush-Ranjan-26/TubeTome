// Runs on the TubeTome site: relays page <-> extension messages.
const post = (m) => window.postMessage({ source: 'tubetome-ext', ...m }, location.origin);
const NOT_RESPONDING = 'The extension is not responding - reload it at chrome://extensions, then reload this page.';

window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'tubetome') return;
    try { // after the extension is reloaded this old script is orphaned and chrome.runtime calls throw
        if (e.data.type === 'ping') post({ type: 'ready', version: chrome.runtime.getManifest().version });
        if (e.data.type === 'import') {
            chrome.runtime.sendMessage({ type: 'import', title: e.data.title, links: e.data.links }, (res) => {
                if (chrome.runtime.lastError || !res?.ok) post({ type: 'error', message: NOT_RESPONDING });
                else post({ type: 'progress', text: 'Extension started the import...' });
            });
        }
    } catch {
        post({ type: 'error', message: 'The extension was updated - reload this page and try again.' });
    }
});

try {
    chrome.runtime.onMessage.addListener((m) => { if (m.type === 'status') post(m.status); });
    post({ type: 'ready', version: chrome.runtime.getManifest().version });
} catch { /* orphaned script */ }
