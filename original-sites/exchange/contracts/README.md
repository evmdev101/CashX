# Limited-token burn and mint exchanges

The production system uses four separate contracts. Every contract is permanently locked to one original token and one matching Limited token.

The original tokens have migrated. Current original-token and exchange addresses
are recorded in `deployment/pulsechain-pools.json`. The sources and artifacts in
this folder describe the legacy deployments below; do not redeploy them as the
current migrated contracts. The website uses the active deployments listed next.

| Deployable contract | Original token | Limited token |
| --- | --- | --- |
| `CashXLCashXMintExchange` | CashX `0x4C450b3C2b89a2DAbE5A3eE39FF475134A30d665` | LCashX `0x57cBC908078b291117242385Fe7C0cf3582fA460` |
| `DistroXLDistroXMintExchange` | DistroX `0xA1198e47Ac3D89903D7eCFd04a14b8Bfd72d7B03` | LDistroX `0xfC961146971679Cc4E731F60D72B60eb3dd8b036` |
| `DivXLDivXMintExchange` | DivX `0x6df9CD07BF067b42A700dc679bD9325Ff61Da8f3` | LDivX `0x8DbD0923c0c2dd4973806B655036251610aE11BC` |
| `GSXLGSXMintExchange` | GSX `0x395127a44Ac1CDc609C8CC9d048E096e8E8fC30e` | LGSX `0xCc6A42F028905096c76E5631aed78e20f5CDDFBa` |

## Active PulseChain deployments after original-token migration

| Pair | Exchange address |
| --- | --- |
| CashX → LCashX | `0xE346B08433BE131A7964a7e1F46c6fC28eC69003` |
| DistroX → LDistroX | `0x3EbC49f2e89260655D957774E73440e20e942934` |
| DivX → LDivX | `0x2b199B79E84f74e06c1E08baf92249Be4003EBa0` |
| GSX → LGSX | `0x9548c4b026b5B4026C60edd39D17D72EABa97093` |

These deployments accept the migrated original tokens and are the current
minters of the existing Limited tokens. Previous exchange contracts are retired
and must not be reused. The notes below document the legacy contract logic;
verify the deployed replacement implementation before using its behavior as a
deployment reference.

All four inherit `SwapBurnMintExchangeCore.sol`. That file contains the shared production logic and is not deployed by itself.

## One atomic exchange

For an input of 100 original tokens, one call does all of the following:

1. Permanently burns 80 original tokens.
2. Sends 20 original tokens through PulseX V2 and delivers the resulting native PLS to `0x175750eA3aDed69d2375ffe044BFb6E46ec90702`.
3. Mints exactly 100 matching Limited tokens to the user.
4. Mints an additional 5 Limited tokens to the management wallet `0xDBA19652f7Ed3f3AE6266c91669C6083ba8cE557`.
5. Updates the on-chain statistics and emits one event.

If the burn, swap, PLS transfer, user mint, management mint, or any exact-amount check fails, the whole transaction reverts. The user does not lose the original tokens on a failed exchange.

The exchange never holds a reserve of Limited tokens. It mints on demand, so the matching Limited token must name the deployed exchange as its active minter. Do not transfer Limited-token ownership to the exchange.

## Fixed shared addresses

- PulseX V2 router: `0x165C3410fC91EF562C50559f7d2289fEbed552d9`
- WPLS: `0xA1077a294dDE1B09bB078844df40758a5D0f9a27`
- PLS treasury: `0x175750eA3aDed69d2375ffe044BFb6E46ec90702`
- 5% management wallet: `0xDBA19652f7Ed3f3AE6266c91669C6083ba8cE557`
- permanent burn sink: `0x000000000000000000000000000000000000dEaD`

The production wrappers have no constructor input. Their initial owner is fixed as the Limited-token creator wallet, `0x175750eA3aDed69d2375ffe044BFb6E46ec90702`. This address can pause/unpause an exchange and transfer its exchange ownership. It cannot change the token pair, percentages, router, treasury, management wallet, or burn sink.

## Current on-chain Limited-token state

All four Limited tokens were checked on PulseChain before these wrappers were created:

- 18 decimals, matching their originals.
- Initial total supply of 1 token.
- Minting is not finalized.
- Owner is `0x175750eA3aDed69d2375ffe044BFb6E46ec90702`.
- Current minter is `0xa0419404eF7b81d9Ec64367eb68e5f425EACE618` until the owner rotates each token to its new exchange.

The starting token is not counted in exchange statistics. It may be sent to a burn address if the project wants the public supply to start at zero, but that is separate from deploying the exchange.

Never press **Finalize Minting**. Finalization removes the minter irreversibly and would permanently stop the exchange from minting.

## Safety checks before opening each pair

1. Confirm the source code and every hardcoded address.
2. Confirm the hardcoded `INITIAL_OWNER` is `0x175750eA3aDed69d2375ffe044BFb6E46ec90702`.
3. Deploy the matching named contract with the PulseChain/Paris settings in `REMIX-DEPLOYMENT.md`.
4. Verify all public getters and source code on the explorer.
5. Confirm the original token permits the exact incoming transfer. Reflection dust received during the router swap is tolerated; a taxed incoming transfer intentionally reverts.
6. Rotate only the matching Limited token's minter to the new exchange.
7. Perform a tiny live exchange and confirm exact supply reduction, PulseX swap, treasury PLS, 1:1 user mint, 5% management mint, and statistics.
8. Pause immediately if any result differs.

The production logic passed a complete CashX mainnet prototype flow. Every production pair still requires its own tiny live test because token behavior and tax settings can differ.

Automated atomicity and accounting tests are kept under `test/`, separate from the production contracts. Run `pnpm test:contracts` for those checks or `pnpm test` for the tests, production artifacts, and website build. Independent security review is still recommended before public launch.
