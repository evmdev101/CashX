# Nexion valuation comparison — 2026-09-06

The user wants this site to display a selected subset of Nexion farms using Nexion's valuation conventions. Keep compatibility estimates distinct from direct token-price estimates; do not silently replace one with the other.

## Sources inspected

- [Nexion Farm Explorer](https://nexionpulse.com/farmexplorer)
- [Farm data calculations, chunk 5518.247a05ff](https://nexionpulse.com/static/js/5518.247a05ff.chunk.js)
- [Farm Explorer position summary, chunk 2279.657345d4](https://nexionpulse.com/static/js/2279.657345d4.chunk.js)

These were fetched from Nexion's public deployment, not inferred from a screenshot. Future deployments can change the formula or chunk names.

## Findings

The farm data hook estimates remaining rewards from the original reward amount multiplied by the fraction of the schedule remaining. It prices that amount to produce `rewardValue`. Farm TVL includes stake value plus that remaining reward value.

The position summary computes primary farm claimable USD as pending tokens multiplied by `rewardValue / original reward tokens`. That is different from pricing the pending tokens directly at the current token price. For example, with 10 pending tokens priced at $1 and half the original schedule remaining, the compatibility estimate is $5 and the direct price estimate is $10. Neither formula changes the raw claimable tokens returned by the farm contract. Dollar estimates are not guaranteed sale proceeds.

Nexion's token-stake subtotal comes from the user's fraction of each token farm's stake value. Its NFT active-position and reward counters are calculated separately. The local subtotal previously added the CashX ECO NFT mint-value estimate; it now excludes that estimate to follow the same token-stake scope. This is not a claim that every global Nexion position is covered by this selected-farm site.

The screenshots alone do not establish the exact cause of the small TVL discrepancies: they are not readings at a shared block, timestamp and price snapshot. Do not promise identical dollars across independently refreshed sites.

## Local behavior

- Farm card and summary claimable USD follow the Nexion convention.
- The user requested removal of the comparison and My positions panels. No alternative market estimate is displayed or retained in valuation results.
- The token-stake subtotal excludes NFT mint-value estimates, consistent with the Nexion summary scope.
- No signing or transaction behavior was changed for this comparison.

Run `node --test scripts/check-data-flows.cjs` for regression checks.

## Same-block verification

`node scripts/compare-nexion.cjs` reads public contracts at a single block and compares the actual local valuation function against the formulas above. The saved `nexion-comparison.json` records block 27478152 (2026-09-06 17:23:55 UTC).

The CASHX/DISTROX LP (#200), DIVX (#240, pHEX rewards with 8 decimals), and GSX (#257, PLSX rewards) matched for reward token, decimals, remaining-reward USD, TVL, APR and claimable USD conversion. Claimable conversion uses a controlled amount of 10 reward tokens; this is not a connected-wallet balance comparison. Independently refreshed pages can still show small differences because their prices and timestamps differ.

Search, reward filtering and favorites use existing farm results without new blockchain calls. They leave portfolio totals and the existing refresh scope intact. Favorites persist only in this browser. Ending badges use the existing countdown timer and appear below seven days; expired schedules say "Rewards ended".
