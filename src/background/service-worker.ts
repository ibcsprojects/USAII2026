// The single source of truth. Holds the active DocModel, the current flags, dismissed
// ids, and settings; serves them to the side panel and the content script. Applying a
// fix runs through the EditBackend and re-analyzes so flags stay consistent.

import { SAMPLE_DOC, flatten, type DocModel } from '../lib/docModel'
import type { Flag } from '../lib/analyzer/types'
import { analyze } from '../lib/analyzer/client'
import { MockDocsBackend, GoogleDocsBackend, type EditBackend } from '../lib/docBackend'
import { getActiveGoogleDocId, getActiveDocsTabId, fetchGoogleDoc } from '../lib/googleDocs'
import { estimatePages } from '../lib/pageEstimate'
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
  /** True until a real Google Doc has been loaded — the panel must say so visibly
   *  instead of silently presenting the demo doc as if it were the user's own. */
  usingSampleDoc: boolean
  connectionError: string | null
}

// Defaults to the offline sample + in-memory backend. When the panel opens on a real
// Google Doc, ensureDoc() swaps in the live document and the Docs API backend.
let backend: EditBackend = new MockDocsBackend()
let liveLoaded = false

const state: State = {
  doc: SAMPLE_DOC,
  flags: [],
  dismissed: new Set(),
  settings: { ...DEFAULT_SETTINGS },
  usingSampleDoc: true,
  connectionError: null,
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
// offline sample in place so the product always works — but state.connectionError records
// *why*, so the panel can say so instead of silently passing the sample off as real.
async function ensureDoc() {
  if (liveLoaded) return
  const docId = await getActiveGoogleDocId()
  if (!docId) {
    state.connectionError = 'This tab is not a Google Doc.'
    return
  }
  try {
    state.doc = await fetchGoogleDoc(docId)
    backend = new GoogleDocsBackend(docId)
    liveLoaded = true
    state.usingSampleDoc = false
    state.connectionError = null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    state.connectionError = message
    console.warn('[GreenPages] Docs API load failed, using sample doc:', err)
  }
}

// Re-pulls the live document so a content-script-triggered live re-analysis sees the
// user's latest edits. No-op on the offline sample (nothing external can change it).
async function refreshLiveDoc() {
  if (!liveLoaded) return
  try {
    const docId = await getActiveGoogleDocId()
    if (docId) {
      state.doc = await fetchGoogleDoc(docId)
      state.connectionError = null
    }
  } catch (err) {
    state.connectionError = err instanceof Error ? err.message : String(err)
    console.warn('[GreenPages] live doc refresh failed:', err)
  }
}

async function reanalyze() {
  const flags = await analyze(state.doc, {
    useAI: state.settings.useAI,
    backendUrl: state.settings.backendUrl,
  })
  state.flags = flags.filter((f) => !state.dismissed.has(f.id))
}

function visibleFlags(): Flag[] {
  return state.flags.filter(
    (f) => !state.dismissed.has(f.id) && !state.settings.mutedTypes.includes(f.type),
  )
}

function stateMessage(): Msg {
  return {
    type: 'STATE',
    doc: state.doc,
    flags: visibleFlags(),
    dismissed: [...state.dismissed],
    settings: state.settings,
    usingSampleDoc: state.usingSampleDoc,
    connectionError: state.connectionError,
  }
}

/** Push fresh state to any open side panel — needed when a change originates outside
 *  the panel's own request/response (e.g. the content script's live re-analysis). */
function broadcastState() {
  chrome.runtime.sendMessage(stateMessage()).catch(() => {})
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
      // Retry the live connection on every call until it actually succeeds once — not
      // just when flags.length === 0, which becomes permanently false after the very
      // first pass (even the offline sample analyzes to 6 flags), silently freezing the
      // panel on the sample doc forever if the first connection attempt ever failed.
      if (!liveLoaded) {
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

    // Content script's MutationObserver, debounced. Unlike REANALYZE (the explicit
    // "Re-scan" button) this must NOT clear dismissed flags — otherwise every pause in
    // typing would resurface issues the user already dealt with elsewhere in the doc.
    case 'LIVE_REANALYZE':
      await refreshLiveDoc()
      await reanalyze()
      broadcastState()
      return { ok: true }

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

    case 'DISMISS_FLAG':
      state.dismissed.add(msg.flagId)
      return stateMessage()

    case 'UPDATE_SETTINGS':
      state.settings = { ...state.settings, ...msg.settings }
      await chrome.storage.local.set({ settings: state.settings })
      await reanalyze()
      return stateMessage()

    case 'JUMP_TO_FLAG': {
      const flag = state.flags.find((f) => f.id === msg.flagId)
      if (flag) {
        const tabId = await getActiveDocsTabId()
        const text = flatten(state.doc).slice(flag.range.start, flag.range.end)
        const docLen = flatten(state.doc).length
        const fraction = docLen > 0 ? flag.range.start / docLen : 0
        if (tabId != null && text.trim()) {
          chrome.tabs.sendMessage(tabId, { type: 'PERFORM_FIND', text, fraction }).catch(() => {})
        }
      }
      return { ok: !!flag }
    }

    case 'OPEN_PANEL': {
      const windowId = sender.tab?.windowId
      if (windowId != null) await chrome.sidePanel.open({ windowId })
      return { ok: true }
    }

    case 'GET_PRINT_SUMMARY': {
      if (!liveLoaded) {
        await loadSettings()
        await ensureDoc()
        await reanalyze()
      }
      const { pages } = estimatePages(state.doc)
      return {
        type: 'PRINT_SUMMARY',
        pages,
        unresolved: visibleFlags().map((f) => ({ type: f.type, title: f.title })),
        settings: state.settings,
      } satisfies Msg
    }

    default:
      return undefined
  }
})
