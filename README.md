# CashX ($CASHX)
> PulseChain community token with a burn-first casino brand.

**Live Site → [evmdev101.github.io/CashX](https://evmdev101.github.io/CashX/)**

---

## Overview

CashX is a community-driven token on PulseChain with a fixed supply, a 4% buy/sell tax that funds the treasury, and an active burn mechanism. This repository contains the official CashX landing page and live dashboard.

---

## Token Info

| Field | Value |
|---|---|
| **Network** | PulseChain (PRC-20) |
| **Contract** | `0x510c547318032275e41D1362A465783320d8152f` |
| **Supply** | 3,700,000,000 (fixed) |
| **Tax** | 4% buy / 4% sell |
| **Pair** | `0x8C59DC0d5C73Ee21748B526F93F512bd098d3ecb` |

---

## October 2026 contract migration

The active site uses the migrated CASHX, DISTROX, DIVX and GSX contracts. Farm IDs remain the same; LP and reward addresses were verified against Nexion poolInfo at block 27909259. The 63 supported token farms plus two NFT farms remain available.

DISTROX, DIVX and GSX now pay reflections and yield automatically. Their wallet balances already contain these payouts, so the site does not call the removed pending-reward functions or offer manual claims. BurnX retains its existing claim flow. Browser readings use a new cache namespace so retired-contract values do not populate current balances or charts.

Run `node --test scripts/check-migration.cjs` for offline migration checks, and `node scripts/compare-nexion.cjs` for a read-only same-block valuation comparison. The verified pool snapshot is in `scripts/fixtures/migration-20261027.json`.

## Farm transaction interaction

Farm, vault and NFT actions use `lib/transactions.js`. Each action has its own wallet-request and mining state; navigation and unrelated actions remain available. Rejected wallet requests release immediately. Submitted hashes remain tracked through RPC errors and page reloads, and only a successful receipt updates claimed balances. Claim All reserves its individual pool claims as well, preventing overlapping claims.

Pending actions are scoped by PulseChain, wallet, product, position and action. No transaction is automatically resubmitted. Wallet speed-ups and cancellations are followed; an unclear broadcast is checked against the intended destination, calldata and value before it can be treated as confirmed. The wallet selects its own nonce; the site does not require a nonce recovery workflow. Browser storage is optional, but tracking across page reloads requires it.

Run `node --test scripts/check-transactions.cjs` for controlled wallet/RPC tests. These tests do not send real transactions.

## Loading performance

Wallet farm reads publish raw balances before prices, APR and LP breakdowns. Interim rows are labelled as updating, their controls wait for complete data, and they cannot replace complete saved snapshots. The public metadata cache shares concurrent requests and keeps successful token metadata / LP members for one hour. LP reserves and calculator prices share a one-second window; wallet balances, pending rewards and allowances are not kept in that cache. Duplicate LP balance and allowance reads are shared only within one wallet-loading pass.

Vault data loads when its subtab opens. Wallet changes invalidate its previous account values even while the subtab is hidden. A newer post-transaction farm reading takes precedence over an older in-flight details pass.

Run `node --test scripts/check-loading-performance.cjs scripts/check-fast-farms.cjs` for controlled checks. For the configured LP fixture, cold LP-detail contract reads fall from 480 to 260 and repeat-pass reads from 360 to 110. These are LP-detail call counts, not total-page request counts or measured real-world loading times.

## Current Structure

| Path | Description |
|---|---|
| `index.html` | CashX landing page with original visual layout preserved |
| `dashboard.html` | Live burn tracker with original visual layout preserved |
| `app/` | Future page entry scripts |
| `components/` | Future reusable browser UI modules |
| `lib/` | PulseChain, contract, config, and burn data services |
| `utils/` | Formatting helpers |
| `styles/` | Future shared CashX styles |
| `public/assets/` | Preserved CashX imagery |
| `contracts/` | Future Solidity / ABI expansion area |
| `sections/`, `pages/`, `hooks/` | Future app-growth folders |

---

## Data Sources

- **DexScreener API** — price, market cap, volume, liquidity, % changes
- **PulseChain RPC + ethers.js** — treasury PLS balance, token supply, burn wallet balances
- **PulseChain Explorer API** — holders, transfer count, burn feed

The current burn tracker is read-only. Public burn stats do not require a wallet connection.

The reusable service files are prepared so future upgrades can move blockchain reads out of inline UI code without changing the current CashX page designs.

---

## Links

- 🌐 **Trade:** [PulseX](https://pulsex.com)
- 💬 **Telegram:** [t.me/+Ruw3dQPRTv00NDRl](https://t.me/+Ruw3dQPRTv00NDRl)
- 📺 **YouTube:** [Watch](https://www.youtube.com/watch?v=UefZfzeoU_M)

---

## Hosting

Static site hosted via GitHub Pages. No server required.

The site uses **only relative asset paths**, so the exact same files also work
when served from an IPFS gateway (`…/ipfs/<CID>/`). GitHub Pages and IPFS can run
side by side — neither affects the other.

---

## IPFS Deployment

The site is decentralization-ready. Anyone can host or pin it.

### 1. Build (stage a clean copy)

There's no compile step — this just copies the site into `dist/` without git
history, CI files, or backup HTML:

```bash
bash scripts/build-ipfs.sh
```

You now have a `dist/` folder ready to upload.

### 2. Upload to IPFS — easiest first

**Option A — Fleek (no terminal, auto-deploys on every push):**
1. Go to [fleek.xyz](https://fleek.xyz) and sign in with GitHub.
2. *Add new site* → pick the `evmdev101/CashX` repo.
3. Build command: `bash scripts/build-ipfs.sh` · Publish directory: `dist`
4. Deploy. Fleek pins it to IPFS and gives you a CID + gateway URL, and
   re-deploys automatically whenever you push to `main`.

**Option B — Pinata web UI (drag & drop):**
1. Create a free account at [app.pinata.cloud](https://app.pinata.cloud).
2. *Add* → *Folder* → select your local `dist/` folder.
3. Pinata uploads, pins, and shows you the **CID** and a gateway link.

**Option C — web3.storage:**
Upload the `dist/` folder at [web3.storage](https://web3.storage); it returns a CID
and keeps it pinned.

### 3. Upload via CLI (account-free, fully decentralized)

Install [IPFS Kubo](https://docs.ipfs.tech/install/command-line/), then:

```bash
bash scripts/build-ipfs.sh
ipfs add -rQ --cid-version=1 dist
```

That prints the **CID** (e.g. `bafy…`). Your local node is already serving it.

### 4. Pin it (so it stays online)

A CID only stays reachable while at least one node pins it. Options:

- **Pinata / Fleek / web3.storage** keep it pinned for you (steps above).
- **Pin by CID** on Pinata: dashboard → *Add* → *CID* → paste the CID.
- **Community pinning** — share the CID and anyone running a node can host it:
  ```bash
  ipfs pin add <CID>
  ```
- **Automated (CI):** the included GitHub Actions workflow
  (`.github/workflows/ipfs.yml`) builds the site and computes the CID on every
  push. Add a repo secret `PINATA_JWT` (Pinata → API Keys) and it will also
  auto-pin to Pinata. The workflow is read-only and never touches GitHub Pages.

### 5. Share the link

Once pinned, share any of these (replace `<CID>`):

- `ipfs://<CID>` — native (Brave, IPFS Companion, IPFS Desktop)
- `https://<CID>.ipfs.dweb.link/` — public gateway
- `https://ipfs.io/ipfs/<CID>/` — public gateway

> **Tip:** for a permanent name that doesn't change each deploy, point an
> **ENS** name or **DNSLink** record at the latest CID — then you can share one
> stable link while the underlying CID updates.
