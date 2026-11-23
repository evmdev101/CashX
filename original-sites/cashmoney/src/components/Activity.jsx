import { useEffect, useState } from 'react'
import { NETWORK } from '../config'
import { loadMintHistory } from '../lib/mintHistory'

// Recent mint activity from the contract's Minted events.
const MAX_ROWS = 25
const VISIBLE_ROWS = 7
const REFRESH_MS = 30_000

function relTime(tsSeconds) {
  const s = Math.max(1, Math.floor(Date.now() / 1000) - tsSeconds)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function Activity() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const recent = await loadMintHistory(MAX_ROWS)
        if (!alive) return
        setRows(recent)
        setError(null)
      } catch (err) {
        console.error('Activity load failed:', err)
        if (alive) setError('Could not load mint activity from PulseChain.')
      }
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  if (error) return <div className="panel mt-8 p-8 text-center text-sm" style={{ color: '#f87171' }}>{error}</div>
  if (!rows) return <div className="panel mt-8 p-8 text-center"><span className="muted text-sm">Loading activity…</span></div>
  if (rows.length === 0) return <div className="panel mt-8 p-8 text-center"><span className="muted text-sm">No mints yet.</span></div>

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-cashx-brand text-2xl uppercase">Recent mints</h2>
        </div>
        <span
          className="rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ borderColor: 'color-mix(in srgb, var(--border) 62%, transparent)', background: 'color-mix(in srgb, var(--panel) 72%, transparent)' }}
        >
          {rows.length} event{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div
        className="max-h-[676px] space-y-2.5 overflow-y-auto overscroll-contain pr-2"
        aria-label={`Latest ${VISIBLE_ROWS} mint events with more available by scrolling`}
      >
        {rows.map(r => {
          const tokenLabel = r.qty === 1 ? `CashMoney #${r.first}` : `CashMoney #${r.first}–#${r.last}`
          return (
            <article
              key={r.key}
              className="activity-row panel relative grid min-h-[88px] grid-cols-1 items-center gap-x-4 gap-y-3 overflow-hidden px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                  <a
                    className="font-mono font-bold hover:underline"
                    href={`${NETWORK.EXPLORER_URL}/address/${r.buyer}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.buyer.slice(0, 6)}…{r.buyer.slice(-4)}
                  </a>
                  <span className="muted">minted {r.qty} NFT{r.qty === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-1.5 truncate text-xs font-bold sm:text-sm">{tokenLabel}</div>
              </div>

              <div
                className="col-span-1 flex items-center justify-between gap-4 border-t pt-3 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"
                style={{ borderColor: 'color-mix(in srgb, var(--border) 42%, transparent)' }}
              >
                <span className="muted whitespace-nowrap text-[10px]">{r.time ? relTime(r.time) : ''}</span>
                <a
                  className="btn-ghost whitespace-nowrap px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest"
                  href={`${NETWORK.EXPLORER_URL}/tx/${r.tx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View tx ↗
                </a>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
