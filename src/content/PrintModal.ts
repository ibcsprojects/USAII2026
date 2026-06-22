// A self-contained print-intercept modal rendered into a Shadow DOM so Google Docs'
// styles can't touch it and ours can't leak out. Vanilla DOM (no React) to keep the
// content-script bundle tiny.

import type { Settings } from '../lib/messaging'

export interface PrintSummary {
  pages: number
  unresolved: { type: string; title: string }[]
  settings: Settings
}

const STYLE = `
:host { all: initial; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: rgba(20, 40, 25, 0.45); backdrop-filter: blur(2px);
  display: grid; place-items: center;
  font-family: Inter, system-ui, sans-serif;
}
.modal {
  width: 380px; max-width: 92vw; background: #fff; border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,.3); overflow: hidden;
}
.head { background: #16a34a; color: #fff; padding: 16px 18px; }
.head h1 { margin: 0; font-size: 16px; }
.head p { margin: 4px 0 0; font-size: 12px; opacity: .9; }
.body { padding: 16px 18px; color: #1f2417; font-size: 13px; }
.stat { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.stat b { font-size: 26px; color: #15803d; }
.warn { background: #fef9c3; color: #854d0e; border-radius: 10px; padding: 8px 10px; font-size: 12px; margin: 8px 0; }
.tips { margin: 10px 0 0; font-size: 12px; color:#3f3f29; }
.tips li { margin: 3px 0; }
.foot { display:flex; gap:8px; padding: 14px 18px; border-top:1px solid #f0fdf4; }
button { font: inherit; border: 0; border-radius: 10px; padding: 9px 14px; cursor: pointer; font-weight:600; font-size:13px; }
.primary { background:#16a34a; color:#fff; }
.primary:hover { background:#15803d; }
.ghost { background:#f0fdf4; color:#166534; margin-left:auto; }
.danger { background:#fff; color:#b91c1c; border:1px solid #fecaca; }
`

export type PrintModalResult = 'print' | 'review' | 'cancel'

export function showPrintModal(summary: PrintSummary): Promise<PrintModalResult> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    host.id = 'greenpages-print-modal'
    document.documentElement.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = STYLE
    root.appendChild(style)

    const heavy = summary.pages >= 10
    const tips: string[] = []
    if (summary.settings.duplexReminder)
      tips.push('Print double-sided to halve your paper use.')
    tips.push('Be mindful of your paper size — pick the smallest that fits so you don’t waste a larger sheet.')
    tips.push('Check you’re sending to the right printer / location.')

    const wrap = document.createElement('div')
    wrap.className = 'backdrop'
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="GreenPages print check">
        <div class="head">
          <h1>Wait! Before you print...</h1>
          <p>A quick eco check so you don’t waste paper or ink.</p>
        </div>
        <div class="body">
          <div class="stat"><b>${summary.pages}</b><span>estimated page${summary.pages === 1 ? '' : 's'}</span></div>
          ${heavy ? `<div class="warn">This is a large print job. Are you sure you need every page on paper?</div>` : ''}
          ${
            summary.unresolved.length
              ? `<div>You still have <b>${summary.unresolved.length}</b> unresolved eco-flag${summary.unresolved.length === 1 ? '' : 's'}</div>`
              : `<div class="warn" style="background:#dcfce7;color:#166534">No unresolved flags — nicely optimized!</div>`
          }
          <ul class="tips">${tips.map((t) => `<li>${t}</li>`).join('')}</ul>
        </div>
        <div class="foot">
          <button class="danger" data-act="print">Print anyway</button>
          <button class="ghost" data-act="review">Review flags</button>
          <button class="primary" data-act="cancel">Keep editing</button>
        </div>
      </div>`
    root.appendChild(wrap)

    const done = (r: PrintModalResult) => {
      host.remove()
      resolve(r)
    }
    wrap.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => done((b as HTMLButtonElement).dataset.act as PrintModalResult)),
    )
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) done('cancel')
    })
  })
}
