# WhatsApp Broadcast Bot (Next.js + Baileys)

A Next.js App Router dashboard for managing a single WhatsApp account via the [Baileys](https://github.com/WhiskeySockets/Baileys) library. The UI lets you authenticate with a QR code, manage broadcast recipients and message templates, randomise delivery intervals, schedule automatic re-sends, and review the last seven days of delivery logs. All configuration and session data is persisted to JSON files for demo purposes.

> **Important:** Baileys depends on Git-hosted packages. Install [Git](https://git-scm.com/) before running `npm install`, otherwise dependency resolution will fail.

## Features

- WhatsApp login/logout via Baileys with QR code rendering in the browser.
- Recipient manager with sanitation (supports semicolons or newlines, strips punctuation, converts `0…` to Indonesian `+62`).
- Broadcast composer with random stagger between messages (min/max seconds) and optional recurring interval (minutes).
- Persisted configuration, credentials, and activity logs stored in JSON (local: `data/`; Vercel: `/tmp/wa-bot`).
- Manual send and interval-based auto broadcast (auto stop when the dashboard is closed or server restarts).
- Activity log viewer with seven-day retention.

## Project Structure

- `app/page.tsx` – client dashboard UI and interactions.
- `app/api/*` – REST endpoints for login/logout, configuration, broadcasting, and logs.
- `lib/whatsappManager.ts` – singleton wrapper around Baileys with scheduling, persistence, and logging.
- `lib/storage.ts` – helper for reading/writing JSON to the correct data directory.
- `data/*.json` – default config/log files for local development (auto-created at runtime if missing).

## Requirements

- Node.js 18.18+ or 20+ (Next.js 16 requirement).
- npm 9+ (ships with Node 18+).
- **Git** (required for Baileys' `libsignal-node` dependency).

## Setup & Development

```bash
npm install        # requires git in PATH
npm run dev        # start the dev server at http://localhost:3000

# optional helpers
npm run lint       # run ESLint
npm run build      # create a production build (needs successful npm install)
```

### Credentials & Persistence

- During local development, session/config/log data lives in `data/`.
- When deployed on Vercel, the app writes to `/tmp/wa-bot/` (ephemeral). Closing the dashboard or a cold start clears active timers; you must manually restart auto broadcasts each time.

### Deployment Notes

- API routes opt into the Node.js runtime (`export const runtime = "nodejs";`).
- Baileys maintains a persistent websocket connection. Vercel serverless functions may terminate idle connections; consider a long-lived environment (e.g. Vercel Serverless Function with keep-alive, Vercel Cron, or a dedicated VM) for production usage.
- JSON persistence is for demo/testing only—replace with a durable datastore before going live.

## API Overview

| Method   | Endpoint               | Purpose                                 |
| -------- | ---------------------- | --------------------------------------- |
| POST     | `/api/session/login`   | Initiate login and return QR code data  |
| POST     | `/api/session/logout`  | Logout and clear stored credentials     |
| GET      | `/api/session/status`  | Session status, config snapshot, timers |
| GET      | `/api/logs`            | Broadcast log entries (7-day window)    |
| GET/POST | `/api/config`          | Fetch or update configuration           |
| POST     | `/api/broadcast/start` | Send now and optionally start interval  |
| POST     | `/api/broadcast/stop`  | Stop the active auto broadcast timer    |

## Known Limitations

- Scheduled broadcasts rely on an in-memory timer. Any process restart or cold start clears the schedule.
- Baileys requires a long-lived process; Vercel may recycle instances leading to disconnections.
- File-based persistence is not suitable for production workloads—use a database or KV store instead.
