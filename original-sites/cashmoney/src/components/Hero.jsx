import { useEffect, useMemo, useRef, useState } from 'react'
import { ethers } from 'ethers'
import { useMintData } from '../hooks/useMintData'
import { useNow } from '../hooks/useNow'
import Countdown from './Countdown'
import { ipfsToHttp, retryImageFromFallback, thumb } from '../lib/ipfs'
import { EDAI_SYMBOL, PLS_SYMBOL, IMAGES_CID } from '../config'
import NftZoom from './NftZoom'
import TiltViewer from './TiltViewer'

// Compact display for big totals (553,500,000 -> 553.5M)
function fmtNumber(n) {
  if (n >= 1_000_000) return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtAmount(wei) {
  return fmtNumber(Number(ethers.formatEther(wei)))
}

function useAnimatedNumber(value, duration = 900) {
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)

  useEffect(() => {
    const startValue = displayRef.current
    const difference = value - startValue
    if (!Number.isFinite(value) || difference === 0) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayRef.current = value
      setDisplay(value)
      return
    }

    let frameId
    const startedAt = performance.now()
    const tick = now => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = startValue + difference * eased
      displayRef.current = next
      setDisplay(next)
      if (progress < 1) frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [value, duration])

  return display
}

// Raise-progress toward the full-sellout treasury goal, computed live
// from contract prices (never hardcoded — mainnet shows real amounts).
function RaiseMetric({ label, value, goal, unit, format = fmtNumber, accent = false }) {
  const displayValue = useAnimatedNumber(value)

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: accent
          ? 'color-mix(in srgb, var(--red) 50%, transparent)'
          : 'color-mix(in srgb, var(--border) 52%, transparent)',
        background: accent
          ? 'linear-gradient(145deg, color-mix(in srgb, var(--red) 13%, var(--panel)), color-mix(in srgb, var(--panel) 88%, transparent))'
          : 'color-mix(in srgb, var(--panel) 72%, transparent)',
      }}
    >
      <div className="muted text-[9px] font-bold uppercase tracking-[0.2em]">{label}</div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <strong
          key={value}
          className="raise-number font-black leading-none tabular-nums"
          aria-label={`${format(value)} ${unit}`}
        >
          {format(displayValue)}
        </strong>
        <span className="muted text-[10px] font-bold">{unit}</span>
      </div>
      <div className="muted mt-2 text-[10px]">Goal · {goal} {unit}</div>
    </div>
  )
}

function TreasuryGoal({ mint }) {
  if (!mint.loaded) return null

  const goalEdai = mint.edaiAmount * mint.maxSupply
  const goalPls = mint.plsAmount * mint.maxSupply
  const raisedEdai = mint.edaiAmount * mint.totalMinted
  const raisedPls = mint.plsAmount * mint.totalMinted

  return (
    <div className="relative mt-10">
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-cashx-brand text-2xl sm:text-3xl">Treasury Raise</h2>
        </div>

      </div>

      <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
        <RaiseMetric
          label="eDAI raised"
          value={Number(ethers.formatEther(raisedEdai))}
          goal={fmtAmount(goalEdai)}
          unit={EDAI_SYMBOL}
        />
        <RaiseMetric
          label={`${PLS_SYMBOL} raised`}
          value={Number(ethers.formatEther(raisedPls))}
          goal={fmtAmount(goalPls)}
          unit={PLS_SYMBOL}
        />
        <RaiseMetric
          label="NFTs minted"
          value={Number(mint.totalMinted)}
          goal={mint.maxSupply.toString()}
          unit="pieces"
          format={value => Math.round(value).toLocaleString()}
          accent
        />
      </div>

    </div>
  )
}

// Promo hero: a 5-card coverflow showcasing the WHOLE collection (all 369,
// minted or not) straight from the image CID. Center card featured big,
// two neighbors each side peeking, auto-advancing through every piece.
const TOTAL = 369
const SLIDE_MS = 3400
const WINDOW = 3 // render center ± this many (extra card each side buffers the slide)

function urlFor(id, w) {
  return thumb(ipfsToHttp(`ipfs://${IMAGES_CID}/${id}.png`), w)
}

// Card transform/opacity by its offset from the featured (center) card.
// Shifts are viewport-clamped so five cards still fit on smaller screens.
function coverStyle(offset) {
  const c = 'translate(-50%, -50%)'
  const s1 = 'min(380px, 36vw)'
  const s2 = 'min(640px, 58vw)'
  // Featured card is scaled up; side cards scaled down so only the middle
  // one reads big, with wider spacing so they don't collide.
  if (offset === 0) return { transform: `${c} scale(1)`, opacity: 1, zIndex: 30, filter: 'none' }
  if (offset === -1) return { transform: `${c} translateX(calc(-1 * ${s1})) scale(0.58)`, opacity: 0.5, zIndex: 20, filter: 'brightness(0.68)' }
  if (offset === 1) return { transform: `${c} translateX(${s1}) scale(0.58)`, opacity: 0.5, zIndex: 20, filter: 'brightness(0.68)' }
  if (offset === -2) return { transform: `${c} translateX(calc(-1 * ${s2})) scale(0.45)`, opacity: 0.22, zIndex: 10, filter: 'brightness(0.5)' }
  if (offset === 2) return { transform: `${c} translateX(${s2}) scale(0.45)`, opacity: 0.22, zIndex: 10, filter: 'brightness(0.5)' }
  return { transform: `${c} translateX(${offset > 0 ? '85vw' : '-85vw'}) scale(0.4)`, opacity: 0, zIndex: 5 }
}

function Arrow({ dir, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? 'Previous' : 'Next'}
      className="btn-ghost absolute top-1/2 z-40 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-lg"
      style={{ [dir < 0 ? 'left' : 'right']: 'max(8px, 2vw)' }}
    >
      {dir < 0 ? '‹' : '›'}
    </button>
  )
}

export default function Hero({ light = true, onToggleLight }) {
  const mint = useMintData(null)
  const now = useNow()
  const ids = useMemo(() => Array.from({ length: TOTAL }, (_, i) => i + 1), [])
  const [center, setCenter] = useState(() => Math.floor(Math.random() * TOTAL))
  const [zoom, setZoom] = useState(null)   // featured id shown full-size
  const hovering = useRef(false)
  const zoomRef = useRef(null)
  const swipe = useRef(null)

  useEffect(() => { zoomRef.current = zoom }, [zoom])

  useEffect(() => {
    const t = setInterval(() => {
      if (!hovering.current && zoomRef.current == null) setCenter(c => (c + 1) % TOTAL)
    }, SLIDE_MS)
    return () => clearInterval(t)
  }, [])

  const go = dir => setCenter(c => ((c + dir) % TOTAL + TOTAL) % TOTAL)

  // Swipe / drag to move the carousel (one card per ~60px)
  function onPointerDown(e) { swipe.current = { x: e.clientX, moved: false } }
  function onPointerMove(e) {
    if (!swipe.current || swipe.current.moved) return
    const dx = e.clientX - swipe.current.x
    if (Math.abs(dx) > 60) {
      swipe.current.moved = true
      go(dx < 0 ? 1 : -1)
    }
  }
  function endSwipe() { swipe.current = null }

  // Rendered window, keyed by token id so shared cards animate between
  // positions (smooth slide) as center advances.
  const cards = []
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const idx = ((center + d) % TOTAL + TOTAL) % TOTAL
    cards.push({ id: ids[idx], idx, offset: d })
  }

  const featuredId = center + 1

  return (
    <>
    {/* Countdown — top of the page */}
    <div className="mx-auto max-w-[980px] pt-2">
      <Countdown loaded={mint.loaded} mintStart={mint.mintStart} mintEnd={mint.mintEnd} now={now} />
    </div>

    <section
      className="py-8 md:py-10"
      onMouseEnter={() => { hovering.current = true }}
      onMouseLeave={() => { hovering.current = false }}
    >
      {/* Coverflow */}
      <div
        className="relative mx-auto h-[560px] w-full max-w-6xl sm:h-[800px]"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endSwipe}
        onPointerLeave={endSwipe}
      >
        <Arrow dir={-1} onClick={() => go(-1)} />
        <Arrow dir={1} onClick={() => go(1)} />
        {cards.map(({ id, idx, offset }) => {
          const featured = offset === 0
          return (
            <div
              key={id}
              className="absolute left-1/2 top-1/2 w-[340px] cursor-pointer transition-all duration-700 ease-out sm:w-[520px]"
              style={coverStyle(offset)}
              onClick={() => { if (swipe.current?.moved) return; featured ? setZoom(id) : setCenter(idx) }}
              title={featured ? `Click to enlarge #${id}` : `Show CashMoney #${id}`}
            >
              {featured ? (
                // Live tilt/light viewer on the center card (same as the zoom)
                <TiltViewer src={urlFor(id, 1040)} alt={`CashMoney #${id}`} cover glare={light} className="aspect-[1085/1450] w-full" />
              ) : (
                <div className="panel relative aspect-[1085/1450] overflow-hidden">
                  <img
                    src={urlFor(id, 480)}
                    alt={`CashMoney #${id}`}
                    draggable="false"
                    onError={retryImageFromFallback}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              {/* Reflection under the featured card */}
              {featured && (
                <div className="pointer-events-none absolute inset-x-0 top-full h-20 overflow-hidden" aria-hidden="true">
                  <img
                    src={urlFor(id, 520)}
                    draggable="false"
                    onError={retryImageFromFallback}
                    className="w-full -scale-y-100"
                    style={{
                      maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.4), transparent 72%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.4), transparent 72%)',
                    }}
                  />
                </div>
              )}
              {featured && onToggleLight && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleLight()
                  }}
                  className="btn-ghost absolute left-1/2 top-full z-40 mt-2 inline-flex -translate-x-1/2 items-center whitespace-nowrap px-2.5 py-1 text-[11px]"
                  style={light ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
                  title="Toggle the light effect"
                >
                  Light {light ? 'On' : 'Off'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Featured caption + position */}
      <div className="mt-4 text-center">
        <div className="font-cashx-brand text-xl">CashMoney #{featuredId}</div>
      </div>
    </section>
    <TreasuryGoal mint={mint} />

    <NftZoom
      id={zoom}
      onClose={() => setZoom(null)}
      light={light}
      onToggleLight={onToggleLight}
    />
    </>
  )
}
