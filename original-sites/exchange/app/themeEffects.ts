// @ts-nocheck — direct port of evmdev101/cashmoney-mint src/lib/themeEffects.js
// Background effects engine — ported from pewdiepie's odysseus
// (static/js/theme.js), the origin of this site's theme system.
// Each effect is a self-cleaning canvas loop: it stops and removes its
// canvas as soon as its body class disappears, so switching patterns is
// just applyBgPattern('next-one').

export function applyBgEffectColor(color) {
  document.documentElement.style.setProperty('--bg-effect-color', color || '')
}

export function applyBgEffectIntensity(v) {
  const n = (v === undefined || v === null || isNaN(v)) ? 1 : Math.max(0, Math.min(1, Number(v)))
  document.documentElement.style.setProperty('--bg-effect-intensity', String(n))
}

export function applyBgEffectSize(v) {
  const n = (v === undefined || v === null || isNaN(v)) ? 1 : Math.max(0.2, Math.min(3, Number(v)))
  document.documentElement.style.setProperty('--bg-effect-size', String(n))
}

export function applyFrostedGlass(on) {
  document.body.classList.toggle('theme-frosted', !!on)
}

function _getEffectSize() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bg-effect-size'))
  return isNaN(v) ? 1 : v
}

const _BG_CLASSES = ['bg-pattern-dots',
  'bg-pattern-synapse', 'bg-pattern-rain', 'bg-pattern-constellations',
  'bg-pattern-perlin-flow',
  'bg-pattern-petals', 'bg-pattern-sparkles', 'bg-pattern-embers']

export const BG_PATTERNS = ['none', 'dots', 'synapse', 'rain', 'constellations', 'perlin-flow', 'petals', 'sparkles', 'embers']

export function applyBgPattern(pattern) {
  const p = pattern || 'none'
  document.body.classList.remove(..._BG_CLASSES)
  document.querySelectorAll('#synapse-canvas, #rain-canvas, #constellations-canvas, #perlin-flow-canvas, #petals-canvas, #sparkles-canvas, #embers-canvas').forEach(c => c.remove())
  if (p !== 'none') document.body.classList.add('bg-pattern-' + p)
  const init = _CANVAS_PATTERNS[p]
  if (init) init()
}

function _effectColor(fallback = '#9cdef2') {
  const s = getComputedStyle(document.documentElement)
  return s.getPropertyValue('--bg-effect-color').trim() || s.getPropertyValue('--fg').trim() || fallback
}

function _makeCanvas(id) {
  const canvas = document.createElement('canvas')
  canvas.id = id
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;'
  document.body.prepend(canvas)
  return canvas
}

// ── Synapse — light pulses running along the CSS grid ──
function _initSynapse() {
  if (document.getElementById('synapse-canvas')) return
  const canvas = _makeCanvas('synapse-canvas')
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const GRID = 24, MAX_PULSES = 20, SPEED_MIN = 2, SPEED_MAX = 22, TRAIL_LEN = 12
  let W, H, cols, rows, pulses = []

  function resize() {
    W = window.innerWidth; H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    cols = Math.ceil(W / GRID); rows = Math.ceil(H / GRID)
  }
  resize()
  const _onResize = () => resize()
  window.addEventListener('resize', _onResize)

  function spawnPulse() {
    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)
    if (Math.random() > 0.5) {
      const row = Math.floor(Math.random() * (rows + 1))
      pulses.push({ x: -TRAIL_LEN, y: row * GRID, dx: speed, dy: 0 })
    } else {
      const col = Math.floor(Math.random() * (cols + 1))
      pulses.push({ x: col * GRID, y: -TRAIL_LEN, dx: 0, dy: speed })
    }
  }

  function draw() {
    if (!document.body.classList.contains('bg-pattern-synapse')) {
      window.removeEventListener('resize', _onResize)
      canvas.remove()
      return
    }
    requestAnimationFrame(draw)
    ctx.clearRect(0, 0, W, H)
    const c = _effectColor()
    if (pulses.length < MAX_PULSES && Math.random() < 0.12) spawnPulse()
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]
      p.x += p.dx; p.y += p.dy
      if (p.x > W + TRAIL_LEN || p.y > H + TRAIL_LEN) { pulses.splice(i, 1); continue }
      const tx = p.x - (p.dx > 0 ? TRAIL_LEN : 0)
      const ty = p.y - (p.dy > 0 ? TRAIL_LEN : 0)
      const grad = ctx.createLinearGradient(tx, ty, p.x, p.y)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(1, c)
      ctx.strokeStyle = grad
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke()
      ctx.globalAlpha = 0.55
      ctx.fillStyle = c
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  draw()
}

// ── Rain — thin vertical streaks falling ──
function _initRain() {
  if (document.getElementById('rain-canvas')) return
  const canvas = _makeCanvas('rain-canvas')
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let W, H
  const drops = []
  const MAX_DROPS = 130

  function resize() {
    W = window.innerWidth; H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  const _onResize = () => resize()
  window.addEventListener('resize', _onResize)

  function spawn() {
    const len = 20 + Math.random() * 40
    const speed = 4 + Math.random() * 8
    drops.push({ x: Math.random() * W, y: -len, len, speed, alpha: 0.32 + Math.random() * 0.28 })
  }

  function draw() {
    if (!document.body.classList.contains('bg-pattern-rain')) {
      window.removeEventListener('resize', _onResize)
      canvas.remove()
      return
    }
    requestAnimationFrame(draw)
    ctx.clearRect(0, 0, W, H)
    const c = _effectColor()
    const intenCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bg-effect-intensity'))
    const inten = isNaN(intenCss) ? 1 : intenCss
    const speedMult = 0.35 + inten * 0.65
    const sizeMult = _getEffectSize()

    if (drops.length < MAX_DROPS * inten && Math.random() < 0.6 * inten) spawn()

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      d.y += d.speed * speedMult
      if (d.y > H + d.len * sizeMult) { drops.splice(i, 1); continue }
      const effLen = d.len * sizeMult
      const grad = ctx.createLinearGradient(d.x, d.y - effLen, d.x, d.y)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(1, c)
      ctx.strokeStyle = grad
      ctx.globalAlpha = d.alpha
      ctx.lineWidth = 1.3 * Math.min(2, Math.max(0.6, sizeMult))
      ctx.beginPath(); ctx.moveTo(d.x, d.y - effLen); ctx.lineTo(d.x, d.y); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  draw()
}

// ── Constellations — drifting stars with connecting lines ──
function _initConstellations() {
  if (document.getElementById('constellations-canvas')) return
  const canvas = _makeCanvas('constellations-canvas')
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let W, H
  const STAR_COUNT = 50, CONNECT_DIST = 120
  let stars = []

  function initStars() {
    stars = []
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: 0.8 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (stars.length === 0) initStars()
  }
  resize()
  const _onResize = () => { resize(); initStars() }
  window.addEventListener('resize', _onResize)

  let t = 0
  function draw() {
    if (!document.body.classList.contains('bg-pattern-constellations')) {
      window.removeEventListener('resize', _onResize)
      canvas.remove()
      return
    }
    requestAnimationFrame(draw)
    t += 0.01
    ctx.clearRect(0, 0, W, H)
    const c = _effectColor()

    for (const s of stars) {
      s.x += s.vx; s.y += s.vy
      if (s.x < 0) s.x = W; if (s.x > W) s.x = 0
      if (s.y < 0) s.y = H; if (s.y > H) s.y = 0
    }

    ctx.strokeStyle = c
    ctx.lineWidth = 0.5
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x
        const dy = stars[i].y - stars[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < CONNECT_DIST) {
          ctx.globalAlpha = (1 - dist / CONNECT_DIST) * 0.15
          ctx.beginPath()
          ctx.moveTo(stars[i].x, stars[i].y)
          ctx.lineTo(stars[j].x, stars[j].y)
          ctx.stroke()
        }
      }
    }

    ctx.fillStyle = c
    for (const s of stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * 2 + s.phase)
      ctx.globalAlpha = 0.15 + twinkle * 0.25
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  draw()
}

// ── Noise helpers for Perlin flow ──
function _bgNoise2d(x, y) { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n) }
function _bgSmoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const a = _bgNoise2d(ix, iy), b = _bgNoise2d(ix + 1, iy), cc = _bgNoise2d(ix, iy + 1), d = _bgNoise2d(ix + 1, iy + 1)
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  return a + (b - a) * ux + (cc - a) * uy + (a - b - cc + d) * ux * uy
}

// ── Perlin Flow — particle streams following a noise field ──
function _initPerlinFlow() {
  if (document.getElementById('perlin-flow-canvas')) return
  const canvas = _makeCanvas('perlin-flow-canvas')
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let W, H, t = 0
  const particles = []
  function resize() {
    W = window.innerWidth; H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (particles.length === 0) for (let i = 0; i < 200; i++) particles.push({ x: Math.random() * W, y: Math.random() * H, life: Math.random() })
  }
  resize()
  const _onResize = () => resize()
  window.addEventListener('resize', _onResize)
  function getBg() { return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#282c34' }
  let _cachedBg = '', _fadeStyle = ''
  function getFade() {
    const bg = getBg()
    if (bg !== _cachedBg) {
      _cachedBg = bg
      const h = bg.replace('#', '')
      const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16)
      _fadeStyle = `rgba(${r},${g},${b},0.02)`
    }
    return _fadeStyle
  }
  function draw() {
    if (!document.body.classList.contains('bg-pattern-perlin-flow')) { window.removeEventListener('resize', _onResize); canvas.remove(); return }
    requestAnimationFrame(draw)
    ctx.fillStyle = getFade()
    ctx.fillRect(0, 0, W, H)
    const c = _effectColor()
    particles.forEach(p => {
      const n = _bgSmoothNoise(p.x * 0.004 + t * 0.0008, p.y * 0.004 + 100)
      const angle = n * Math.PI * 6
      const speed = 1 + _bgSmoothNoise(p.x * 0.003, p.y * 0.003 + 50) * 1.5
      p.x += Math.cos(angle) * speed; p.y += Math.sin(angle) * speed; p.life -= 0.001
      if (p.life <= 0 || p.x < 0 || p.x > W || p.y < 0 || p.y > H) { p.x = Math.random() * W; p.y = Math.random() * H; p.life = 1 }
      ctx.beginPath(); ctx.arc(p.x, p.y, 1, 0, Math.PI * 2)
      ctx.fillStyle = c; ctx.globalAlpha = p.life * 0.15; ctx.fill()
    })
    ctx.globalAlpha = 1
    t++
  }
  draw()
}

// ── Petals — gentle falling flower petals ──
function _initPetals() {
  if (document.getElementById('petals-canvas')) return
  const canvas = _makeCanvas('petals-canvas')
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let W, H
  const petals = []
  function makePetal() {
    return {
      x: Math.random() * W, y: -10 - Math.random() * 40,
      size: 3 + Math.random() * 5, rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.03, vy: 0.3 + Math.random() * 0.6,
      drift: Math.random() * Math.PI * 2, driftSpeed: 0.008 + Math.random() * 0.012,
      wobble: 0.3 + Math.random() * 0.8,
    }
  }
  function resize() {
    W = window.innerWidth; H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (petals.length === 0) for (let i = 0; i < 30; i++) { const p = makePetal(); p.y = Math.random() * H; petals.push(p) }
  }
  resize()
  const _onResize = () => resize()
  window.addEventListener('resize', _onResize)
  function draw() {
    if (!document.body.classList.contains('bg-pattern-petals')) { window.removeEventListener('resize', _onResize); canvas.remove(); return }
    requestAnimationFrame(draw)
    ctx.clearRect(0, 0, W, H)
    const c = _effectColor()
    const sz = _getEffectSize()
    petals.forEach(p => {
      p.y += p.vy; p.rot += p.vr; p.drift += p.driftSpeed
      p.x += Math.sin(p.drift) * p.wobble
      if (p.y > H + 15) Object.assign(p, makePetal())
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot)
      ctx.globalAlpha = 0.2
      ctx.fillStyle = c
      ctx.beginPath(); ctx.ellipse(-p.size * 0.2 * sz, 0, p.size * 0.6 * sz, p.size * 0.3 * sz, 0.3, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 0.15
      ctx.beginPath(); ctx.ellipse(p.size * 0.2 * sz, 0, p.size * 0.6 * sz, p.size * 0.3 * sz, -0.3, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    })
    ctx.globalAlpha = 1
  }
  draw()
}

// ── Sparkles — twinkling 4-point stars ──
function _initSparkles() {
  if (document.getElementById('sparkles-canvas')) return
  const canvas = _makeCanvas('sparkles-canvas')
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let W, H
  const sparkles = []
  function makeSpark() {
    return { x: Math.random() * W, y: Math.random() * H, size: 2 + Math.random() * 5, phase: Math.random() * Math.PI * 2, speed: 0.015 + Math.random() * 0.03, life: 0.5 + Math.random() * 0.5 }
  }
  function resize() {
    W = window.innerWidth; H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (sparkles.length === 0) for (let i = 0; i < 35; i++) sparkles.push(makeSpark())
  }
  resize()
  const _onResize = () => resize()
  window.addEventListener('resize', _onResize)
  function drawStar(x, y, r, c, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = c; ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.15, -r * 0.15, r, 0)
    ctx.quadraticCurveTo(r * 0.15, r * 0.15, 0, r)
    ctx.quadraticCurveTo(-r * 0.15, r * 0.15, -r, 0)
    ctx.quadraticCurveTo(-r * 0.15, -r * 0.15, 0, -r)
    ctx.fill()
    ctx.restore()
  }
  function draw() {
    if (!document.body.classList.contains('bg-pattern-sparkles')) { window.removeEventListener('resize', _onResize); canvas.remove(); return }
    requestAnimationFrame(draw)
    ctx.clearRect(0, 0, W, H)
    const c = _effectColor()
    const sizeMult = _getEffectSize()
    sparkles.forEach(s => {
      s.phase += s.speed
      const twinkle = Math.sin(s.phase)
      const alpha = Math.max(0, twinkle) * 0.25 * s.life
      const scale = 0.5 + Math.max(0, twinkle) * 0.5
      if (alpha > 0.01) drawStar(s.x, s.y, s.size * scale * sizeMult, c, alpha)
      if (s.phase > Math.PI * 6) Object.assign(s, makeSpark())
    })
    ctx.globalAlpha = 1
  }
  draw()
}

// ── Embers — warm particles rising with glow and spark bursts ──
function _initEmbers() {
  if (document.getElementById('embers-canvas')) return
  const canvas = _makeCanvas('embers-canvas')
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let W, H
  const embers = []
  function makeEmber() {
    return {
      x: Math.random() * W,
      y: H + Math.random() * 40,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.3 - Math.random() * 0.8,
      r: 0.3 + Math.random() * 0.6,
      life: 0,
      maxLife: 220 + Math.random() * 220,
      wobble: Math.random() * Math.PI * 2,
      spark: false,
    }
  }
  function resize() {
    W = window.innerWidth; H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (embers.length === 0) {
      for (let i = 0; i < 60; i++) { const e = makeEmber(); e.y = Math.random() * H; e.life = Math.random() * e.maxLife; embers.push(e) }
    }
  }
  resize()
  const _onResize = () => resize()
  window.addEventListener('resize', _onResize)
  function rgba(hex, a) {
    const h = hex.replace('#', '')
    const n = parseInt(h, 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
  }
  function draw() {
    if (!document.body.classList.contains('bg-pattern-embers')) {
      window.removeEventListener('resize', _onResize)
      canvas.remove()
      return
    }
    requestAnimationFrame(draw)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'
    const color = _effectColor('#c9a95a')
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i]
      e.wobble += 0.03
      e.x += e.vx + Math.sin(e.wobble) * 0.5
      e.y += e.vy
      e.life++
      if (e.life > e.maxLife || e.y < -20) {
        embers.splice(i, 1)
        if (embers.length < 70) embers.push(makeEmber())
        continue
      }
      if (!e.spark && Math.random() < 0.003) e.spark = true
      const lifeRatio = e.life / e.maxLife
      const fade = Math.min(1, Math.min(lifeRatio * 4, (1 - lifeRatio) * 3))
      const sz = _getEffectSize()
      const r = e.r * (e.spark ? 2.4 : 1) * sz
      const a = (e.spark ? 0.9 : 0.55) * fade
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 4)
      g.addColorStop(0, rgba(color, a))
      g.addColorStop(0.4, rgba(color, a * 0.3))
      g.addColorStop(1, rgba(color, 0))
      ctx.fillStyle = g
      ctx.fillRect(e.x - r * 4, e.y - r * 4, r * 8, r * 8)
      ctx.fillStyle = rgba('#ffffff', a * 0.6)
      ctx.beginPath()
      ctx.arc(e.x, e.y, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
      e.spark = false
    }
    if (Math.random() < 0.015) {
      const bx = Math.random() * W
      for (let i = 0; i < 5; i++) {
        const e = makeEmber()
        e.x = bx + (Math.random() - 0.5) * 40
        e.y = H - 10
        e.vy *= 1.5
        embers.push(e)
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }
  draw()
}

const _CANVAS_PATTERNS = {
  synapse: _initSynapse,
  rain: _initRain,
  constellations: _initConstellations,
  'perlin-flow': _initPerlinFlow,
  petals: _initPetals,
  sparkles: _initSparkles,
  embers: _initEmbers,
}
