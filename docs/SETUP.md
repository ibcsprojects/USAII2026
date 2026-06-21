# Going live — connecting real services

GreenPages runs fully offline by default (bundled demo doc + local rules). This guide adds
the three real integrations. They're independent — do them in any order.

---

## 1. Gemini (AI condensation) — easiest, ~5 min

The backend upgrades `verbose` flags with Gemini 1.5 Flash and falls back to the offline
shortener if anything fails.

1. Get a free key at <https://aistudio.google.com/app/apikey>.
2. Copy `.env.example` → `.env` and set `GEMINI_API_KEY=...` (for local dev), **or** set it
   as an env var in your Vercel project (step 2).
3. Set `VITE_BACKEND_URL` (in `.env` before `npm run build`) to your deployed backend's
   base URL — e.g. `https://your-app.vercel.app`, or `http://localhost:3000` with
   `vercel dev`. This is **baked into the extension at build time**, so AI is on by default
   and there's nothing to toggle in the side panel. Leave it blank to stay fully offline.

Without a key the endpoints still work and return `source: "local"`.

---

## 2. Vercel (host the backend)

```bash
npm i -g vercel
vercel            # link/create the project
vercel env add GEMINI_API_KEY   # paste your key
vercel deploy --prod
```

Vercel auto-detects the root `api/` directory as serverless functions, exposing:

- `POST /api/analyze`  `{ doc }` → `{ flags }`
- `POST /api/condense` `{ text }` → `{ text, source }`

CORS is open (`*`) so the extension can call it. Local testing: `vercel dev`.

---

## 3. Google Docs API (read & write the live document) — biggest step

This replaces the demo doc with the user's real document and makes **Apply** write back.

### 3a. Google Cloud project

1. <https://console.cloud.google.com> → new project.
2. **APIs & Services → Enable APIs** → enable **Google Docs API**.
3. **OAuth consent screen** → External → add scope
   `https://www.googleapis.com/auth/documents`.
4. **Credentials → Create OAuth client ID → Chrome extension**. Use your unpacked
   extension ID (`chrome://extensions` shows it). Copy the client ID.

### 3b. Extension changes — ✅ already implemented

All the code below is wired; the only manual edit is your client ID.

1. `manifest.config.ts` declares the `oauth2` block and the `identity` permission.
   **Paste your client ID** into `oauth2.client_id`.
2. OAuth, reading, and writing live in `src/lib/googleDocs.ts`
   (`getActiveGoogleDocId`, `fetchGoogleDoc`, `pushBatchUpdate`). Tokens come from
   `chrome.identity.getAuthToken` and auto-refresh once on a 401.
3. **Read** — `service-worker.ts` → `ensureDoc()` detects the active Google Doc tab,
   calls `documents.get`, and maps the response to `DocModel`
   (`paragraphs → elements[].textRun` with `fontSize`, `backgroundColor`, `bullet`,
   `pageBreak`). If you're not on a Doc (or decline auth) it stays on `SAMPLE_DOC`.
4. **Write** — `service-worker.ts` swaps in `GoogleDocsBackend` automatically once a live
   doc loads; `docBackend.ts` issues the real `batchUpdate` and re-reads the doc after each
   edit so indices stay in sync.

### 3c. Index translation — ✅ done

Docs API edits use **document indices**, not our flat-text offsets. The read mapping stores
each run's Docs `startIndex` (`TextRun.docStart`) and each paragraph's
`[docStart, docEnd)`. `docBackend.ts → toDocIndex()` translates flat offsets to Docs indices
in `buildRequests`. Re-reading after every edit avoids index-shift bookkeeping.

> **Known simplification:** `bulletsToTable` collapses bullets into a two-column **text**
> block (same as offline). A real `insertTable` is possible but needs follow-up requests to
> populate each cell at computed indices — left as an upgrade in `buildRequests`.

---

## Verifying

- Offline: `npm run build`, load `dist/`, open a Doc — 6 demo flags, Apply works, Ctrl+P
  shows the modal.
- With Vercel + Gemini: build with `VITE_BACKEND_URL` set, re-scan — wordy paragraphs are
  flagged and their suggestions are AI-written (network tab shows `/api/analyze`).
- With Docs API: open your own wasteful doc — flags now reflect *your* content and Apply
  edits the live document.
