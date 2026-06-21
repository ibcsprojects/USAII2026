// The shared flag card — used both in the summary list (Mode 3) and, conceptually, as
// the anchored card a user would see on clicking a flag (Mode 2). One component, two homes.

import { useState } from 'react'
import type { Flag } from '../../lib/analyzer/types'
import { useStore } from '../state/store'
import { FLAG_META, SEVERITY_DOT } from './flagMeta'

export function FlagCard({ flag }: { flag: Flag }) {
  const apply = useStore((s) => s.apply)
  const dismiss = useStore((s) => s.dismiss)
  const jumpTo = useStore((s) => s.jumpTo)
  const busy = useStore((s) => s.busy[flag.id])
  const applyError = useStore((s) => s.applyErrors[flag.id])
  const meta = FLAG_META[flag.type]

  // Verbose flags expose an editable AI suggestion, plus 0-2 alternative rewrites the
  // user can pick between before applying.
  const options =
    flag.editableSuggestion != null ? [flag.editableSuggestion, ...(flag.alternatives ?? [])] : []
  const [optionIndex, setOptionIndex] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(options[0] ?? '')

  const selectOption = (i: number) => {
    setOptionIndex(i)
    setDraft(options[i])
  }

  const paper = flag.impact.paper
  const ink = flag.impact.ink

  return (
    <div className="rounded-xl border border-leaf-100 bg-white p-3 shadow-sm transition hover:shadow-md">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[flag.severity]}`} aria-hidden />
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${meta.accent}`}>
          {meta.icon} {meta.label}
        </span>
        <button
          onClick={() => jumpTo(flag.id)}
          title="Show this in the document"
          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-leaf-700 transition hover:bg-leaf-100"
        >
          ↳ Show in doc
        </button>
        <span className="ml-auto text-[11px] text-bark-700/60">
          {paper > 0.001 && `~${formatPages(paper)} saved`}
          {ink > 0.001 && `${paper > 0.001 ? ' · ' : ''}ink↓`}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-bark-900">{flag.title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-bark-700/80">{flag.explanation}</p>

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
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <span className="text-bark-900">{options[optionIndex] ?? flag.after}</span>
          )}
        </div>
      </div>

      {options.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => selectOption(i)}
              title={opt}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                i === optionIndex ? 'bg-leaf-600 text-white' : 'bg-leaf-50 text-leaf-700 hover:bg-leaf-100'
              }`}
            >
              Option {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={() => apply(flag.id, options.length > 0 ? draft : undefined)}
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
      {applyError && (
        <p className="mt-2 rounded-lg bg-rose-100 px-2 py-1.5 text-[11px] leading-relaxed text-rose-800">
          Apply failed: {applyError}
        </p>
      )}
    </div>
  )
}

function formatPages(p: number): string {
  if (p >= 1) return `${p.toFixed(1)} pages`
  return `${Math.round(p * 100)}% page`
}
