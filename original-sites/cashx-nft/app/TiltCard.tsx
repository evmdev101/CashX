import { useEffect, useRef } from "react";

// Pointer-driven 3D sway with a moving light glare, adapted from the
// cashmoney-mint viewer. Motion is damped in a rAF loop (lerp toward target)
// and written straight to the DOM so the tilt never triggers a React render.

const MAX_TILT = 14;

export function TiltCard({
  src,
  alt,
  light,
}: {
  src: string;
  alt: string;
  light: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    tx: 0,
    ty: 0,
    cx: 0,
    cy: 0,
    gx: 50,
    gy: 42,
    cgx: 50,
    cgy: 42,
    hovering: false,
  });

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = state.current;
    let frame = 0;
    let t = 0;

    const loop = () => {
      t += 0.016;

      // Gentle idle sway, but only for visitors who accept motion.
      if (!s.hovering && !reduceMotion) {
        s.tx = Math.sin(t * 0.6) * 0.28;
        s.ty = Math.cos(t * 0.45) * 0.2;
        s.gx = 50 + Math.sin(t * 0.6) * 20;
        s.gy = 42 + Math.cos(t * 0.45) * 16;
      }

      s.cx += (s.tx - s.cx) * 0.08;
      s.cy += (s.ty - s.cy) * 0.08;
      s.cgx += (s.gx - s.cgx) * 0.1;
      s.cgy += (s.gy - s.cgy) * 0.1;

      if (cardRef.current) {
        cardRef.current.style.transform =
          `rotateY(${s.cx * MAX_TILT}deg) rotateX(${-s.cy * MAX_TILT}deg)`;
      }
      if (glareRef.current) {
        glareRef.current.style.background =
          `radial-gradient(circle at ${s.cgx}% ${s.cgy}%, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.1) 28%, transparent 58%)`;
      }

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = wrapRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const s = state.current;
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const nx = ((event.clientX - bounds.left) / width - 0.5) * 2;
    const ny = ((event.clientY - bounds.top) / height - 0.5) * 2;

    s.hovering = true;
    s.tx = Math.max(-1, Math.min(1, nx));
    s.ty = Math.max(-1, Math.min(1, ny));
    s.gx = ((event.clientX - bounds.left) / width) * 100;
    s.gy = ((event.clientY - bounds.top) / height) * 100;
  };

  const handleLeave = () => {
    state.current.hovering = false;
  };

  return (
    <div
      className="tilt-wrap"
      ref={wrapRef}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div className="tilt-card" ref={cardRef}>
        <img className="tilt-art" src={src} alt={alt} draggable={false} />
        {light && <div className="tilt-glare" ref={glareRef} aria-hidden="true" />}
      </div>
    </div>
  );
}
