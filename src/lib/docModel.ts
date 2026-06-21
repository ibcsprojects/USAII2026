// The in-extension document model. It mirrors the shape the Google Docs API returns
// (a document is paragraphs; a paragraph is styled text runs) so that the
// GoogleDocsBackend can map our edits to `batchUpdate` requests with minimal glue.
//
// Until the Docs API is wired (see docs/SETUP.md) the side panel analyzes SAMPLE_DOC,
// a deliberately wasteful document that trips all six detectors.

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** Background highlight colour (ink-heavy). null/undefined = none. */
  highlightColor?: string | null
  /** Font size in points. */
  fontSize: number
  /** Google Docs document index of this run's first character (read path). Enables
   *  translating our flat-text offsets back to Docs API indices for write-back. */
  docStart?: number
  // ---- inline image runs: text is '' (contributes no length to flat offsets) ----
  /** Docs API inlineObjectId — present only on image runs. */
  imageObjectId?: string
  imageWidthPt?: number
  imageHeightPt?: number
  // ---- computed by rebuildOffsets ----
  start?: number
  end?: number
}

export type ParagraphKind = 'normal' | 'bullet' | 'heading' | 'pageBreak'

export interface Paragraph {
  id: string
  kind: ParagraphKind
  runs: TextRun[]
  /** Google Docs structural extent [docStart, docEnd) including the trailing newline
   *  (read path). Used for paragraph-level edits like deleting blank lines. */
  docStart?: number
  docEnd?: number
  // ---- computed by rebuildOffsets ----
  start?: number
  end?: number
}

export interface DocModel {
  id: string
  title: string
  defaultFontSize: number
  /** Roughly how many text lines fill one printed page (used by pageEstimate). */
  linesPerPage: number
  paragraphs: Paragraph[]
}

/** Concatenated text of a paragraph's runs. */
export function paragraphText(p: Paragraph): string {
  return p.runs.map((r) => r.text).join('')
}

/** Whole-document flat text, paragraphs joined by newlines. */
export function flatten(doc: DocModel): string {
  return doc.paragraphs.map(paragraphText).join('\n')
}

/**
 * Recomputes [start,end) character offsets for every paragraph and run against the
 * flat document text. Call after any structural edit. Returns the same doc for chaining.
 */
export function rebuildOffsets(doc: DocModel): DocModel {
  let cursor = 0
  doc.paragraphs.forEach((p, i) => {
    p.start = cursor
    let runCursor = cursor
    for (const run of p.runs) {
      run.start = runCursor
      runCursor += run.text.length
      run.end = runCursor
    }
    p.end = runCursor
    cursor = runCursor
    if (i < doc.paragraphs.length - 1) cursor += 1 // the joining '\n'
  })
  return doc
}

/** Deep clone so edits never mutate shared state across the message boundary. */
export function cloneDoc(doc: DocModel): DocModel {
  return JSON.parse(JSON.stringify(doc)) as DocModel
}

let _pid = 0
const pid = () => `p${_pid++}`

// A run helper to keep the sample readable.
const run = (text: string, extra: Partial<TextRun> = {}): TextRun => ({
  text,
  fontSize: 11,
  ...extra,
})

/**
 * A wasteful sample doc. Each section is engineered to trigger one detector:
 *  - highlighted sentence (highlight)
 *  - oversized body paragraph at 18pt (fontSize)
 *  - three consecutive blank paragraphs (doubleSpacing)
 *  - a hard page break (pageBreak)
 *  - eight two-word bullets (bulletSprawl)
 *  - a bloated redundant paragraph (verbose)
 */
export const SAMPLE_DOC: DocModel = rebuildOffsets({
  id: 'sample-doc',
  title: 'Q3 Sustainability Report (sample)',
  defaultFontSize: 11,
  linesPerPage: 46,
  paragraphs: [
    { id: pid(), kind: 'heading', runs: [run('Q3 Sustainability Report', { fontSize: 20, bold: true })] },
    {
      id: pid(),
      kind: 'normal',
      runs: [
        run('Our key takeaway this quarter is that '),
        run('paper consumption rose by 12% across all departments', {
          highlightColor: '#fff176',
        }),
        run(' and we must act on it now.'),
      ],
    },
    {
      id: pid(),
      kind: 'normal',
      runs: [
        run(
          'This entire introductory section has been set in an unusually large eighteen point font, which pushes a great deal of content onto extra pages and wastes a noticeable amount of paper when this document is eventually printed for the quarterly review meeting.',
          { fontSize: 18 },
        ),
      ],
    },
    { id: pid(), kind: 'normal', runs: [run('')] },
    { id: pid(), kind: 'normal', runs: [run('   ')] },
    { id: pid(), kind: 'normal', runs: [run('')] },
    { id: pid(), kind: 'pageBreak', runs: [run('')] },
    { id: pid(), kind: 'heading', runs: [run('Departmental Paper Use', { fontSize: 16, bold: true })] },
    { id: pid(), kind: 'bullet', runs: [run('Sales: high')] },
    { id: pid(), kind: 'bullet', runs: [run('Legal: high')] },
    { id: pid(), kind: 'bullet', runs: [run('HR: medium')] },
    { id: pid(), kind: 'bullet', runs: [run('Eng: low')] },
    { id: pid(), kind: 'bullet', runs: [run('Ops: medium')] },
    { id: pid(), kind: 'bullet', runs: [run('Finance: high')] },
    { id: pid(), kind: 'bullet', runs: [run('Support: low')] },
    { id: pid(), kind: 'bullet', runs: [run('Design: low')] },
    {
      id: pid(),
      kind: 'normal',
      runs: [{ text: '', fontSize: 11, imageObjectId: 'sample-img-1', imageWidthPt: 600, imageHeightPt: 360 }],
    },
    {
      id: pid(),
      kind: 'normal',
      runs: [
        run(
          'Due to the fact that the printer on the third floor is in very close proximity to the marketing team, and in light of the fact that a large number of documents are being printed on a daily basis on a regular basis, it is absolutely essential and critically important that we should endeavour to make an effort to reduce and cut down on unnecessary and superfluous printing wherever and whenever it is at all possible to do so.',
        ),
      ],
    },
  ],
})
