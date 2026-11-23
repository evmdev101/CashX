import { useState } from 'react'
import Hero from './Hero'
import MintPanel from './MintPanel'
import Faq from './Faq'
import Gallery from './Gallery'
import AllNftPreview from './AllNftPreview'
import Holders from './Holders'
import Activity from './Activity'
import GsxSac from './GsxSac'

// Collection page: hero carousel + treasury raise, then OpenSea-style
// tabs — Mint (all-369 preview + mint box), Items, Holders, Activity.
const TABS = [
  ['mint', 'Mint'],
  ['items', 'Items'],
  ['holders', 'Holders'],
  ['activity', 'Activity'],
  ['gsx', 'GSX SAC'],
]

export default function MintPage({ wallet, onMinted, tab, onTabChange }) {
  const [light, setLight] = useState(true)   // shared "light" (glare) toggle
  const toggleLight = () => setLight(v => !v)

  return (
    <div className="w-full max-w-7xl px-1">
      <Hero light={light} onToggleLight={toggleLight} />

      {/* Tab strip */}
      <div className="mt-8 flex gap-6 border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)' }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className="font-cashx-brand pb-3 text-lg transition-colors sm:text-xl"
            style={tab === key
              ? { color: 'var(--fg)', borderBottom: '2px solid var(--red)', marginBottom: '-1px' }
              : { color: 'color-mix(in srgb, var(--fg) 50%, transparent)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'mint' && (
        <>
          <section id="mint-section" className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
            <div className="flex justify-center md:justify-start">
              <AllNftPreview light={light} onToggleLight={toggleLight} />
            </div>
            <div className="flex justify-center">
              <MintPanel wallet={wallet} onMinted={onMinted} />
            </div>
          </section>
          <Faq />
        </>
      )}
      {tab === 'items' && <div className="mt-2 flex justify-center"><Gallery wallet={wallet} /></div>}
      {tab === 'holders' && <Holders />}
      {tab === 'activity' && <Activity />}
      {tab === 'gsx' && <GsxSac />}
    </div>
  )
}
