import { create } from 'zustand'
import type { DocModel } from '../../lib/docModel'
import type { Flag } from '../../lib/analyzer/types'
import { sendMessage, type Msg, type Settings, DEFAULT_SETTINGS } from '../../lib/messaging'

interface PanelState {
  doc: DocModel | null
  flags: Flag[]
  settings: Settings
  loading: boolean
  /** Per-flag busy state so a card can show a spinner while applying. */
  busy: Record<string, boolean>
  /** Per-flag error message when Apply fails, so the card shows why instead of
   *  spinning forever or the panel silently corrupting its own state. */
  applyErrors: Record<string, string>
  usingSampleDoc: boolean
  connectionError: string | null
  init: () => Promise<void>
  reanalyze: () => Promise<void>
  apply: (flagId: string, overrideText?: string) => Promise<void>
  dismiss: (flagId: string) => Promise<void>
  updateSettings: (s: Partial<Settings>) => Promise<void>
  jumpTo: (flagId: string) => Promise<void>
}

function isErrorResponse(msg: unknown): msg is { error: string } {
  return !!msg && typeof msg === 'object' && 'error' in msg
}

function applyState(set: (p: Partial<PanelState>) => void, msg: Extract<Msg, { type: 'STATE' }>) {
  set({
    doc: msg.doc,
    flags: msg.flags,
    settings: msg.settings,
    loading: false,
    usingSampleDoc: msg.usingSampleDoc,
    connectionError: msg.connectionError,
  })
}

export const useStore = create<PanelState>((set, get) => ({
  doc: null,
  flags: [],
  settings: { ...DEFAULT_SETTINGS },
  loading: true,
  busy: {},
  applyErrors: {},
  usingSampleDoc: true,
  connectionError: null,

  init: async () => {
    set({ loading: true })
    const msg = await sendMessage<Extract<Msg, { type: 'STATE' }>>({ type: 'GET_STATE' })
    applyState(set, msg)
    // Passive updates pushed by the worker — e.g. a live re-analysis triggered by the
    // content script's MutationObserver, which has no direct response channel back here.
    chrome.runtime.onMessage.addListener((m: Msg) => {
      if (m.type === 'STATE') applyState(set, m)
    })
  },

  reanalyze: async () => {
    set({ loading: true })
    const msg = await sendMessage<Extract<Msg, { type: 'STATE' }>>({ type: 'REANALYZE' })
    applyState(set, msg)
  },

  apply: async (flagId, overrideText) => {
    const errors = { ...get().applyErrors }
    delete errors[flagId]
    set({ busy: { ...get().busy, [flagId]: true }, applyErrors: errors })
    try {
      const msg = await sendMessage<Extract<Msg, { type: 'STATE' }> | { error: string }>({
        type: 'APPLY_FLAG',
        flagId,
        overrideText,
      })
      if (isErrorResponse(msg)) {
        set({ applyErrors: { ...get().applyErrors, [flagId]: msg.error } })
      } else {
        applyState(set, msg)
      }
    } catch (err) {
      set({
        applyErrors: {
          ...get().applyErrors,
          [flagId]: err instanceof Error ? err.message : String(err),
        },
      })
    } finally {
      const busy = { ...get().busy }
      delete busy[flagId]
      set({ busy })
    }
  },

  dismiss: async (flagId) => {
    const msg = await sendMessage<Extract<Msg, { type: 'STATE' }>>({
      type: 'DISMISS_FLAG',
      flagId,
    })
    applyState(set, msg)
  },

  updateSettings: async (s) => {
    const msg = await sendMessage<Extract<Msg, { type: 'STATE' }>>({
      type: 'UPDATE_SETTINGS',
      settings: s,
    })
    applyState(set, msg)
  },

  jumpTo: async (flagId) => {
    await sendMessage({ type: 'JUMP_TO_FLAG', flagId }).catch(() => {})
  },
}))
