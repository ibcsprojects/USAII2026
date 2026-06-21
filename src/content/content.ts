// Content script injected into Google Docs. Two jobs:
//  1. Install the print intercept (Layer 2).
//  2. Float a small "GreenPages" pill that opens the side panel (Mode 3).
//
// NOTE: we deliberately do not try to draw inline underlines over the document. Google
// Docs renders text to <canvas>, so per-word screen coordinates aren't available to an
// extension — that's why analysis + fixes live in the side panel. See docs/ARCHITECTURE.md.

import { sendMessage, onMessage, ExtensionContextInvalidatedError } from '../lib/messaging'
import { installPrintIntercept } from './printIntercept'

installPrintIntercept()
mountPill()

// The side panel asks us to reveal a flagged span. Google Docs paints the body to <canvas>,
// so there's no DOM element for a paragraph to scrollIntoView, and the Docs REST API can't
// move the live cursor. The robust approach (the only thing that uses Docs' own canvas-aware
// text engine from a content script) is its native Find bar — real DOM, and it scrolls to
// AND highlights the exact text. We always do a proportional scroll first so *something*
// reliably happens, then drive Find to land precisely.
onMessage((msg) => {
  if (msg.type === 'SCROLL_TO_FLAG') void revealInDoc(msg.text, msg.fraction)
})

async function revealInDoc(text: string, fraction: number): Promise<void> {
  // Use the *full* snippet (whitespace-normalized) so Docs highlights the entire flagged
  // span, not just its first words. Fall back to a proportional scroll only if the (hidden)
  // find bar never opens. Find-first avoids a visible double-jump.
  const query = text.replace(/\s+/g, ' ').trim()
  const found = query.length >= 4 && (await findInDoc(query))
  if (!found) scrollProportionally(fraction)
}

/** Proportional scroll of the Kix editor — approximate, but always works. */
function scrollProportionally(fraction: number): void {
  const scroller =
    document.querySelector<HTMLElement>('.kix-appview-editor') ??
    (document.scrollingElement as HTMLElement | null)
  if (!scroller) return
  const max = scroller.scrollHeight - scroller.clientHeight
  scroller.scrollTo({ top: Math.max(0, max * fraction), behavior: 'smooth' })
}

/** Open Docs' native Find bar (kept visually hidden), type the query, and trigger the
 *  search so Docs scrolls to + highlights the match — without the user ever seeing the bar.
 *  Returns false if the find bar never appeared. */
async function findInDoc(query: string): Promise<boolean> {
  const css = injectFindBarHider() // layer 1: pre-hide by class to guard against any flash
  const hider = hideFindCardWhileSearching() // layer 2: class/locale-proof, before first paint
  dispatchFindShortcut()
  const input = await waitFor(getFindInput, 1500)
  if (!input) {
    css.remove()
    hider.stop()
    return false
  }
  input.focus()
  setNativeValue(input, query)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  // Enter runs the search; Docs scrolls to and highlights the first match.
  for (const type of ['keydown', 'keyup'] as const) {
    input.dispatchEvent(
      new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
    )
  }
  // Keep it hidden (the highlight stays) but restore the instant the user really interacts,
  // so a manual Ctrl/⌘+F still behaves normally.
  restoreOnUserInteraction(() => {
    css.remove()
    hider.stop()
  })
  return true
}

/** A stylesheet that hides Docs' find bar by class (class names aren't localized). Kept as a
 *  cheap first layer; the real work is done by hideFindCardWhileSearching. */
function injectFindBarHider(): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = `
    [class*="findbar"], [class*="find-bar"], .docs-findandreplacedialog {
      opacity: 0 !important; pointer-events: none !important;
    }`
  document.documentElement.appendChild(style)
  return style
}

/**
 * Hide Docs' floating Find card the moment it's inserted — *before* the browser paints it,
 * and without depending on its (changeable, sometimes-leaking) class names. We watch the DOM
 * for the find input appearing, then hide its outermost positioned ancestor: that container
 * is what Docs actually renders as the floating card. MutationObserver callbacks run before
 * paint, so the card never visibly flashes. Returns a `stop()` that restores what it hid.
 */
function hideFindCardWhileSearching(): { stop: () => void } {
  let hidden: HTMLElement | null = null
  let prevStyle: string | null = null
  const apply = () => {
    const input = getFindInput()
    if (!input) return
    const card = getFindCard(input)
    if (card !== hidden) {
      if (hidden) hidden.setAttribute('style', prevStyle ?? '') // input moved to a new card
      hidden = card
      prevStyle = card.getAttribute('style')
    }
    card.style.setProperty('opacity', '0', 'important')
    card.style.setProperty('pointer-events', 'none', 'important')
  }
  apply() // in case the bar is already open
  const obs = new MutationObserver(apply)
  obs.observe(document.documentElement, { childList: true, subtree: true })
  // The *first* time Docs builds the find bar it plays an entrance animation and writes its
  // own inline styles a few frames after creation — which would briefly override our hide and
  // flash the bar (later opens reuse the built bar, so no animation, no flash). Re-apply every
  // frame for a short window to ride that out. rAF runs before paint, so nothing shows.
  let stopped = false
  const until = performance.now() + 1200
  const pump = () => {
    if (stopped) return
    apply()
    if (performance.now() < until) requestAnimationFrame(pump)
  }
  requestAnimationFrame(pump)
  return {
    stop: () => {
      stopped = true
      obs.disconnect()
      if (hidden) hidden.setAttribute('style', prevStyle ?? '')
    },
  }
}

/** The visible floating card = outermost positioned ancestor of the find input. Locale- and
 *  class-proof: works regardless of Docs' current find-bar markup. */
function getFindCard(input: HTMLElement): HTMLElement {
  let cur: HTMLElement | null = input.parentElement
  let card: HTMLElement = input
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const pos = getComputedStyle(cur).position
    if (pos === 'fixed' || pos === 'absolute') card = cur
    cur = cur.parentElement
  }
  return card
}

/** Run `cleanup` the first time the user genuinely interacts (trusted event), with a safety
 *  timeout. Lets us keep the find result visible until the user does something themselves. */
function restoreOnUserInteraction(cleanup: () => void): void {
  const done = () => {
    cleanup()
    document.removeEventListener('keydown', onUser, true)
    document.removeEventListener('mousedown', onUser, true)
    clearTimeout(timer)
  }
  const onUser = (e: Event) => {
    if (e.isTrusted) done() // ignore our own synthetic events
  }
  document.addEventListener('keydown', onUser, true)
  document.addEventListener('mousedown', onUser, true)
  const timer = setTimeout(done, 10000) // safety net
}

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)

/** Send Ctrl/⌘+F to the page so Docs opens its quick find bar. */
function dispatchFindShortcut(): void {
  const opts: KeyboardEventInit = {
    key: 'f',
    code: 'KeyF',
    keyCode: 70,
    which: 70,
    ctrlKey: !isMac,
    metaKey: isMac,
    bubbles: true,
    cancelable: true,
  }
  for (const type of ['keydown', 'keyup'] as const) {
    document.dispatchEvent(new KeyboardEvent(type, opts))
    // Docs routes keystrokes through a hidden iframe; hit that too.
    const iframe = document.querySelector<HTMLIFrameElement>('.docs-texteventtarget-iframe')
    iframe?.contentDocument?.dispatchEvent(new KeyboardEvent(type, opts))
  }
}

/** The Find bar's text input. Prefer the just-focused input (locale-proof), then fall back
 *  to known class selectors. */
function getFindInput(): HTMLInputElement | null {
  const active = document.activeElement
  if (active instanceof HTMLInputElement && active.type !== 'hidden') return active
  return document.querySelector<HTMLInputElement>(
    '.docs-findbar-input, .docs-findandreplacedialog-input, input.jfk-textinput',
  )
}

/** Set an <input>'s value through the native setter so Closure/React UIs notice the change. */
function setNativeValue(el: HTMLInputElement, value: string): void {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  if (desc?.set) desc.set.call(el, value)
  else el.value = value
}

function waitFor<T>(fn: () => T | null, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const tick = () => {
      const v = fn()
      if (v) resolve(v)
      else if (Date.now() - start >= timeoutMs) resolve(null)
      else setTimeout(tick, 100)
    }
    tick()
  })
}

function mountPill(): void {
  if (document.getElementById('greenpages-pill')) return
  const host = document.createElement('div')
  host.id = 'greenpages-pill'
  document.documentElement.appendChild(host)
  const root = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = `
    .pill {
      position: fixed; right: 18px; bottom: 18px; z-index: 2147483646;
      display: flex; align-items: center; gap: 8px;
      background: #16a34a; color: #fff; border: 0; cursor: pointer;
      font-family: Inter, system-ui, sans-serif; font-weight: 600; font-size: 13px;
      padding: 10px 14px; border-radius: 999px;
      box-shadow: 0 8px 24px rgba(22,163,74,.35);
      transition: transform .12s ease, background .12s ease;
    }
    .pill:hover { transform: translateY(-1px); background: #15803d; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #bbf7d0; }
  `
  root.appendChild(style)

  const btn = document.createElement('button')
  btn.className = 'pill'
  btn.innerHTML = `<span class="dot"></span>🌿 GreenPages`
  btn.title = 'Open GreenPages eco-formatting panel'
  btn.addEventListener('click', () => {
    sendMessage({ type: 'OPEN_PANEL' }).catch((err) => {
      if (err instanceof ExtensionContextInvalidatedError) {
        btn.innerHTML = `<span class="dot"></span>↻ Reload page`
        btn.title = 'GreenPages was updated. Reload this tab to reconnect.'
      } else {
        console.error('[GreenPages] OPEN_PANEL failed', err)
      }
    })
  })
  root.appendChild(btn)
}
