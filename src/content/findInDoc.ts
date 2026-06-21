// Click-to-jump: scroll the live Google Doc to a flagged range and highlight it.
//
// We deliberately don't try to compute pixel coordinates ourselves (see
// docs/ARCHITECTURE.md — Docs paints to <canvas>, there's no per-word geometry to anchor
// to). Instead this drives mechanisms Google Docs itself already implements, layered from
// most to least precise. None of layers 1-2 have been verified against a live document in
// this environment (no browser automation access) — they're best-effort and degrade
// gracefully to layer 3, which always does *something* visible.

const FIND_INPUT_SELECTOR =
  '.docs-findbar input[type="text"], [aria-label="Find in document"] input, [aria-label="Find"] input'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Layer 1: the legacy but still-supported browser-native find. Works only if Docs
// maintains a real, selectable text layer in the DOM matching what's painted on canvas.
function tryWindowFind(text: string): boolean {
  try {
    const w = window as Window & { find?: (s: string) => boolean }
    return typeof w.find === 'function' && w.find(text)
  } catch {
    return false
  }
}

// Layer 2: drive Google Docs' own find bar. This searches via Docs' internal document
// model rather than DOM/canvas geometry, so — unlike inline underlines — it isn't subject
// to the canvas constraint. The risk is purely automation: Docs may ignore a synthetic
// (non-trusted) Ctrl+F, and its find-bar input's selector is undocumented/may drift.
async function tryDocsFindBar(text: string): Promise<boolean> {
  let input = document.querySelector<HTMLInputElement>(FIND_INPUT_SELECTOR)
  if (!input) {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    await wait(200)
    input = document.querySelector<HTMLInputElement>(FIND_INPUT_SELECTOR)
  }
  if (!input) return false

  input.focus()
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await wait(150)
  return true
}

// Layer 3: guaranteed fallback. We don't know the flag's pixel position, but the worker
// does know its character offset as a fraction of the whole document — scroll there.
function scrollProportional(fraction: number): void {
  const editor = document.querySelector<HTMLElement>('.kix-appview-editor')
  const scroller = editor ?? document.scrollingElement ?? document.documentElement
  scroller.scrollTo({ top: scroller.scrollHeight * Math.min(1, Math.max(0, fraction)), behavior: 'smooth' })
}

export async function performFind(text: string, fraction: number): Promise<boolean> {
  const needle = text.trim()
  if (!needle) return false
  if (tryWindowFind(needle)) return true
  if (await tryDocsFindBar(needle)) return true
  scrollProportional(fraction)
  return false
}
