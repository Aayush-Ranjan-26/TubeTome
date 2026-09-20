// Runs inside NotebookLM (notebooklm.google.com -> notebook.google.com) in the user's own signed-in tab:
// creates a notebook, adds the YouTube links as website sources, and renames it.
// Text-based matching with a loose fallback, so it survives class-name churn and non-<button> controls.
(async () => {
    const send = (m) => chrome.runtime.sendMessage(m).catch(() => {}); // a dead service worker / reloaded extension must not become an unhandled rejection
    let job = await send({ type: 'getJob' });
    for (let i = 0; !job && i < 5; i++) { // job is stored just after the tab is created; the page can win that race
        await new Promise((r) => setTimeout(r, 300));
        job = await send({ type: 'getJob' });
    }
    if (!job) return;

    const say = (status) => send({ type: 'status', status });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const CLICKABLE = 'button,[role=button],[role=menuitem],[role=option],[role=tab],a,mat-chip,mat-chip-option,div[tabindex]';
    const visible = (el) => el.getClientRects().length > 0;
    const label = (el) => `${el.getAttribute('aria-label') || ''} ${el.textContent}`.replace(/\s+/g, ' ').trim();

    // Shortest matching label = most specific element (icon ligature text like "add" is tolerated);
    // on a tie (wrapper vs. the element inside it) the innermost wins.
    const pick = (sel, re, max, root = document) => [...root.querySelectorAll(sel)]
        .filter((el) => visible(el) && label(el).length < max && re.test(label(el)))
        .sort((a, b) => label(a).length - label(b).length || (a.contains(b) ? 1 : b.contains(a) ? -1 : 0))[0];
    const find = (re) => pick(CLICKABLE, re, 80);
    const findLoose = (re) => find(re) || pick('*', re, 40); // any element; clicks bubble to the real handler
    const click = (el) => el.click(); // bubbles to the real handler; closest(CLICKABLE) could resolve to an unrelated tabindex container

    const FIELDS = 'textarea,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),[contenteditable="true"]';
    const fields = () => [...document.querySelectorAll(FIELDS)].filter(visible);

    async function waitFor(fn, ms, what) {
        // wall-clock deadline: hidden tabs throttle timers, so counting iterations would stretch the wait
        for (let pass = 0; pass < 2; pass++) {
            for (const end = Date.now() + (pass ? Math.min(ms, 15000) : ms); Date.now() < end; await sleep(500)) {
                const v = fn();
                if (v) return v;
            }
            const v = fn(); // a throttled wake-up can land past the deadline
            if (v) return v;
            if (!what || !document.hidden || pass) break;
            send({ type: 'focus' }); // minimized window: animations/route changes may stall while hidden; restore it and retry once
            await sleep(1500);
        }
        if (what) throw notFound(what);
        return null;
    }

    // Error that names what was missing and which controls were visible, so a layout change is diagnosable from the site.
    function notFound(what) {
        const seen = [...new Set([...document.querySelectorAll(CLICKABLE)].filter(visible).map(label)
            .concat(fields().map((f) => `[${f.placeholder || f.getAttribute('aria-label') || f.tagName}]`))
            .filter((l) => l && l.length < 40))].slice(0, 40);
        return new Error(`Could not find ${what} - NotebookLM's layout may have changed. Page: ${location.host}${location.pathname}. Visible: ${seen.join(' | ')}`);
    }

    // React/Angular ignore a plain `.value =`; use the native setter + input event (contenteditable: insertText).
    function setValue(el, v) {
        el.focus();
        if ('value' in el) {
            Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            document.execCommand('selectAll');
            document.execCommand('insertText', false, v);
        }
    }

    // Sets the notebook title; NotebookLM may auto-title after sources are added, so this runs before and after.
    async function renameNotebook() {
        const fieldText = (el) => el.value ?? el.textContent;
        if (fields().some((el) => fieldText(el) === job.title)
            || [...document.querySelectorAll('h1,h2,[role=heading],span,div')].some((el) => visible(el) && !el.children.length && el.textContent.trim() === job.title)) return true; // already named (title may be plain text)
        // never a dialog / search / link box: the title must not land in the source dialog
        const ownField = (el) => !el.closest('[role=dialog],.cdk-overlay-container') && !/search|paste|link|url/i.test(`${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`);
        const own = fields().filter(ownField);
        let title = own.find((el) => /untitled/i.test(fieldText(el)))
            || own.find((el) => { const r = el.getBoundingClientRect(); return r.top < 120 && r.left < innerWidth / 2; }); // top-left title, e.g. an auto-generated name
        if (!title) { // title may be plain text that turns editable on click
            const t = pick('*', /^untitled notebook$/i, 40);
            if (t) {
                t.click();
                await sleep(700);
                const a = document.activeElement;
                if (a && a !== document.body && ('value' in a || a.isContentEditable) && ownField(a)) title = a; // focus may sit in the auto-opened source dialog
            }
        }
        if (!title) return false;
        setValue(title, job.title);
        title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        title.blur();
        await sleep(1000);
        return true;
    }

    try {
        // A hard navigation to /notebook/<id> after Create kills the run that claimed the job; the fresh page takes over from here (once).
        const resumed = job.claimed && /\/notebook\//.test(location.pathname) && await send({ type: 'resume' });
        if (!resumed) {
            // Needs the word "create" (so an existing notebook card titled "New notebook ..." can't match) but is otherwise
            // loose: the real label carries icon text / tooltips after it.
            const CREATE = /create (new|notebook)/i;
            // Signed out only when NotebookLM itself says so; merely not finding the button is NOT proof of that.
            const SIGNED_OUT = () => find(/(^|\s)sign in$/i) || /^\/login/.test(location.pathname);
            // Background tabs load slowly, so allow 45s.
            const home = () => (SIGNED_OUT() && true) || findLoose(CREATE); // sign-in first: a signed-out page may also carry a create CTA; the card may be a plain div
            let create = await waitFor(home, 15000);
            if (!create) { // slow, or a hidden window that never renders (no animation frames while hidden): bring it forward and keep waiting
                if (document.hidden) send({ type: 'focus' });
                create = await waitFor(home, 45000);
            }
            if (create === true) { // really signed out: bring the tab forward so the user can sign in
                say({ type: 'progress', text: 'Google needs you to sign in - see the NotebookLM window that just came forward...' });
                send({ type: 'focus' });
                create = await waitFor(() => !SIGNED_OUT() && findLoose(CREATE), 180000, '"Create notebook"'); // wait for the sign-in control to go away
            } else if (!create) {
                throw notFound('"Create notebook"');
            }
            if (!(await send({ type: 'claim' }))) { // page reloaded after the job was claimed: the run that owned it is gone
                send({ type: 'focus' });
                return say({ type: 'error', message: 'NotebookLM reloaded in the middle of the import - check the NotebookLM window; some links may already have been added.' });
            }

            say({ type: 'progress', text: 'Creating notebook...' });
            click(create);
            await waitFor(() => /\/notebook\//.test(location.pathname), 30000, 'the new notebook');
        }
        await sleep(2500);

        // Name it before adding sources: NotebookLM auto-titles only notebooks that are still "Untitled".
        say({ type: 'progress', text: 'Naming notebook...' });
        let renamed = await renameNotebook();

        say({ type: 'progress', text: `Adding ${job.links.length} videos...` });
        // Older layouts had a separate YouTube option; newer ones take YouTube links under "Websites". Prefer YouTube if both exist.
        const opt = (re) => ({ test: (t) => re.test(t) && !t.includes(job.title) }); // skip the notebook title, often "YouTube playlist"
        const YT_OPT = opt(/youtube/i), WEB_OPT = opt(/websites?/i); // no \b: an icon ligature can be glued to the label ("languageWebsites") // a YouTube option may take one link; Websites takes many
        const option = (f) => (job.links.length > 1 ? f(WEB_OPT) || f(YT_OPT) : f(YT_OPT) || f(WEB_OPT));
        // The link box is labelled paste/link/url ("Search the web for new sources" is a different box and doesn't match).
        const linkBox = () => [...document.querySelectorAll('textarea[formcontrolname="newUrl"]')].find(visible)
            || fields().find((f) => /paste|link|url/i.test(`${f.placeholder || ''} ${f.getAttribute('aria-label') || ''}`));
        // The source dialog may already be open (older layout) and may show the link box directly or behind a "Websites" option.
        // (8s: the auto-opened dialog can lag the page; clicking "Add sources" underneath it would stack a second dialog)
        let step = await waitFor(() => linkBox() || option(find), 8000);
        if (!step) {
            if (document.hidden) { // minimized window: Material dialogs open via requestAnimationFrame, which never runs while hidden
                send({ type: 'focus' });
                step = await waitFor(() => linkBox() || option(find), 3000); // the dialog may render now; don't stack a second one
            }
        }
        if (!step) {
            click(await waitFor(() => findLoose(/add sources?|upload a source/i), 15000, '"Add sources"'));
            step = await waitFor(() => linkBox() || option(findLoose), 10000, '"Websites" source option or the link box');
        }
        let box = step.matches(FIELDS) ? step : null;
        if (!box) {
            const before = new Set(fields());
            click(step);
            box = await waitFor(() => linkBox() || fields().find((f) => !before.has(f)), 10000, 'the link box');
        }
        setValue(box, job.links.join(box.tagName === 'INPUT' ? ' ' : '\n')); // a single-line input would strip newlines

        const SUBMIT = /(^|\s)(insert|add|import|submit)$/i;
        // Search only inside the dialog: "Add note" / an "add" icon button elsewhere also matches SUBMIT.
        const dlg = box.closest('[role=dialog],mat-dialog-container,.cdk-overlay-pane');
        const submit = await waitFor(() => {
            const b = pick(CLICKABLE, /insert/i, 60, dlg || document) || pick(CLICKABLE, SUBMIT, 30, dlg || document); // "Insert" may carry trailing icon text
            return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && b;
        }, 10000, '"Insert" button');
        await send({ type: 'inserted' });
        click(submit);
        // dialog closes once sources are accepted; if it stays, the links were rejected - don't report a false success
        const gone = () => !visible(dlg || submit);
        let closed = await waitFor(gone, 15000);
        if (!closed) { // a hidden window may never fire the dialog's close animation: restore it and wait longer
            if (document.hidden) send({ type: 'focus' });
            closed = await waitFor(gone, 45000);
        }
        if (!closed) throw new Error(`Clicked "${label(submit)}" but the sources dialog never closed - NotebookLM may have rejected the links. Check the NotebookLM window. Page: ${location.host}${location.pathname}`);
        await sleep(3000);
        // wait for ingestion spinners to clear, then make sure NotebookLM's auto-title didn't replace ours
        await waitFor(() => ![...document.querySelectorAll('.mat-mdc-progress-spinner,[role=progressbar]')].some(visible), 45000 + job.links.length * 2000); // bigger batches ingest longer
        renamed = await renameNotebook();
        say({ type: 'done', notebookUrl: location.origin + location.pathname + (new URLSearchParams(location.search).has('authuser') ? '?authuser=' + new URLSearchParams(location.search).get('authuser') : ''), name: renamed ? job.title : 'Untitled notebook', count: job.links.length });
        await sleep(10000); // let NotebookLM finish ingesting before the background tab closes
        send({ type: 'close' });
    } catch (err) {
        send({ type: 'focus' }); // leave the tab open and visible so the problem can be seen
        say({ type: 'error', message: err.message });
    }
})();
