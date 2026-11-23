// ============================================================
// CashMoney NFT — site configuration
// Everything swappable lives here.
// ============================================================

const TESTNET = {
  CHAIN_ID: 943,
  CHAIN_ID_HEX: '0x3af',
  CHAIN_NAME: 'PulseChain Testnet v4',
  RPC_URL: 'https://rpc.v4.testnet.pulsechain.com',
  RPC_URLS: ['https://rpc.v4.testnet.pulsechain.com'],
  EXPLORER_URL: 'https://scan.v4.testnet.pulsechain.com',
  CURRENCY: { name: 'Test Pulse', symbol: 'tPLS', decimals: 18 },
}

const MAINNET_RPC_URLS = [
  'https://rpc.pulsechainstats.com',
  'https://rpc-pulsechain.g4mm4.io',
  'https://pulsechain-rpc.publicnode.com',
]

// PublicNode serves current contract reads, but its free endpoint rejects
// historical eth_getLogs requests. Keep event-history reads on archive-capable
// providers and retry them explicitly in src/lib/rpc.js.
const MAINNET_HISTORY_RPC_URLS = [
  'https://rpc.pulsechainstats.com',
  'https://rpc-pulsechain.g4mm4.io',
]

const MAINNET = {
  CHAIN_ID: 369,
  CHAIN_ID_HEX: '0x171',
  CHAIN_NAME: 'PulseChain',
  // Every site read uses the ordered list below, so an outage automatically
  // falls through to the next independent PulseChain provider.
  RPC_URL: MAINNET_RPC_URLS[0],
  RPC_URLS: MAINNET_RPC_URLS,
  HISTORY_RPC_URLS: MAINNET_HISTORY_RPC_URLS,
  EXPLORER_URL: 'https://scan.pulsechain.com',
  CURRENCY: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
}

// ── Mainnet launch record ───────────────────────────────────
// These values mirror CashMoney-NFT.sol and are used only for the
// post-deploy diagnostic. The mint UI always reads price/token details live
// from the deployed contract and never from this object.
export const MAINNET_DEPLOYMENT = {
  CONTRACT_ADDRESS: '0x1b9C3cebE3E6e6Db92d525CC5cF3bECa86397ee6',
  EDAI_ADDRESS: '0xefD766cCb38EaF1dfd701853BFCe31359239F305',
  TREASURY_ADDRESS: '0x1b5E021691BC4121302eEaE6abD3Be08B203c7D6',
  EDAI_PER_NFT: '110',
  PLS_PER_NFT: '1500000',
  BASE_URI: 'ipfs://bafybeidd7ftycyesgsbmequfwkidbq662edinpa37sk5qsfbyebyiub54a/',
}

const TESTNET_CONTRACT_ADDRESS = '0xEC5Da45F58Ec3727aD7A924233bEB204EACF8918'

// ── Switch this single line when going live ─────────────────
export const NETWORK = MAINNET

// Once NETWORK is MAINNET, set MAINNET_DEPLOYMENT.CONTRACT_ADDRESS above.
// This intentionally prevents the testnet address from ever being used on
// PulseChain mainnet by accident.
export const CASHMONEY_CONTRACT_ADDRESS = NETWORK.CHAIN_ID === MAINNET.CHAIN_ID
  ? MAINNET_DEPLOYMENT.CONTRACT_ADDRESS
  : TESTNET_CONTRACT_ADDRESS

// The contract itself enforces the remaining collection supply. Keeping this
// at the full supply means the UI does not impose an artificial mint limit.
export const MAX_MINT_PER_TX = 369

// GSX SAC is a separate PulseChain mainnet program, independent of the
// currently selected NFT mint network. Keep transfer initiation out of the
// site: this configuration is display/read-only until final launch details,
// artwork, and any GSX contract information are supplied.
export const GSX_SAC = {
  ADDRESS: '0xfF6669025c039147f1edDc650d8B009d048e297f',
  PLS_PER_GSX: 5,
  CHAIN_ID: MAINNET.CHAIN_ID,
  RPC_URL: MAINNET.RPC_URL,
  RPC_URLS: MAINNET.RPC_URLS,
  HISTORY_RPC_URLS: MAINNET.HISTORY_RPC_URLS,
  EXPLORER_URL: MAINNET.EXPLORER_URL,
  // Independent explorer first; the legacy Blockscout API remains a backup.
  EXPLORER_API_URLS: [
    'https://dev.pulsechainexplorer.com/api',
    'https://api.scan.pulsechain.com/api',
  ],
  ARTWORK_FILE: 'gsx.jpg',
}

// Display labels only. The eDAI token ADDRESS is always read
// from the contract via edai() — never hardcoded.
export const PLS_SYMBOL = NETWORK.CURRENCY.symbol
export const EDAI_SYMBOL = 'eDAI'

// Default IPFS gateway (metadata lives on Filebase; this public
// gateway serves anything).
export const IPFS_GATEWAY = 'https://ipfs.filebase.io'

// Filebase reliably serves the artwork CID. The previous custom Pinata
// gateway currently returns 403 for this pin, so Pinata's public gateway is
// kept as a browser-side fallback instead.
export const IMAGES_CID = 'QmREkdPdykKcFb8xippuwLUyk8Tw1WN61bSqLS4ftugna5'
export const IMAGES_GATEWAY = IPFS_GATEWAY
export const IMAGES_FALLBACK_GATEWAY = 'https://gateway.pinata.cloud'

// How many NFT cards the gallery loads per batch
export const GALLERY_PAGE_SIZE = 24

// Params for MetaMask/Rabby wallet_addEthereumChain
export const CHAIN_PARAMS = {
  chainId: NETWORK.CHAIN_ID_HEX,
  chainName: NETWORK.CHAIN_NAME,
  nativeCurrency: NETWORK.CURRENCY,
  rpcUrls: NETWORK.RPC_URLS ?? [NETWORK.RPC_URL],
  blockExplorerUrls: [NETWORK.EXPLORER_URL],
}
