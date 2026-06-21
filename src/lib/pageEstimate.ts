// Estimates how many printed pages a DocModel will produce. Used by the print-intercept
// modal and the side panel header. Deliberately simple and transparent — font size and
// blank lines both inflate the count, which is exactly what the flags target.

import type { DocModel } from './docModel'
import { paragraphText } from './docModel'

const CHARS_PER_LINE_AT_11PT = 90

export interface PageEstimate {
  pages: number
  lines: number
}

export function estimatePages(doc: DocModel): PageEstimate {
  let lines = 0
  for (const p of doc.paragraphs) {
    if (p.kind === 'pageBreak') {
      // a page break rounds up to the next full page
      lines = Math.ceil(lines / doc.linesPerPage) * doc.linesPerPage
      continue
    }
    const text = paragraphText(p)
    if (text.trim().length === 0) {
      lines += 1
      continue
    }
    // larger fonts fit fewer chars per line and take more vertical room
    const fontSize = Math.max(...p.runs.map((r) => r.fontSize), doc.defaultFontSize)
    const scale = fontSize / doc.defaultFontSize
    const charsPerLine = CHARS_PER_LINE_AT_11PT / scale
    const wrapped = Math.max(1, Math.ceil(text.length / charsPerLine))
    lines += wrapped * scale
  }
  return { pages: Math.max(1, Math.ceil(lines / doc.linesPerPage)), lines: Math.round(lines) }
}
