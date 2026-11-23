// @ts-nocheck
// Theme presets — ported unchanged from evmdev101/cashmoney-mint.
// (static/js/theme.js THEMES object), as specified in the design brief.
// Each theme: bg / fg / panel / border / red (accent).

export const THEMES = {
  dark:       { bg: '#282c34', fg: '#9cdef2', panel: '#111111', border: '#355a66', red: '#e06c75' },
  light:      { bg: '#f0ebe3', fg: '#5a5248', panel: '#faf6f0', border: '#d4cdc2', red: '#c47d5a' },
  midnight:   { bg: '#0d1117', fg: '#c9d1d9', panel: '#161b22', border: '#30363d', red: '#f85149' },
  paper:      { bg: '#faf8f5', fg: '#3b3836', panel: '#ffffff', border: '#d5d0c8', red: '#c5ac4a' },
  cyberpunk:  { bg: '#0a0a0f', fg: '#0ff0fc', panel: '#12101a', border: '#9b30ff', red: '#e040fb' },
  retrowave:  { bg: '#1a1a2e', fg: '#e94560', panel: '#16213e', border: '#533483', red: '#e94560' },
  forest:     { bg: '#1b2a1b', fg: '#a8d5a2', panel: '#142414', border: '#3d6b3d', red: '#7cb871' },
  ocean:      { bg: '#0b1a2c', fg: '#64d2ff', panel: '#091422', border: '#1e5074', red: '#4facfe' },
  ume:        { bg: '#2b1b2e', fg: '#f5c2e7', panel: '#1e1420', border: '#6c4675', red: '#f5a0c0' },
  copper:     { bg: '#1c1410', fg: '#e8c39e', panel: '#140f0a', border: '#7a5533', red: '#d4764e' },
  terminal:   { bg: '#000000', fg: '#00ff41', panel: '#0a0a0a', border: '#003b00', red: '#00ff41' },
  organs:     { bg: '#0a0406', fg: '#efe1c8', panel: '#15080a', border: '#3a1519', red: '#c83240' },
  lavender:   { bg: '#f3eef8', fg: '#3d3551', panel: '#faf7ff', border: '#cec3de', red: '#9b6dcc' },
  gpt:        { bg: '#212121', fg: '#ececec', panel: '#171717', border: '#424242', red: '#949494' },
  claude:     { bg: '#262624', fg: '#f5f4f0', panel: '#30302e', border: '#4a4a47', red: '#c6613f' },
  cute:       { bg: '#fff0f5', fg: '#d4608a', panel: '#fff8fa', border: '#f0c0d0', red: '#ff6b9d' },
}

export const DEFAULT_THEME = 'cyberpunk'

// Per-theme background animation defaults — same values as odysseus.
export const THEME_DEFAULT_PATTERN = {
  dark: 'none',
  light: 'dots',
  midnight: 'rain',
  paper: 'dots',
  cyberpunk: 'constellations',
  retrowave: 'embers',
  forest: 'petals',
  ocean: 'constellations',
  terminal: 'perlin-flow',
  organs: 'rain',
  ume: 'petals',
  cute: 'sparkles',
}

export const THEME_DEFAULT_EFFECT_COLOR = {
  midnight: '#ffffff',
  organs: '#451616',
  cute: '#ff8cb8',
  ume: '#f5a0c0',
}

export const THEME_DEFAULT_INTENSITY = {
  midnight: 0.5,
  terminal: 0.8,
  organs: 0.65,
}

export const THEME_DEFAULT_FROSTED = {
  lavender: true,
}

// Effect settings a theme starts with when picked.
export function defaultFx(name) {
  return {
    pattern: THEME_DEFAULT_PATTERN[name] || 'none',
    effectColor: THEME_DEFAULT_EFFECT_COLOR[name] || '',
    intensity: THEME_DEFAULT_INTENSITY[name] !== undefined ? THEME_DEFAULT_INTENSITY[name] : 1,
    size: 1,
    frosted: THEME_DEFAULT_FROSTED[name] === true,
  }
}

// Display labels (odysseus shows 'dark' as "original" and 'gpt' as "GPT")
export function themeLabel(name) {
  if (name === 'dark') return 'original'
  if (name === 'gpt') return 'GPT'
  return name
}

// Apply a theme's colors as CSS variables on <html> — same variable
// names odysseus uses (--bg, --fg, --panel, --border, --red).
export function applyTheme(colors) {
  const s = document.documentElement.style
  s.setProperty('--bg', colors.bg)
  s.setProperty('--fg', colors.fg)
  s.setProperty('--panel', colors.panel)
  s.setProperty('--border', colors.border)
  s.setProperty('--red', colors.red)
}
