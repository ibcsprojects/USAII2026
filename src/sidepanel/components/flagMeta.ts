import type { FlagType, Severity } from '../../lib/analyzer/types'

export const FLAG_META: Record<FlagType, { label: string; icon: string; accent: string }> = {
  highlight: { label: 'Ink — highlight', icon: '🖍️', accent: 'bg-amber-100 text-amber-800' },
  fontSize: { label: 'Paper — font size', icon: '🔠', accent: 'bg-sky-100 text-sky-800' },
  doubleSpacing: { label: 'Paper — spacing', icon: '↕️', accent: 'bg-violet-100 text-violet-800' },
  pageBreak: { label: 'Paper — page break', icon: '⤓', accent: 'bg-rose-100 text-rose-800' },
  bulletSprawl: { label: 'Paper — layout', icon: '☰', accent: 'bg-teal-100 text-teal-800' },
  verbose: { label: 'Paper — wordiness', icon: '✂️', accent: 'bg-leaf-100 text-leaf-800' },
  imageResize: { label: 'Paper — image size', icon: '🖼️', accent: 'bg-indigo-100 text-indigo-800' },
}

export const SEVERITY_DOT: Record<Severity, string> = {
  low: 'bg-leaf-400',
  medium: 'bg-amber-400',
  high: 'bg-rose-500',
}
