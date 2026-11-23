// Live countdown to mint end. Pure display — all timing comes from the
// contract's mintStart/mintEnd (bigint unix seconds) vs the ticking clock.

const URGENT_SECONDS = 24 * 3600
const URGENT_COLOR = '#f87171'

function Unit({ value, label, urgent }) {
  const digits = String(value).length
  const numberSize = digits >= 5
    ? 'clamp(1.75rem, 4vw, 3.25rem)'
    : digits === 4
      ? 'clamp(2rem, 4.5vw, 3.75rem)'
      : digits === 3
        ? 'clamp(2.25rem, 6vw, 4.5rem)'
        : 'clamp(2.5rem, 8vw, 5.375rem)'

  return (
    <div className="min-w-0 text-center">
      <div
        className="flex h-[clamp(5.5rem,11vw,7.5rem)] items-center justify-center rounded-lg border px-2"
        style={{
          borderColor: urgent ? URGENT_COLOR : 'color-mix(in srgb, var(--red) 58%, transparent)',
          background: urgent ? 'rgba(248,113,113,0.08)' : 'color-mix(in srgb, var(--panel) 90%, #030812)',
          boxShadow: urgent ? '0 0 34px rgba(248,113,113,0.12)' : '0 0 34px color-mix(in srgb, var(--red) 12%, transparent)',
        }}
      >
        <strong
          key={value}
          className="countdown-number block leading-none tabular-nums text-white"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: numberSize,
            letterSpacing: digits >= 4 ? '-0.04em' : undefined,
            ...(urgent ? { color: URGENT_COLOR } : {}),
          }}
        >
          {String(value).padStart(2, '0')}
        </strong>
      </div>
      <div className="mt-2.5 text-[9px] font-extrabold uppercase tracking-[0.24em] text-white sm:text-[10px]">
        {label}
      </div>
    </div>
  )
}

function Separator({ urgent }) {
  const color = urgent ? URGENT_COLOR : 'var(--red)'
  return (
    <div className="countdown-separator hidden self-start pt-8 sm:grid sm:gap-3" aria-hidden="true">
      <span className="h-1.5 w-1.5 rounded-sm" style={{ background: color, boxShadow: `0 0 16px ${color}` }} />
      <span className="h-1.5 w-1.5 rounded-sm" style={{ background: color, boxShadow: `0 0 16px ${color}` }} />
    </div>
  )
}

export default function Countdown({ loaded, mintStart, mintEnd, now }) {
  if (!loaded || mintEnd <= 0n) return null
  const nowB = BigInt(now)

  if (mintStart > 0n && nowB < mintStart) {
    return (
      <div className="mt-5 rounded-md border px-4 py-3 text-center text-sm font-bold uppercase tracking-widest" style={{ borderColor: 'var(--red)', color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 10%, transparent)' }}>
        Mint opens soon
      </div>
    )
  }

  if (nowB > mintEnd) {
    return (
      <div className="mt-5 rounded-md border-2 px-4 py-4 text-center text-lg font-bold uppercase tracking-widest" style={{ borderColor: URGENT_COLOR, color: URGENT_COLOR, background: 'rgba(248,113,113,0.1)' }}>
        Mint Ended
      </div>
    )
  }

  const remaining = Number(mintEnd - nowB)
  const urgent = remaining < URGENT_SECONDS
  const days = Math.floor(remaining / 86400)
  const hours = Math.floor((remaining % 86400) / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)
  const seconds = remaining % 60

  return (
    <div className="mt-5">
      <div className="font-cashx-brand muted mb-5 text-center text-sm uppercase" style={urgent ? { color: URGENT_COLOR } : undefined}>
        {urgent ? '⚠ Mint ends in' : 'Mint ends in'}
      </div>
      <div
        className="grid grid-cols-2 items-start gap-x-4 gap-y-7 sm:grid-cols-[1fr_22px_1fr_22px_1fr_22px_1fr] sm:gap-x-4"
        role="timer"
        aria-label={`${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds remaining`}
      >
        <Unit value={days} label="days" urgent={urgent} />
        <Separator urgent={urgent} />
        <Unit value={hours} label="hours" urgent={urgent} />
        <Separator urgent={urgent} />
        <Unit value={minutes} label="minutes" urgent={urgent} />
        <Separator urgent={urgent} />
        <Unit value={seconds} label="seconds" urgent={urgent} />
      </div>
    </div>
  )
}
