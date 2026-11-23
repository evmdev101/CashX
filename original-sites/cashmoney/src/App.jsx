import { useEffect, useState } from 'react'
import { THEMES, DEFAULT_THEME, applyTheme, defaultFx } from './themes'
import { applyBgPattern, applyBgEffectColor, applyBgEffectIntensity, applyBgEffectSize, applyFrostedGlass } from './lib/themeEffects'
import { useWallet } from './hooks/useWallet'
import ThemePicker from './components/ThemePicker'
import MintPage from './components/MintPage'
import StakePanel from './components/StakePanel'
import PackReveal from './components/PackReveal'

export default function App() {
  const wallet = useWallet()
  const [view, setView] = useState('mint') // 'mint' | 'stake'
  const [mintTab, setMintTab] = useState('mint')
  // Reveal overlay lives here (not in the mint panel) so it opens on top
  // of whatever tab is active when the mint confirms.
  const [reveal, setReveal] = useState(null) // { ids: string[] }

  // Theme state — React only, nothing persisted
  const [activeName, setActiveName] = useState(DEFAULT_THEME)
  const [colors, setColors] = useState(THEMES[DEFAULT_THEME])
  // Background effect settings (pattern/color/intensity/size/frosted),
  // seeded from each theme's odysseus defaults
  const [fx, setFx] = useState(() => defaultFx(DEFAULT_THEME))

  useEffect(() => {
    applyTheme(colors)
  }, [colors])

  useEffect(() => {
    applyBgEffectColor(fx.effectColor)
    applyBgEffectIntensity(fx.intensity)
    applyBgEffectSize(fx.size)
    applyFrostedGlass(fx.frosted)
    applyBgPattern(fx.pattern)
  }, [fx])

  function pickTheme(name) {
    setActiveName(name)
    setColors(THEMES[name])
    setFx(defaultFx(name))
  }

  function customColors(next) {
    setActiveName('custom')
    setColors(next)
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* CashX-style fixed nav: social icons | pill tabs | theme + wallet */}
      <nav className="cx-nav">
        <div className="cx-nav-left">
          <a href="https://t.me/+Ruw3dQPRTv00NDRl" target="_blank" rel="noreferrer" className="cx-icon" aria-label="Telegram">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" fill="black" />
            </svg>
          </a>
          <a href="https://x.com/TomkiwMich70997" target="_blank" rel="noreferrer" className="cx-icon" aria-label="X">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="black" />
            </svg>
          </a>
          <a href="https://dexscreener.com/pulsechain/0xda942580cee2a69c5fc74109090816157730c64d" target="_blank" rel="noreferrer" className="cx-icon" aria-label="DexScreener">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="black" fillRule="evenodd" viewBox="0 0 252 300">
              <path d="M151.818 106.866c9.177-4.576 20.854-11.312 32.545-20.541 2.465 5.119 2.735 9.586 1.465 13.193-.9 2.542-2.596 4.753-4.826 6.512-2.415 1.901-5.431 3.285-8.765 4.033-6.326 1.425-13.712.593-20.419-3.197m1.591 46.886l12.148 7.017c-24.804 13.902-31.547 39.716-39.557 64.859-8.009-25.143-14.753-50.957-39.556-64.859l12.148-7.017a5.95 5.95 0 003.84-5.845c-1.113-23.547 5.245-33.96 13.821-40.498 3.076-2.342 6.434-3.518 9.747-3.518s6.671 1.176 9.748 3.518c8.576 6.538 14.934 16.951 13.821 40.498a5.95 5.95 0 003.84 5.845zM126 0c14.042.377 28.119 3.103 40.336 8.406 8.46 3.677 16.354 8.534 23.502 14.342 3.228 2.622 5.886 5.155 8.814 8.071 7.897.273 19.438-8.5 24.796-16.709-9.221 30.23-51.299 65.929-80.43 79.589-.012-.005-.02-.012-.029-.018-5.228-3.992-11.108-5.988-16.989-5.988s-11.76 1.996-16.988 5.988c-.009.005-.017.014-.029.018-29.132-13.66-71.209-49.359-80.43-79.589 5.357 8.209 16.898 16.982 24.795 16.709 2.929-2.915 5.587-5.449 8.814-8.071C69.31 16.94 77.204 12.083 85.664 8.406 97.882 3.103 111.959.377 126 0m-25.818 106.866c-9.176-4.576-20.854-11.312-32.544-20.541-2.465 5.119-2.735 9.586-1.466 13.193.901 2.542 2.597 4.753 4.826 6.512 2.416 1.901 5.432 3.285 8.766 4.033 6.326 1.425 13.711.593 20.418-3.197" />
              <path d="M197.167 75.016c6.436-6.495 12.107-13.684 16.667-20.099l2.316 4.359c7.456 14.917 11.33 29.774 11.33 46.494l-.016 26.532.14 13.754c.54 33.766 7.846 67.929 24.396 99.193l-34.627-27.922-24.501 39.759-25.74-24.231L126 299.604l-41.132-66.748-25.739 24.231-24.501-39.759L0 245.25c16.55-31.264 23.856-65.427 24.397-99.193l.14-13.754-.016-26.532c0-16.721 3.873-31.578 11.331-46.494l2.315-4.359c4.56 6.415 10.23 13.603 16.667 20.099l-2.01 4.175c-3.905 8.109-5.198 17.176-2.156 25.799 1.961 5.554 5.54 10.317 10.154 13.953 4.48 3.531 9.782 5.911 15.333 7.161 3.616.814 7.3 1.149 10.96 1.035-.854 4.841-1.227 9.862-1.251 14.978L53.2 160.984l25.206 14.129a41.926 41.926 0 015.734 3.869c20.781 18.658 33.275 73.855 41.861 100.816 8.587-26.961 21.08-82.158 41.862-100.816a41.865 41.865 0 015.734-3.869l25.206-14.129-32.665-18.866c-.024-5.116-.397-10.137-1.251-14.978 3.66.114 7.344-.221 10.96-1.035 5.551-1.25 10.854-3.63 15.333-7.161 4.613-3.636 8.193-8.399 10.153-13.953 3.043-8.623 1.749-17.689-2.155-25.799l-2.01-4.175z" />
            </svg>
          </a>
          <a href="https://www.youtube.com/watch?v=UefZfzeoU_M" target="_blank" rel="noreferrer" className="cx-icon" aria-label="YouTube">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </a>
        </div>

        <div className="cx-nav-center" aria-label="Main navigation">
          {[['mint', 'Mint'], ['stake', 'Stake']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`cx-tab ${view === key ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="cx-nav-right">
          <ThemePicker
            activeName={activeName}
            colors={colors}
            fx={fx}
            onPickTheme={pickTheme}
            onCustomColors={customColors}
            onFx={setFx}
          />
          {wallet.isConnected ? (
            wallet.isWrongNetwork ? (
              <button onClick={wallet.switchNetwork} className="h-9 rounded-full border border-red-500 bg-red-500/90 px-4 text-xs font-bold text-white">
                Wrong Network
              </button>
            ) : (
              <button onClick={wallet.disconnect} className="btn-ghost h-9 px-4 text-xs" title="Click to disconnect">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </button>
            )
          ) : (
            <button onClick={wallet.connect} disabled={wallet.connecting} className="btn-accent h-9 px-4 text-xs font-bold">
              {wallet.connecting ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
      </nav>

      {/* Active view (padded below the fixed nav) */}
      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-28 sm:pb-14">
        {view === 'mint'
          ? <MintPage wallet={wallet} onMinted={ids => setReveal({ ids })} tab={mintTab} onTabChange={setMintTab} />
          : <StakePanel wallet={wallet} />}
      </main>

      <footer className="muted pb-6 text-center text-[11px]">
        CashMoney NFT · 369 on PulseChain
      </footer>

      {reveal && (
        <PackReveal
          tokenIds={reveal.ids}
          onClose={() => setReveal(null)}
          onViewGallery={() => { setReveal(null); setView('mint'); setMintTab('items') }}
        />
      )}
    </div>
  )
}
