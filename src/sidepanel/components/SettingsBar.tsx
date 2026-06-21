import { useState } from 'react'
import { useStore } from '../state/store'
import { FLAG_META } from './flagMeta'
import type { FlagType } from '../../lib/analyzer/types'

const ALL_TYPES: FlagType[] = [
  'highlight',
  'fontSize',
  'doubleSpacing',
  'pageBreak',
  'bulletSprawl',
  'verbose',
  'imageResize',
]

export function SettingsBar() {
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)

  const toggleType = (t: FlagType) => {
    const mutedTypes = settings.mutedTypes.includes(t)
      ? settings.mutedTypes.filter((x) => x !== t)
      : [...settings.mutedTypes, t]
    update({ mutedTypes })
  }

  return (
    <div className="border-t border-leaf-100 bg-white/70 px-3 py-2 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center text-bark-700/70 hover:text-bark-900"
      >
        <span className="font-medium">Settings</span>
        <span className="ml-auto">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <label className="flex items-center justify-between">
            Double-sided reminder
            <input
              type="checkbox"
              checked={settings.duplexReminder}
              onChange={(e) => update({ duplexReminder: e.target.checked })}
              className="accent-leaf-600"
            />
          </label>

          <div>
            <div className="mb-1 font-medium text-bark-700/70">Check for</div>
            <div className="space-y-1">
              {ALL_TYPES.map((t) => (
                <label key={t} className="flex items-center justify-between">
                  <span>
                    {FLAG_META[t].icon} {FLAG_META[t].label}
                  </span>
                  <input
                    type="checkbox"
                    checked={!settings.mutedTypes.includes(t)}
                    onChange={() => toggleType(t)}
                    className="accent-leaf-600"
                  />
                </label>
              ))}
            </div>
          </div>

          <p className="rounded-lg bg-leaf-50 px-2 py-1.5 text-[11px] leading-relaxed text-leaf-800">
            ✨ AI is on. GreenPages reads your paragraphs and rewrites wordy ones to save paper —
            you’ll see those flagged in the list above.
          </p>
        </div>
      )}
    </div>
  )
}
