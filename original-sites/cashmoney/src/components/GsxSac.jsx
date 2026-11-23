import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { GSX_SAC } from '../config'
import { createReadProvider } from '../lib/rpc'
import { useMintData } from '../hooks/useMintData'
import { useNow } from '../hooks/useNow'
import LiveSacs from './LiveSacs'

const provider = createReadProvider(GSX_SAC)
const gsxArtworkUrl = `${import.meta.env.BASE_URL}${GSX_SAC.ARTWORK_FILE}`

function formatAmount(value, maxDigits = 2) {
  if (value === null) return '…'
  const amount = Number(ethers.formatEther(value))
  return amount.toLocaleString(undefined, {
    notation: amount >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: maxDigits,
  })
}

function Metric({ label, value, unit, note }) {
  return (
    <div className="p-5 sm:p-6">
      <div className="muted text-[9px] font-bold uppercase tracking-[0.2em]">{label}</div>
      <div className="font-cashx-display mt-2 flex items-baseline gap-2 text-4xl font-extrabold tabular-nums">
        <span>{value}</span>
        {unit && <span className="muted text-xs">{unit}</span>}
      </div>
      {note && <div className="muted mt-1 text-[9px] leading-relaxed">{note}</div>}
    </div>
  )
}

function RateMetric() {
  return (
    <div className="p-5 sm:p-6">
      <div className="muted text-[9px] font-bold uppercase tracking-[0.2em]">GSX SAC exchange rate</div>
      <div className="font-cashx-display mt-3 flex items-center gap-3 font-extrabold tabular-nums">
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl">{GSX_SAC.PLS_PER_GSX}</span>
          <span className="muted text-xs">PLS</span>
        </div>
        <span className="text-xl" style={{ color: 'var(--red)' }}>=</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl">1</span>
          <span className="muted text-xs">GSX</span>
        </div>
      </div>
    </div>
  )
}

export default function GsxSac() {
  // The SAC and NFT mint share the NFT contract's on-chain end time.
  // This only controls the website's SAC messaging; it never sends a transfer.
  const mint = useMintData()
  const now = useNow()
  const [balance, setBalance] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    async function refresh() {
      try {
        const next = await provider.getBalance(GSX_SAC.ADDRESS)
        if (alive) {
          setBalance(next)
          setError(null)
        }
      } catch (refreshError) {
        console.error('GSX SAC balance read failed:', refreshError)
        if (alive) setError('Could not read the GSX SAC address from PulseChain right now.')
      }
    }
    refresh()
    const timer = setInterval(refresh, 30_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(GSX_SAC.ADDRESS)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const estimatedGsx = balance === null
    ? null
    : balance / BigInt(GSX_SAC.PLS_PER_GSX)
  const sacOver = mint.loaded && mint.mintEnd > 0n && BigInt(now) >= mint.mintEnd

  return (
    <div className="mt-8 space-y-6">
      {error && <div className="rounded-md border px-4 py-3 text-xs" style={{ borderColor: '#f87171', background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>{error}</div>}

      {sacOver && (
        <section className="rounded-2xl border-2 px-6 py-8 text-center sm:px-10" style={{ borderColor: '#f87171', background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
          <div className="font-cashx-brand text-3xl sm:text-4xl">GSX SAC Over</div>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold leading-6 text-white">
            The GSX SAC closed when the CashMoney mint ended. Please do not send any more PLS to the SAC address.
          </p>
        </section>
      )}

      {!sacOver && <section className="panel overflow-hidden">
        <div className="border-b px-5 py-4 sm:px-6" style={{ borderColor: 'color-mix(in srgb, var(--border) 46%, transparent)' }}>
          <h2 className="font-cashx-display text-2xl font-extrabold">Live SAC overview</h2>
        </div>
        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ borderColor: 'color-mix(in srgb, var(--border) 40%, transparent)' }}>
          <Metric label="Current address balance" value={formatAmount(balance)} unit="PLS" />
          <Metric label="GSX at posted rate" value={formatAmount(estimatedGsx)} unit="GSX" />
          <RateMetric />
        </div>
      </section>}

      {!sacOver && <section
        className="overflow-hidden rounded-2xl border"
        style={{
          borderColor: 'color-mix(in srgb, var(--red) 48%, var(--border))',
          background: 'radial-gradient(circle at 78% 20%, color-mix(in srgb, var(--red) 15%, transparent), transparent 30%), color-mix(in srgb, var(--panel) 88%, transparent)',
          boxShadow: '0 22px 70px color-mix(in srgb, var(--bg) 46%, transparent)',
        }}
      >
        <div className="grid lg:grid-cols-[minmax(380px,0.88fr)_minmax(0,1.12fr)]">
          <div className={`relative flex min-h-[520px] items-center justify-center overflow-hidden bg-black lg:min-h-full ${gsxArtworkUrl ? '' : 'p-8'}`}>
            {gsxArtworkUrl ? (
              <>
                <img src={gsxArtworkUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-xl" />
                <img src={gsxArtworkUrl} alt="GSX Grand Slam artwork" className="relative z-10 h-full w-full object-contain" />
              </>
            ) : (
              <div className="max-w-sm text-center">
                <div className="font-cashx-display text-7xl font-extrabold" style={{ color: 'var(--red)' }}>GSX</div>
                <div className="font-cashx-brand mt-1 text-3xl">Grand Slam X</div>
              </div>
            )}
          </div>

          <div className="flex flex-col justify-start p-6 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-end justify-between gap-5 border-b pb-5" style={{ borderColor: 'color-mix(in srgb, var(--border) 46%, transparent)' }}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: 'var(--red)' }}>Grand Slam X</div>
                <h1 className="font-cashx-brand mt-2 text-5xl sm:text-6xl">GSX SAC</h1>
              </div>
              <div className="flex items-end gap-3 sm:gap-4">
                <div className="text-right">
                  <div className="muted mb-1 text-[8px] font-bold uppercase tracking-widest">Posted rate</div>
                  <div className="font-cashx-display text-4xl font-extrabold tabular-nums">{GSX_SAC.PLS_PER_GSX}<span className="muted ml-1 text-[10px]">PLS</span></div>
                </div>
                <div className="mb-1 text-xl" style={{ color: 'var(--red)' }}>→</div>
                <div>
                  <div className="muted mb-1 text-[8px] font-bold uppercase tracking-widest">Receive</div>
                  <div className="font-cashx-display text-4xl font-extrabold tabular-nums">1<span className="muted ml-1 text-[10px]">GSX</span></div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="muted text-[9px] font-bold uppercase tracking-[0.2em]">SAC address</div>
              <code className="mt-2 block break-all rounded-lg border px-4 py-3 text-xs font-bold sm:text-sm" style={{ borderColor: 'color-mix(in srgb, var(--border) 52%, transparent)', background: 'color-mix(in srgb, var(--bg) 62%, transparent)' }}>{GSX_SAC.ADDRESS}</code>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={copyAddress} className="btn-accent px-6 py-3 text-xs font-bold">{copied ? 'Address copied' : 'Copy SAC address'}</button>
              <a className="btn-ghost px-6 py-3 text-center text-xs font-bold" href={`${GSX_SAC.EXPLORER_URL}/address/${GSX_SAC.ADDRESS}`} target="_blank" rel="noreferrer">View on explorer ↗</a>
            </div>

            <div className="mt-5 rounded-lg border px-4 py-3 text-[11px] font-bold leading-5" style={{ borderColor: '#fbbf24', background: 'rgba(251,191,36,0.07)', color: '#fbbf24' }}>
              Send native PLS only. Do not send eDAI, tokens, NFTs, or assets from another network. Transfers are irreversible.
            </div>

            <LiveSacs />
          </div>
        </div>
      </section>}

    </div>
  )
}
