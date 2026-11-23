# CashX Ecosystem NFT Mint

GitHub Pages mint site and native-PLS sale contract for a 10,000-piece CashX Ecosystem NFT collection on PulseChain.

The wallet connection, mint flow, holder table, and activity feed read from the verified mainnet deployment configuration. Testnet V4 was validated end to end with a real mint, shared IPFS metadata, and immediate treasury forwarding.

The Solidity contract, deployment scripts, verified launch inputs, and production checklist live in [`contracts/`](contracts/README.md).

## Local development

```bash
pnpm install
pnpm dev
```

## Production build

```bash
pnpm build
```

The committed defaults target the deployed PulseChain mainnet contract. GitHub Actions publishes the static build to:

<https://evmdev101.github.io/cashx-10000-nft-mint/>

## Contract checks

```bash
pnpm contract:check
```

Read `PROJECT-BRIEF.md` before enabling any wallet or mint transaction.

## PulseChain mainnet deployment

- Contract: `0x744351E2846498D040B649D694CAB21f32f14AFe`
- Deployment transaction: `0x65c69aa507a7736897e5008b5dfcc10578228d7c5af09495f27c81a43d5c27e4`
- Deployment block: `27306495`
- Chain ID: `369`
- Price: `1,000,000 PLS`
- Supply: `10,000`
- Sale status at verification: closed
- Metadata: `ipfs://bafkreihz5r3riranvj2wciy2w2xcfgznojpznb3cd2h3t4mqqsfxnf24pm`
- Treasury: `0x8875b605ad560792FC8420F901235961d863F62e`

## Validated Testnet V4 deployment

- Contract: `0x54Fa3D2FF523417D0887625BA5fc01F8063a5104`
- Chain ID: `943`
- Price: `0.1 tPLS`
- Metadata: `ipfs://bafkreihz5r3riranvj2wciy2w2xcfgznojpznb3cd2h3t4mqqsfxnf24pm`
- Treasury: `0x8875b605ad560792FC8420F901235961d863F62e`
- First mint: `0xd70362d43ecd99b528f8654ff1361e7aa20b5ad2bffef32b8976201a6892c544`

The first mint created token `#1`, resolved the pinned metadata, and increased the treasury balance by exactly `0.1 tPLS` in the same block.
