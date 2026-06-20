# GreenPages

Project Goal: Help a school understand and visualize how everyday choices contribute to environmental impact.

GreenPages is a Chrome extension that works inside Google Docs to flag wasteful print
formatting (highlighting, oversized fonts, double spacing, redundant text, hard page
breaks) and stops you at the moment of printing to show what's unresolved before paper
gets used.

This repo now contains a complete implementation of all four roles in the team brief
(Overlay/UI, Print Intercept, AI backend, Docs API). Everything that doesn't require your
personal accounts (Gemini API key, Google Cloud OAuth client, a deployed Vercel project) is
built, tested, and verified. The three things that genuinely need your credentials are
called out explicitly below — I can't create Google Cloud or Vercel accounts on your
behalf, and I don't have browser access to a live, authenticated Google Doc in this
environment, so those specific seams are documented rather than faked.

## Architecture

```
flagStore.js        shared flag/eco-score state + cumulative impact stats (chrome.storage.local)
docsApi.js           Docs API read (fetchSnapshot) + write (applyFix/batchUpdate) layer
textAnchor.js         pure text-locating math used to position Mode 1 underlines (unit tested)
flagCard.js           shared flag-card component used by both Mode 2 and Mode 3
printIntercept.js      Layer 2: Ctrl+P / window.print() guard modal
overlay.js             Mode 1 inline underlines + Mode 2 click-to-card popout
summarySidebar.js     Mode 3 summary sidebar (floating eco badge + slide-out panel)
analysis.js            MutationObserver -> 8s debounce -> snapshot -> backend -> flagStore
content.js             bootstraps all of the above, relays messages to/from popup.js
popup.html/js/css      toolbar dashboard: live doc score, impact stats, manual re-scan
api/analyze.js         Vercel serverless function: Gemini call + schema validation + diff
```

Load order in `manifest.json` matters (later files depend on earlier ones):
`flagStore.js -> docsApi.js -> textAnchor.js -> flagCard.js -> printIntercept.js ->
overlay.js -> summarySidebar.js -> analysis.js -> content.js`.

## What's been built for every role

- **Person 1 (Overlay/UI)** — `overlay.js` + `textAnchor.js`. Mode 1 finds flagged text in
  the live document by searching the rendered DOM's text nodes for the literal substring
  (resolved from the paragraph snapshot + offsets, or `original` for `REDUNDANT_TEXT`),
  then positions a colored `<div>` underline over each of `Range.getClientRects()` so
  wrapped lines get multiple underline segments. It resyncs on scroll/resize via
  `requestAnimationFrame`. Clicking an underline opens the shared Mode 2 card
  (`flagCard.js`) with scroll lock, Apply/Dismiss, and an explicit close button.
- **Person 2 (Print Intercept)** — `printIntercept.js`, unchanged from before: captures
  Ctrl/Cmd+P and `window.print()`, estimates page count from `.kix-page` elements, shows
  the warning modal, and only calls the real print dialog on explicit "Print Anyway".
- **Person 3 (AI backend)** — `api/analyze.js`, a Vercel serverless function. It validates
  the request, diffs `currentSnapshot` against `previousSnapshot` to find changed
  paragraph IDs, sends only those to Gemini 1.5 Flash with a system prompt that enforces
  the locked JSON schema (`responseMimeType: 'application/json'` + an explicit "no prose"
  instruction), validates/sanitizes whatever comes back (drops unknown flag types or
  paragraphIds that don't exist), and merges it with carried-forward flags for paragraphs
  that didn't change.
- **Person 4 (Docs API)** — `docsApi.js`. `fetchSnapshot()` calls the real
  `documents.get` endpoint and parses the official `StructuralElement`/`textRun` response
  shape into `{ paragraphId, text, startIndex, endIndex, maxFontSize, hasHighlight,
  isBullet }` per paragraph (paragraphId is synthesized from each paragraph's absolute
  `startIndex`, since the Docs API doesn't expose Kix's internal `kix.xxx` IDs).
  `applyFix()` resolves paragraph-relative offsets into absolute indices using that
  snapshot and calls the real `documents.batchUpdate` endpoint with the correct request
  shape per flag type.
- **Orchestration** — `analysis.js` implements the brief's full flow: a `MutationObserver`
  on the editor, an 8-second inactivity debounce, a snapshot fetch, a POST to the backend
  with the current+previous snapshot and previous flags, and a `flagStore.setFlags()` /
  `setDocMeta()` update. A manual "Re-scan now" button in the popup triggers the same path
  on demand via `chrome.runtime` messaging.

## What's actually been tested, and how

I don't have a live, authenticated Google Doc to test against in this environment (no
browser automation bridge was available — confirmed by trying it), and I have no Gemini
API key or OAuth client (by your choice, so you can supply real ones later). Rather than
claim untested code "works," here's exactly what was verified and how:

- `npm test` runs three real test files (17 assertions total, all passing):
  - `textAnchor.test.js` — the Mode 1 text-locating math (single-node matches,
    matches spanning multiple text nodes, repeated-text occurrence index, no-match,
    empty-string edge case). This is the trickiest, most failure-prone part of the whole
    project, fully isolated from the DOM so it's actually testable.
  - `docsApi.test.js` — `parseSnapshot()` against a payload shaped exactly like a real
    `documents.get` response (verified against Google's official Docs API resource
    schema), plus `buildRequests()`/`resolveAbsoluteRange()` producing correct
    `batchUpdate` request bodies for each auto-fixable flag type.
  - `api/analyze.test.js` — the backend's diff-then-Gemini-then-merge pipeline with a
    mocked Gemini HTTP response (no real network call or API key), confirming only
    changed paragraphs get sent to Gemini, unchanged paragraphs' flags carry forward, and
    the handler returns the right HTTP status codes for missing config / bad methods.
- Every `.js` file passes `node --check` and `manifest.json`/`package.json` are valid JSON.
- **What's *not* verified**: Mode 1's DOM-binding layer (the part of `overlay.js` that
  walks real `.kix-appview-editor` text nodes) against an actual live Google Doc, and any
  live network calls to Gemini or the Docs API. Google's Kix editor DOM is internal and
  undocumented and has changed over time — the text-search approach is a deliberate,
  defensible choice (it doesn't depend on Kix's internal class names at all, unlike a
  pixel-coordinate scheme keyed to specific CSS selectors), but it's still unverified
  against the real thing. If something looks subtly off when you first load a real doc,
  start by checking `overlay.js`'s `TEXT_CONTAINER_SELECTOR` and `findRangeForText`.

## The three things only you can do

1. **Gemini API key** — get a free key from [Google AI Studio], then set it as the
   `GEMINI_API_KEY` environment variable in your Vercel project settings.
2. **Deploy the backend to Vercel** — `vercel deploy` from this repo root (it auto-detects
   `/api/analyze.js` as a serverless function, no extra config needed). Then update
   `BACKEND_URL` in `analysis.js` to your deployed URL.
3. **Google Cloud OAuth for the Docs API** — create a Cloud Console project, enable the
   Docs API, create an OAuth client of type "Chrome Extension" (you'll need this
   extension's ID, visible in `chrome://extensions` once loaded), then add to
   `manifest.json`:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "scopes": ["https://www.googleapis.com/auth/documents"]
   }
   ```

Until those three are done, the extension still works end-to-end on demo data:
`flagStore.js` seeds realistic placeholder flags so the print guard, sidebar, and Mode 2
cards are all fully functional and demoable; `analysis.js` logs (not throws) when the
backend isn't configured yet and `docsApi.js` surfaces a clear error in the flag card if
Apply is clicked before OAuth is set up.

## Loading the extension locally

1. `chrome://extensions` → enable Developer Mode → **Load unpacked** → select this folder.
2. Open any Google Doc (`docs.google.com/document/...`).
3. Press **Ctrl/Cmd+P** (or File → Print) to see the print guard modal.
4. Click the floating leaf badge bottom-right to open the summary sidebar, or click a
   colored underline in the doc to open the Mode 2 card (once real flags are flowing).
5. Click the extension's toolbar icon for the impact dashboard and the manual re-scan
   button.

## Running the tests

```
npm test
```

## Color palette

| Role | Hex |
|---|---|
| Primary green | `#2AA16C` |
| Dark green (headers) | `#2A5746` |
| Amber (mid eco score / warnings) | `#FFB221` |
| Cream (cards/backgrounds) | `#ECE1D6` |
| Coral (low eco score / alerts) | `#E76544` |

[Google AI Studio]: https://aistudio.google.com/
