// The shared flag card — used both in the summary list (Mode 3) and, conceptually, as
// the anchored card a user would see on clicking a flag (Mode 2). One component, two homes.
//
// When several flags point at the same snippet (e.g. oversized font that is also
// highlighted, or a wordy paragraph that is also too large) they are rendered together by
// FlagGroupCard so the user sees one card per place in the document.

import { useState } from 'react'
import type { Flag, Severity } from '../../lib/analyzer/types'
import { useStore } from '../state/store'
import { FLAG_META, SEVERITY_DOT } from './flagMeta'

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 }

/** The category chip (icon + label) shown for each issue. */
function FlagChip({ flag }: { flag: Flag }) {
  const meta = FLAG_META[flag.type]
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${meta.accent}`}>
      {meta.label}
    </span>
  )
}

/** A small chevron that rotates to point down when its card is open. */
function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-bark-700/40 transition-transform ${expanded ? 'rotate-180' : ''}`}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Short "~N saved / ink↓" summary for one flag's impact. */
function impactLabel(flag: Flag): string {
  const paper = flag.impact.paper
  const ink = flag.impact.ink
  const parts: string[] = []
  if (paper > 0.001) parts.push(`${formatPages(paper)} saved`)
  if (ink > 0.001) parts.push('ink↓')
  return parts.join(' · ')
}

/**
 * The interactive body of a single issue: explanation, before→after preview and the
 * apply / dismiss / edit controls. Reused by both the single and grouped cards. The
 * heading is optional — single cards already show the title in their collapsed header,
 * while grouped sub-cards pass `showTitle` to label each stacked issue.
 */
function FlagIssueBody({ flag, showTitle = false }: { flag: Flag; showTitle?: boolean }) {
  const apply = useStore((s) => s.apply)
  const dismiss = useStore((s) => s.dismiss)
  const reveal = useStore((s) => s.reveal)
  const busy = useStore((s) => s.busy[flag.id])

  // Verbose flags expose an editable AI suggestion before applying.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(flag.editableSuggestion ?? '')

  return (
    <>
      {showTitle && <h3 className="text-sm font-semibold text-bark-900">{flag.title}</h3>}

      <div className="mt-2 space-y-1 rounded-lg bg-leaf-50 p-2 text-xs">
        <div className="flex gap-1.5">
          <span className="shrink-0 font-medium text-rose-600">Now</span>
          <span className="text-bark-700/80 line-through decoration-rose-300">{flag.before}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="shrink-0 font-medium text-leaf-700">Eco</span>
          {editing ? (
            <textarea
              className="w-full rounded border border-leaf-200 p-1 text-xs"
              rows={4}
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <span className="text-bark-900">{flag.after}</span>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => apply(flag.id, editing ? draft : undefined)}
          disabled={busy}
          className="rounded-lg bg-leaf-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-leaf-700 disabled:opacity-50"
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
        <button
          onClick={() => dismiss(flag.id)}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-bark-700/70 transition hover:bg-leaf-100"
        >
          Dismiss
        </button>
        {flag.editableSuggestion !== undefined && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="ml-auto rounded-lg px-2 py-1.5 text-xs font-medium text-leaf-700 transition hover:bg-leaf-100"
          >
            {editing ? 'Done editing' : 'Edit suggestion'}
          </button>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          reveal(flag.id)
        }}
        className="mt-2 flex items-center gap-1 text-[11px] font-medium text-bark-700/55 transition hover:text-leaf-700"
      >
        <span aria-hidden>↧</span> Show in document
      </button>
    </>
  )
}

/** A single flag on its own snippet — compact by default, expands on click. */
export function FlagCard({
  flag,
  expanded,
  onToggle,
}: {
  flag: Flag
  expanded: boolean
  onToggle: (open: boolean) => void
}) {
  const reveal = useStore((s) => s.reveal)
  const impact = impactLabel(flag)

  // Opening a card also scrolls the live document to its paragraph, so the user sees
  // the flagged spot in context the moment they expand it.
  const toggle = () => {
    const next = !expanded
    onToggle(next)
    if (next) reveal(flag.id)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-leaf-100 bg-white shadow-sm transition hover:border-leaf-300 hover:shadow-md">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[flag.severity]}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-bark-900">
          {flag.title}
        </span>
        {!expanded && impact && (
          <span className="shrink-0 text-[11px] text-bark-700/60">{impact}</span>
        )}
        <Chevron expanded={expanded} />
      </button>

      {expanded && (
        <div className="border-t border-leaf-100 px-3 pb-3 pt-2.5">
          <div className="mb-1.5 flex items-center gap-2">
            <FlagChip flag={flag} />
            {impact && <span className="ml-auto text-[11px] text-bark-700/60">{impact}</span>}
          </div>
          <FlagIssueBody flag={flag} />
        </div>
      )}
    </div>
  )
}

/** Several flags that share one snippet, stacked under a single card. Compact by default. */
export function FlagGroupCard({
  flags,
  expanded,
  onToggle,
}: {
  flags: Flag[]
  expanded: boolean
  onToggle: (open: boolean) => void
}) {
  const reveal = useStore((s) => s.reveal)

  const topSeverity = flags.reduce<Severity>(
    (acc, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc] ? f.severity : acc),
    'low',
  )
  const paper = flags.reduce((s, f) => s + f.impact.paper, 0)
  const ink = flags.reduce((s, f) => s + f.impact.ink, 0)
  const totalParts: string[] = []
  if (paper > 0.001) totalParts.push(`${formatPages(paper)} saved`)
  if (ink > 0.001) totalParts.push('ink↓')

  const toggle = () => {
    const next = !expanded
    onToggle(next)
    if (next) reveal(flags[0].id)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-leaf-100 bg-white shadow-sm transition hover:border-leaf-300 hover:shadow-md">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[topSeverity]}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-bark-900">
          {flags.length} issues on this snippet
        </span>
        {!expanded && totalParts.length > 0 && (
          <span className="shrink-0 text-[11px] text-bark-700/60">{totalParts.join(' · ')}</span>
        )}
        <Chevron expanded={expanded} />
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-leaf-100 p-3">
          {flags.map((flag) => (
            <div key={flag.id} className="rounded-lg border border-leaf-100 bg-leaf-50/40 p-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <FlagChip flag={flag} />
                {impactLabel(flag) && (
                  <span className="ml-auto text-[11px] text-bark-700/60">{impactLabel(flag)}</span>
                )}
              </div>
              <FlagIssueBody flag={flag} showTitle />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatPages(p: number): string {
  if (p >= 1) return `${p.toFixed(1)} pages`
  return `${Math.round(p * 100)}% page`
}
