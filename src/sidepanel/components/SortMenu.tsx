import { useEffect, useRef, useState } from 'react'
import { useStore, type SortMode } from '../state/store'

const OPTIONS: { value: SortMode; label: string; hint: string }[] = [
  { value: 'savings', label: 'Highest % page saved', hint: 'Biggest wins first' },
  { value: 'document', label: 'Order in document', hint: 'Top to bottom' },
]

/** A small filter button + dropdown that picks how the flag list is ordered. */
export function SortMenu() {
  const sortMode = useStore((s) => s.sortMode)
  const setSortMode = useStore((s) => s.setSortMode)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside or Escape so the dropdown doesn't linger.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Sort issues"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center rounded-lg border px-2 py-1 transition ${
          open
            ? 'border-leaf-400 bg-leaf-100 text-leaf-700'
            : 'border-leaf-200 bg-white text-leaf-700 hover:bg-leaf-100'
        }`}
      >
        {/* funnel / filter icon */}
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M3 5h14l-5.5 6.5V16l-3 1.5v-6L3 5z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-lg border border-leaf-200 bg-white py-1 shadow-lg"
        >
          <div className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-bark-700/50">
            Sort issues by
          </div>
          {OPTIONS.map((opt) => {
            const active = opt.value === sortMode
            return (
              <button
                key={opt.value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setSortMode(opt.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-leaf-50 ${
                  active ? 'text-leaf-800' : 'text-bark-700/80'
                }`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {active && (
                    <svg className="h-3.5 w-3.5 text-leaf-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className={`font-medium ${active ? 'text-leaf-800' : 'text-bark-900'}`}>{opt.label}</span>
                  <span className="text-[10px] text-bark-700/50">{opt.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
