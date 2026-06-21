import { useStore } from '../state/store'
import { totalImpact } from '../../lib/analyzer/rules'
import { estimatePages } from '../../lib/pageEstimate'

export function EcoScore() {
  const flags = useStore((s) => s.flags)
  const doc = useStore((s) => s.doc)
  const impact = totalImpact(flags)
  const pages = doc ? estimatePages(doc).pages : 0

  // A simple 0–100 score: fewer outstanding flags = greener.
  const score = Math.max(0, Math.min(100, 100 - flags.length * 8))
  const ring =
    score >= 80 ? 'text-leaf-600' : score >= 50 ? 'text-amber-500' : 'text-rose-500'

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/70 p-3">
      <div className={`relative grid h-14 w-14 place-items-center ${ring}`}>
        <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5f5ea" strokeWidth="4" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 97.4} 97.4`}
          />
        </svg>
        <span className="absolute text-sm font-bold">{score}</span>
      </div>
      <div className="text-xs leading-tight">
        <div className="font-semibold text-bark-900">Eco score</div>
        <div className="text-bark-700/70">
          {flags.length} flag{flags.length === 1 ? '' : 's'} · ~{pages} page{pages === 1 ? '' : 's'}
        </div>
        <div className="text-leaf-700">
          Save ~{impact.paper.toFixed(1)} pages{impact.ink > 0.1 ? ' + ink' : ''}
        </div>
      </div>
    </div>
  )
}
