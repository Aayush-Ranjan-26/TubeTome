// Service worker: starts an import job in a minimized NotebookLM window and relays its status to the site tab.
// Jobs live in chrome.storage.session (the worker can be killed at any time), keyed by NotebookLM tab id.
const YT = /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{6,20}$/;
const SITE = /^https:\/\/tube-tome\.vercel\.app\//;
const NLM = /^https:\/\/(notebooklm|notebook)\.google\.com\//;
const key = (tabId) => `job:${tabId}`;
const getJob = async (tabId) => (await chrome.storage.session.get(key(tabId)))[key(tabId)];
const claiming = new Set(); // makes claim atomic within this worker instance

// Bring the (minimized) NotebookLM window forward.
const show = async (tabId) => {
    const tab = await chrome.tabs.update(tabId, { active: true }).catch(() => null);
    const win = tab && await chrome.windows.get(tab.windowId).catch(() => null);
    if (win) chrome.windows.update(win.id, win.state === 'minimized' ? { state: 'normal', focused: true } : { focused: true }).catch(() => {}); // don't un-maximize a visible window
};
const tell = (siteTabId, status) => siteTabId && chrome.tabs.sendMessage(siteTabId, { type: 'status', status }).catch(() => {});

async function startJob({ title, links }, siteTabId) {
    if (!Array.isArray(links) || !links.length || links.length > 500 || !links.every((l) => YT.test(l))) {
        return tell(siteTabId, { type: 'error', message: 'Invalid video links.' });
    }
    // Own minimized window: nothing appears in the user's tab strip. show() restores it only when the user is needed.
    const win = await chrome.windows.create({ url: 'https://notebooklm.google.com/', state: 'minimized' })
        .catch(() => chrome.tabs.create({ url: 'https://notebooklm.google.com/', active: false }).then((t) => ({ tabs: [t] })).catch(() => null));
    if (win?.id && win.state && win.state !== 'minimized') chrome.windows.update(win.id, { state: 'minimized' }).catch(() => {}); // some builds ignore minimized-at-create
    const tab = win?.tabs?.[0];
    if (!tab) return tell(siteTabId, { type: 'error', message: 'Could not open NotebookLM.' });
    await chrome.storage.session.set({
        [key(tab.id)]: { title: String(title || 'YouTube playlist').slice(0, 200), links, siteTabId },
    });
    tell(siteTabId, { type: 'progress', text: 'Working in a hidden NotebookLM window...' });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    const tabId = sender.tab?.id;
    const from = sender.url || '';
    if (msg.type === 'import' && SITE.test(from)) {
        startJob(msg, tabId);
        reply({ ok: true }); // acknowledge so the site knows the extension is alive
    } else if (!NLM.test(from)) {
        return; // everything below is only for NotebookLM tabs
    } else if (msg.type === 'focus') {
        show(tabId);
    } else if (msg.type === 'close') {
        chrome.tabs.remove(tabId);
    } else if (msg.type === 'getJob') {
        getJob(tabId).then((job) => reply(job ?? null));
        return true;
    } else if (msg.type === 'claim') { // exactly one run per job, even if NotebookLM reloads (e.g. after sign-in)
        if (claiming.has(tabId)) return reply(false);
        claiming.add(tabId);
        getJob(tabId).then(async (job) => {
            if (!job || job.claimed) return reply(false);
            await chrome.storage.session.set({ [key(tabId)]: { ...job, claimed: true } });
            reply(true);
        }).finally(() => claiming.delete(tabId));
        return true;
    } else if (msg.type === 'resume') { // a reloaded page takes over a claimed job, once
        if (claiming.has(tabId)) return reply(false);
        claiming.add(tabId);
        getJob(tabId).then(async (job) => {
            if (!job?.claimed || job.resumed || job.inserted) return reply(false); // never re-insert after the links went in
            await chrome.storage.session.set({ [key(tabId)]: { ...job, resumed: true } });
            reply(true);
        }).finally(() => claiming.delete(tabId));
        return true;
    } else if (msg.type === 'inserted') { // the links were submitted: a reload after this must not run the insert again
        getJob(tabId).then((job) => job && chrome.storage.session.set({ [key(tabId)]: { ...job, inserted: true } }));
    } else if (msg.type === 'status') {
        getJob(tabId).then((job) => {
            if (!job) return;
            tell(job.siteTabId, msg.status);
            if (msg.status.type !== 'progress') chrome.storage.session.remove(key(tabId));
        });
    }
});

// Signed-in users also pass through accounts.google.com on silent redirects, so only a tab that STAYS there is a real
// sign-in page (no content script runs there) - bring that one forward, once.
const ON_GOOGLE_LOGIN = (tab) => tab?.url?.startsWith('https://accounts.google.com/');
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
    if (!change.url?.startsWith('https://accounts.google.com/') || !(await getJob(tabId))) return;
    setTimeout(async () => {
        const [tab, job] = [await chrome.tabs.get(tabId).catch(() => null), await getJob(tabId)];
        if (!job || job.focused || !ON_GOOGLE_LOGIN(tab)) return;
        await chrome.storage.session.set({ [key(tabId)]: { ...job, focused: true } });
        show(tabId);
        tell(job.siteTabId, { type: 'progress', text: 'Google needs you to sign in - see the NotebookLM window that just came forward...' });
    }, 12000);
});

// The user closed the NotebookLM tab before the import finished: don't leave the site waiting.
chrome.tabs.onRemoved.addListener(async (tabId) => {
    const job = await getJob(tabId);
    if (!job) return;
    chrome.storage.session.remove(key(tabId));
    tell(job.siteTabId, { type: 'error', message: 'The NotebookLM window was closed before the import finished.' });
});
