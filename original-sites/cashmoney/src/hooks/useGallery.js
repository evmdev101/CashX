import { useCallback, useEffect, useRef, useState } from 'react'
import { ethers } from 'ethers'
import { CASHMONEY_CONTRACT_ADDRESS, GALLERY_PAGE_SIZE, IMAGES_CID } from '../config'
import { CASHMONEY_ABI } from '../abi/cashMoney'
import { ipfsToHttp, isPlaceholderUri } from '../lib/ipfs'
import { readProvider } from '../lib/rpc'

// Shared resilient read-only provider. Re-exported for Holders/Activity tabs.
export { readProvider }
export const readContract = new ethers.Contract(CASHMONEY_CONTRACT_ADDRESS, CASHMONEY_ABI, readProvider)

// Module-level metadata cache: tokenId -> card. Survives filter switches
// and view changes so nothing is fetched twice. In-memory only.
const cardCache = new Map()

// Resolve one token into a renderable card. Confirmed revealed tokens and
// intentional placeholder URIs are cached. Transient RPC failures are returned
// as retryable cards and deliberately left out of the cache.
// Exported so the mint reveal reuses the same pipeline + cache.
export async function resolveToken(id) {
  const key = id.toString()
  if (cardCache.has(key)) return cardCache.get(key)

  let card = { id: key, name: `CashMoney #${key}`, image: null, placeholder: true }
  try {
    const uri = await readContract.tokenURI(id)
    if (isPlaceholderUri(uri)) {
      cardCache.set(key, card)
      return card
    }

    // The finalized collection uses one immutable artwork CID with numbered
    // PNGs. Once tokenURI confirms the token is revealed, go straight to the
    // artwork instead of issuing a separate metadata fetch for every card.
    const image = ipfsToHttp(`ipfs://${IMAGES_CID}/${key}.png`)
    card = {
      id: key,
      name: `CashMoney #${key}`,
      image,
      placeholder: false,
    }
    cardCache.set(key, card)
    return card
  } catch (error) {
    console.warn(`Artwork resolution failed for CashMoney #${key}; retry remains available.`, error)
    return { ...card, retryable: true }
  }
}

// ownerAddress: null = all minted tokens, address = only that wallet's.
export function useGallery(ownerAddress) {
  const [total, setTotal] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Bumped whenever the filter changes so in-flight batches from the old
  // filter get dropped instead of mixing into the new list.
  const genRef = useRef(0)
  // Hard lock so overlapping calls (StrictMode double-effects, impatient
  // scrolling) can't start two batches at once.
  const inFlightRef = useRef(false)
  const itemsRef = useRef([])
  itemsRef.current = items

  const loadMore = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const gen = genRef.current
    setLoading(true)
    setError(null)
    try {
      // A retry click resolves previously failed cards before loading another
      // page. resolveToken does not cache these failures, so this is a real
      // network retry rather than another read of the placeholder.
      const retryIds = itemsRef.current
        .filter(item => item.retryable)
        .map(item => BigInt(item.id))

      if (retryIds.length > 0) {
        setItems(prev => prev.map(item => (
          item.retryable ? { ...item, pending: true } : item
        )))
        const retriedCards = await Promise.all(retryIds.map(resolveToken))
        if (genRef.current !== gen) return
        setItems(prev => prev.map(item => (
          retriedCards.find(card => card.id === item.id) ?? item
        )))
        if (retriedCards.some(card => card.retryable)) {
          setError('Some NFT artwork could not load. Tap to retry.')
        }
        return
      }

      // Scope size: whole collection or just the connected wallet's tokens
      let scopeTotal = total
      if (scopeTotal === null) {
        const t = ownerAddress
          ? await readContract.balanceOf(ownerAddress)
          : await readContract.totalSupply()
        scopeTotal = Number(t)
        if (genRef.current !== gen) return
        setTotal(scopeTotal)
      }

      const from = itemsRef.current.length
      const to = Math.min(from + GALLERY_PAGE_SIZE, scopeTotal)
      if (from >= to) return

      // Token IDs for this batch
      const ids = await Promise.all(
        Array.from({ length: to - from }, (_, k) => {
          const i = BigInt(from + k)
          return ownerAddress
            ? readContract.tokenOfOwnerByIndex(ownerAddress, i)
            : readContract.tokenByIndex(i)
        })
      )
      if (genRef.current !== gen) return

      // Show the cards immediately as "loading", then fill in metadata
      setItems(prev => [...prev, ...ids.map(id => ({ id: id.toString(), name: `CashMoney #${id}`, image: null, placeholder: true, pending: true }))])

      const cards = await Promise.all(ids.map(resolveToken))
      if (genRef.current !== gen) return
      setItems(prev => prev.map(item => cards.find(c => c.id === item.id) ?? item))
      if (cards.some(card => card.retryable)) {
        setError('Some NFT artwork could not load. Tap to retry.')
      }
    } catch (err) {
      console.error('Gallery load failed:', err)
      if (genRef.current === gen) setError('Could not load NFTs from PulseChain. Tap to retry.')
    } finally {
      // Always release, even if the filter changed mid-flight — the trigger
      // effect below restarts the first batch for the new filter.
      inFlightRef.current = false
      setLoading(false)
    }
  }, [ownerAddress, total])

  // Reset + load first batch whenever the filter changes
  useEffect(() => {
    genRef.current += 1
    setTotal(null)
    setItems([])
    setError(null)
  }, [ownerAddress])

  useEffect(() => {
    if (total === null && !loading) loadMore()
  }, [total, loading, loadMore])

  const hasMore = total !== null && items.length < total

  return { total, items, loading, error, hasMore, loadMore }
}
