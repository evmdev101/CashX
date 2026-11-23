import { useEffect, useRef, useState } from 'react'
import { useGallery } from '../hooks/useGallery'
import { retryImageFromFallback, thumb } from '../lib/ipfs'
import NftZoom from './NftZoom'

function PlaceholderArt({ pending }) {
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-2 ${pending ? 'animate-pulse' : ''}`}>
      <span className="accent text-3xl font-bold opacity-60">$</span>
      <span className="muted text-[10px] uppercase tracking-widest">
        {pending ? 'loading…' : 'art coming soon'}
      </span>
    </div>
  )
}

export function NftCard({ card }) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = card.image && !imgFailed

  return (
    <div className="panel overflow-hidden">
      <div className="relative aspect-[3/4]" style={{ background: 'color-mix(in srgb, var(--fg) 5%, transparent)' }}>
        {showImage ? (
          <img
            src={thumb(card.image, 480)}
            alt={card.name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={event => {
              if (!retryImageFromFallback(event)) setImgFailed(true)
            }}
          />
        ) : (
          <PlaceholderArt pending={card.pending} />
        )}
      </div>
      <div className="flex items-center justify-end px-2 py-1">
        <span className="muted shrink-0 text-[10px]">#{card.id}</span>
      </div>
    </div>
  )
}

export default function Gallery({ wallet }) {
  const [filter, setFilter] = useState('all') // 'all' | 'mine'
  const mine = filter === 'mine' && wallet.isConnected
  const gallery = useGallery(mine ? wallet.address : null)
  const sentinelRef = useRef(null)
  const galleryScrollRef = useRef(null)
  const [zoom, setZoom] = useState(null)

  // Auto-load the next batch when the bottom sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !gallery.hasMore || gallery.loading || gallery.error) return undefined
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) gallery.loadMore()
    }, { root: galleryScrollRef.current, rootMargin: '400px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [gallery.hasMore, gallery.loading, gallery.error, gallery.loadMore]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full max-w-5xl">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-cashx-brand text-3xl uppercase">Gallery</h1>
          <p className="muted mt-1 text-xs">
            {gallery.total === null
              ? 'Loading…'
              : mine
                ? `You own ${gallery.total} CashMoney NFT${gallery.total === 1 ? '' : 's'}`
                : `${gallery.total} minted so far`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="btn-ghost h-9 px-3 text-xs"
            style={filter === 'all' ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
          >
            All minted
          </button>
          <button
            type="button"
            onClick={() => setFilter('mine')}
            disabled={!wallet.isConnected}
            className="btn-ghost h-9 px-3 text-xs"
            style={filter === 'mine' ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
            title={wallet.isConnected ? undefined : 'Connect your wallet first'}
          >
            My NFTs
          </button>
        </div>
      </div>

      {filter === 'mine' && !wallet.isConnected && (
        <div className="panel mt-6 p-8 text-center">
          <p className="muted text-sm">Connect your wallet to see your NFTs.</p>
          <button onClick={wallet.connect} className="btn-accent mt-4 px-5 py-2.5 text-xs font-bold">Connect Wallet</button>
        </div>
      )}

      {/* Grid */}
      {gallery.items.length > 0 && (
        <div ref={galleryScrollRef} className="mt-6 max-h-[1498px] overflow-y-auto overscroll-contain pr-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.items.map(card => (
              <button key={card.id} type="button" className="text-left" onClick={() => setZoom(card.id)}>
                <NftCard card={card} />
              </button>
            ))}

            {gallery.hasMore && !gallery.error && (
              <div ref={sentinelRef} className="col-span-full flex justify-center py-2">
                <button type="button" onClick={gallery.loadMore} disabled={gallery.loading} className="btn-ghost px-5 py-2.5 text-xs">
                  {gallery.loading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty states */}
      {gallery.total === 0 && !gallery.loading && (
        <div className="panel mt-6 p-8 text-center">
          <p className="muted text-sm">
            {mine ? "You don't own any CashMoney NFTs yet — head to the Mint tab." : 'Nothing minted yet.'}
          </p>
        </div>
      )}

      {/* Error + retry */}
      {gallery.error && (
        <button
          type="button"
          onClick={gallery.loadMore}
          className="mt-4 w-full rounded-md border px-4 py-3 text-xs"
          style={{ borderColor: '#f87171', background: 'rgba(248,113,113,0.12)', color: '#f87171' }}
        >
          {gallery.error}
        </button>
      )}

      <NftZoom id={zoom} onClose={() => setZoom(null)} />
    </div>
  )
}
