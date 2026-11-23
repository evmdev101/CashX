# CashMoney NFT

CashMoney is a 369-piece PulseChain NFT mint website. It is a static React +
Vite application: no backend and no local storage.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Verify the configured contract

```bash
npm run check
```

This reads the active contract configuration directly from PulseChain. Once
mainnet is enabled, it also verifies the reviewed price, eDAI address,
treasury, and IPFS metadata URI before the site is published.

## Mainnet launch

The website is configured for the deployed PulseChain mainnet contract at
`0x1b9C3cebE3E6e6Db92d525CC5cF3bECa86397ee6`.

Before publishing an update, run `npm run check` and make sure every mainnet
verification says `OK`, then run `npm run build`.

The mint UI reads its price and eDAI token from the contract itself, rather
than hardcoding them in the website.

## GitHub and hosting

Use GitHub to store and version the source code. Do not use GitHub Pages for
the live mint: GitHub Pages is not intended for sites that facilitate
commercial transactions. Deploy this static site from the GitHub repository
through a suitable static host such as Cloudflare Pages or Netlify instead.

## Contract

The reviewed mainnet deployment source is in
`contracts/CashMoney-NFT.sol`. Compile it for PulseChain with **EVM version
`paris`**, not Cancun.
