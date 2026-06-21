// The single source of truth. Holds the active DocModel, the current flags, dismissed
// ids, and settings; serves them to the side panel and the content script. Applying a
// fix runs through the EditBackend and re-analyzes so flags stay consistent.

import { SAMPLE_DOC, flatten, type DocModel } from '../lib/docModel'
import type { Flag } from '../lib/analyzer/types'
import { analyze } from '../lib/analyzer/client'
import { MockDocsBackend, GoogleDocsBackend, type EditBackend } from '../lib/docBackend'
import { applyAllFixes } from '../lib/applyAll'
import { getActiveGoogleDocId, fetchGoogleDoc, fetchDocPageCount } from '../lib/googleDocs'
import { estimatePages, lineLocation } from '../lib/pageEstimate'
import {
  DEFAULT_SETTINGS,
  onMessage,
  type Msg,
  type Settings,
} from '../lib/messaging'

interface State {
  doc: DocModel
  flags: Flag[]
  dismissed: Set<string>
  settings: Settings
  /** Current page count: exact (live PDF export) when on a doc, else the heuristic. */
  pages: number
}

// Defaults to the offline sample + in-memory backend. When the panel opens on a real
// Google Doc, ensureDoc() swaps in the live document and the Docs API backend.
let backend: EditBackend = new MockDocsBackend()
let liveLoaded = false
let liveDocId: string | null = null
// Whether the current analysis reflects the user's live doc or the bundled sample, plus a
// heads-up to show when we wanted the live doc but couldn't open it (so a failed sign-in /
// OAuth mismatch / Docs error is visible instead of silently analyzing the sample).
let docSource: 'live' | 'sample' = 'sample'
let loadNotice: string | null = null
// Set when the live page count fell back to the rough estimate (PDF export unavailable).
let pagesNotice: string | null = null

const state: State = {
  doc: SAMPLE_DOC,
  flags: [],
  dismissed: new Set(),
  settings: { ...DEFAULT_SETTINGS },
  pages: 1,
}

async function loadSettings() {
  const saved = await chrome.storage.local.get('settings')
  if (saved.settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...saved.settings }
    // AI on/off and the backend URL are build-time concerns (baked from VITE_BACKEND_URL),
    // not user toggles. Always take them from the current defaults so stale stored settings
    // (e.g. an old useAI:false or empty backendUrl) can't silently disable AI after an update.
    state.settings.useAI = DEFAULT_SETTINGS.useAI
    state.settings.backendUrl = DEFAULT_SETTINGS.backendUrl
  }
}

// One-shot: if the active tab is a Google Doc, load it via the Docs API (prompting for
// OAuth the first time). Any failure (not a doc, auth declined, network) leaves the
// offline sample in place so the product always works.
async function ensureDoc() {
  if (liveLoaded) return
  const docId = await getActiveGoogleDocId()
  if (!docId) {
    // Not on a Google Doc tab — the sample is the intended experience, no warning.
    docSource = 'sample'
    loadNotice = null
    return
  }
  try {
    state.doc = await fetchGoogleDoc(docId)
    backend = new GoogleDocsBackend(docId)
    liveLoaded = true
    liveDocId = docId
    docSource = 'live'
    loadNotice = null
  } catch (err) {
    // The tab IS a Google Doc but we couldn't open it (declined sign-in, an OAuth client
    // that doesn't match this extension's id, a Docs API error). Stay on the sample so the
    // product still works, but say so — otherwise "Apply" edits an in-memory sample and the
    // user's real document never changes, which looks like a broken feature.
    docSource = 'sample'
    loadNotice = `Couldn't open your Google Doc — showing a sample instead. Edits won't reach your document. (${(err as Error)?.message ?? err})`
    console.warn('[GreenPages] Docs API load failed, using sample doc:', err)
  }
}

async function reanalyze() {
  await reanalyzeFlags()
  await refreshPages()
}

// Re-detect flags only (no page export). Apply-all calls this between edits so it doesn't
// pay for a PDF page count on every step — it refreshes pages once when the run finishes.
async function reanalyzeFlags() {
  const flags = await analyze(state.doc, {
    useAI: state.settings.useAI,
    backendUrl: state.settings.backendUrl,
  })
  state.flags = flags.filter((f) => !state.dismissed.has(f.id))
}

// Exact page count from a live PDF export (matches what actually prints); falls back to the
// heuristic for the offline sample or if the export fails. Runs after every (re)analysis so
// the header and print modal reflect edits.
async function refreshPages() {
  if (liveLoaded && liveDocId) {
    try {
      state.pages = await fetchDocPageCount(liveDocId)
      pagesNotice = null
      return
    } catch (err) {
      // The heuristic is rough (it often undercounts), so don't let this fail silently —
      // tell the user the number is an estimate and why the exact PDF count didn't work.
      pagesNotice = `Page count is a rough estimate — couldn't get the exact count by exporting your doc to PDF. ${(err as Error)?.message ?? err}. Enable the Google Drive API for your OAuth project and grant Drive access.`
      console.warn('[GreenPages] PDF page count failed, using estimate:', err)
    }
  } else {
    pagesNotice = null
  }
  state.pages = estimatePages(state.doc).pages
}

function visibleFlags(): Flag[] {
  return state.flags.filter((f) => !state.dismissed.has(f.id))
}

function stateMessage(): Msg {
  return {
    type: 'STATE',
    doc: state.doc,
    flags: visibleFlags(),
    dismissed: [...state.dismissed],
    settings: state.settings,
    docSource,
    pages: state.pages,
    ...(loadNotice ? { notice: loadNotice } : {}),
    ...(pagesNotice ? { pagesNotice } : {}),
  }
}

// Toolbar icon opens the side panel on the active tab.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId != null) {
    await chrome.sidePanel.open({ windowId: tab.windowId })
  }
})

// Allow the side panel to be opened from the action button.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

onMessage(async (msg: Msg, sender) => {
  switch (msg.type) {
    case 'GET_STATE':
      if (state.flags.length === 0) {
        await loadSettings()
        await ensureDoc()
        await reanalyze()
      }
      return stateMessage()

    case 'REANALYZE':
      await ensureDoc()
      state.dismissed.clear()
      await reanalyze()
      return stateMessage()

    case 'APPLY_FLAG': {
      const flag = state.flags.find((f) => f.id === msg.flagId)
      if (flag) {
        const action =
          msg.overrideText && flag.action.kind === 'replaceText'
            ? { ...flag.action, text: msg.overrideText }
            : flag.action
        state.doc = await backend.apply(state.doc, action)
        state.dismissed.add(flag.id)
        await reanalyze()
      }
      return stateMessage()
    }

    case 'APPLY_ALL': {
      // Robust loop lives in applyAllFixes (testable, signature-based, no `dismissed`
      // pollution). It analyzes via the same backend path and applies via the live/mock
      // backend, re-reading between edits. Respect prior user dismissals but never add to them.
      const analyzeFn = (d: DocModel) =>
        analyze(d, { useAI: state.settings.useAI, backendUrl: state.settings.backendUrl }).then(
          (flags) => flags.filter((f) => !state.dismissed.has(f.id)),
        )
      const result = await applyAllFixes(state.doc, analyzeFn, (d, a) => backend.apply(d, a))
      state.doc = result.doc
      state.flags = result.flags
      await refreshPages()
      return stateMessage()
    }

    case 'DISMISS_FLAG':
      state.dismissed.add(msg.flagId)
      return stateMessage()

    case 'REVEAL_FLAG': {
      // Ask the content script in the active Google Doc tab to scroll to the flag. The
      // panel doesn't steal tab focus, so the active tab is still the user's document.
      const flag = state.flags.find((f) => f.id === msg.flagId)
      if (flag) {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
        if (tab?.id != null && /docs\.google\.com\/document\//.test(tab.url ?? '')) {
          const { fraction } = lineLocation(state.doc, flag.range.start)
          const text = flatten(state.doc).slice(flag.range.start, flag.range.end)
          chrome.tabs
            .sendMessage(tab.id, { type: 'SCROLL_TO_FLAG', text, fraction } satisfies Msg)
            .catch(() => {}) // tab navigated / no content script — ignore
        }
      }
      return { ok: true }
    }

    case 'UPDATE_SETTINGS':
      state.settings = { ...state.settings, ...msg.settings }
      await chrome.storage.local.set({ settings: state.settings })
      await reanalyze()
      return stateMessage()

    case 'OPEN_PANEL': {
      const windowId = sender.tab?.windowId
      if (windowId != null) await chrome.sidePanel.open({ windowId })
      return { ok: true }
    }

    case 'GET_PRINT_SUMMARY': {
      if (state.flags.length === 0) {
        await loadSettings()
        await ensureDoc()
        await reanalyze()
      }
      return {
        type: 'PRINT_SUMMARY',
        pages: state.pages,
        unresolved: visibleFlags().map((f) => ({ type: f.type, title: f.title })),
        settings: state.settings,
      } satisfies Msg
    }

    default:
      return undefined
  }
})
