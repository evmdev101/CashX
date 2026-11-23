"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { THEMES, themeLabel } from './themes'
import { BG_PATTERNS } from './themeEffects'

type ThemePalette = {
  bg: string
  fg: string
  panel: string
  border: string
  red: string
}

type ThemeFx = {
  pattern: string
  effectColor: string
  intensity: number
  size: number
  frosted: boolean
}

type ThemeName = keyof typeof THEMES

type ThemePickerProps = {
  activeName: string
  colors: ThemePalette
  fx: ThemeFx
  onPickTheme: (name: ThemeName) => void
  onCustomColors: (colors: ThemePalette) => void
  onFx: (fx: ThemeFx) => void
}

type SnapZone = 'left' | 'right' | 'full' | null
type WindowPosition = { left: number; top: number }
type WindowSize = { width: number; height: number }
type DragState = {
  active: boolean
  startX: number
  startY: number
  baseLeft: number
  baseTop: number
}

// Draggable floating theme window — opens centered, drag the title bar to
// move, snap to a screen edge to dock (left/right half) or the top for
// fullscreen. Minimize / Peek / Close in the title bar. Behavior modeled
// on the odysseus window manager this theme system comes from.

// Snap-zone thresholds (cursor distance from an edge, px)
const TOP_SNAP = 14
const SIDE_SNAP = 48

// Shown once per session
let proTipSeen = false

function zoneFor(x: number, y: number): SnapZone {
  if (y <= TOP_SNAP) return 'full'          // top edge wins → fullscreen
  if (x <= SIDE_SNAP) return 'left'
  if (x >= window.innerWidth - SIDE_SNAP) return 'right'
  return null
}

function snapStyle(snap: Exclude<SnapZone, null>): CSSProperties {
  if (snap === 'full') return { inset: 0, width: 'auto', height: 'auto' }
  if (snap === 'left') return { left: 0, top: 0, width: 'min(50vw, 480px)', height: '100vh' }
  if (snap === 'right') return { right: 0, left: 'auto', top: 0, width: 'min(50vw, 480px)', height: '100vh' }
  return {}
}

function hintStyle(zone: Exclude<SnapZone, null>): CSSProperties {
  if (zone === 'full') return { inset: 0 }
  if (zone === 'left') return { left: 0, top: 0, width: '50vw', height: '100vh' }
  if (zone === 'right') return { right: 0, top: 0, width: '50vw', height: '100vh' }
  return {}
}

export default function ThemePicker({
  activeName,
  colors,
  fx,
  onPickTheme,
  onCustomColors,
  onFx,
}: ThemePickerProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'themes' | 'customize'>('themes')
  const [draft, setDraft] = useState<ThemePalette>(colors)

  // Window state
  const [pos, setPos] = useState<WindowPosition | null>(null)
  const [snap, setSnap] = useState<SnapZone>(null)
  const [hint, setHint] = useState<SnapZone>(null)
  const [minimized, setMinimized] = useState(false)
  const [peek, setPeek] = useState(false)
  const [showTip, setShowTip] = useState(false)

  const [winSize, setWinSize] = useState<WindowSize | null>(null)
  const winRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<DragState>({
    active: false,
    startX: 0,
    startY: 0,
    baseLeft: 0,
    baseTop: 0,
  })

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Center the window when it opens (before paint, so no flash)
  useLayoutEffect(() => {
    if (open && pos == null && snap == null && winRef.current) {
      const r = winRef.current.getBoundingClientRect()
      setWinSize({ width: r.width, height: r.height })
      setPos({
        left: Math.max(8, (window.innerWidth - r.width) / 2),
        top: Math.max(16, (window.innerHeight - r.height) / 2),
      })
    }
  }, [open, pos, snap])

  function launch() {
    setTab('themes')
    setDraft(colors)
    setMinimized(false)
    setPeek(false)
    setSnap(null)
    setPos(null)          // forces re-center on next open
    setOpen(true)
    if (!proTipSeen) setShowTip(true)
  }

  // ── Drag / snap ──────────────────────────────────────────
  function onHeaderPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.target instanceof Element && e.target.closest('button')) return
    const r = winRef.current?.getBoundingClientRect()
    if (!r) return
    // Un-snap into a free window at its current spot, then follow the cursor
    setSnap(null)
    setPos({ left: r.left, top: r.top })
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, baseLeft: r.left, baseTop: r.top }
    // Capture on the header (the element with the move/up handlers) so the
    // drag keeps tracking even when the cursor outruns the window.
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }

  function onHeaderPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return
    const { startX, startY, baseLeft, baseTop } = drag.current
    setPos({ left: baseLeft + (e.clientX - startX), top: baseTop + (e.clientY - startY) })
    setHint(zoneFor(e.clientX, e.clientY))
  }

  function onHeaderPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return
    drag.current.active = false
    const z = zoneFor(e.clientX, e.clientY)
    setHint(null)
    if (z) setSnap(z)
  }

  function dismissTip() {
    proTipSeen = true
    setShowTip(false)
  }

  const FIELDS: Array<[keyof ThemePalette, string]> = [
    ['bg', 'Background'],
    ['fg', 'Text'],
    ['panel', 'Panel'],
    ['border', 'Border'],
    ['red', 'Accent'],
  ]

  const border = 'color-mix(in srgb, var(--border) 72%, transparent)'
  const isDocked = snap === 'left' || snap === 'right' || snap === 'full'

  // Window position/size: snapped → inset styles; free → pos; unmeasured → centered
  const posStyle = snap
    ? snapStyle(snap)
    : pos
      ? { left: pos.left, top: pos.top, width: 'min(540px, calc(100vw - 24px))' }
      : { left: '50%', top: 72, transform: 'translateX(-50%)', width: 'min(540px, calc(100vw - 24px))' }

  return (
    <>
      <button
        type="button"
        onClick={launch}
        className="btn-ghost flex h-9 items-center gap-2 px-3 text-xs"
        aria-haspopup="dialog"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a7 7 0 0 0 0 20 4 4 0 0 1 0-8 4 4 0 0 0 0-8" />
          <circle cx="8" cy="9" r="1.5" fill="currentColor" />
          <circle cx="15" cy="14" r="1.5" fill="currentColor" />
          <circle cx="9" cy="15" r="1.5" fill="currentColor" />
        </svg>
        Theme
      </button>

      {/* Live snap-zone hint while dragging */}
      {hint && (
        <div
          className="fixed"
          style={{
            ...hintStyle(hint),
            zIndex: 490,
            background: 'color-mix(in srgb, var(--red) 12%, transparent)',
            border: '2px dashed color-mix(in srgb, var(--red) 60%, transparent)',
            pointerEvents: 'none',
          }}
        />
      )}

      {open && (
        <div
          ref={winRef}
          className="panel fixed flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="false"
          aria-label="Theme picker"
          style={{
            ...posStyle,
            zIndex: 500,
            maxHeight: isDocked ? '100vh' : '82vh',
            borderRadius: snap === 'full' ? 0 : undefined,
            opacity: peek ? 0.4 : 1,
            transition: 'opacity 0.15s',
            boxShadow: '0 28px 90px rgba(0,0,0,0.6), 0 0 48px color-mix(in srgb, var(--red) 20%, transparent)',
          }}
        >
          {/* Title bar (drag handle) */}
          <div
            className="flex shrink-0 items-center justify-between border-b px-4 py-3 select-none"
            style={{ borderColor: border, cursor: 'grab', touchAction: 'none' }}
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={onHeaderPointerUp}
          >
            <div className="accent text-sm font-bold">◐ Theme</div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPeek(p => !p)}
                className="btn-ghost flex h-6 items-center gap-1 px-2 text-[10px]"
                style={peek ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
                title="Peek — fade the window to preview the page behind it"
              >
                ◔ Peek
              </button>
              <button
                type="button"
                onClick={() => setMinimized(m => !m)}
                className="btn-ghost flex h-6 w-6 items-center justify-center text-xs"
                aria-label={minimized ? 'Restore' : 'Minimize'}
                title={minimized ? 'Restore' : 'Minimize'}
              >
                {minimized ? '▢' : '—'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost flex h-6 w-6 items-center justify-center text-xs"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Tabs */}
              <div className="flex shrink-0 gap-1 border-b px-4" style={{ borderColor: border }}>
                {([['themes', '◐ Themes'], ['customize', '✎ Customize']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className="px-3 py-2.5 text-xs"
                    style={{
                      color: tab === key ? 'var(--red)' : 'inherit',
                      borderBottom: tab === key ? '2px solid var(--red)' : '2px solid transparent',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {tab === 'themes' ? (
                  <div className="rounded-lg border p-4" style={{ borderColor: border }}>
                    <div className="mb-3 border-b pb-2 text-sm font-bold" style={{ borderColor: border }}>
                      Default Themes
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {(Object.entries(THEMES) as Array<[ThemeName, ThemePalette]>).map(([name, c]) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => onPickTheme(name)}
                          className="theme-palette-button flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md border text-[10px] leading-none"
                          style={{
                            background: c.bg,
                            color: c.fg,
                            borderColor: name === activeName ? 'var(--red)' : border,
                            boxShadow: name === activeName ? '0 0 0 2px color-mix(in srgb, var(--red) 30%, transparent)' : 'none',
                          }}
                        >
                          <span className="flex" aria-hidden="true">
                            {[c.bg, c.panel, c.fg, c.red].map((dot, i) => (
                              <span
                                key={i}
                                className="h-3.5 w-3.5 rounded-full"
                                style={{ background: dot, boxShadow: '0 0 0 1px rgba(255,255,255,0.16)', marginLeft: i > 0 ? '-4px' : 0 }}
                              />
                            ))}
                          </span>
                          <span>{themeLabel(name)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border p-4" style={{ borderColor: border }}>
                    <div className="mb-3 border-b pb-2 text-sm font-bold" style={{ borderColor: border }}>
                      Colors
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {FIELDS.map(([field, label]) => (
                        <label key={field} className="muted flex items-center justify-between gap-3 text-xs">
                          {label}
                          <input
                            type="color"
                            value={draft[field] || '#000000'}
                            onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                            className="h-8 w-11 cursor-pointer rounded-full border bg-transparent p-0"
                            style={{ borderColor: border }}
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onCustomColors(draft)}
                      className="btn-ghost mt-4 w-full py-2 text-xs"
                      style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                    >
                      Apply Custom Theme
                    </button>

                    {/* Background animation controls */}
                    <div className="mb-3 mt-6 border-b pb-2 text-sm font-bold" style={{ borderColor: border }}>
                      Background
                    </div>
                    <div className="space-y-3">
                      <label className="muted flex items-center justify-between gap-3 text-xs">
                        Animation
                        <select
                          value={fx.pattern}
                          onChange={e => onFx({ ...fx, pattern: e.target.value })}
                          className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
                          style={{ borderColor: border, background: 'var(--panel)', color: 'var(--fg)' }}
                        >
                          {BG_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </label>
                      <label className="muted flex items-center justify-between gap-3 text-xs">
                        Effect color
                        <input
                          type="color"
                          value={fx.effectColor || colors.fg || '#9cdef2'}
                          onChange={e => onFx({ ...fx, effectColor: e.target.value })}
                          className="h-8 w-11 cursor-pointer rounded-full border bg-transparent p-0"
                          style={{ borderColor: border }}
                        />
                      </label>
                      <label className="muted flex items-center justify-between gap-3 text-xs">
                        Intensity
                        <input
                          type="range" min="0" max="100"
                          value={Math.round(fx.intensity * 100)}
                          onChange={e => onFx({ ...fx, intensity: Number(e.target.value) / 100 })}
                          className="w-36 accent-[var(--red)]"
                        />
                      </label>
                      <label className="muted flex items-center justify-between gap-3 text-xs">
                        Size
                        <input
                          type="range" min="30" max="250"
                          value={Math.round(fx.size * 100)}
                          onChange={e => onFx({ ...fx, size: Number(e.target.value) / 100 })}
                          className="w-36 accent-[var(--red)]"
                        />
                      </label>
                      <label className="muted flex cursor-pointer items-center justify-between gap-3 text-xs">
                        Frosted glass
                        <input
                          type="checkbox"
                          checked={fx.frosted}
                          onChange={e => onFx({ ...fx, frosted: e.target.checked })}
                          className="h-4 w-4 accent-[var(--red)]"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Pro tip — shown once per session, docked to the right of the window */}
      {open && showTip && !minimized && !snap && pos && winSize && (
        <div
          className="panel fixed w-[260px] p-4"
          style={{
            zIndex: 510,
            left: Math.min(pos.left + winSize.width + 16, window.innerWidth - 276),
            top: pos.top,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          <div className="accent mb-2 flex justify-center">
            <svg viewBox="0 0 100 60" width="160" height="96" aria-hidden="true">
              {/* ambient frame */}
              <rect x="0.5" y="0.5" width="99" height="59" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.18" />
              {/* snap-zone preview (right half) */}
              <rect className="th-zone" x="51" y="2" width="47" height="56" rx="2" fill="currentColor" opacity="0" />
              {/* the modal being dragged */}
              <g className="th-modal-group">
                <rect x="22" y="20" width="34" height="22" rx="2.5" fill="var(--bg)" stroke="currentColor" strokeWidth="1.2" />
                <rect x="22" y="20" width="34" height="5" rx="2.5" fill="currentColor" opacity="0.35" />
              </g>
              {/* cursor */}
              <path className="th-cursor" d="M0 0 L0 9 L2.5 7 L4.5 10 L6 9 L4 6 L7 6 Z" fill="currentColor" />
            </svg>
          </div>
          <p className="text-xs leading-5">
            <span className="accent font-bold">Pro tip:</span> drag the window&apos;s
            title bar to a screen edge to snap it. Drag to the top for fullscreen.
          </p>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={dismissTip} className="btn-accent px-4 py-1.5 text-xs font-bold">Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
