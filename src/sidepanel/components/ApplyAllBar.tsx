import { useStore } from '../state/store'

// Bottom bar: one button that applies every outstanding fix in the panel at once.
export function ApplyAllBar() {
  const flags = useStore((s) => s.flags)
  const loading = useStore((s) => s.loading)
  const applyAll = useStore((s) => s.applyAll)

  const count = flags.length
  const disabled = loading || count === 0

  return (
    <div className="border-t border-leaf-100 bg-white/70 px-3 py-2.5">
      <button
        onClick={() => applyAll()}
        disabled={disabled}
        className="w-full rounded-lg bg-leaf-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? 'Applying…'
          : count === 0
            ? 'All changes applied'
            : `Apply all changes (${count})`}
      </button>
    </div>
  )
}
