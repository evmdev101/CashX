import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { readContract } from '../hooks/useGallery'
import { useNow } from '../hooks/useNow'
import { EDAI_SYMBOL, NETWORK, PLS_SYMBOL } from '../config'
import { loadMintHistory } from '../lib/mintHistory'

const MAX_ROWS = 7
const REFRESH_MS = 30_000

function shortAmount(wei) {
  const amount = Number(ethers.formatEther(wei))
  if (amount >= 1_000_000) {
    return amount.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })
  }
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function relativeTime(now, timestamp) {
  const seconds = Math.max(1, now - timestamp)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function LiveMints({ edaiAmount, plsAmount }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)
  const now = useNow()

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const recent = await loadMintHistory(MAX_ROWS)
        if (!alive) return
        setRows(recent)
        setError(false)
      } catch (loadError) {
        console.error('Live mints load failed:', loadError)
        if (alive) setError(true)
      }
    }

    load()
    const onMinted = () => load()
    const timer = setInterval(load, REFRESH_MS)
    readContract.on('Minted', onMinted)
    return () => {
      alive = false
      clearInterval(timer)
      readContract.off('Minted', onMinted)
    }
  }, [])

  return (
    <section className="mt-8" aria-label="Live mints">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-cashx-ui text-sm font-bold uppercase tracking-wide">Live mints</h2>
        <span className="muted text-[9px] uppercase tracking-widest">Updates automatically</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[570px]">
          <div className="muted grid grid-cols-[minmax(0,1.3fr)_minmax(160px,1fr)_46px_76px] gap-3 border-b px-2 pb-2 text-[9px] font-bold uppercase tracking-widest" style={{ borderColor: 'color-mix(in srgb, var(--border) 48%, transparent)' }}>
            <span>Minter</span>
            <span>Price</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Time</span>
          </div>

          <div className="divide-y" style={{ borderColor: 'color-mix(in srgb, var(--border) 38%, transparent)' }} aria-live="polite">
            {!rows && !error && Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="grid animate-pulse grid-cols-[minmax(0,1.3fr)_minmax(160px,1fr)_46px_76px] items-center gap-3 px-2 py-3">
                <span className="h-7 rounded bg-white/5" />
                <span className="h-4 rounded bg-white/5" />
                <span className="h-4 rounded bg-white/5" />
                <span className="h-4 rounded bg-white/5" />
              </div>
            ))}

            {error && <div className="muted px-2 py-5 text-center text-xs">Live mints are temporarily unavailable.</div>}
            {rows?.length === 0 && <div className="muted px-2 py-5 text-center text-xs">No mints yet.</div>}

            {rows?.map(row => {
              const quantity = BigInt(row.qty)
              const tokenRange = row.qty === 1 ? `CashMoney #${row.first}` : `CashMoney #${row.first}–#${row.last}`
              return (
                <div key={row.key} className="grid grid-cols-[minmax(0,1.3fr)_minmax(160px,1fr)_46px_76px] items-center gap-3 px-2 py-2.5 text-[11px] transition-colors hover:bg-white/[0.025]">
                  <div className="min-w-0">
                    <a className="block truncate font-bold hover:underline" href={`${NETWORK.EXPLORER_URL}/address/${row.buyer}`} target="_blank" rel="noreferrer">
                      {row.buyer.slice(0, 6)}…{row.buyer.slice(-4)}
                    </a>
                    <div className="muted mt-0.5 truncate text-[9px]">{tokenRange}</div>
                  </div>
                  <div className="min-w-0 font-bold tabular-nums">
                    <span>{shortAmount(edaiAmount * quantity)} {EDAI_SYMBOL}</span>
                    <span className="muted"> + </span>
                    <span>{shortAmount(plsAmount * quantity)} {PLS_SYMBOL}</span>
                  </div>
                  <span className="text-center font-bold tabular-nums">{row.qty}</span>
                  <a className="muted whitespace-nowrap text-right text-[10px] hover:underline" href={`${NETWORK.EXPLORER_URL}/tx/${row.tx}`} target="_blank" rel="noreferrer">
                    {row.time ? relativeTime(now, row.time) : '—'} ↗
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
