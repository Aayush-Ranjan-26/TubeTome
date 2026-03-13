# TubeTome 📚📺

**Import YouTube playlists directly into NotebookLM notebooks** — powered by browser automation with persistent Google login.

TubeTome is a high-performance automation bridge that lets you fetch entire playlists, select specific videos (by index or range), and automatically generate a ready-to-use NotebookLM notebook in seconds.

## Quick Start

### 1. Install & Configure

```bash
# Backend
cd backend
npm install
npx playwright install chromium   # one-time browser download

# Frontend
cd ../frontend
npm install
```

Create `backend/.env`:
```env
PORT=3001
YOUTUBE_API_KEY=your_youtube_api_key
```

- **`YOUTUBE_API_KEY`** — Google API key with YouTube Data API v3 enabled.

### 2. Run

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Open **http://localhost:5173** — the browser auto-opens.

### 3. Onboarding (one-time)

1. On the TubeTome UI, the **Automation Status** card shows "Not configured".
2. Click **Configure Automation**.
3. A Chrome window opens to `notebooklm.google.com`.
4. Sign in with your Google account normally.
5. Once the NotebookLM dashboard loads, the browser closes automatically.
6. The status card updates to **Configured**.
7. Your Google cookies are saved in a persistent Chrome profile — **no re-login needed**.

### 4. Import a Playlist

1. Paste a YouTube playlist URL.
2. Choose selection mode: **All Videos**, **Specific Numbers**, or **Range**.
3. Click **Import to NotebookLM** (or **Extract Links** for links only).
4. On first run, a consent dialog explains what the automation does — click **I understand and continue**.
5. TubeTome fetches videos, creates a uniquely-named notebook, and adds all video URLs as sources.
6. The Chrome tab stays open with your new notebook.

---

## Features

- **Smart Video Selection** — Import all, specific indices (`2, 5, 8`), or a range (`5-12`)
- **Persistent Login** — Chrome profile persists Google cookies between sessions
- **Supabase Integration** — Google OAuth sign-in, user profiles, import history
- **Session Diagnostics** — Manual "Refresh sign-in" fallback if session expires
- **Premium UI** — Three.js 3D particle background, Anime.js micro-animations
- **Single Tab** — Opens one Chrome tab, leaves it open for you

## Architecture

```
frontend/             Vite + React (dark YouTube-inspired UI)
  src/
    App.jsx           Main app component
    supabaseClient.js Supabase client (session persistence)
    useAuth.js        Auth hook (Google OAuth, profile, history)
    index.css         Full design system
backend/
  server.js           Express — routes for auth, playlist, automation
  youtube.js          YouTube Data API v3 (pagination, metadata)
  src/automation/
    selectors.js      All NotebookLM UI selectors (single file)
    auth.js           Persistent Chrome profile management
    queue.js          Single-concurrency job queue
    playwright_worker.js  Headful Chrome automation (launchPersistentContext)
    selection_parser.js   Robust video selection parsing
```

## Security & Privacy

| Concern | How TubeTome handles it |
|---|---|
| Google credentials | Stored in a persistent Chrome profile on your local machine. Never sent to any third party. |
| Auth persistence | Chrome profile at `backend/data/chrome-profile/` stores cookies on disk. |
| YouTube API key | Server-side only, loaded from `.env`. Never exposed to the browser. |
| Supabase auth | Google OAuth via Supabase with RLS. User data stays in your Supabase project. |
| Consent | UI shows a consent modal before first automation run. |
| Deletion | Click **Reset session** in the UI, or delete `backend/data/chrome-profile/`. |

## Supabase Setup (Optional)

The app integrates with Supabase for user profiles and import history:

1. The Supabase project is pre-configured with `profiles` and `import_history` tables.
2. To enable Google OAuth sign-in, configure the **Google provider** in your [Supabase Auth settings](https://supabase.com/dashboard).
3. Add your Google Cloud OAuth Client ID and Secret.
4. Set the redirect URL to your app's origin (e.g., `http://localhost:5173`).

## Troubleshooting

### Selectors broke (NotebookLM UI changed)
1. The API returns `{ code: "UI_SELECTOR_FAIL", screenshot: "path" }`.
2. Check `backend/logs/screenshots/` for failure screenshots.
3. Update selectors in `backend/src/automation/selectors.js`.
4. Restart the backend.

### Refreshing the automation session
1. Click **Reset session** in the UI (or `DELETE /auth`).
2. Click **Configure Automation** to re-run onboarding.

### Error Codes
| Code | Meaning |
|---|---|
| `AUTH_MISSING` | No Chrome profile. Run onboarding. |
| `UI_SELECTOR_FAIL` | NotebookLM UI changed. Update selectors. |
| `CREATION_FAILED` | Notebook creation or source addition failed. |
| `YT_API_FAIL` | YouTube API error (quota, private playlist). |
| `EMPTY_SELECTION` | No valid videos selected. Check your input. |

## Tech Stack

- **Frontend:** React 18, Three.js, Anime.js, Vite
- **Backend:** Node.js, Express, Playwright
- **Auth & DB:** Supabase (Google OAuth, PostgreSQL, RLS)
- **APIs:** YouTube Data API v3, NotebookLM (browser automation)
