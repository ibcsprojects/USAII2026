// Core types shared by the analyzer, the side panel, the content script, and the
// (optional) backend. Everything here is plain serializable data so it can cross the
// chrome.runtime message boundary unchanged.

/** A flag category. Drives the chip colour/icon and the kind of eco-saving. */
export type FlagType =
  | 'highlight' // wasteful background highlight → underline/italic
  | 'doubleSpacing' // blank lines / double line-spacing padding the page
  | 'fontSize' // oversized body font eating pages
  | 'pageBreak' // hard page break → a slim dashed rule
  | 'bulletSprawl' // many tiny bullets that a table would compress
  | 'verbose' // redundant text an AI can condense

export type Severity = 'low' | 'medium' | 'high'

/** Half-open character range [start, end) into DocModel.text. */
export interface Range {
  start: number
  end: number
}

/**
 * A serializable edit. The MockDocsBackend applies these to the in-memory DocModel;
 * the GoogleDocsBackend maps each to a Google Docs API `batchUpdate` request.
 */
export type EditAction =
  | { kind: 'removeHighlight'; range: Range; alt: 'underline' | 'italic' }
  | { kind: 'setFontSize'; range: Range; from: number; to: number }
  | { kind: 'removeBlankLines'; range: Range }
  | { kind: 'pageBreakToRule'; range: Range }
  | { kind: 'bulletsToTable'; range: Range; rows: string[] }
  | { kind: 'replaceText'; range: Range; text: string }

/** Estimated environmental saving from accepting one flag. */
export interface EcoImpact {
  /** Fractional sheets of paper saved (e.g. 0.15 of a page). */
  paper: number
  /** Relative ink units saved (highlight fills are ink-heavy). */
  ink: number
}

export interface Flag {
  id: string
  type: FlagType
  severity: Severity
  range: Range
  title: string
  explanation: string
  /** Short human "before → after" preview text for the card. */
  before: string
  after: string
  impact: EcoImpact
  action: EditAction
  /** For `verbose` flags: the editable suggestion the user can tweak before applying. */
  editableSuggestion?: string
  /** For `verbose` flags with AI on: 0-2 additional rewrite options besides `after`. */
  alternatives?: string[]
}
