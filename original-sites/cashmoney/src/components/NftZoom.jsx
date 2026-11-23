import { useState } from 'react'
import TiltViewer from './TiltViewer'
import { ipfsToHttp, thumb } from '../lib/ipfs'
import { IMAGES_CID } from '../config'

// Shared full-size zoom overlay with the interactive tilt/glare viewer.
// Builds the image straight from the images CID by token id, so every
// piece (minted or not) enlarges cleanly.
export default function NftZoom({ id, onClose, light: controlledLight, onToggleLight }) {
  const [localLight, setLocalLight] = useState(true)
  if (id == null) return null

  const light = controlledLight ?? localLight
  const toggleLight = onToggleLight ?? (() => setLocalLight(value => !value))
  const src = thumb(ipfsToHttp(`ipfs://${IMAGES_CID}/${id}.png`), 1200)

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-4 p-6"
      style={{ zIndex: 600, background: 'rgba(0,0,0,0.86)' }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()}>
        <TiltViewer src={src} alt={`CashMoney #${id}`} glare={light} />
      </div>
      <div className="flex items-center gap-3" onClick={event => event.stopPropagation()}>
        <button
          type="button"
          onClick={toggleLight}
          aria-pressed={light}
          className="btn-ghost px-4 py-2 text-xs"
          style={light ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
          title="Toggle the light effect"
        >
          Light {light ? 'On' : 'Off'}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost px-5 py-2 text-xs">
          Close
        </button>
      </div>
    </div>
  )
}
