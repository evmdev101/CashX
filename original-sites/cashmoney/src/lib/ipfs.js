import { IPFS_GATEWAY, IMAGES_CID, IMAGES_FALLBACK_GATEWAY, IMAGES_GATEWAY } from '../config'

// Turn any ipfs:// URI into an HTTP gateway URL.
//   ipfs://CID/path  ->  <gateway>/ipfs/CID/path
// Content under the images CID uses the same verified Filebase gateway as
// metadata. The browser can retry artwork on Pinata's public gateway if
// Filebase has a temporary problem.
// http(s) URLs pass through unchanged.
export function ipfsToHttp(uri) {
  if (!uri) return null
  if (uri.startsWith('ipfs://')) {
    const path = uri.slice('ipfs://'.length).replace(/^ipfs\//, '')
    const gateway = path.startsWith(IMAGES_CID) ? IMAGES_GATEWAY : IPFS_GATEWAY
    return `${gateway}/ipfs/${path}`
  }
  return uri
}

// Keep the helper at all existing call sites. The working public gateways
// serve the original PNGs and do not reliably support resize parameters.
export function thumb(url) {
  return url
}

// Retry an artwork image once through Pinata's public gateway. Returns true
// when a retry was started, so React components can show a placeholder only
// after both gateways have failed.
export function retryImageFromFallback(event) {
  const image = event.currentTarget
  if (image.dataset.ipfsFallbackTried === 'true') return false

  const source = image.currentSrc || image.src
  const primaryPrefix = `${IMAGES_GATEWAY}/ipfs/`
  if (!source.startsWith(primaryPrefix)) return false

  image.dataset.ipfsFallbackTried = 'true'
  image.src = source.replace(IMAGES_GATEWAY, IMAGES_FALLBACK_GATEWAY)
  return true
}

// The contract ships with baseURI = ipfs://PLACEHOLDER_CID/ until the real
// art is uploaded. Don't waste requests on URIs that can never resolve.
export function isPlaceholderUri(uri) {
  return !uri || /placeholder/i.test(uri)
}

// fetch() with a hard timeout so a dead gateway can't hang a card forever.
export async function fetchWithTimeout(url, ms = 10_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
