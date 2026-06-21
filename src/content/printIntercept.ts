// Layer 2 — Print Intercept. Catches Ctrl/Cmd+P (and the browser's beforeprint event)
// inside a Google Doc, then shows the eco-check modal before any print dialog opens.

import { sendMessage, ExtensionContextInvalidatedError } from '../lib/messaging'
import { showPrintModal, type PrintSummary } from './PrintModal'

let modalOpen = false

async function intercept(): Promise<void> {
  if (modalOpen) return
  modalOpen = true
  try {
    const summary = await sendMessage<PrintSummary>({ type: 'GET_PRINT_SUMMARY' })
    const result = await showPrintModal(summary)
    if (result === 'print') {
      // User insists — hand off to the real print dialog.
      window.print()
    } else if (result === 'review') {
      await sendMessage({ type: 'OPEN_PANEL' })
    }
    // 'cancel' simply returns to editing.
  } catch (err) {
    if (err instanceof ExtensionContextInvalidatedError) {
      // Extension was reloaded out from under us; don't block the user's print.
      console.warn('[GreenPages] reload the page to re-enable the print check')
      window.print()
    } else {
      console.error('[GreenPages] print intercept failed', err)
    }
  } finally {
    modalOpen = false
  }
}

export function installPrintIntercept(): void {
  // Capture the keyboard shortcut before Docs' own Ctrl/Cmd+P handler does — Docs calls
  // window.print() itself to show its print preview, and that handler doesn't check
  // defaultPrevented, so stopPropagation() alone isn't enough if it's bound to the same
  // node; stopImmediatePropagation() is what actually keeps Docs' handler from also firing.
  document.addEventListener(
    'keydown',
    (e) => {
      const isPrint = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'p' || e.key === 'P')
      if (isPrint) {
        e.preventDefault()
        e.stopImmediatePropagation()
        void intercept()
      }
    },
    true,
  )

  // Fallback: if a print is triggered another way, still surface the modal.
  window.addEventListener('beforeprint', () => {
    void intercept()
  })
}
