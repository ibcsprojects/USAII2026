// Typed message protocol shared by the side panel, content script, and service worker.
// All payloads are plain JSON (DocModel, Flag, etc. are already serializable).

import type { DocModel } from './docModel'
import type { Flag, FlagType } from './analyzer/types'

export type Settings = {
  duplexReminder: boolean
  /**
   * Use the Gemini backend to read paragraphs and rewrite wordy ones.
   * On by default — the backend URL is baked in at build time (VITE_BACKEND_URL),
   * so AI just works without the user touching settings.
   */
  useAI: boolean
  backendUrl: string
  /** Flag types the user has muted; they're filtered out of every analysis pass. */
  mutedTypes: FlagType[]
}

export const DEFAULT_SETTINGS: Settings = {
  duplexReminder: true,
  useAI: true,
  backendUrl: import.meta.env.VITE_BACKEND_URL ?? '',
  mutedTypes: [],
}

export type Msg =
  // side panel ⇄ worker
  | { type: 'GET_STATE' }
  | {
      type: 'STATE'
      doc: DocModel
      flags: Flag[]
      dismissed: string[]
      settings: Settings
      usingSampleDoc: boolean
      connectionError: string | null
    }
  | { type: 'REANALYZE' }
  | { type: 'APPLY_FLAG'; flagId: string; overrideText?: string }
  | { type: 'DISMISS_FLAG'; flagId: string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'JUMP_TO_FLAG'; flagId: string } // panel → worker: "show this in the doc"
  // content script ⇄ worker
  | { type: 'LIVE_REANALYZE' } // content's debounced MutationObserver poke
  | { type: 'OPEN_PANEL' }
  | { type: 'GET_PRINT_SUMMARY' }
  | {
      type: 'PRINT_SUMMARY'
      pages: number
      unresolved: { type: string; title: string }[]
      settings: Settings
    }
  | { type: 'PRINT_INTERCEPT' } // content → worker: user hit Ctrl+P
  // worker → content script (via chrome.tabs.sendMessage, not chrome.runtime.sendMessage)
  | { type: 'PERFORM_FIND'; text: string; fraction: number }

/** Thrown when the content script outlives the extension (reload/update/disable). */
export class ExtensionContextInvalidatedError extends Error {
  constructor() {
    super('Extension context invalidated — reload the page to reconnect GreenPages.')
    this.name = 'ExtensionContextInvalidatedError'
  }
}

/**
 * True while the content script is still connected to a live extension runtime.
 * `chrome.runtime.id` becomes undefined once the context is invalidated.
 */
export function isExtensionContextValid(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id
}

export function sendMessage<T = unknown>(msg: Msg): Promise<T> {
  // After an extension reload, an orphaned content script still runs in the page
  // but chrome.runtime is dead. Calling sendMessage then throws synchronously, so
  // we convert that into a normal rejected promise callers can catch.
  if (!isExtensionContextValid()) {
    return Promise.reject(new ExtensionContextInvalidatedError())
  }
  try {
    return chrome.runtime.sendMessage(msg) as Promise<T>
  } catch (err) {
    return Promise.reject(
      /context invalidated/i.test(String((err as Error)?.message))
        ? new ExtensionContextInvalidatedError()
        : (err as Error),
    )
  }
}

export function onMessage(
  handler: (msg: Msg, sender: chrome.runtime.MessageSender) => void | Promise<unknown>,
) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // sendResponse must always be called exactly once, or the caller's sendMessage()
    // promise hangs forever — it has no built-in timeout. A handler that throws (e.g. a
    // failed Docs API write) used to do exactly that, freezing the side panel's "Applying…"
    // state with no error ever surfacing.
    const toErrorResponse = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })
    let result: void | Promise<unknown>
    try {
      result = handler(msg as Msg, sender)
    } catch (err) {
      sendResponse(toErrorResponse(err))
      return false
    }
    if (result instanceof Promise) {
      result.then((r) => sendResponse(r)).catch((err) => sendResponse(toErrorResponse(err)))
      return true // keep the channel open for the async response
    }
    return false
  })
}
