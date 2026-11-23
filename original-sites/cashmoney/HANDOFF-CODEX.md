# CashMoney NFT — Project Handoff

## What this is
An NFT mint website for **CashMoney NFT** — a 369-piece PulseChain collection.
Users mint with **eDAI (ERC20) + PLS (native)**; after mint they'll stake on
Nexion. Single-page React app. Currently wired to a **testnet** deployment;
mainnet contract is written but not deployed yet.

## Repo & run
- Location: `C:\Users\Ryan A. Saunders\cashmoney-mint`
- Stack: **React + Vite + Tailwind + ethers.js v6**. No backend. Node at
  `C:\Program Files\nodejs`.
- Run: `npm install` then `npm run dev` (Vite on http://localhost:5173).
  `npm run build` = production build. `npm run check` = prints live contract
  state from chain (sanity check).
- No localStorage/sessionStorage anywhere (deliberate — all state in React).

## Smart contract
Two versions:
1. **Deployed on PulseChain Testnet v4 (chain 943):**
   `0xEC5Da45F58Ec3727aD7A924233bEB204EACF8918`
   Test pricing: **1 tPLS + 100 eDAI** per NFT. baseURI already set to the
   real metadata CID (below). ~18 minted during testing.
2. **Mainnet contract (written, NOT deployed):** `Downloads/CashMoney-NFT.sol`
   — OZ 5.0.2, `ERC721 + ERC721Enumerable + Ownable + ReentrancyGuard`.
   Real pricing: **1,500,000 PLS + 100 eDAI** per NFT. maxSupply 369,
   14-day mint window set at deploy. eDAI hardcoded to
   `0xefD766cCb38EaF1dfd701853BFCe31359239F305`, treasury
   `0x1b5E021691BC4121302eEaE6abD3Be08B203c7D6`. Only admin fn is
   `setBaseURI(onlyOwner)`; everything else constant/immutable.

Mint flow (two-step): user `approve()`s eDAI to the contract, then `mint(qty)`
sending `plsAmount*qty` as msg.value. Token IDs are sequential (mint #N = token
#N), so "minted vs available" is just `id <= totalMinted`.

### CRITICAL deploy gotcha
PulseChain does NOT support the **MCOPY** opcode. Compile with
**`evmVersion: "paris"`** (Solidity 0.8.20+ defaults to cancun → `tokenURI()`,
`name()`, `symbol()` revert with "invalid opcode: MCOPY"). The first testnet
deploy hit exactly this; the current one is the paris recompile.

## IPFS / art (done, permanent)
- Images (369 PNGs, ~913 MB): Pinata CID
  `QmREkdPdykKcFb8xippuwLUyk8Tw1WN61bSqLS4ftugna5`
- Metadata (369 JSONs): Filebase CID
  `bafybeidd7ftycyesgsbmequfwkidbq662edinpa37sk5qsfbyebyiub54a`
- baseURI to set on any contract: `ipfs://bafybeidd7...b54a/` (uriSuffix `.json`)
- Art source + `manifest.csv` (token→original file→category map) live in
  `Downloads/CashMoneyNFT-Final` / `Desktop/CashMoneyNFT-Working`. Art is
  ~1085×1450 px. 7 categories (Apes/Pigs/Bulls/Tinmen/Punks/Frogs/Dogs) + 19
  rare "Randoms" shuffled evenly across token IDs.
- Gateways: metadata via `ipfs.filebase.io`; images via the Pinata dedicated
  gateway `chocolate-tricky-pig-667.mypinata.cloud` (CDN-fast, supports
  `?img-width=` thumbnails — see `src/lib/ipfs.js` `thumb()`).

## Config — the one file that matters
`src/config.js`. To go mainnet: (1) flip `export const NETWORK = TESTNET` →
`MAINNET`, (2) set `CASHMONEY_CONTRACT_ADDRESS` to the deployed mainnet
address. Prices are ALWAYS read from the contract (`plsAmount()`/`edaiAmount()`)
— never hardcode them in the UI. eDAI address is read via `edai()`.

## Architecture (src/)
- `App.jsx` — shell: fixed CashX-style nav (Mint/Gallery/Stake), theme state,
  wallet, hosts the mint-reveal overlay.
- `components/MintPage.jsx` — collection page: Hero carousel + OpenSea-style
  tabs (Mint / Items / Holders / Activity).
- `components/Hero.jsx` — 5-card coverflow of all 369 (center featured, big,
  interactive), countdown, treasury-raise bar, click-to-zoom.
- `components/MintPanel.jsx` — the two-step approve→mint UI + status; emits
  minted token IDs upward for the reveal.
- `components/AllNftPreview.jsx` — mint-tab preview cycling all 369.
- `components/Gallery.jsx` — grid (all minted / my NFTs), exports `NftCard`.
- `components/StakePanel.jsx` — staking UI (UI only; see staking seam below).
- `components/Holders.jsx` / `Activity.jsx` — on-chain holder table / mint feed.
- `components/PackReveal.jsx` — R6-style pack-tear reveal on successful mint.
- `components/TiltViewer.jsx` + `NftZoom.jsx` — 3D tilt/glare viewer (adapted
  from the degenNFT repo) used in zoom + inline showcases; Light on/off toggle.
- `components/Countdown.jsx`, `Faq.jsx`, `ThemePicker.jsx` (draggable/snapping
  theme window).
- `hooks/` — `useWallet` (MM/Rabby), `useMintData` (supply/price/allowance),
  `useGallery` (enumerate+metadata, exports read provider/contract + resolveToken),
  `useNow` (1s clock).
- `lib/ipfs.js` (gateway routing + thumbnails), `lib/themeEffects.js` (odysseus
  canvas backgrounds), `lib/staking.js` (Nexion seam), `themes.js` (16 palettes
  + per-theme animation defaults), `abi/`.

## Theme system
Ported from pewdiepie's **odysseus** (`pewdiepie-archdaemon.github.io/odysseus`)
— 16 palettes, per-theme canvas background animations (rain, constellations,
embers, etc.), frosted glass, draggable/edge-snapping theme window. Same system
as the user's CashX site (`github.com/evmdev101/CashX`).

## Staking = deferred seam (DO NOT guess)
`src/lib/staking.js` is the ONLY place Nexion details go. Until a real staking
contract address is set there, `isStakingConfigured` is false, all stake/unstake/
claim actions are disabled (in UI AND guarded in code — never send approve/
transfer to a zero/placeholder address). To wire later: fill
STAKING_CONTRACT_ADDRESS, STAKING_ABI, REWARD_TOKEN, and the approve model
(setApprovalForAll vs per-token), then complete the TODO stubs.

## What's built (all working on testnet)
Wallet connect + network switch · supply counter · live price · quantity ·
two-step approve/mint · gallery (all + my NFTs) · Holders/Activity tabs ·
countdown to mint end · pack-tear reveal · staking UI scaffold · IPFS art
revealed via setBaseURI · treasury-raise tracker · 3D tilt/glare viewer + zoom ·
CashX-style nav + odysseus theme system.

## What's left (launch checklist)
1. Deploy `CashMoney-NFT.sol` to PulseChain mainnet — **paris EVM**, verify the
   eDAI address is correct for mainnet.
2. `setBaseURI("ipfs://bafybeidd7...b54a/")` from the owner wallet.
3. In `src/config.js`: `NETWORK = MAINNET` + new contract address.
4. `npm run build`, deploy static site (GitHub Pages / Netlify).
5. Bandwidth: Pinata free tier is near its limits (~955 MB used, gateway
   bandwidth capped) — a paid tier may be needed for mint-day traffic.
6. Later: wire Nexion staking when details arrive.

## Notes / conventions
- Prices/amounts always read from contract, formatted with ethers formatUnits.
- Errors shown as readable messages (rejected, insufficient eDAI/PLS, sold out,
  window closed…).
- `abi/cashMoney.js` includes setter fns the mainnet contract doesn't have —
  harmless (never called); only `setBaseURI` is used, via Remix/owner wallet.
