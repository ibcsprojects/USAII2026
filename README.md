# 🌿 GreenPages

**Like Grammarly, but for paper & ink.** A Chrome extension (Manifest V3) that works
inside Google Docs, detects wasteful print formatting, and suggests eco-friendly fixes
you accept **one at a time** from a side panel — plus a print-intercept that double-checks
you before any wasteful print job.

> Works **100% offline out of the box** against a bundled demo document and a
> deterministic rules engine. No accounts, no keys. The Google Docs API and Gemini are an
> optional upgrade (see [`docs/SETUP.md`](docs/SETUP.md)).

## What it flags

| Flag | Waste | Eco fix |
|------|-------|---------|
| 🖍️ Highlighted text | Ink-heavy fills | Switch to underline |
| 🔠 Oversized body font | Extra pages | Shrink to body size |
| ↕️ Stacked blank lines | Padding pages | Collapse to one |
| ⤓ Hard page break | Half-blank sheet | Slim dashed divider |
| ☰ Sprawling short bullets | One line each | Compact table |
| ✂️ Wordy paragraphs | Extra lines | AI-condensed text (editable) |

## Quick start

```bash
npm install
npm run build          # type-checks + bundles to dist/
```

Then load it in Chrome:

1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `dist/` folder.
3. Open any Google Doc. Click the **🌿 GreenPages** pill (bottom-right) or the toolbar
   icon to open the side panel.
4. Review flag cards → **Apply** or **Dismiss** each. The eco-score and "pages saved"
   update live.
5. Press **Ctrl/Cmd+P** in the doc → the **print-intercept modal** shows the page
   estimate, unresolved flags, and double-sided / paper-size / location reminders.

## Scripts

| Command | Does |
|---------|------|
| `npm run dev` | Vite dev server (HMR for the side panel) |
| `npm run build` | Type-check + production bundle to `dist/` |
| `npm test` | Vitest — the rules engine + edit backend |

## For hackathon moderators / judges

You don't need to build anything to try this — just load the pre-built extension:

1. Go to `chrome://extensions`, enable **Developer mode** (top-right toggle).
2. Click **Load unpacked** and select the `dist/` folder from this submission.
3. Open any Google Doc, then click the **🌿 GreenPages** pill (bottom-right of the page)
   or the extension's toolbar icon to open the side panel.
4. The extension works immediately against a bundled offline demo document — no sign-in
   needed to see the core feature set (flag detection, Apply/Dismiss, the eco-score, and
   the Ctrl/Cmd+P print-intercept modal).

**To test it against your own real Google Doc** (live read/write via the Docs API), Chrome
will ask you to sign in and grant access the first time. Because this extension isn't
published to the Chrome Web Store, Google restricts who can complete that sign-in to a
fixed list of approved testers — **please email [team email addresses] and ask to be
added as an authorized tester** before you try this part. Once you're added, the sign-in
prompt will work normally. If you skip this step, the extension still works fine — it
simply stays on the offline demo document instead of reading your real one.

## How it's wired

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Short version: the side panel and a
service worker hold the document model and flags; an `EditBackend` interface applies each
accepted fix. Today that's an in-memory `MockDocsBackend`; swapping in `GoogleDocsBackend`
(maps edits to Docs API `batchUpdate`) takes the product live with no UI changes.

### A note on inline underlines

Google Docs renders text onto `<canvas>`, so a third-party extension can't get per-word
**screen coordinates** — which is why true Grammarly-style inline underlines aren't
reliable there (and why Grammarly's own Docs support is special-cased). GreenPages instead
uses the **side-panel** model: it reads the document via the Docs API (character ranges,
not pixels), which is all it needs to analyze and to apply fixes.
