// Deterministic, offline text shortener. Used by the `verbose` detector to propose an
// edit, and mirrored on the backend as the fallback when no Gemini key is configured.
// It only collapses well-known wordy phrases, so it is safe and predictable.

const PHRASES: Array<[RegExp, string]> = [
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin light of the fact that\b/gi, 'because'],
  [/\bin the event that\b/gi, 'if'],
  [/\bin order to\b/gi, 'to'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bwith regard to\b/gi, 'about'],
  [/\ba large number of\b/gi, 'many'],
  [/\ba great deal of\b/gi, 'much'],
  [/\bon a daily basis\b/gi, 'daily'],
  [/\bon a regular basis\b/gi, 'regularly'],
  [/\bin very close proximity to\b/gi, 'near'],
  [/\bin close proximity to\b/gi, 'near'],
  [/\bendeavou?r to make an effort to\b/gi, 'try to'],
  [/\bmake an effort to\b/gi, 'try to'],
  [/\babsolutely essential and critically important\b/gi, 'essential'],
  [/\bessential and critically important\b/gi, 'essential'],
  [/\breduce and cut down on\b/gi, 'reduce'],
  [/\bunnecessary and superfluous\b/gi, 'unnecessary'],
  [/\bwherever and whenever it is at all possible to do so\b/gi, 'whenever possible'],
  [/\bwhenever it is at all possible\b/gi, 'whenever possible'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bat the present time\b/gi, 'now'],
  [/\bit is important to note that\b/gi, ''],
  [/\bit should be noted that\b/gi, ''],
]

/** Collapse wordy phrases and tidy whitespace/leading capital. */
export function condenseLocally(input: string): string {
  let out = input
  for (const [re, rep] of PHRASES) out = out.replace(re, rep)
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim()
  if (out.length) out = out[0].toUpperCase() + out.slice(1)
  return out
}

/** Heuristic: is this paragraph wordy enough to be worth condensing? */
export function looksVerbose(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length < 25) return false
  const condensed = condenseLocally(text)
  // Worth flagging if our offline pass can already trim a meaningful chunk...
  if (condensed.length <= text.length * 0.9) return true
  // ...or if the paragraph is simply long and dense: the AI rewrite can tighten
  // these even when our fixed phrase list doesn't match anything.
  return words.length >= 35
}
