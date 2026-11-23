"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  applyBgEffectColor,
  applyBgEffectIntensity,
  applyBgEffectSize,
  applyBgPattern,
  applyFrostedGlass,
  BG_PATTERNS,
} from "./themeEffects";

type ThemeColors = {
  bg: string;
  fg: string;
  panel: string;
  border: string;
  red: string;
};

type BackgroundSettings = {
  pattern: string;
  effectColor: string;
  intensity: number;
  size: number;
  frosted: boolean;
};

type StoredTheme = {
  name: string;
  colors: ThemeColors;
  background: BackgroundSettings;
};

type WindowPosition = { left: number; top: number };
type SnapZone = "left" | "right" | "full" | null;

const topSnapDistance = 14;
const sideSnapDistance = 48;
let proTipSeen = false;

function snapZoneFor(x: number, y: number): SnapZone {
  if (y <= topSnapDistance) return "full";
  if (x <= sideSnapDistance) return "left";
  if (x >= window.innerWidth - sideSnapDistance) return "right";
  return null;
}

function snappedWindowStyle(zone: Exclude<SnapZone, null>): CSSProperties {
  if (zone === "full") {
    return { inset: 0, width: "auto", height: "auto", maxHeight: "none", transform: "none", borderRadius: 0 };
  }
  if (zone === "left") {
    return { left: 0, top: 0, right: "auto", width: "min(50vw, 480px)", height: "100vh", maxHeight: "none", transform: "none" };
  }
  return { right: 0, left: "auto", top: 0, width: "min(50vw, 480px)", height: "100vh", maxHeight: "none", transform: "none" };
}

// Exact presets from cashmoney-mint/src/themes.js.
const themes: Record<string, ThemeColors> = {
  dark: { bg: "#282c34", fg: "#9cdef2", panel: "#111111", border: "#355a66", red: "#e06c75" },
  light: { bg: "#f0ebe3", fg: "#5a5248", panel: "#faf6f0", border: "#d4cdc2", red: "#c47d5a" },
  midnight: { bg: "#0d1117", fg: "#c9d1d9", panel: "#161b22", border: "#30363d", red: "#f85149" },
  paper: { bg: "#faf8f5", fg: "#3b3836", panel: "#ffffff", border: "#d5d0c8", red: "#c5ac4a" },
  cyberpunk: { bg: "#0a0a0f", fg: "#0ff0fc", panel: "#12101a", border: "#9b30ff", red: "#e040fb" },
  retrowave: { bg: "#1a1a2e", fg: "#e94560", panel: "#16213e", border: "#533483", red: "#e94560" },
  forest: { bg: "#1b2a1b", fg: "#a8d5a2", panel: "#142414", border: "#3d6b3d", red: "#7cb871" },
  ocean: { bg: "#0b1a2c", fg: "#64d2ff", panel: "#091422", border: "#1e5074", red: "#4facfe" },
  ume: { bg: "#2b1b2e", fg: "#f5c2e7", panel: "#1e1420", border: "#6c4675", red: "#f5a0c0" },
  copper: { bg: "#1c1410", fg: "#e8c39e", panel: "#140f0a", border: "#7a5533", red: "#d4764e" },
  terminal: { bg: "#000000", fg: "#00ff41", panel: "#0a0a0a", border: "#003b00", red: "#00ff41" },
  organs: { bg: "#0a0406", fg: "#efe1c8", panel: "#15080a", border: "#3a1519", red: "#c83240" },
  lavender: { bg: "#f3eef8", fg: "#3d3551", panel: "#faf7ff", border: "#cec3de", red: "#9b6dcc" },
  gpt: { bg: "#212121", fg: "#ececec", panel: "#171717", border: "#424242", red: "#949494" },
  claude: { bg: "#262624", fg: "#f5f4f0", panel: "#30302e", border: "#4a4a47", red: "#c6613f" },
  cute: { bg: "#fff0f5", fg: "#d4608a", panel: "#fff8fa", border: "#f0c0d0", red: "#ff6b9d" },
};

const storageKey = "limited-exchange-theme-v2";
const defaultThemeName = "midnight";
const defaultBackground: BackgroundSettings = {
  pattern: "none",
  effectColor: "",
  intensity: 1,
  size: 1,
  frosted: false,
};

const themeDefaults: Record<string, Partial<BackgroundSettings>> = {
  light: { pattern: "dots" },
  midnight: { pattern: "constellations", effectColor: "#ffffff", intensity: 0.5 },
  paper: { pattern: "dots" },
  cyberpunk: { pattern: "synapse" },
  retrowave: { pattern: "embers" },
  forest: { pattern: "petals" },
  ocean: { pattern: "constellations" },
  terminal: { pattern: "perlin-flow", intensity: 0.8 },
  organs: { pattern: "rain", effectColor: "#451616", intensity: 0.65 },
  ume: { pattern: "petals", effectColor: "#f5a0c0" },
  lavender: { frosted: true },
  cute: { pattern: "sparkles", effectColor: "#ff8cb8" },
};

const defaultThemeBackground: BackgroundSettings = {
  ...defaultBackground,
  ...themeDefaults[defaultThemeName],
};

function displayName(name: string) {
  if (name === "dark") return "original";
  if (name === "gpt") return "GPT";
  return name;
}

function applyColors(colors: ThemeColors) {
  const style = document.documentElement.style;
  Object.entries(colors).forEach(([key, value]) => style.setProperty(`--${key}`, value));
  const rgb = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(colors.bg);
  if (rgb) {
    const brightness = parseInt(rgb[1], 16) * 299 + parseInt(rgb[2], 16) * 587 + parseInt(rgb[3], 16) * 114;
    style.colorScheme = brightness >= 128000 ? "light" : "dark";
  }
}

function applyBackground(settings: BackgroundSettings) {
  applyBgEffectColor(settings.effectColor);
  applyBgEffectIntensity(settings.intensity);
  applyBgEffectSize(settings.size);
  applyFrostedGlass(settings.frosted);
  applyBgPattern(settings.pattern);
}

function saveTheme(name: string, colors: ThemeColors, background: BackgroundSettings) {
  localStorage.setItem(storageKey, JSON.stringify({ name, colors, background } satisfies StoredTheme));
}

export default function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<"themes" | "customize">("themes");
  const [activeName, setActiveName] = useState(defaultThemeName);
  const [colors, setColors] = useState<ThemeColors>(themes[defaultThemeName]);
  const [draft, setDraft] = useState<ThemeColors>(themes[defaultThemeName]);
  const [background, setBackground] = useState<BackgroundSettings>(defaultThemeBackground);
  const [position, setPosition] = useState<WindowPosition | null>(null);
  const [snap, setSnap] = useState<SnapZone>(null);
  const [snapHint, setSnapHint] = useState<SnapZone>(null);
  const [dragging, setDragging] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipPosition, setTipPosition] = useState<WindowPosition | null>(null);
  const windowRef = useRef<HTMLElement>(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseLeft: 0, baseTop: 0 });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        applyColors(themes[defaultThemeName]);
        applyBackground(defaultThemeBackground);
        return;
      }
      const parsed = JSON.parse(saved) as StoredTheme;
      if (!parsed.colors || !parsed.background) return;
      setActiveName(parsed.name || "custom");
      setColors(parsed.colors);
      setDraft(parsed.colors);
      setBackground(parsed.background);
      applyColors(parsed.colors);
      applyBackground(parsed.background);
    } catch {
      localStorage.removeItem(storageKey);
      applyColors(themes[defaultThemeName]);
      applyBackground(defaultThemeBackground);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !showTip || minimized || snap || !windowRef.current) {
      setTipPosition(null);
      return;
    }

    const dialogRect = windowRef.current.getBoundingClientRect();
    const tipWidth = 260;
    const tipHeight = 240;
    const gap = 16;
    const margin = 12;
    const rightPosition = dialogRect.right + gap;
    const leftPosition = dialogRect.left - tipWidth - gap;
    const left = rightPosition + tipWidth <= window.innerWidth - margin
      ? rightPosition
      : Math.max(margin, leftPosition);
    const top = Math.min(
      Math.max(margin, dialogRect.top),
      Math.max(margin, window.innerHeight - tipHeight - margin),
    );

    setTipPosition({ left, top });
  }, [minimized, open, position, showTip, snap]);

  function pickTheme(name: string) {
    const nextColors = themes[name];
    const nextBackground = {
      ...defaultBackground,
      ...themeDefaults[name],
    };
    setActiveName(name);
    setColors(nextColors);
    setDraft(nextColors);
    setBackground(nextBackground);
    applyColors(nextColors);
    applyBackground(nextBackground);
    saveTheme(name, nextColors, nextBackground);
  }

  function applyCustomTheme() {
    setActiveName("custom");
    setColors(draft);
    applyColors(draft);
    saveTheme("custom", draft, background);
  }

  function changeBackground(next: BackgroundSettings) {
    setBackground(next);
    applyBackground(next);
    saveTheme(activeName, colors, next);
  }

  function launchPicker() {
    setTab("themes");
    setMinimized(false);
    setPosition(null);
    setSnap(null);
    setSnapHint(null);
    setOpen(true);
    if (!proTipSeen) setShowTip(true);
  }

  function dismissTip() {
    proTipSeen = true;
    setShowTip(false);
  }

  function onHeaderPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as Element).closest("button")) return;
    const rect = windowRef.current?.getBoundingClientRect();
    if (!rect) return;

    setSnap(null);
    setPosition({ left: rect.left, top: rect.top });
    setDragging(true);
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      baseLeft: rect.left,
      baseTop: rect.top,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onHeaderPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!dragRef.current.active) return;
    const { startX, startY, baseLeft, baseTop } = dragRef.current;
    const rect = windowRef.current?.getBoundingClientRect();
    const minimumVisible = 72;
    const width = rect?.width ?? 540;
    const height = rect?.height ?? 48;
    const nextLeft = baseLeft + event.clientX - startX;
    const nextTop = baseTop + event.clientY - startY;

    setPosition({
      left: Math.min(window.innerWidth - minimumVisible, Math.max(minimumVisible - width, nextLeft)),
      top: Math.min(window.innerHeight - 42, Math.max(0, Math.min(nextTop, window.innerHeight - Math.min(height, 48)))),
    });
    setSnapHint(snapZoneFor(event.clientX, event.clientY));
  }

  function onHeaderPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setDragging(false);
    const nextSnap = snapZoneFor(event.clientX, event.clientY);
    setSnapHint(null);
    if (nextSnap) setSnap(nextSnap);
  }

  function onHeaderLostPointerCapture() {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setDragging(false);
    setSnapHint(null);
  }

  const windowStyle: CSSProperties | undefined = snap
    ? snappedWindowStyle(snap)
    : position
      ? { left: position.left, top: position.top, right: "auto", transform: "none" }
      : undefined;

  return (
    <>
      <button
        className="theme-launcher"
        type="button"
        onClick={launchPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden="true">◉</span> Theme
      </button>

      {snapHint && <div className={`theme-snap-hint ${snapHint}`} aria-hidden="true" />}

      {open && (
        <section ref={windowRef} className={`theme-window${minimized ? " minimized" : ""}${dragging ? " dragging" : ""}${snap ? ` snapped ${snap}` : ""}`} role="dialog" aria-label="Theme picker" style={windowStyle}>
          <header
            className="theme-window-title"
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={onHeaderPointerUp}
            onLostPointerCapture={onHeaderLostPointerCapture}
            title="Drag to move. Drop at an edge to snap."
          >
            <strong>◉ Theme</strong>
            <div>
              <button type="button" onClick={() => setMinimized((value) => !value)} aria-label={minimized ? "Restore theme window" : "Minimize theme window"}>
                {minimized ? "□" : "−"}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close theme window">×</button>
            </div>
          </header>

          {!minimized && (
            <>
              <div className="theme-tabs" role="tablist" aria-label="Theme options">
                <button type="button" role="tab" aria-selected={tab === "themes"} className={tab === "themes" ? "active" : ""} onClick={() => setTab("themes")}>◉ Themes</button>
                <button type="button" role="tab" aria-selected={tab === "customize"} className={tab === "customize" ? "active" : ""} onClick={() => setTab("customize")}>⌕ Customize</button>
              </div>

              <div className="theme-window-body">
                {tab === "themes" ? (
                  <div className="theme-group">
                    <h3>Default Themes</h3>
                    <div className="theme-presets">
                      {Object.entries(themes).map(([name, palette]) => (
                        <button
                          key={name}
                          type="button"
                          className={activeName === name ? "selected" : ""}
                          onClick={() => pickTheme(name)}
                          style={{ background: palette.bg, color: palette.fg, borderColor: activeName === name ? colors.red : palette.border }}
                          aria-label={`Use ${displayName(name)} theme`}
                        >
                          <span className="palette-dots" aria-hidden="true">
                            {[palette.bg, palette.panel, palette.fg, palette.red].map((color, index) => (
                              <i key={`${color}-${index}`} style={{ background: color }} />
                            ))}
                          </span>
                          <span>{displayName(name)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="theme-group">
                    <h3>Colors</h3>
                    <div className="color-controls">
                      {([
                        ["bg", "Background"],
                        ["fg", "Text"],
                        ["panel", "Panel"],
                        ["border", "Border"],
                        ["red", "Accent"],
                      ] as const).map(([field, label]) => (
                        <label key={field}>
                          <span>{label}</span>
                          <input type="color" value={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} />
                        </label>
                      ))}
                    </div>
                    <button className="apply-theme" type="button" onClick={applyCustomTheme}>Apply Custom Theme</button>

                    <h3 className="background-heading">Background</h3>
                    <div className="background-controls">
                      <label>
                        <span>Animation</span>
                        <select value={background.pattern} onChange={(event) => changeBackground({ ...background, pattern: event.target.value })}>
                          {BG_PATTERNS.map((pattern: string) => <option key={pattern} value={pattern}>{pattern}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Effect color</span>
                        <input type="color" value={background.effectColor || colors.fg} onChange={(event) => changeBackground({ ...background, effectColor: event.target.value })} />
                      </label>
                      <label>
                        <span>Intensity</span>
                        <input type="range" min="0" max="100" value={Math.round(background.intensity * 100)} onChange={(event) => changeBackground({ ...background, intensity: Number(event.target.value) / 100 })} />
                      </label>
                      <label>
                        <span>Size</span>
                        <input type="range" min="30" max="250" value={Math.round(background.size * 100)} onChange={(event) => changeBackground({ ...background, size: Number(event.target.value) / 100 })} />
                      </label>
                      <label>
                        <span>Frosted glass</span>
                        <input type="checkbox" checked={background.frosted} onChange={(event) => changeBackground({ ...background, frosted: event.target.checked })} />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {open && showTip && !minimized && !snap && tipPosition && (
        <aside className="theme-pro-tip" aria-label="Theme window pro tip" style={{ left: tipPosition.left, top: tipPosition.top }}>
          <div className="theme-tip-demo" aria-hidden="true">
            <svg viewBox="0 0 100 60" width="160" height="96">
              <rect x="0.5" y="0.5" width="99" height="59" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.18" />
              <rect className="th-zone" x="51" y="2" width="47" height="56" rx="2" fill="currentColor" opacity="0" />
              <g className="th-modal-group">
                <rect x="22" y="20" width="34" height="22" rx="2.5" fill="var(--bg)" stroke="currentColor" strokeWidth="1.2" />
                <rect x="22" y="20" width="34" height="5" rx="2.5" fill="currentColor" opacity="0.35" />
              </g>
              <path className="th-cursor" d="M0 0 L0 9 L2.5 7 L4.5 10 L6 9 L4 6 L7 6 Z" fill="currentColor" />
            </svg>
          </div>
          <p><strong>Pro tip:</strong> drag the window&apos;s title bar to a screen edge to snap it. Drag to the top for fullscreen.</p>
          <button type="button" onClick={dismissTip}>Got it</button>
        </aside>
      )}
    </>
  );
}
