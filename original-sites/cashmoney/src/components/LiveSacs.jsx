import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { GSX_SAC } from '../config'
import { useNow } from '../hooks/useNow'

const MAX_ROWS = 7
const REFRESH_MS = 30_000
const REQUEST_TIMEOUT_MS = 8_000

function formatAmount(value, maxDigits = 2) {
  const amount = Number(ethers.formatEther(value))
  return amount.toLocaleString(undefined, {
    notation: amount >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: maxDigits,
  })
}

function relativeTime(now, timestamp) {
  const seconds = Math.max(1, now - timestamp)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

async function fetchSacTransactions() {
  let lastError

  for (const apiUrl of GSX_SAC.EXPLORER_API_URLS) {
    const isDeveloperExplorer = apiUrl.includes('dev.pulsechainexplorer.com')
    const params = new URLSearchParams({
      module: 'account',
      action: 'txlist',
      address: GSX_SAC.ADDRESS,
      ...(isDeveloperExplorer
        ? { offset: '0', limit: '25' }
        : { page: '1', offset: '25', sort: 'desc', filterby: 'to' }),
    })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${apiUrl}?${params}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`SAC activity request failed (${response.status})`)

      const payload = await response.json()
      if (String(payload.status) !== '1' && payload.message !== 'No transactions found') {
        throw new Error(payload.message || 'SAC activity request failed')
      }

      const transactions = Array.isArray(payload.result)
        ? payload.result
        : (Array.isArray(payload.result?.txs) ? payload.result.txs : [])

      return transactions
    } catch (error) {
      lastError = error
      console.warn(`SAC explorer failed (${apiUrl}); trying the next endpoint.`, error)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError ?? new Error('No SAC explorer APIs are configured.')
}

export default function LiveSacs() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)
  const now = useNow(30_000)

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const transactions = await fetchSacTransactions()
        const address = GSX_SAC.ADDRESS.toLowerCase()
        const recent = transactions
          .filter(transaction => (
            (transaction.isError === '0' || transaction.txreceipt_status === '1')
            && transaction.to?.toLowerCase() === address
            && BigInt(transaction.value || 0) > 0n
          ))
          .sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp))
          .slice(0, MAX_ROWS)
          .map(transaction => ({
            key: transaction.hash,
            sender: transaction.from,
            value: BigInt(transaction.value),
            estimatedGsx: BigInt(transaction.value) / BigInt(GSX_SAC.PLS_PER_GSX),
            time: Number(transaction.timeStamp),
            tx: transaction.hash,
          }))

        if (!alive) return
        setRows(recent)
        setError(false)
      } catch (loadError) {
        console.error('Live SACs load failed:', loadError)
        if (alive) setError(true)
      }
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return (
    <section className="mt-7 border-t pt-6" style={{ borderColor: 'color-mix(in srgb, var(--border) 46%, transparent)' }} aria-label="Live GSX SACs">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-cashx-ui text-sm font-bold uppercase tracking-wide">Live SACs</h2>
        <span className="muted text-[9px] font-bold uppercase tracking-widest">Updates automatically</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          <div className="muted grid grid-cols-[minmax(0,1.35fr)_minmax(110px,0.9fr)_minmax(100px,0.8fr)_64px] gap-3 border-b px-2 pb-2 text-[9px] font-bold uppercase tracking-widest" style={{ borderColor: 'color-mix(in srgb, var(--border) 42%, transparent)' }}>
            <span>Sender</span>
            <span>PLS sent</span>
            <span>Est. GSX</span>
            <span className="text-right">Time</span>
          </div>

          <div className="divide-y" style={{ borderColor: 'color-mix(in srgb, var(--border) 34%, transparent)' }} aria-live="polite">
            {!rows && !error && Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="grid animate-pulse grid-cols-[minmax(0,1.35fr)_minmax(110px,0.9fr)_minmax(100px,0.8fr)_64px] items-center gap-3 px-2 py-3">
                <span className="h-4 rounded bg-white/5" />
                <span className="h-4 rounded bg-white/5" />
                <span className="h-4 rounded bg-white/5" />
                <span className="h-4 rounded bg-white/5" />
              </div>
            ))}

            {error && <div className="muted px-2 py-6 text-center text-xs">Live SAC activity is temporarily unavailable.</div>}
            {rows?.length === 0 && <div className="muted px-2 py-6 text-center text-xs">No incoming PLS SACs yet.</div>}

            {rows?.map(row => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1.35fr)_minmax(110px,0.9fr)_minmax(100px,0.8fr)_64px] items-center gap-3 px-2 py-2.5 text-[11px] transition-colors hover:bg-white/[0.025]">
                <a className="min-w-0 truncate font-bold hover:underline" href={`${GSX_SAC.EXPLORER_URL}/address/${row.sender}`} target="_blank" rel="noreferrer">
                  {row.sender.slice(0, 6)}…{row.sender.slice(-4)}
                </a>
                <span className="font-bold tabular-nums">{formatAmount(row.value)} PLS</span>
                <span className="font-bold tabular-nums">{formatAmount(row.estimatedGsx)} GSX</span>
                <a className="muted whitespace-nowrap text-right text-[10px] hover:underline" href={`${GSX_SAC.EXPLORER_URL}/tx/${row.tx}`} target="_blank" rel="noreferrer">
                  {relativeTime(now, row.time)} ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
