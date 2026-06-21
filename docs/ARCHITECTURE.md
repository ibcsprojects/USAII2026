# Architecture

```
                ┌────────────────────────────────────────────────┐
                │            Service worker (state owner)         │
                │  DocModel · Flag[] · dismissed · Settings       │
                │  analyze() ── EditBackend.apply() ── pageEst    │
                └───────▲───────────────────────────▲────────────┘
                        │ chrome.runtime messages    │
        ┌───────────────┴──────────┐      ┌──────────┴───────────────┐
        │   Side panel (React)     │      │  Content script (Docs)    │
        │  Mode 3 list of Flag     │      │  • print intercept (L2)   │
        │  cards · Apply/Dismiss   │      │  • floating GreenPages pill│
        └──────────────────────────┘      └───────────────────────────┘
```

## Components

- **`src/background/service-worker.ts`** — single source of truth. Owns the active
  `DocModel`, current `Flag[]`, dismissed ids, and `Settings`. Handles every message
  (`GET_STATE`, `REANALYZE`, `APPLY_FLAG`, `DISMISS_FLAG`, `UPDATE_SETTINGS`,
  `GET_PRINT_SUMMARY`, `OPEN_PANEL`). Applying a flag runs the `EditBackend` then
  re-analyzes so flags stay consistent.

- **`src/sidepanel/`** — React + Tailwind + zustand. `store.ts` mirrors worker state over
  messages; components are presentational. `FlagCard.tsx` is the shared card (Mode 2/3):
  chip, explanation, before→after, Apply / Dismiss, and an editable suggestion for
  `verbose` flags.

- **`src/content/`** — injected on `docs.google.com/document/*`. `printIntercept.ts`
  captures Ctrl/Cmd+P (+ `beforeprint`) and shows `PrintModal.ts` (a Shadow-DOM modal, no
  React, so it can't be styled by Docs). `content.ts` also mounts the launcher pill.

- **`src/lib/`** — framework-free core, unit-tested:
  - `docModel.ts` — paragraphs → styled text runs (mirrors the Docs API shape) +
    `flatten` / `rebuildOffsets` / `cloneDoc` + the bundled `SAMPLE_DOC`.
  - `analyzer/rules.ts` — the six detectors → `Flag[]`. `analyzer/condense.ts` — offline
    text shortener. `analyzer/client.ts` — local-vs-Gemini switch.
  - `docBackend.ts` — `EditBackend` interface; `MockDocsBackend` (in-memory, today) and
    `GoogleDocsBackend` (maps each `EditAction` to a Docs API `batchUpdate` request).
  - `pageEstimate.ts` — printed-page estimate (font size + blank lines inflate it).
  - `messaging.ts` — the typed message protocol.

- **`api/`** — optional Vercel serverless functions (root convention). `api/analyze.ts`
  (structural rules + Gemini-upgraded verbose suggestions) and `api/condense.ts`, with
  shared helpers in **`server/lib/`** (`gemini.ts`, `prompt.ts`). Both fall back to the
  offline path when `GEMINI_API_KEY` is absent.

## Data flow for "Apply"

1. User clicks **Apply** on a `FlagCard` → `store.apply(flagId, overrideText?)`.
2. → `APPLY_FLAG` message → worker looks up the flag, takes its `EditAction`
   (substituting edited text for `verbose` flags), calls `EditBackend.apply(doc, action)`.
3. `MockDocsBackend` returns a new `DocModel` (offsets rebuilt); worker marks the flag
   resolved and re-analyzes.
4. Worker replies `STATE`; the panel re-renders with the card gone and the score updated.

## The canvas constraint (why side-panel, not inline)

Google Docs paints text on `<canvas>`. The DOM has no per-word geometry, so an extension
cannot anchor an underline over a specific word reliably (it breaks on scroll/zoom and
can't cover all text). The Docs API gives **character ranges**, not pixels — perfect for
analysis and `batchUpdate` edits, which is exactly what the side-panel model needs.
Inline canvas overlays (Mode 1) are intentionally out of scope; the `EditAction` seam is
ready for them if Google ever exposes the geometry.

## The upgrade seam

Going live = three independent swaps, none of which touch the UI:

1. **Read** the real doc → replace `SAMPLE_DOC` with a Docs API `documents.get` mapped to
   `DocModel` (the shapes already align: paragraphs → text runs → `textStyle`).
2. **Write** edits → swap `MockDocsBackend` for `GoogleDocsBackend` (request payloads are
   already written in `buildRequests`; only OAuth + index translation remain).
3. **AI** → on by default; build with `VITE_BACKEND_URL` set (baked into `DEFAULT_SETTINGS`)
   and `analyzer/client.ts` routes to the Gemini-backed endpoints.
