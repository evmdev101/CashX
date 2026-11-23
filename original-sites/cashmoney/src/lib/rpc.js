import { ethers } from 'ethers'
import { NETWORK } from '../config.js'

const REQUEST_TIMEOUT_MS = 4_000
const FALLBACK_STALL_MS = 900

function createJsonRpcProvider(url, network) {
  const request = new ethers.FetchRequest(url)
  request.timeout = REQUEST_TIMEOUT_MS

  return new ethers.JsonRpcProvider(request, network.CHAIN_ID, {
    staticNetwork: true,
  })
}

// Build a read-only provider that starts with the fastest preferred endpoint
// and automatically tries independent PulseChain RPCs when one is slow or
// unavailable. Quorum 1 prioritizes availability; writes still go through the
// user's wallet signer and never through this provider.
export function createReadProvider(network = NETWORK) {
  const urls = [...new Set(network.RPC_URLS ?? [network.RPC_URL])]
    .filter(Boolean)

  if (urls.length === 0) {
    throw new Error(`No RPC endpoints configured for chain ${network.CHAIN_ID}`)
  }

  const providers = urls.map((url, index) => ({
    provider: createJsonRpcProvider(url, network),
    priority: index + 1,
    stallTimeout: FALLBACK_STALL_MS,
    weight: 1,
  }))

  if (providers.length === 1) return providers[0].provider

  return new ethers.FallbackProvider(providers, network.CHAIN_ID, {
    quorum: 1,
  })
}

export const readProvider = createReadProvider()

const historyProviders = [...new Set(
  NETWORK.HISTORY_RPC_URLS ?? NETWORK.RPC_URLS ?? [NETWORK.RPC_URL],
)]
  .filter(Boolean)
  .map(url => ({ url, provider: createJsonRpcProvider(url, NETWORK) }))

// FallbackProvider treats some fast JSON-RPC method errors as a completed
// quorum response. Historical logs need true sequential retry so a provider
// limitation cannot hide mint activity when another endpoint is healthy.
export async function withHistoryProvider(operation) {
  let lastError

  for (const { url, provider } of historyProviders) {
    try {
      return await operation(provider)
    } catch (error) {
      lastError = error
      console.warn(`Historical RPC failed (${url}); trying the next endpoint.`, error)
    }
  }

  throw lastError ?? new Error('No historical RPC endpoints are configured.')
}
