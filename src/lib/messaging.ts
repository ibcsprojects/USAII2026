// Typed message protocol shared by the side panel, content script, and service worker.
// All payloads are plain JSON (DocModel, Flag, etc. are already serializable).

import type { DocModel } from './docModel'
import type { Flag } from './analyzer/types'

export type Settings = {
  duplexReminder: boolean
  /**
   * Use the Gemini backend to read paragraphs and rewrite wordy ones.
   * On by default — the backend URL is baked in at build time (VITE_BACKEND_URL),
   * so AI just works without the user touching settings.
   */
  useAI: boolean
  backendUrl: string
}

export const DEFAULT_SETTINGS: Settings = {
  duplexReminder: true,
  useAI: true,
  backendUrl: import.meta.env.VITE_BACKEND_URL ?? '',
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
      /** Whether we're analyzing the user's live Google Doc or the offline sample. */
      docSource?: 'live' | 'sample'
      /** Current page count — exact from a live PDF export, else the heuristic estimate. */
      pages?: number
      /** A user-facing heads-up, e.g. "couldn't open your doc, showing a sample". */
      notice?: string
      /** Set when `pages` is the rough estimate because the exact PDF export failed. */
      pagesNotice?: string
    }
  /** A handler threw — surfaced to the panel instead of vanishing into a dead port. */
  | { type: 'ERROR'; message: string }
  | { type: 'REANALYZE' }
  | { type: 'APPLY_FLAG'; flagId: string; overrideText?: string }
  | { type: 'APPLY_ALL' }
  | { type: 'DISMISS_FLAG'; flagId: string }
  | { type: 'REVEAL_FLAG'; flagId: string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  // content script ⇄ worker
  | { type: 'OPEN_PANEL' }
  // worker → content script: reveal a flagged span in the live Google Doc.
  // `fraction` (0..1 share of the doc's lines) drives a guaranteed proportional scroll;
  // `text` is the flagged text used to drive Docs' native Find for an exact jump+highlight.
  | { type: 'SCROLL_TO_FLAG'; text: string; fraction: number }
  | { type: 'GET_PRINT_SUMMARY' }
  | {
      type: 'PRINT_SUMMARY'
      pages: number
      unresolved: { type: string; title: string }[]
      settings: Settings
    }
  | { type: 'PRINT_INTERCEPT' } // content → worker: user hit Ctrl+P

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
    const result = handler(msg as Msg, sender)
    if (result instanceof Promise) {
      // A rejected handler must still answer the port, or the panel's `await sendMessage`
      // hangs/rejects with "message port closed" and the failure is invisible. Convert any
      // throw into an ERROR response the panel can show.
      result.then(
        (r) => sendResponse(r),
        (err) =>
          sendResponse({
            type: 'ERROR',
            message: String((err as Error)?.message ?? err),
          } satisfies Msg),
      )
      return true // keep the channel open for the async response
    }
    return false
  })
}
