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
  init: () => Promise<void>
  reanalyze: () => Promise<void>
  apply: (flagId: string, overrideText?: string) => Promise<void>
  dismiss: (flagId: string) => Promise<void>
  updateSettings: (s: Partial<Settings>) => Promise<void>
  jumpTo: (flagId: string) => Promise<void>
}

function applyState(set: (p: Partial<PanelState>) => void, msg: Extract<Msg, { type: 'STATE' }>) {
  set({ doc: msg.doc, flags: msg.flags, settings: msg.settings, loading: false })
}

export const useStore = create<PanelState>((set, get) => ({
  doc: null,
  flags: [],
  settings: { ...DEFAULT_SETTINGS },
  loading: true,
  busy: {},

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
    set({ busy: { ...get().busy, [flagId]: true } })
    const msg = await sendMessage<Extract<Msg, { type: 'STATE' }>>({
      type: 'APPLY_FLAG',
      flagId,
      overrideText,
    })
    const busy = { ...get().busy }
    delete busy[flagId]
    applyState(set, msg)
    set({ busy })
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
