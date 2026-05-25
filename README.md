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
