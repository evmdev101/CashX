# CashMoney NFT — launch notes

## IPFS (uploaded 2026-07-05, permanent)
- Images (369 PNGs, 913.5 MB) — pinned on Pinata:
  `QmREkdPdykKcFb8xippuwLUyk8Tw1WN61bSqLS4ftugna5`
- Metadata (369 JSONs) — pinned on Filebase (bucket cashmoney-metadata-369):
  `bafybeidd7ftycyesgsbmequfwkidbq662edinpa37sk5qsfbyebyiub54a`
- Mainnet contract baseURI (already set in `contracts/CashMoney-NFT.sol`):
  `ipfs://bafybeidd7ftycyesgsbmequfwkidbq662edinpa37sk5qsfbyebyiub54a/`
  (uriSuffix must be `.json`)

## Gateways
- Site uses `https://ipfs.filebase.io` for both metadata and artwork.
- The custom Pinata gateway currently returns 403 for the artwork CID, so it
  is not used. The site retries a failed artwork request through Pinata's
  public gateway automatically.

## Contracts
- Testnet v4 (test only): `0xEC5Da45F58Ec3727aD7A924233bEB204EACF8918`
- Mainnet deployment source: `contracts/CashMoney-NFT.sol`
  - deployed address: `0x1b9C3cebE3E6e6Db92d525CC5cF3bECa86397ee6`
  - 110 eDAI + 1,500,000 native PLS per NFT
  - 369 total NFTs; no per-transaction mint cap beyond remaining supply
  - mint starts at deployment and lasts 14 days + 5 minutes
  - eDAI: `0xefD766cCb38EaF1dfd701853BFCe31359239F305`
  - treasury: `0x1b5E021691BC4121302eEaE6abD3Be08B203c7D6`
- Compile with **EVM version `paris`**. PulseChain does not support the
  Cancun `MCOPY` opcode.
- Mainnet is configured in `src/config.js`. Run `npm run check` before each
  publishing step to verify the deployed contract still matches this record.

## Token mapping
- manifest.csv (token_id -> original file -> category) lives in
  Desktop\CashMoneyNFT-Working\manifest.csv — keep it private (reveals
  which token is the CONGRATULATIONS piece, currently #266).
