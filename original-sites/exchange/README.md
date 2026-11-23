# Limited Exchange

A Vite + React interface for fixed 1:1 token burn exchanges on PulseChain.

The site supports four locked pairs:

- CashX → LCashX
- DistroX → LDistroX
- DivX → LDivX
- GSX → LGSX

Only the matching original token can claim its limited counterpart. The output
token is selected automatically and cannot be changed to a different pair.

## Local development

Requirements: Node.js 22 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

The development server opens at `http://localhost:3000/`.

## Verification

```bash
pnpm build
pnpm test
```

`pnpm test` runs the Solidity tests, compiles the production contracts using
the PulseChain-compatible Paris EVM target, and builds the website.

## Deployment

Pushing the `main` branch runs `.github/workflows/deploy-pages.yml`. The workflow
builds the Vite app and publishes `dist/` to GitHub Pages.

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
The site will be available at:

`https://evmdev101.github.io/Limited-Exchange/`

## Contract status

The migrated original tokens and active burn exchanges are recorded in
`contracts/deployment/pulsechain-pools.json` and configured in `app/page.tsx`.
The Limited-token addresses remain unchanged. Run
`pnpm contracts:check-production` to verify token pairs, minter authority, and
exchange settings against PulseChain before publishing an address update.
