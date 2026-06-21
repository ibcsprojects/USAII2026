// Estimates how many printed pages a DocModel will produce. Used by the print-intercept
// modal and the side panel header. Deliberately simple and transparent — font size and
// blank lines both inflate the count, which is exactly what the flags target.

import type { DocModel } from './docModel.js'
import { paragraphText } from './docModel.js'

const CHARS_PER_LINE_AT_11PT = 90

export interface PageEstimate {
  pages: number
  lines: number
}

/** Estimated lines a single paragraph occupies (mirrors the estimatePages rules). */
function paragraphLines(p: DocModel['paragraphs'][number], doc: DocModel): number {
  const text = paragraphText(p)
  if (text.trim().length === 0) return 1
  const fontSize = Math.max(...p.runs.map((r) => r.fontSize), doc.defaultFontSize)
  const scale = fontSize / doc.defaultFontSize
  const charsPerLine = CHARS_PER_LINE_AT_11PT / scale
  const wrapped = Math.max(1, Math.ceil(text.length / charsPerLine))
  return wrapped * scale
}

export function estimatePages(doc: DocModel): PageEstimate {
  let lines = 0
  for (const p of doc.paragraphs) {
    if (p.kind === 'pageBreak') {
      // a page break rounds up to the next full page
      lines = Math.ceil(lines / doc.linesPerPage) * doc.linesPerPage
      continue
    }
    lines += paragraphLines(p, doc)
  }
  return { pages: Math.max(1, Math.ceil(lines / doc.linesPerPage)), lines: Math.round(lines) }
}

/**
 * Where a character offset sits in the document, as line counts. `fraction` is its share
 * of total lines (0..1) — used to scroll the live Doc — and `page` is its 0-based page.
 * Approximate by design: Google Docs renders to canvas, so we can't get exact pixels.
 */
export function lineLocation(
  doc: DocModel,
  charOffset: number,
): { linesBefore: number; totalLines: number; fraction: number; page: number } {
  let lines = 0
  let linesBefore = 0
  let found = false
  for (const p of doc.paragraphs) {
    // The first paragraph whose end reaches the offset is the one that contains it; record
    // the lines accumulated before it as the scroll target.
    if (!found && p.end != null && charOffset <= p.end) {
      linesBefore = lines
      found = true
    }
    if (p.kind === 'pageBreak') {
      lines = Math.ceil(lines / doc.linesPerPage) * doc.linesPerPage
      continue
    }
    lines += paragraphLines(p, doc)
  }
  if (!found) linesBefore = lines // offset past the end → bottom of doc
  const totalLines = lines
  return {
    linesBefore,
    totalLines,
    fraction: totalLines > 0 ? linesBefore / totalLines : 0,
    page: Math.floor(linesBefore / doc.linesPerPage),
  }
}
