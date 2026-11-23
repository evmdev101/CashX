# CashX Ecosystem NFT contract

This folder contains the native-PLS sale contract for the 10,000-piece CashX Ecosystem NFT collection.

## Mainnet deployment

- Contract: `0x744351E2846498D040B649D694CAB21f32f14AFe`
- Deployment transaction: `0x65c69aa507a7736897e5008b5dfcc10578228d7c5af09495f27c81a43d5c27e4`
- Deployment block: `27306495`
- Chain ID: `369`
- Sale status at verification: closed

Direct reads confirmed the intended owner, treasury, price, supply, and shared metadata URI. The deployed executable code matches the locally tested production candidate after normalizing the immutable price value.

## Locked collection economics

- Standard: ERC-721 + ERC-721 Enumerable
- Supply: 10,000 NFTs
- Mainnet price: 1,000,000 native PLS per NFT
- Testnet V4 price: 0.1 tPLS per NFT
- Artwork/metadata: one shared token URI for every token
- Deadline: none
- Per-transaction limit: none beyond the remaining collection supply
- Payment path: the complete payment is forwarded to the treasury in the mint transaction
- Token IDs: sequential, starting at 1

The contract exposes both `mint(quantity)` and `buyWithPLS(quantity)` so the new site can use the CashMoney naming or the DegenNFT naming. Both functions execute the same protected internal purchase logic.

The price is immutable after deployment. The deployment script automatically locks it to 0.1 tPLS on Testnet V4 (chain 943) and 1,000,000 PLS on PulseChain mainnet (chain 369), so a test deployment cannot accidentally change the production price.

There is no project-defined batch cap. A buyer can request any positive quantity that remains in the 10,000-NFT supply. PulseChain's block gas limit can still make an extremely large batch too expensive to fit into one transaction, in which case the buyer must use multiple transactions.

## Safety controls

- The sale starts closed and only the owner can open it.
- Incorrect or partial payments revert; the contract does not retain mint proceeds.
- Minting is guarded against reentrancy.
- Direct PLS transfers are rejected.
- Ownership uses OpenZeppelin's two-step ownership transfer.
- Treasury changes are also two-step: the proposed treasury must accept the role.
- Metadata can be updated before launch and frozen permanently after final IPFS verification.
- Compilation targets the `paris` EVM for PulseChain compatibility.

For production, the owner should be a reviewed multisig rather than a personal hot wallet. The owner can pause minting and change metadata until it is frozen, so those powers must be protected.

## Compile and test

From the project root:

```bash
pnpm install
pnpm contract:check
```

The compiler writes an ignored artifact to `contracts/artifacts/CashXEcosystemNFT.json`. The tests deploy the contract to an in-memory local chain and verify payment forwarding, pricing, sale controls, shared metadata, access control, and treasury rotation.

## Deployment inputs

The intended production treasury supplied for this collection is:

```text
0x8875b605ad560792FC8420F901235961d863F62e
```

It has a valid EIP-55 checksum and was observed as an externally owned account (no deployed bytecode) on PulseChain mainnet and Testnet V4 on 2026-08-16. The validated Testnet mint forwarded exactly `0.1 tPLS` to this address. The project owner must still reconfirm that this is the intended mainnet treasury immediately before deployment.

`pnpm contract:deploy` requires these environment variables:

```text
RPC_URL=<reviewed PulseChain RPC URL>
EXPECTED_CHAIN_ID=<the exact target chain ID>
DEPLOYER_PRIVATE_KEY=<deployment wallet private key>
OWNER_ADDRESS=<reviewed owner or multisig address>
TREASURY_ADDRESS=<reviewed treasury address>
TOKEN_URI=ipfs://<metadata CID>
```

The deployment script refuses to continue if the RPC chain ID differs from `EXPECTED_CHAIN_ID`. It does not open the sale. After deployment:

1. Verify the source and constructor arguments in the block explorer.
2. Confirm `MAX_SUPPLY`, `PRICE_PER_NFT`, `treasury`, `owner`, and `sharedTokenURI` on-chain.
3. Mint on testnet and prove that the exact PLS value reaches the treasury. This passed on Testnet V4 with transaction `0xd70362d43ecd99b528f8654ff1361e7aa20b5ad2bffef32b8976201a6892c544`.
4. Confirm the NFT can be deposited and withdrawn through Nexion.
5. Point the website at the deployed address and perform an end-to-end test.
6. Freeze metadata only after the final IPFS JSON and image are pinned and independently checked.
7. Have the owner call `setSaleActive(true)` only after every check passes.

## Frontend write

The safest UI flow is to read the quote from the contract and use the same value for the transaction:

```js
const value = await contract.quote(quantity);
const transaction = await contract.mint(quantity, { value });
await transaction.wait();
```

Do not enable the live wallet write in the website until the final deployed address and treasury have been approved.

The exact production sequence and Remix constructor values are recorded in [`MAINNET-CHECKLIST.md`](MAINNET-CHECKLIST.md).
