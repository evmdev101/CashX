# PulseChain Remix deployment checklist

This prepares the four production contracts but does not authorize deployment or minter changes. The Limited-token creator wallet is locked in as the initial exchange owner.

## Compiler settings

Use the same settings for every contract:

- Solidity compiler: `0.8.36+commit.8a079791`
- EVM version: `paris`
- Optimization: enabled
- Runs: `200`
- `viaIR`: off
- OpenZeppelin Contracts: `5.6.1` from this project

Do not use the compiler default, Cancun, or Osaka. PulseChain deployment bytecode must target Paris.

## Wallet and network

- Environment: connected browser wallet
- Network: PulseChain Mainnet
- Chain ID: `369`
- Constructor value: `0` PLS
- Constructor argument: none

The deploying wallet pays gas. The initial owner is fixed as `0x175750eA3aDed69d2375ffe044BFb6E46ec90702`, the Limited-token creator wallet. It controls only pause/unpause and exchange ownership; the PLS treasury and 5% management recipient are also fixed in the source.

## Deploy exactly these contracts

| Source file | Contract selected in Remix | Limited token | Constructor input |
| --- | --- | --- | --- |
| `CashXLCashXMintExchange.sol` | `CashXLCashXMintExchange` | `0x57cBC908078b291117242385Fe7C0cf3582fA460` | none |
| `DistroXLDistroXMintExchange.sol` | `DistroXLDistroXMintExchange` | `0xfC961146971679Cc4E731F60D72B60eb3dd8b036` | none |
| `DivXLDivXMintExchange.sol` | `DivXLDivXMintExchange` | `0x8DbD0923c0c2dd4973806B655036251610aE11BC` | none |
| `GSXLGSXMintExchange.sol` | `GSXLGSXMintExchange` | `0xCc6A42F028905096c76E5631aed78e20f5CDDFBa` | none |

Do not deploy `SwapBurnMintExchangeCore`, any `I...` interface, `SafeERC20`, or `StorageSlot`. Only deploy one of the four named contracts in the table above.

## Verify immediately after every deployment

Read the following getters before changing a Limited token's minter:

1. `burnToken()` equals the intended original token.
2. `limitedToken()` equals the intended matching Limited token.
3. `pulseXRouter()` equals `0x165C3410fC91EF562C50559f7d2289fEbed552d9`.
4. `wrappedPls()` equals `0xA1077a294dDE1B09bB078844df40758a5D0f9a27`.
5. `treasury()` equals `0x175750eA3aDed69d2375ffe044BFb6E46ec90702`.
6. `managementWallet()` equals `0xDBA19652f7Ed3f3AE6266c91669C6083ba8cE557`.
7. `owner()` equals `0x175750eA3aDed69d2375ffe044BFb6E46ec90702`.
8. `paused()` is false.
9. `BURN_BPS()` is `8000`, `SWAP_BPS()` is `2000`, and `MANAGEMENT_MINT_BPS()` is `500`.

If any value is wrong, abandon that deployment. Constructor values and immutable addresses cannot be edited.

## Connect each Limited token to its exchange

Use the wallet that currently owns the Limited token. On Nexion, open the Limited token's **Manage Token** page and find **Mint Controls**.

1. Copy the verified matching exchange address.
2. Paste it under **Rotate Minter**.
3. Click **Set Minter** and confirm the wallet transaction.
4. Refresh and confirm the displayed minter is the exchange address.

Use only the new exchange addresses produced by this deployment. The previous
exchange contracts are permanently connected to the retired Limited tokens and
cannot be reused.

Do not transfer token ownership to the exchange. Do not press **Finalize Minting**. Do not renounce ownership.

If a contract is replaced before finalization, the Limited-token owner can rotate the minter from the old exchange to the verified replacement. The old contract immediately becomes unable to mint.

## Tiny live test for every pair

Before public use:

1. Confirm the original token permits a direct transfer of the exact input amount to the exchange. The core accepts harmless reflection dust credited during the swap, but a taxed incoming transfer intentionally reverts.
2. Use a very small amount that still produces a nonzero 5% management mint.
3. Read `quote(amount)` and `quotePlsOut(amount)`.
4. Set the website's minimum PLS output using an explicit slippage tolerance.
5. Approve the original token for only the test amount.
6. Call `burnAndMint(amount, minPlsOut)`.
7. Confirm 80% reduced the original `totalSupply()` and the dead-address transfer is visible.
8. Confirm 20% was swapped through PulseX and native PLS reached the fixed treasury.
9. Confirm the user received exactly 1:1 Limited tokens.
10. Confirm the management wallet received exactly 5% extra Limited tokens.
11. Confirm all exchange statistics increased by the same values.

Any failure must revert the complete transaction. If the original does not reduce supply exactly or taxes the incoming exchange transfer, correct the token configuration instead of weakening the checks.

## Explorer verification

Verify with the exact deployment settings:

- Compiler: `0.8.36+commit.8a079791`
- EVM: `paris`
- Optimization: enabled, 200 runs
- Contract: exact named production contract
- Constructor argument: none

After all four tiny tests pass, record the addresses in `contracts/deployment/pulsechain-pools.json`, update the website configuration, run the full build, and request an independent security review before public launch.
