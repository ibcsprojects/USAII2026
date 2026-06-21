import { useStore } from '../state/store'
import { FlagCard } from './FlagCard'
import { EmptyState } from './EmptyState'

export function FlagList() {
  const flags = useStore((s) => s.flags)
  const loading = useStore((s) => s.loading)

  if (loading && flags.length === 0) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-white/60" />
        ))}
      </div>
    )
  }

  if (flags.length === 0) return <EmptyState />

  return (
    <div className="space-y-2 p-3">
      {flags.map((f) => (
        <FlagCard key={f.id} flag={f} />
      ))}
    </div>
  )
}
