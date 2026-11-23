import { useEffect, useRef } from 'react'
import { retryImageFromFallback } from '../lib/ipfs'

// Interactive tilt-and-glare card — a flat-image adaptation of the degenNFT
// 3D viewer's feel: pointer drives a slight 3D sway + a moving light glare,
// with a gentle idle sway when untouched. Motion is damped in a rAF loop
// (lerp toward target) so it eases like the original, and the transforms are
// written straight to the DOM to avoid per-frame React renders.

const MAX_TILT = 14 // degrees at the edges

// cover=false (default): image shown at natural size (zoom overlay).
// cover=true: image fills the wrapper via object-cover (inline card use);
// pass a sizing className like "aspect-[3/4] w-full".
// glare=false hides the moving light highlight (the tilt/sway still runs).
export default function TiltViewer({ src, alt, className = '', cover = false, glare = true }) {
  const wrapRef = useRef(null)
  const cardRef = useRef(null)
  const glareRef = useRef(null)
  const st = useRef({
    tx: 0, ty: 0, cx: 0, cy: 0,           // tilt: target x/y, current x/y (-1..1)
    gx: 50, gy: 42, cgx: 50, cgy: 42,     // glare: target %, current %
    hovering: false,
  })

  useEffect(() => {
    let raf
    let t = 0
    const s = st.current
    const loop = () => {
      t += 0.016
      // Gentle idle sway when the pointer isn't driving it
      if (!s.hovering) {
        s.tx = Math.sin(t * 0.6) * 0.28
        s.ty = Math.cos(t * 0.45) * 0.2
        s.gx = 50 + Math.sin(t * 0.6) * 20
        s.gy = 42 + Math.cos(t * 0.45) * 16
      }
      // Damp current toward target (eased follow)
      s.cx += (s.tx - s.cx) * 0.08
      s.cy += (s.ty - s.cy) * 0.08
      s.cgx += (s.gx - s.cgx) * 0.10
      s.cgy += (s.gy - s.cgy) * 0.10
      if (cardRef.current) {
        cardRef.current.style.transform =
          `rotateY(${s.cx * MAX_TILT}deg) rotateX(${-s.cy * MAX_TILT}deg)`
      }
      if (glareRef.current) {
        glareRef.current.style.background =
          `radial-gradient(circle at ${s.cgx}% ${s.cgy}%, rgba(255,255,255,0.4), rgba(255,255,255,0.1) 28%, transparent 58%)`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  function onMove(e) {
    const r = wrapRef.current.getBoundingClientRect()
    const s = st.current
    const nx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2
    const ny = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2
    s.hovering = true
    s.tx = Math.max(-1, Math.min(1, nx))
    s.ty = Math.max(-1, Math.min(1, ny))
    s.gx = ((e.clientX - r.left) / Math.max(1, r.width)) * 100
    s.gy = ((e.clientY - r.top) / Math.max(1, r.height)) * 100
  }

  function onLeave() {
    st.current.hovering = false
  }

  return (
    <div
      ref={wrapRef}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`relative select-none ${className}`}
      style={{ perspective: '1100px', cursor: 'grab' }}
    >
      <div
        ref={cardRef}
        className={`relative overflow-hidden rounded-xl border-2 ${cover ? 'h-full w-full' : ''}`}
        style={{
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          borderColor: 'var(--red)',
          boxShadow: '0 0 70px color-mix(in srgb, var(--red) 45%, transparent)',
        }}
      >
        <img
          key={src}
          src={src}
          alt={alt}
          draggable="false"
          onError={retryImageFromFallback}
          className={cover ? 'cx-fade-in h-full w-full object-cover' : 'block max-h-[78vh] w-auto'}
        />
        {glare && <div ref={glareRef} className="pointer-events-none absolute inset-0" style={{ mixBlendMode: 'screen', opacity: 0.85 }} />}
      </div>
    </div>
  )
}
