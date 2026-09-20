# 📚 TubeTome ✨

> **Turn any YouTube playlist into a Google NotebookLM notebook in just a few clicks! 🚀**

TubeTome grabs the videos from any public YouTube playlist, lets you cherry-pick the ones you want, and automagically cooks up a NotebookLM notebook packed w/ those sources. 

Best of all? Everything runs right in **your own signed-in browser** via a lightweight Chrome ext — so your Google credentials stay 100% private and never touch our servers! 🔒🛡️

[![Live Site](https://img.shields.io/badge/Live%20Demo-tube--tome.vercel.app-blueviolet?style=flat-square&logo=vercel)](https://tube-tome.vercel.app)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Backend](https://img.shields.io/badge/Backend-Express%20on%20Vercel-black?style=flat-square&logo=express)](https://expressjs.com/)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20%2B%20RLS-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![Extension](https://img.shields.io/badge/Chrome%20Ext-Manifest%20V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)

🔗 **Live App:** [tube-tome.vercel.app](https://tube-tome.vercel.app)

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🧠 How It Works](#-how-it-works)
- [🚀 Getting Started](#-getting-started)
- [🎮 Using TubeTome](#-using-tubetome)
- [📂 Project Structure](#-project-structure)
- [🚢 Deployment](#-deployment)
- [⚙️ Configuration](#️-configuration)
- [🛡️ Security & Privacy](#️-security--privacy)
- [🔧 Troubleshooting](#-troubleshooting)
- [⚠️ Limitations & Gotchas](#️-limitations--gotchas)
- [🧰 Tech Stack](#-tech-stack)

---

## ✨ Features

- 📺 **Instant Playlist Extraction** — Drop in any public YouTube playlist URL and grab every video link in a snap.
- 🎯 **Flexible Selection** — Import everything, select specific positions (`2, 5, 8`), or grab an exact range (`5-12`).
- ⚡ **One-Click Notebook Creation** — The ext handles the heavy lifting: opens NotebookLM, inserts the videos as web sources, and titles the notebook after your playlist.
- 🕶️ **Runs Out of Sight** — Automation runs quietly in a minimized browser window that self-closes when done, handing you back a clean direct link.
- 🔐 **Google Auth + RLS** — Fast Google sign-in via Supabase OAuth. Your import history is protected w/ Postgres Row-Level Security (RLS).
- 🩺 **Built-in Diagnostics** — If NotebookLM tweaks its UI and an import stumbles, hit **Copy diagnostics** to instantly grab version, browser, and DOM state info for quick debugging.

---

## 🧠 How It Works

Here is a quick bird's-eye view of how the pieces talk to each other:

```text
🌐 Web App (Vercel) ────► ⚡ Backend API (Vercel) ────► 📺 YouTube Data API
       │                                                 (fetches playlist videos)
       │
       └── window.postMessage ──► 🧩 Chrome Extension ──► 📓 NotebookLM
                                  (runs locally in browser w/ your Google session 🔒)
```

1. **Sign in & paste:** Pop open the site, sign in w/ Google, and paste your YouTube playlist URL.
2. **Fetch playlist:** The frontend ping the backend API w/ your Supabase auth token. The backend queries YouTube Data API v3 and returns the video list.
3. **Pick your clips:** Choose your videos and hit **Import to NotebookLM**. The frontend shoots a message to the TubeTome extension.
4. **Automate the notebook:** The ext opens NotebookLM in a minimized tab, spins up a fresh notebook, adds the links as website sources, and renames it. Live progress streams right back to the UI!
5. **Done!** You get a direct link to your shiny new notebook, and the run is saved to your import history.

> 🔒 **Privacy Note:** The extension only ever interacts inside your local NotebookLM session. No passwords, tokens, or Google session cookies are ever sent to our backend.

---

## 🚀 Getting Started

### 1. Install the Chrome Extension

Since the ext isn't on the Chrome Web Store yet, you can load it in unpack mode in ~30 seconds:

1. Download the zip from the site's install card, or grab [`frontend/public/tubetome-extension.zip`](frontend/public/tubetome-extension.zip), and extract it.
2. Navigate to `chrome://extensions` in your browser and toggle **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped `tubetome-extension` folder.
4. Open (or refresh) [tube-tome.vercel.app](https://tube-tome.vercel.app) so the ext connects to the page.

> 💡 **Pro tip:** Whenever you update or edit extension files, click the **reload icon** on `chrome://extensions` **and** open a fresh tab of the site so the new scripts attach properly!

### 2. Sign In

Open the web app and click **Sign in w/ Google**. Make sure you're logged into Google in the same browser profile so NotebookLM is ready to go!

---

## 🎮 Using TubeTome

1. 📋 **Paste a playlist URL** (`https://www.youtube.com/playlist?list=...`).
2. 🎛️ **Choose your selection mode:**
   - **All Videos** — grab the whole batch.
   - **Specific Numbers** — cherry-pick items like `1, 3, 7`.
   - **Range** — select a slice like `1-10`.
3. 🚀 **Choose an action:**
   - **Extract Links** — copies cleaned video links straight to your clipboard.
   - **Import to NotebookLM** — triggers the extension to build your notebook.
4. 🎉 **Enjoy:** Watch the progress indicators, grab your notebook link when it pops up, and start querying your videos!

> 💡 **First-time tip:** Start w/ a small test run (e.g. 2–4 videos) to see the magic in action.
>
> ⚠️ **NotebookLM limits:** NotebookLM currently caps free plans at **50 sources per notebook**. TubeTome will alert you if you pick >50 videos so you can trim down with a range.

---

## 📂 Project Structure

```text
frontend/         💻 React + Vite web app (Three.js interactive visuals, Anime.js, Supabase auth)
  public/         📦 Assets & tubetome-extension.zip (re-zip extension/ here after updates!)
  src/            🎨 UI components, auth hooks, & extension bridge listeners
backend/          ⚡ Express API deployed as a Vercel Serverless Function
  server.js       🛡️ API routes, auth validation, CORS, CSRF, & rate limits
  youtube.js      📺 Streamlined YouTube Data API v3 client (fetch-based, zero bloat)
  api/index.js    🚀 Vercel entrypoint
  src/security/   🔒 Request tracing, CSRF origin verification, & security telemetry
extension/        🧩 Manifest V3 Chrome extension
  bridge.js       🌉 Content script bridge; talks to web UI & handles version handshake
  background.js   ⚙️ Service worker; manages tabs, validates YouTube URLs, & tracks lifecycle
  notebooklm.js   🤖 DOM automation script inside notebooklm.google.com
supabase/         🗄️ Database schemas, RLS policies, & auto-profile triggers
```

---

## 🚢 Deployment

TubeTome is configured to deploy seamlessly as two separate Vercel projects: one for `frontend/` and one for `backend/`.

Deploy directly via Vercel CLI from the respective folder:

```bash
# Deploy frontend or backend to production
vercel deploy --prod
```

> ⏰ **Supabase keep-alive:** The backend `vercel.json` includes a daily cron pinging `/healthz` to keep free-tier Supabase DBs warm and prevent automatic inactivity pausing!

### 🗄️ Supabase & OAuth Setup

1. Spin up a Supabase project and execute [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor.
2. In Google Cloud Console, create an OAuth 2.0 Web Client with the callback URL:  
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. In Supabase, enable Google under **Authentication → Providers** and paste your Client ID & Secret.
4. Under **Authentication → URL Configuration**, add your deployed URL (`https://tube-tome.vercel.app`) to Site URL & Redirect URLs.

### 🌐 Custom Domains

The extension is scoped to run on `tube-tome.vercel.app` and `notebooklm.google.com`. If you're hosting on a custom domain, remember to update `matches` in [`extension/manifest.json`](extension/manifest.json) and `SITE` in [`extension/background.js`](extension/background.js), then re-pack the zip.

---

## ⚙️ Configuration

Set these environment variables in your respective Vercel project dashboards:

| Scope | Variable | Purpose |
| :--- | :--- | :--- |
| `frontend` | `VITE_SUPABASE_URL` | Supabase project URL |
| `frontend` | `VITE_SUPABASE_ANON_KEY` | Supabase public (anon) API key |
| `frontend` | `VITE_API_URL` | Backend URL (whitelisted in site CSP) |
| `backend` | `YOUTUBE_API_KEY` | YouTube Data API v3 key (secure server-side) |
| `backend` | `SUPABASE_URL` | Supabase project URL (token verification) |
| `backend` | `SUPABASE_ANON_KEY` | Supabase anon key |
| `backend` | `KEEPALIVE_URL` | *(Optional)* Extra healthcheck endpoint for cron |
| `backend` | `ALLOWED_ORIGINS` | *(Optional)* Comma-separated extra CORS origins |

> 📝 Check out [`frontend/.env.example`](frontend/.env.example) and [`backend/.env.example`](backend/.env.example) for ready-to-copy templates.

---

## 🛡️ Security & Privacy

We treat security and privacy as non-negotiables:

| Concern | How TubeTome Handles It |
| :--- | :--- |
| 🔑 **Google Credentials** | Never leave your machine. The extension drives NotebookLM strictly within your existing browser session. |
| 🛡️ **Extension Input** | Strictly validates input URLs: only `https://www.youtube.com/watch?v=...` links are accepted (max 500 per run). |
| 🔒 **Least-Privilege Scopes** | Extension permissions are limited to `storage` and `accounts.google.com`. Content scripts inject only into the site and NotebookLM. |
| 🛑 **API Protection** | Every backend endpoint enforces Supabase JWT verification, strict CORS, CSRF origin verification, Helmet HTTP headers, & rate limits. |
| 📺 **YouTube API Key** | Kept strictly on the backend — never exposed to the client. |
| 👤 **User Data Isolation** | Full Postgres Row-Level Security (RLS): users can only query and modify their own records. |

---

## 🔧 Troubleshooting

| Issue | Quick Fix |
| :--- | :--- |
| ❓ **Site prompts to install extension, but it's already installed** | Open a fresh tab! Chrome only injects content scripts into pages loaded *after* the extension is installed/reloaded. |
| ⏱️ **"Extension not responding" or "out of date"** | Go to `chrome://extensions`, click the 🔁 reload button on TubeTome, and reload the web app tab. |
| 🔍 **"Could not find … NotebookLM's layout may have changed"** | Google may have updated NotebookLM's DOM. Click **Copy diagnostics** to copy the error dump for a bug report, or update the selectors in [`extension/notebooklm.js`](extension/notebooklm.js). |
| 🪟 **NotebookLM window pops up into focus** | Google might need you to re-authenticate, or an error occurred and the window stayed open for you to check. Just finish signing in and the import will resume! |
| 🚫 **Sign-in fails** | Inspect the Supabase error popup. Double-check your Google OAuth credentials and redirect URIs in the Supabase dashboard. |

---

## ⚠️ Limitations & Gotchas

- **DOM-Driven Automation:** NotebookLM currently lacks a public API for personal accounts. TubeTome automates the web UI, meaning Google UI redesigns might occasionally require selector updates.
- **Manual Extension Install:** Until TubeTome hits the Chrome Web Store, manual loading via `chrome://extensions` is required.
- **Chromium Only:** Requires Chromium-based browsers (Chrome, Brave, Edge, Arc) supporting Manifest V3.

---

## 🧰 Tech Stack

- **Frontend:** React 18 · Vite · Three.js · Anime.js · Vanilla CSS
- **Backend:** Express · Node.js · Vercel Serverless Functions
- **Auth & DB:** Supabase (Google OAuth, PostgreSQL, Row-Level Security)
- **APIs & Ext:** YouTube Data API v3 · Chrome Extension (Manifest V3)
- **Deployment:** Vercel (CI/CD, Serverless, Cron Jobs)

---

<div align="center">
  <sub>Built with ❤️ for curious minds, researchers, and playlist hoarders everywhere.</sub>
</div>
