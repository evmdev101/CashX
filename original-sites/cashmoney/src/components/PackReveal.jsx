import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveToken } from '../hooks/useGallery'
import { retryImageFromFallback, thumb } from '../lib/ipfs'

// R6-style pack reveal: pack drops in → user tears the strip → cards
// burst out face-down → flip to reveal the minted art.
// Pure CSS transitions; phases advance on timers after the tear.
// Phases: drop → ready → tearing → burst → facedown → flipped

const MAX_REVEAL_CARDS = 10

function cardSize(n) {
  if (n === 1) return { width: 300, height: 400 }
  if (n <= 3) return { width: 270, height: 360 }
  if (n === 4) return { width: 210, height: 280 }
  if (n === 5) return { width: 170, height: 227 }
  return { width: 145, height: 193 }
}

function layoutPositions(n) {
  // Fan (dealt-hand arc) and settled row/grid targets for n cards
  const { width, height } = cardSize(n)
  const fan = []
  const grid = []
  const cols = Math.min(n, 5)
  const rows = Math.ceil(n / cols)
  for (let i = 0; i < n; i++) {
    const c = i - (n - 1) / 2
    fan.push({
      x: c * Math.min(width * 0.68, 760 / n),
      y: -30 - Math.abs(c) * -14,
      r: c * 7,
      s: 1,
    })
    const row = Math.floor(i / cols)
    const col = i % cols
    grid.push({
      x: (col - (cols - 1) / 2) * (width + 14),
      y: (row - (rows - 1) / 2) * (height + 16) - 10,
      r: 0,
      s: 1,
    })
  }
  return { fan, grid, cardWidth: width, cardHeight: height }
}

function CardFace({ card }) {
  return card?.image ? (
    <img src={thumb(card.image, 480)} alt={card.name} className="h-full w-full rounded-lg object-cover" draggable="false" onError={retryImageFromFallback} />
  ) : (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg" style={{ background: 'var(--panel)' }}>
      <span className="accent text-3xl font-bold">$</span>
      <span className="px-2 text-center text-[10px] font-bold">{card?.name}</span>
      <span className="muted text-[9px] uppercase tracking-widest">art loading…</span>
    </div>
  )
}

export default function PackReveal({ tokenIds, onClose, onViewGallery }) {
  const totalCount = tokenIds.length
  const visibleTokenIds = useMemo(() => tokenIds.slice(0, MAX_REVEAL_CARDS), [tokenIds])
  const visibleCount = visibleTokenIds.length
  const additionalCount = totalCount - visibleCount
  const [phase, setPhase] = useState('drop')
  const [cards, setCards] = useState(() => visibleTokenIds.map(id => ({ id, name: `CashMoney #${id}`, image: null })))
  const [zoomed, setZoomed] = useState(null)
  const dragStart = useRef(null)
  const timers = useRef([])
  const { fan, grid, cardWidth, cardHeight } = useMemo(() => layoutPositions(visibleCount), [visibleCount])

  // Fetch art through the gallery pipeline (cached, timeout-guarded,
  // never throws). Cards update whenever their data lands — even after
  // the flip — so a slow gateway can never hang the animation.
  useEffect(() => {
    let alive = true
    setCards(visibleTokenIds.map(id => ({ id, name: `CashMoney #${id}`, image: null })))
    visibleTokenIds.forEach(id => {
      resolveToken(id).then(card => {
        if (alive) setCards(prev => prev.map(c => (c.id === card.id ? { ...c, ...card } : c)))
      })
    })
    return () => { alive = false }
  }, [visibleTokenIds])

  function after(ms, fn) {
    timers.current.push(setTimeout(fn, ms))
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // drop → ready
  useEffect(() => {
    if (phase === 'drop') after(700, () => setPhase(p => (p === 'drop' ? 'ready' : p)))
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function tear() {
    if (phase !== 'ready') return
    setPhase('tearing')
    after(450, () => setPhase('burst'))
    after(1250, () => setPhase('facedown'))
    after(2050, () => setPhase('flipped'))
  }

  function skip() {
    timers.current.forEach(clearTimeout)
    setPhase('flipped')
  }

  const showPack = phase === 'drop' || phase === 'ready' || phase === 'tearing'
  const cardsOut = phase === 'burst' || phase === 'facedown' || phase === 'flipped'
  const settled = phase === 'facedown' || phase === 'flipped'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden" style={{ background: 'rgba(0,0,0,0.88)' }}>
      {/* Skip — always visible */}
      {phase !== 'flipped' && (
        <button onClick={skip} className="btn-ghost absolute right-4 top-4 z-20 px-4 py-2 text-xs">
          Skip ≫
        </button>
      )}

      {/* The pack */}
      {showPack && (
        <div
          className={`pr-pack relative z-10 h-[min(520px,72vh)] w-[min(360px,78vw)] select-none ${phase === 'drop' ? 'pr-pack-drop' : ''} ${phase === 'ready' ? 'pr-pack-idle cursor-pointer' : ''}`}
          onPointerDown={e => { dragStart.current = e.clientX }}
          onPointerMove={e => {
            if (dragStart.current !== null && Math.abs(e.clientX - dragStart.current) > 80) {
              dragStart.current = null
              tear()
            }
          }}
          onPointerUp={() => { dragStart.current = null }}
          onClick={tear}
        >
          {/* Foil pouch */}
          <div className="pr-pack-shell absolute inset-0 overflow-hidden rounded-[22px]">
            <div className="pr-pack-foil absolute inset-0" aria-hidden="true" />
            <div className="pr-pack-seam pr-pack-seam-left" aria-hidden="true" />
            <div className="pr-pack-seam pr-pack-seam-right" aria-hidden="true" />

            <div className="pr-pack-top-band absolute inset-x-0 top-[62px] h-12" aria-hidden="true">
              <span>CASHMONEY</span>
              <span>369 COLLECTION</span>
            </div>

            <div className="absolute inset-x-8 bottom-12 top-[125px] flex flex-col items-center justify-center text-center">
              <div className="pr-pack-kicker">PulseChain mint series</div>
              <div className="pr-pack-emblem" aria-hidden="true">$</div>
              <div className="font-cashx-brand mt-1 text-4xl text-white sm:text-5xl">CashMoney</div>
              <div className="pr-pack-edition mt-2">NFT REVEAL PACK</div>
              <div className="mt-6 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">
                <span className="pr-pack-chip">Series 01</span>
                <span className="pr-pack-chip">{totalCount} NFT{totalCount > 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="pr-pack-vertical" aria-hidden="true">PULSECHAIN</div>
            <div className="pr-pack-bottom-seal absolute inset-x-0 bottom-0 h-8" aria-hidden="true" />
          </div>

          {/* Tear strip */}
          <div
            className={`pr-tear-strip absolute inset-x-0 top-0 z-20 flex h-[64px] items-center justify-center rounded-t-[22px] ${phase === 'tearing' ? 'pr-strip-torn' : ''}`}
          >
            <span className="pr-tear-grip" aria-hidden="true" />
            <span className="relative z-10 text-[10px] font-bold uppercase tracking-[0.32em] text-white/85">Tear to reveal</span>
            <span className="pr-tear-perforation absolute inset-x-4 bottom-0" aria-hidden="true" />
          </div>

        </div>
      )}

      {/* The cards */}
      {cardsOut && (
        <div className="absolute left-1/2 top-1/2 z-10">
          {cards.map((card, i) => {
            const pos = settled ? grid[i] : fan[i]
            const flipped = phase === 'flipped'
            return (
              <div
                key={card.id}
                className="pr-card absolute cursor-pointer"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  marginLeft: -cardWidth / 2,
                  marginTop: -cardHeight / 2,
                  transform: `translate(${pos.x}px, ${pos.y}px) rotate(${pos.r}deg) scale(${pos.s})`,
                  transitionDelay: `${i * 45}ms`,
                }}
                onClick={() => flipped && setZoomed(card)}
              >
                <div className={`pr-card-inner ${flipped ? 'pr-flip' : ''}`} style={{ transitionDelay: `${i * 90}ms` }}>
                  {/* Premium card back */}
                  <div className="pr-face pr-card-back rounded-xl">
                    <span className="pr-card-rail pr-card-rail-left" aria-hidden="true" />
                    <span className="pr-card-rail pr-card-rail-right" aria-hidden="true" />
                    <div className="pr-card-texture" aria-hidden="true">
                      <span>CM / MINT SERIES</span>
                    </div>
                    <span className="pr-card-divider" aria-hidden="true" />
                    <div className="pr-card-seal" aria-hidden="true">
                      <span>369</span>
                    </div>
                    <div className="pr-card-back-content">
                      <div className="pr-card-shield" aria-hidden="true"><span>$</span></div>
                      <div className="pr-card-brand">CashMoney</div>
                      <div className="pr-card-subtitle">NFT REVEAL CARD</div>
                    </div>
                    <div className="pr-card-serial">PULSECHAIN · SERIES 01</div>
                  </div>
                  {/* Front (art) */}
                  <div className="pr-face pr-face-front rounded-lg border" style={{ borderColor: 'color-mix(in srgb, var(--red) 55%, transparent)', boxShadow: '0 0 24px color-mix(in srgb, var(--red) 30%, transparent)' }}>
                    <CardFace card={card} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* End state */}
      {phase === 'flipped' && !zoomed && (
        <div className="absolute inset-x-0 bottom-8 z-20 flex flex-col items-center gap-4 px-4">
          <div className="text-center text-lg font-bold" style={{ color: 'var(--fg)' }}>
            {totalCount === 1 ? `You minted ${cards[0]?.name || 'a CashMoney NFT'}!` : `You minted ${totalCount} CashMoney NFTs!`}
          </div>
          {additionalCount > 0 && (
            <div className="rounded-full border px-4 py-2 text-center text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: 'color-mix(in srgb, var(--red) 52%, transparent)', background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--fg)' }}>
              Showing {visibleCount} cards · {additionalCount} additional NFT{additionalCount === 1 ? '' : 's'} are in Items
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onViewGallery} className="btn-accent px-5 py-2.5 text-xs font-bold">View in Items</button>
            <button onClick={onClose} className="btn-ghost px-5 py-2.5 text-xs">Close</button>
          </div>
          <div className="muted text-[10px]">tap a card to zoom</div>
        </div>
      )}

      {/* Zoom */}
      {zoomed && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 p-6" onClick={() => setZoomed(null)}>
          <div className="max-h-[75vh] overflow-hidden rounded-xl border-2" style={{ borderColor: 'var(--red)', boxShadow: '0 0 60px color-mix(in srgb, var(--red) 40%, transparent)' }}>
            {zoomed.image
              ? <img src={thumb(zoomed.image, 1200)} alt={zoomed.name} className="max-h-[75vh] w-auto" draggable="false" onError={retryImageFromFallback} />
              : <div className="flex h-72 w-56 items-center justify-center" style={{ background: 'var(--panel)' }}><span className="accent text-5xl font-bold">$</span></div>}
          </div>
          <div className="text-sm font-bold" style={{ color: 'var(--fg)' }}>{zoomed.name}</div>
          <div className="muted text-[10px]">tap anywhere to go back</div>
        </div>
      )}
    </div>
  )
}
