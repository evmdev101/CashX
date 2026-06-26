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
| **Contract** | `0x4C450b3C2b89a2DAbE5A3eE39FF475134A30d665` |
| **Supply** | 3,700,000,000 (fixed) |
| **Tax** | 4% buy / 4% sell |
| **Pair** | `0xda942580cee2a69c5fc74109090816157730c64d` |

---

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
