# CashX Ecosystem NFT — mainnet checklist

The contract has been deployed with the reviewed constructor values. Keep the sale closed until the remaining post-deployment checks are complete.

## Mainnet deployment

- Contract: `0x744351E2846498D040B649D694CAB21f32f14AFe`
- Transaction: `0x65c69aa507a7736897e5008b5dfcc10578228d7c5af09495f27c81a43d5c27e4`
- Block: `27306495`
- Deployer and owner: `0xc684B8024A1A852F6707ba01081fB55ABCC5E74d`
- Sale status at verification: closed
- Total supply at verification: `0`

Direct PulseChain reads confirmed the owner, treasury, price, maximum supply, metadata URI, and sale state. The deployed executable code matches the tested candidate after accounting for the immutable mainnet price.

## Validated deployment candidate

- Contract tests: `11 passed`, `0 failed`
- Compiler: Solidity `0.8.24`
- EVM target: `paris`
- Optimizer: enabled, `200` runs
- Deployed bytecode: `8,078` bytes
- Testnet V4 executable-code comparison: exact match after normalizing the immutable mint-price value
- Testnet V4 contract: `0x54Fa3D2FF523417D0887625BA5fc01F8063a5104`

The price is immutable. Deploying with the constructor value below permanently fixes the mainnet price at `1,000,000 PLS` per NFT. The mint has no deadline and can remain open while a separate Nexion farm is active.

## Exact Remix settings

- Source: `contracts/remix/CashXEcosystemNFT.sol`
- Solidity compiler: `0.8.24`
- EVM version: `paris`
- Optimizer: enabled, `200` runs
- Wallet network: PulseChain mainnet, chain ID `369`
- Deployment transaction value: `0 wei`

## Constructor values

| Field | Value |
| --- | --- |
| `initialOwner` | `0xc684B8024A1A852F6707ba01081fB55ABCC5E74d` |
| `initialTreasury` | `0x8875b605ad560792FC8420F901235961d863F62e` |
| `initialTokenURI` | `ipfs://bafkreihz5r3riranvj2wciy2w2xcfgznojpznb3cd2h3t4mqqsfxnf24pm` |
| `initialPricePerNFT` | `1000000000000000000000000` |

`initialPricePerNFT` is exactly 1,000,000 PLS expressed with 18 decimals. The sale starts closed.

## Immediately after deployment

Record the deployment transaction, contract address, and deployment block. Before any sale activation, confirm these read calls:

| Read call | Required result |
| --- | --- |
| `name()` | `CashX Ecosystem` |
| `symbol()` | `CASHXNFT` |
| `MAX_SUPPLY()` | `10000` |
| `PRICE_PER_NFT()` | `1000000000000000000000000` |
| `owner()` | reviewed owner address above |
| `treasury()` | reviewed treasury address above |
| `sharedTokenURI()` | final IPFS URI above |
| `saleActive()` | `false` |
| `totalSupply()` | `0` |

Then:

1. Verify the exact source and constructor arguments on the PulseChain explorer.
2. Set the website build variables to chain `369`, the new contract address, and its deployment block.
3. Build and inspect the production site while the sale remains closed.
4. Confirm the IPFS JSON and PNG again. If no metadata changes remain, the owner may call `freezeMetadata()`; this is permanent.
5. Confirm Nexion has the new ERC-721 address for its farm setup.
6. Only after every check passes, the owner calls `setSaleActive(true)`.

Do not give Nexion the Testnet V4 address or the original CashMoney collection address. Its new NFT pool must reference the newly deployed mainnet contract from this launch.

## Production website variables

```text
NEXT_PUBLIC_CASHX_CHAIN_ID=369
NEXT_PUBLIC_CASHX_CONTRACT_ADDRESS=0x744351E2846498D040B649D694CAB21f32f14AFe
NEXT_PUBLIC_CASHX_DEPLOYMENT_BLOCK=27306495
```

The production GitHub Pages build uses these same reviewed values.
