import { describe, it, expect } from 'vitest'
import { mapApiDoc, type ApiDoc } from './googleDocs'
import { analyzeDoc } from './analyzer/rules'

// A doc shaped like the bug report: a table, the mandatory empty paragraph after it, a real
// "Insert → Horizontal line" (horizontalRule element), then a heading.
const apiDoc = (): ApiDoc => ({
  body: {
    content: [
      { startIndex: 1, table: { tableRows: [] } },
      { startIndex: 40, paragraph: { elements: [{ textRun: { content: '\n' } }] } }, // mandatory blank
      { startIndex: 41, paragraph: { elements: [{ horizontalRule: {} }, { textRun: { content: '\n' } }] } },
      {
        startIndex: 42,
        paragraph: {
          paragraphStyle: { namedStyleType: 'HEADING_1' },
          elements: [{ textRun: { content: 'Section IV\n' } }],
        },
      },
    ],
  },
})

describe('mapApiDoc: horizontal rule is not a blank line', () => {
  it('marks a horizontalRule paragraph as a rule', () => {
    const doc = mapApiDoc('d', apiDoc())
    const rule = doc.paragraphs.find((p) => p.isRule)
    expect(rule).toBeDefined()
  })

  it('does not flag the table + blank + horizontal line as a blank run', () => {
    const doc = mapApiDoc('d', apiDoc())
    // table (not blank), one mandatory blank (isolated), horizontal rule (not blank) — so the
    // lone blank can't form a 2-in-a-row run.
    expect(analyzeDoc(doc).some((f) => f.type === 'doubleSpacing')).toBe(false)
  })
})
