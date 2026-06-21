import { describe, it, expect } from 'vitest'
import { countPdfPages } from './googleDocs'

const bytes = (s: string) => new TextEncoder().encode(s).buffer

describe('countPdfPages', () => {
  it("reads the page-tree root's /Count", () => {
    // A trimmed PDF skeleton: one /Pages node with /Count 3 and three leaf /Page objects.
    const pdf =
      '%PDF-1.7\n' +
      '2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >> endobj\n' +
      '3 0 obj << /Type /Page /Parent 2 0 R >> endobj\n' +
      '4 0 obj << /Type /Page /Parent 2 0 R >> endobj\n' +
      '5 0 obj << /Type /Page /Parent 2 0 R >> endobj\n'
    expect(countPdfPages(bytes(pdf))).toBe(3)
  })

  it('reads /Count when it precedes /Type within the dictionary', () => {
    const pdf = '%PDF-1.7\n1 0 obj << /Count 12 /Type /Pages /Kids [] >> endobj\n'
    expect(countPdfPages(bytes(pdf))).toBe(12)
  })

  it('falls back to counting leaf /Page objects when no /Count is present', () => {
    const pdf =
      '%PDF-1.7\n' +
      '3 0 obj << /Type /Page /MediaBox [0 0 612 792] >> endobj\n' +
      '4 0 obj << /Type /Page /MediaBox [0 0 612 792] >> endobj\n'
    expect(countPdfPages(bytes(pdf))).toBe(2)
  })

  it('does not mistake the /Pages tree node for a leaf page in the fallback', () => {
    const pdf =
      '%PDF-1.7\n' +
      '2 0 obj << /Type /Pages /Kids [3 0 R] >> endobj\n' +
      '3 0 obj << /Type /Page >> endobj\n'
    // /Count absent → fallback; must count the single leaf, not the /Pages node.
    expect(countPdfPages(bytes(pdf))).toBe(1)
  })

  it('returns 0 for bytes with no page structure (caller then falls back to the estimate)', () => {
    expect(countPdfPages(bytes('%PDF-1.7\nnothing useful here\n'))).toBe(0)
  })
})
