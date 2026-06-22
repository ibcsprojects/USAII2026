import { create } from 'zustand'
import type { DocModel } from '../../lib/docModel'
import type { Flag } from '../../lib/analyzer/types'
import { sendMessage, type Msg, type Settings, DEFAULT_SETTINGS } from '../../lib/messaging'

/** How the flag list is ordered: by position in the doc, or by biggest page saving first. */
export type SortMode = 'document' | 'savings'

interface PanelState {
  doc: DocModel | null
  flags: Flag[]
  settings: Settings
  loading: boolean
  /** UI-only ordering of the flag list. Not sent to the worker. */
  sortMode: SortMode
  setSortMode: (mode: SortMode) => void
  /** Current page count from the worker — exact (live PDF export) or estimated. */
  pages: number
  /** Set when `pages` is the rough estimate because the exact PDF export failed. */
  pagesNotice: string | null
  /** Whether the panel is analyzing the live doc or the offline sample. */
  docSource: 'live' | 'sample' | null
  /** A heads-up from the worker (e.g. couldn't open the live doc), or null. */
  notice: string | null
  /** The last operation's error message, shown as a banner until the next action. */
  error: string | null
  /** Per-flag busy state so a card can show a spinner while applying. */
  busy: Record<string, boolean>
  init: () => Promise<void>
  reanalyze: () => Promise<void>
  apply: (flagId: string, overrideText?: string) => Promise<void>
  /** Apply every outstanding flag in one go. */
  applyAll: () => Promise<void>
  dismiss: (flagId: string) => Promise<void>
  reveal: (flagId: string) => Promise<void>
  updateSettings: (s: Partial<Settings>) => Promise<void>
}

function applyState(set: (p: Partial<PanelState>) => void, msg: Extract<Msg, { type: 'STATE' }>) {
  set({
    doc: msg.doc,
    flags: msg.flags,
    settings: msg.settings,
    pages: msg.pages ?? 0,
    pagesNotice: msg.pagesNotice ?? null,
    docSource: msg.docSource ?? null,
    notice: msg.notice ?? null,
    error: null,
    loading: false,
  })
}

/**
 * Apply a worker response. The worker answers either with fresh STATE or, when a handler
 * threw, an ERROR — surface that as a banner instead of letting `applyState` read `.doc`
 * off an error message and crash the panel.
 */
function handleResponse(set: (p: Partial<PanelState>) => void, msg: Msg) {
  if (msg.type === 'ERROR') set({ error: msg.message, loading: false })
  else if (msg.type === 'STATE') applyState(set, msg)
}

export const useStore = create<PanelState>((set, get) => ({
  doc: null,
  flags: [],
  settings: { ...DEFAULT_SETTINGS },
  loading: true,
  pages: 0,
  pagesNotice: null,
  docSource: null,
  notice: null,
  error: null,
  busy: {},
  sortMode: 'document',

  setSortMode: (mode) => set({ sortMode: mode }),

  init: async () => {
    set({ loading: true, error: null })
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'GET_STATE' }))
    } catch (err) {
      set({ error: errMessage(err), loading: false })
    }
  },

  reanalyze: async () => {
    set({ loading: true, error: null })
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'REANALYZE' }))
    } catch (err) {
      set({ error: errMessage(err), loading: false })
    }
  },

  apply: async (flagId, overrideText) => {
    set({ busy: { ...get().busy, [flagId]: true }, error: null })
    try {
      handleResponse(
        set,
        await sendMessage<Msg>({ type: 'APPLY_FLAG', flagId, overrideText }),
      )
    } catch (err) {
      // A rejected port (e.g. the worker died mid-edit) must still clear the spinner and
      // tell the user, not leave the card stuck on "Applying…".
      set({ error: errMessage(err) })
    } finally {
      const busy = { ...get().busy }
      delete busy[flagId]
      set({ busy })
    }
  },

  applyAll: async () => {
    // `loading` drives the panel's busy state while the worker applies every fix in turn.
    set({ loading: true, error: null })
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'APPLY_ALL' }))
    } catch (err) {
      set({ error: errMessage(err), loading: false })
    }
  },

  dismiss: async (flagId) => {
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'DISMISS_FLAG', flagId }))
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  // Fire-and-forget: tells the worker to scroll the live doc; no state change here.
  reveal: async (flagId) => {
    await sendMessage({ type: 'REVEAL_FLAG', flagId }).catch(() => {})
  },

  updateSettings: async (s) => {
    try {
      handleResponse(set, await sendMessage<Msg>({ type: 'UPDATE_SETTINGS', settings: s }))
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },
}))

function errMessage(err: unknown): string {
  return String((err as Error)?.message ?? err)
}
