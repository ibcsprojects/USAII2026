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

export function setCors(res: { setHeader: (k: string, v: string) => void }): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
