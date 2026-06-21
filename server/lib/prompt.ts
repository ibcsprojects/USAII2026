// Prompt builders + shared HTTP helpers for the serverless endpoints.

export function condensePrompt(text: string): string {
  return [
    'You are an editor reducing paper and ink use by tightening prose.',
    'Rewrite the following paragraph to be as short as possible while preserving all',
    'facts and meaning. Remove redundancy and padded phrases. Keep the same language.',
    'Return ONLY the rewritten paragraph, with no preamble or quotes.',
    '',
    'Paragraph:',
    text,
  ].join('\n')
}

/** Like condensePrompt, but asks for 3 distinctly-phrased options in one call instead of
 *  one (used for the FlagCard's alternatives picker) so it costs one Gemini call, not 3. */
export function condenseOptionsPrompt(text: string): string {
  return [
    'You are an editor reducing paper and ink use by tightening prose.',
    'Produce exactly 3 alternative rewrites of the paragraph below, each as short as',
    'possible while preserving all facts and meaning, removing redundancy and padded',
    'phrases. Keep the same language. Vary the phrasing across the 3 options — don\'t make',
    'only trivial wording tweaks between them.',
    'Return ONLY a JSON array of exactly 3 strings, nothing else — no prose, no markdown',
    'fences, no numbering.',
    '',
    'Paragraph:',
    text,
  ].join('\n')
}

export function setCors(res: { setHeader: (k: string, v: string) => void }): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
