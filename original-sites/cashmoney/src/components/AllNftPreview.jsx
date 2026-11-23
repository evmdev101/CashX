import { useEffect, useRef, useState } from 'react'
import { ipfsToHttp, retryImageFromFallback, thumb } from '../lib/ipfs'
import { IMAGES_CID } from '../config'
import NftZoom from './NftZoom'
import TiltViewer from './TiltViewer'

// Cycles through ALL 369 pieces one at a time (minted or not) so minters
// see what they could pull. Images come straight from the images CID —
// no contract calls needed. Stride 97 is coprime with 369, so the order
// feels random but still visits every single piece before repeating.
const TOTAL = 369
const STRIDE = 97
const STEP_MS = 2600

function urlFor(n, width = 720) {
  return thumb(ipfsToHttp(`ipfs://${IMAGES_CID}/${n}.png`), width)
}

export default function AllNftPreview({ light = true, onToggleLight }) {
  const [n, setN] = useState(() => 1 + Math.floor(Math.random() * TOTAL))
  const [zoom, setZoom] = useState(null)
  const zoomRef = useRef(null)

  useEffect(() => { zoomRef.current = zoom }, [zoom])

  useEffect(() => {
    const id = setInterval(() => {
      if (zoomRef.current == null) setN(v => ((v - 1 + STRIDE) % TOTAL) + 1)
    }, STEP_MS)
    return () => clearInterval(id)
  }, [])

  // Preload the next slide so the swap is seamless
  useEffect(() => {
    const img = new Image()
    img.src = urlFor(((n - 1 + STRIDE) % TOTAL) + 1)
  }, [n])

  return (
    <div className="w-full max-w-[520px]">
      {/* Live tilt/light viewer — same effect as the zoom, before you click.
          Click to open the full-size version. */}
      <div className="relative cursor-pointer" onClick={() => setZoom(n)} title={`Click to enlarge #${n}`}>
        <TiltViewer src={urlFor(n, 900)} alt={`CashMoney #${n}`} cover glare={light} className="aspect-[1085/1450] w-full" />
      </div>

      {/* Reflection */}
      <div className="pointer-events-none relative h-20 overflow-hidden" aria-hidden="true">
        <img
          src={urlFor(n, 520)}
          draggable="false"
          onError={retryImageFromFallback}
          className="w-full -scale-y-100"
          style={{
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.4), transparent 72%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.4), transparent 72%)',
          }}
        />
      </div>

      {/* Light toggle — right below the NFT */}
      {onToggleLight && (
        <div className="relative z-10 -mt-[4.5rem] flex justify-center">
          <button
            type="button"
            onClick={onToggleLight}
            className="btn-ghost inline-flex items-center px-2.5 py-1 text-[11px]"
            style={light ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
            title="Toggle the light effect"
          >
            Light {light ? 'On' : 'Off'}
          </button>
        </div>
      )}

      <NftZoom
        id={zoom}
        onClose={() => setZoom(null)}
        light={light}
        onToggleLight={onToggleLight}
      />
    </div>
  )
}
