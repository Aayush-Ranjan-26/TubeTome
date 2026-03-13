/**
 * NotebookLM UI Selectors — single source of truth.
 *
 * BASED ON the actual 2025/2026 NotebookLM UI:
 *
 *   HOME PAGE:
 *     - Top bar has "+ Create notebook" button
 *     - Notebook grid shows existing notebooks
 *
 *   INSIDE A NOTEBOOK:
 *     - Title "Untitled notebook" at top-left — click to rename
 *     - Left sidebar: "+ Add sources" button
 *     - Source dialog auto-opens for new notebooks:
 *       → "Search the web for new sources" text field
 *       → Tabs: "Web" dropdown, "Fast research"
 *       → "Upload files" | "Websites" | "Drive" | "Copied text" buttons
 *     - After clicking "Websites":
 *       → URL input field appears to paste links
 *       → Arrow/submit button to add the source
 *
 * Uses Playwright text selectors (`:has-text()`, `text=`) for resilience.
 */
export const SELECTORS = {
    /* ── Home / Notebook list ────────────────────────── */

    // "Create notebook" / "New notebook" / "Create new" button variations
    createNotebookBtn: [
        // Exact text matches
        'text="Create new"',
        'text="+ Create new"',
        'text="Create notebook"',
        'text="New notebook"',
        'text="Create new notebook"',
        // Button with text
        'button:has-text("Create new")',
        'button:has-text("Create notebook")',
        'button:has-text("New notebook")',
        'button:has-text("Create")',
        // Aria-label patterns
        '[aria-label="Create new notebook"]',
        '[aria-label="Create notebook"]',
        '[aria-label="New notebook"]',
        '[aria-label*="Create"]',
        '[aria-label*="New notebook"]',
        // Role-based
        '[role="button"]:has-text("Create new")',
        '[role="button"]:has-text("Create notebook")',
        '[role="button"]:has-text("New notebook")',
        '[role="button"]:has-text("Create")',
        // Material Design FAB (floating action button) or icon buttons
        'button.mdc-button:has-text("Create")',
        'button.mat-mdc-button:has-text("Create")',
        // Generic fallback — any clickable element with create text
        'a:has-text("Create new")',
        'div[role="button"]:has-text("Create")',
        'span:has-text("Create new")',
    ],

    // A notebook card in the grid
    notebookCard: [
        '[data-notebook-id]',
        'a[href*="/notebook/"]',
        '.notebook-card',
    ],

    /* ── Inside a notebook ───────────────────────────── */

    // The notebook title (editable) — click to rename
    notebookTitleEditable: [
        'input[aria-label*="notebook"]',
        'input[aria-label*="title"]',
        '[contenteditable="true"]',
        'h1[contenteditable]',
    ],

    // The title text element to click for editing
    notebookTitleText: [
        'text="Untitled notebook"',
        'h1:has-text("Untitled")',
        '[class*="title"]:has-text("Untitled")',
    ],

    /* ── Source dialog ───────────────────────────────── */

    // "+ Add sources" button in left sidebar
    addSourcesBtn: [
        'button:has-text("Add sources")',
        'button:has-text("Add source")',
        'text="Add sources"',
        '[aria-label="Add sources"]',
        '[role="button"]:has-text("Add sources")',
        'div:has-text("Add sources")',
    ],

    // "Websites" button in the source dialog
    websitesBtn: [
        'button:has-text("Websites")',
        'button:has-text("Website")',
        'text="Websites"',
    ],

    // The URL textarea for adding website/YouTube sources in bulk
    sourceUrlInput: [
        'textarea[placeholder*="Paste any links"]',
        'textarea[placeholder*="Paste"]',
        'textarea[aria-label*="Paste"]',
        'textarea',
        'input[placeholder*="Paste"]',
        'input[placeholder*="URL"]',
        'input[placeholder*="Search the web"]',
    ],

    // Submit/arrow button to add the URL source
    sourceSubmitBtn: [
        'text="Insert"',
        'button:has-text("Insert")',
        '[aria-label*="Insert"]',
        '[role="button"]:has-text("Insert")',
        'div:has-text("Insert")',
        'button[aria-label*="Submit"]',
        'button[aria-label*="Add"]',
        'button:has-text("Turn on")',
    ],

    // Arrow submit button (the → icon button next to URL input)
    sourceArrowBtn: [
        'button[aria-label*="arrow"]',
        'button svg path[d*="arrow"]',
    ],

    // Close button on the source dialog
    sourceDialogClose: [
        'button[aria-label="Close"]',
        'button[aria-label="close"]',
        'button:has-text("✕")',
        'button:has-text("Close")',
    ],

    /* ── General ─────────────────────────────────────── */

    // Loading/progress indicators
    loadingIndicator: [
        '[role="progressbar"]',
        '.loading',
        '[class*="spinner"]',
    ],
};
