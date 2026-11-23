import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { readContract } from '../hooks/useGallery'
import { ipfsToHttp, retryImageFromFallback, thumb } from '../lib/ipfs'
import { CASHMONEY_CONTRACT_ADDRESS, IMAGES_CID, NETWORK } from '../config'
import { CASHMONEY_ABI } from '../abi/cashMoney'
import { withHistoryProvider } from '../lib/rpc'

// Holders leaderboard, aggregated live from on-chain ownerOf() calls. NFTs
// deposited into the custody vault stay attributed to their depositor so the
// vault does not incorrectly appear as one giant collector wallet.
const CHUNK = 30
const VISIBLE_HOLDERS = 7
const CUSTODY_VAULT = '0x7de1824210c65973bc5C380785C81128834DD08e'
const LOOKBACK_BLOCKS = 500_000

async function chunked(items, fn) {
  const out = []
  for (let i = 0; i < items.length; i += CHUNK) {
    out.push(...await Promise.all(items.slice(i, i + CHUNK).map(fn)))
  }
  return out
}

// Deterministic avatar color from an address
function hue(addr) {
  let h = 0
  for (const ch of addr.slice(2, 10)) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

async function loadCustodyDepositors(tokenIds) {
  if (tokenIds.length === 0) return new Map()

  return withHistoryProvider(async provider => {
    const contract = new ethers.Contract(CASHMONEY_CONTRACT_ADDRESS, CASHMONEY_ABI, provider)
    const tip = await provider.getBlockNumber()
    const from = Math.max(0, tip - LOOKBACK_BLOCKS)
    const transfers = await contract.queryFilter(
      contract.filters.Transfer(null, CUSTODY_VAULT),
      from,
      tip,
    )
    const deposited = new Set(tokenIds.map(String))
    const depositors = new Map()

    for (const transfer of transfers) {
      const tokenId = transfer.args.tokenId.toString()
      if (deposited.has(tokenId)) depositors.set(tokenId, transfer.args.from)
    }
    return depositors
  })
}

export default function Holders() {
  const [rows, setRows] = useState(null)
  const [minted, setMinted] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const total = Number(await readContract.totalSupply())
        if (!alive) return
        setMinted(total)
        const idx = Array.from({ length: total }, (_, i) => i)
        const ids = await chunked(idx, i => readContract.tokenByIndex(BigInt(i)))
        const owners = await chunked(ids, id => readContract.ownerOf(id))
        const vaultTokenIds = ids.filter((_, i) => owners[i].toLowerCase() === CUSTODY_VAULT.toLowerCase())
        const custodyDepositors = await loadCustodyDepositors(vaultTokenIds)
        if (!alive) return
        const map = new Map()
        owners.forEach((owner, i) => {
          const tokenId = ids[i].toString()
          const effectiveOwner = owner.toLowerCase() === CUSTODY_VAULT.toLowerCase()
            ? custodyDepositors.get(tokenId) ?? owner
            : owner
          if (!map.has(effectiveOwner)) map.set(effectiveOwner, [])
          map.get(effectiveOwner).push(tokenId)
        })
        const sorted = [...map.entries()]
          .map(([owner, tokenIds]) => ({ owner, tokenIds }))
          .sort((a, b) => b.tokenIds.length - a.tokenIds.length)
        setRows(sorted)
      } catch (err) {
        console.error('Holders load failed:', err)
        if (alive) setError('Could not load holders from PulseChain.')
      }
    }
    load()
    return () => { alive = false }
  }, [])

  if (error) return <div className="panel mt-8 p-8 text-center text-sm" style={{ color: '#f87171' }}>{error}</div>
  if (!rows) return <div className="panel mt-8 p-8 text-center"><span className="muted text-sm">Loading holders…</span></div>
  if (rows.length === 0) return <div className="panel mt-8 p-8 text-center"><span className="muted text-sm">No holders yet — nothing minted.</span></div>

  return (
    <div className="mt-8">
      <div className="muted mb-3 grid grid-cols-[1fr_70px_70px] gap-2 px-4 text-[10px] font-bold uppercase tracking-widest sm:grid-cols-[1fr_70px_70px_220px]">
        <span>Wallet</span>
        <span className="text-right">Owned</span>
        <span className="text-right">% Owned</span>
        <span className="hidden sm:block">Items</span>
      </div>
      <div
        className="max-h-[400px] space-y-1.5 overflow-y-auto overscroll-contain pr-2"
        aria-label={`Latest ${VISIBLE_HOLDERS} holders with more available by scrolling`}
      >
        {rows.map(({ owner, tokenIds }) => (
          <div key={owner} className="panel grid min-h-[52px] grid-cols-[1fr_70px_70px] items-center gap-2 px-4 py-2.5 sm:grid-cols-[1fr_70px_70px_220px]">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="h-7 w-7 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, hsl(${hue(owner)},70%,55%), hsl(${(hue(owner) + 70) % 360},70%,40%))` }} />
              <a
                className="truncate font-mono text-xs font-bold hover:underline"
                href={`${NETWORK.EXPLORER_URL}/address/${owner}`}
                target="_blank"
                rel="noreferrer"
              >
                {owner.slice(0, 6)}…{owner.slice(-4)}
              </a>
            </div>
            <span className="text-right text-sm font-bold tabular-nums">{tokenIds.length}</span>
            <span className="muted text-right text-xs tabular-nums">{((tokenIds.length / minted) * 100).toFixed(1)}%</span>
            <div className="hidden items-center gap-1 sm:flex">
              {tokenIds.slice(0, 5).map(id => (
                <img
                  key={id}
                  src={thumb(ipfsToHttp(`ipfs://${IMAGES_CID}/${id}.png`), 96)}
                  alt={`#${id}`}
                  title={`CashMoney #${id}`}
                  loading="lazy"
                  onError={retryImageFromFallback}
                  className="h-8 w-8 rounded object-cover"
                />
              ))}
              {tokenIds.length > 5 && <span className="muted text-[10px]">+{tokenIds.length - 5}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="muted mt-3 text-center text-[10px] uppercase tracking-widest">{rows.length} holders · {minted} minted</div>
    </div>
  )
}
