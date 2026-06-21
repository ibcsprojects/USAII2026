import { useState } from 'react'
import { useStore } from '../state/store'
import { FlagCard, FlagGroupCard } from './FlagCard'
import { EmptyState } from './EmptyState'
import { groupFlags } from './groupFlags'

export function FlagList() {
  const flags = useStore((s) => s.flags)
  const loading = useStore((s) => s.loading)

  // Only one card is open at a time (accordion); opening one collapses the rest.
  // Keyed by the group's lead flag id, which is stable across re-renders.
  const [openId, setOpenId] = useState<string | null>(null)

  if (loading && flags.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 py-16 text-center">
        <div className="flex flex-col items-center">
          <div className="relative grid h-16 w-16 place-items-center">
            <span className="absolute inline-block h-16 w-16 animate-ping rounded-full bg-leaf-300/40" />
            <span className="absolute inline-block h-12 w-12 animate-spin rounded-full border-2 border-leaf-200 border-t-leaf-600" />
            <span className="text-2xl">🌿</span>
          </div>
          <h2 className="mt-4 text-sm font-semibold text-leaf-800">Scanning document…</h2>
          <p className="mt-1 max-w-[15rem] text-xs text-bark-700/70">
            Looking for ways to trim pages and ink before you print.
          </p>
        </div>
      </div>
    )
  }

  if (flags.length === 0) return <EmptyState />

  // The margins recommendation always leads the panel; the rest stay in document order
  // (groupFlags relies on that order to cluster overlapping flags).
  const ordered = [...flags].sort((a, b) => {
    if (a.type === 'wideMargins' && b.type !== 'wideMargins') return -1
    if (b.type === 'wideMargins' && a.type !== 'wideMargins') return 1
    return a.range.start - b.range.start
  })
  const groups = groupFlags(ordered)

  return (
    <div className="space-y-2 p-3">
      {groups.map((group) => {
        const id = group[0].id
        const expanded = openId === id
        const onToggle = (open: boolean) => setOpenId(open ? id : null)
        return group.length === 1 ? (
          <FlagCard key={id} flag={group[0]} expanded={expanded} onToggle={onToggle} />
        ) : (
          <FlagGroupCard key={id} flags={group} expanded={expanded} onToggle={onToggle} />
        )
      })}
    </div>
  )
}
