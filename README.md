# TubeTome

**Turn a YouTube playlist into a Google NotebookLM notebook in a few clicks.**

TubeTome lists the videos in a public YouTube playlist, lets you choose which ones to keep, and then creates a NotebookLM notebook with those videos as sources. The notebook is created in **your own signed-in browser** through a small Chrome extension, so your Google credentials never leave your machine.

**Live site:** https://tube-tome.vercel.app

---

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Using TubeTome](#using-tubetome)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Tech stack](#tech-stack)

---

## Features

- **Playlist extraction.** Paste any public YouTube playlist URL and get every video link.
- **Flexible selection.** Import all videos, specific positions (`2, 5, 8`), or a range (`5-12`).
- **One-click notebook.** The extension creates a NotebookLM notebook, adds the videos as sources, and names it after the playlist.
- **Runs out of sight.** The import happens in a minimized browser window that closes itself when finished. The site then shows a link to the finished notebook.
- **Google sign-in.** Authentication is handled by Supabase (Google OAuth). Import history is stored per user with row-level security.
- **Built-in diagnostics.** If an import fails, a **Copy diagnostics** button on the error captures the extension version, browser, and the controls visible on the NotebookLM page, which makes layout changes easy to report.

## How it works

```
Website (Vercel) ──► Backend API (Vercel) ──► YouTube Data API      lists the playlist's videos
      │
      └── window.postMessage ──► Chrome extension ──► NotebookLM     creates the notebook
                                 (your browser, your Google session)
```

1. You sign in on the website with Google and paste a playlist URL.
2. The website asks the backend for the playlist. The backend verifies your Supabase session and queries the YouTube Data API.
3. You choose the videos. When you click **Import to NotebookLM**, the website hands the selected links to the TubeTome extension.
4. The extension opens NotebookLM in a minimized window, creates a notebook, pastes the links as website sources, and renames the notebook. Progress is reported back to the website.
5. When the import finishes, the website shows the notebook link and records the import in your history.

The extension only ever acts inside your own NotebookLM session. No Google login, cookie, or token is sent to a server.

## Getting started

### 1. Install the extension

The extension is not published on the Chrome Web Store yet, so it is loaded manually:

1. Download the extension from the site's install card, or use [`frontend/public/tubetome-extension.zip`](frontend/public/tubetome-extension.zip), and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped `tubetome-extension` folder.
4. Open (or reload) https://tube-tome.vercel.app so the extension attaches to the page.

After updating the extension, click its reload icon on `chrome://extensions` **and** open a fresh tab of the site. Otherwise the old page script keeps running.

### 2. Sign in

Open the site and choose **Sign in** with your Google account. You must also be signed in to Google in the same browser profile so that NotebookLM can open.

## Using TubeTome

1. Paste a playlist URL (`https://www.youtube.com/playlist?list=...`).
2. Pick a selection mode: **All Videos**, **Specific Numbers**, or **Range**.
3. Choose an action:
   - **Extract Links** copies the video links to your clipboard.
   - **Import to NotebookLM** creates the notebook through the extension.
4. Wait for the confirmation message and open the notebook link it shows.

Start with a small selection (for example videos 1 to 4) the first time you try it.

> NotebookLM limits the number of sources per notebook (50 on the free plan). The site warns before importing more than 50 videos; use a range or specific positions to stay within your plan.

## Project structure

```
frontend/     React + Vite web app (Supabase Google sign-in, Three.js background, Anime.js)
  public/tubetome-extension.zip   downloadable build of extension/ (re-zip after every change)
backend/      Express API deployed as a Vercel function
  server.js     routes, auth, CORS, CSRF, rate limiting
  youtube.js    YouTube Data API client
  api/index.js  Vercel entry point
  src/security/ request IDs, CSRF origin check, security-event logging
extension/    Chrome extension (Manifest V3)
  bridge.js     runs on the site; relays messages and reports the extension version
  background.js service worker; validates links, opens the NotebookLM window, relays status
  notebooklm.js runs inside NotebookLM; drives the UI to create the notebook
supabase/     schema.sql: tables, row-level security, profile trigger
```

## Deployment

TubeTome runs as two Vercel projects, one for `frontend/` and one for `backend/`. There is no local server; deploy with the Vercel CLI from the relevant directory:

```bash
vercel deploy --prod
```

The backend's `vercel.json` registers a daily cron job that calls `/healthz`, which pings Supabase so a free-tier project is not paused for inactivity.

### Supabase

1. Create a project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
2. In Google Cloud Console, create an OAuth client (type *Web*) with the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
3. In Supabase, enable the Google provider under **Authentication → Providers** and paste the client ID and secret.
4. Under **Authentication → URL Configuration**, set the Site URL to your site and add it to the redirect URLs.

### Using a different domain

The extension only runs on `tube-tome.vercel.app` and on NotebookLM. To use another site domain, add it to `matches` in [`extension/manifest.json`](extension/manifest.json) and to `SITE` in [`extension/background.js`](extension/background.js), then re-zip the extension.

## Configuration

| Project  | Variable                 | Purpose                                                              |
| -------- | ------------------------ | -------------------------------------------------------------------- |
| frontend | `VITE_SUPABASE_URL`      | Supabase project URL                                                 |
| frontend | `VITE_SUPABASE_ANON_KEY` | Supabase public (anon) key                                           |
| frontend | `VITE_API_URL`           | Backend URL; also allowed in the site's Content Security Policy      |
| backend  | `YOUTUBE_API_KEY`        | YouTube Data API v3 key (kept server-side)                           |
| backend  | `SUPABASE_URL`           | Supabase project URL, used to verify user tokens                     |
| backend  | `SUPABASE_ANON_KEY`      | Supabase public (anon) key                                           |
| backend  | `KEEPALIVE_URL`          | Optional extra URL to ping from the daily cron                       |
| backend  | `ALLOWED_ORIGINS`        | Optional comma-separated extra origins for CORS                      |

Templates are provided in [`frontend/.env.example`](frontend/.env.example) and [`backend/.env.example`](backend/.env.example). Set the values in each Vercel project's environment settings.

## Security and privacy

| Concern             | How it is handled                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Google credentials  | Never leave your browser. The extension acts only inside your own NotebookLM window.                       |
| Extension input     | The background script accepts only `https://www.youtube.com/watch?v=...` links, at most 500 per import.     |
| Extension scope     | Permissions are limited to `storage` and `accounts.google.com`; content scripts run only on the site and NotebookLM. |
| API access          | Every backend route requires a valid Supabase JWT. CORS, CSRF origin checks, rate limiting, and Helmet are enabled. |
| YouTube API key     | Stored server-side only.                                                                                   |
| User data           | Supabase row-level security: users can read only their own profile and import history.                     |

## Troubleshooting

| Symptom | What to do |
| ------- | ---------- |
| The site says to install the extension although it is installed | Open a fresh tab of the site. Chrome injects extensions only into pages loaded after installation. |
| "The extension is not responding" or "out of date" | Reload the extension at `chrome://extensions`, then open a fresh tab of the site. |
| "Could not find … NotebookLM's layout may have changed" | NotebookLM's interface changed. Click **Copy diagnostics** and include it in an issue, or adjust the text patterns in [`extension/notebooklm.js`](extension/notebooklm.js), re-zip, and reload the extension. |
| A NotebookLM window comes forward | Google needs you to sign in, or a step failed and the window was left open for inspection. Sign in and the import continues automatically. |
| Sign-in fails | The page shows Supabase's error message. Check the Google provider settings and redirect URLs. |

## Limitations

- The import automates NotebookLM's web interface, because NotebookLM has no public API for personal accounts. If Google changes that interface, the extension may need an update.
- The extension must be installed manually until it is listed on the Chrome Web Store.
- Only Chromium-based browsers that support Manifest V3 extensions are supported.

## Tech stack

React 18 · Vite · Three.js · Anime.js · Express · Supabase (Google OAuth, Postgres, row-level security) · YouTube Data API v3 · Chrome Extension (Manifest V3) · Vercel
