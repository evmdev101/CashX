# CashX Ecosystem NFT — working brief

## Confirmed from the latest customer message

- Network: PulseChain
- Supply: 10,000 NFTs
- Artwork: the same CashX Ecosystem image for every NFT
- Price: 1,000,000 PLS per NFT
- Intended treasury: `0x8875b605ad560792FC8420F901235961d863F62e`
- Mint deadline: none
- Post-mint path: holders take their NFT to Nexion and stake it
- Reward direction: staking rewards are intended to grow with ecosystem activity
- Token mechanic: CashX buy-and-burn utility
- Site direction: reuse the clear mint flow, stats, tabs, and dark neon visual language from `cashmoney-mint` and `degenNFT`

## Needed before a live launch

Completed:

- Collection name and symbol: CashX Ecosystem / CASHXNFT.
- Final artwork is installed and its pinned IPFS bytes match the local source image.
- Final metadata URI is pinned and resolves through multiple public gateways.
- Testnet deployment and end-to-end wallet mint are successful.
- The first mint forwarded exactly `0.1 tPLS` to the configured treasury.
- The live site reads price, supply, holders, and activity from the contract.
- The mainnet contract is deployed at `0x744351E2846498D040B649D694CAB21f32f14AFe`.
- The deployed executable code, owner, treasury, price, supply, metadata URI, and closed sale state have been checked directly on PulseChain.
- The production website is configured for GitHub Pages and the mainnet deployment.

Still required before mainnet sale activation:

1. An independent reviewer should review the final contract. Local tests are not an independent audit.
2. Verify the source and constructor arguments on the PulseChain explorer.
3. Publish and inspect the GitHub Pages website while the sale remains closed.
4. Perform a controlled first mainnet mint and confirm the treasury receives the exact payment.
5. Freeze metadata only after inspecting token `#1` from the mainnet deployment.
6. Confirm with the main developer/Nexion that the new mainnet ERC-721 address has been accepted for its farm. The Stake tab must remain in setup mode until Nexion supplies the farm and reward contract addresses.
7. Announce the sale only after the controlled mainnet mint and final website check pass.

## Safety rule

Never reuse the Testnet address in a production build. Keep the mainnet sale closed until the deployed contract, treasury, price, supply, source verification, and metadata have all been checked on PulseChain.
