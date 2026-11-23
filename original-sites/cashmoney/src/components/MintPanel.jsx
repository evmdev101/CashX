import { useState } from 'react'
import { ethers } from 'ethers'
import { useMintData } from '../hooks/useMintData'
import { useNow } from '../hooks/useNow'
import {
  CASHMONEY_CONTRACT_ADDRESS, MAX_MINT_PER_TX, NETWORK, PLS_SYMBOL, EDAI_SYMBOL,
} from '../config'
import { CASHMONEY_ABI } from '../abi/cashMoney'
import { ERC20_ABI } from '../abi/erc20'
import LiveMints from './LiveMints'

function fmt(wei) {
  if (wei === null || wei === undefined) return '…'
  return Number(ethers.formatEther(wei)).toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function readableTxError(err) {
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001 || err?.info?.error?.code === 4001) {
    return 'Transaction rejected in your wallet.'
  }
  if (err?.code === 'INSUFFICIENT_FUNDS') {
    return `Not enough ${PLS_SYMBOL} to cover the mint cost plus gas.`
  }
  const reason = err?.reason || err?.revert?.args?.[0] || err?.info?.error?.message || err?.shortMessage
  if (reason) {
    const r = String(reason).toLowerCase()
    if (r.includes('insufficient allowance')) return `The contract is not approved to spend enough ${EDAI_SYMBOL}. Run the approve step first.`
    if (r.includes('exceeds balance') || r.includes('insufficient balance')) return `Not enough ${EDAI_SYMBOL} in your wallet.`
    if (r.includes('wrong pls') || r.includes('incorrect pls') || r.includes('wrong value')) return `Wrong ${PLS_SYMBOL} amount sent. The price may have changed — refresh and try again.`
    if (r.includes('sold out') || r.includes('max supply') || r.includes('exceeds supply')) return 'Not enough NFTs left for that quantity.'
    if (r.includes('not started')) return 'The mint has not started yet.'
    if (r.includes('ended') || r.includes('closed')) return 'The mint window has ended.'
    return `Transaction failed: ${reason}`
  }
  return 'Transaction failed. Check your wallet and try again.'
}

function StatusBox({ tone, children }) {
  const colors = {
    info:    { border: 'var(--red)', bg: 'color-mix(in srgb, var(--red) 12%, transparent)', text: 'var(--red)' },
    success: { border: '#34d399', bg: 'rgba(52, 211, 153, 0.12)', text: '#34d399' },
    error:   { border: '#f87171', bg: 'rgba(248, 113, 113, 0.12)', text: '#f87171' },
  }[tone]
  return (
    <div className="mt-3 rounded-md border px-3 py-2.5 text-xs leading-5" style={{ borderColor: colors.border, background: colors.bg, color: colors.text }}>
      {children}
    </div>
  )
}

export default function MintPanel({ wallet, onMinted }) {
  const { isConnected, isWrongNetwork, address, signer, connect, switchNetwork, connecting } = wallet
  const mint = useMintData(address)
  const { user } = mint

  const [qty, setQty] = useState(1)
  // idle | approve-wallet | approve-mining | mint-wallet | mint-mining
  const [txState, setTxState] = useState('idle')
  const [txError, setTxError] = useState(null)
  const [pendingHash, setPendingHash] = useState(null)
  const [copiedAddress, setCopiedAddress] = useState(null)

  async function copyAddress(value) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedAddress(value)
      window.setTimeout(() => setCopiedAddress((current) => current === value ? null : current), 1800)
    } catch {
      setTxError('Could not copy the address. Please select it and copy manually.')
    }
  }
  const [mintSuccess, setMintSuccess] = useState(null) // { hash, qty }

  const busy = txState !== 'idle'

  // ── Derived chain state ─────────────────────────────────────
  const remaining = mint.loaded ? Number(mint.maxSupply - mint.totalMinted) : 0
  const progress = mint.loaded && mint.maxSupply > 0n
    ? (Number(mint.totalMinted) / Number(mint.maxSupply)) * 100
    : 0

  // Ticks every second so the countdown, status badge, and mint button
  // all flip live the moment the mint window opens or closes.
  const now = useNow()
  const nowSec = BigInt(now)
  const notStarted = mint.loaded && mint.mintStart > 0n && nowSec < mint.mintStart
  const ended = mint.loaded && mint.mintEnd > 0n && nowSec > mint.mintEnd
  const soldOut = mint.loaded && remaining <= 0
  const mintLive = mint.loaded && !notStarted && !ended && !soldOut

  const qtyBig = BigInt(qty)
  const plsTotal = mint.plsAmount * qtyBig
  const edaiTotal = mint.edaiAmount * qtyBig

  const needsApproval = user.loaded && user.edaiAllowance < edaiTotal
  const lowEdai = user.loaded && user.edaiBalance < edaiTotal
  const lowPls = user.loaded && user.plsBalance < plsTotal
  const approvalComplete = user.loaded && !needsApproval

  const maxQty = Math.max(1, Math.min(MAX_MINT_PER_TX, remaining || MAX_MINT_PER_TX))

  // ── Step 1: approve eDAI ────────────────────────────────────
  async function handleApprove() {
    if (busy || !signer) return
    setTxError(null)
    setMintSuccess(null)
    try {
      setTxState('approve-wallet')
      const edai = new ethers.Contract(mint.edaiAddress, ERC20_ABI, signer)
      const tx = await edai.approve(CASHMONEY_CONTRACT_ADDRESS, edaiTotal)
      setPendingHash(tx.hash)
      setTxState('approve-mining')
      await tx.wait()
      await mint.refreshUser()
    } catch (err) {
      console.error('Approve failed:', err)
      setTxError(readableTxError(err))
    } finally {
      setTxState('idle')
      setPendingHash(null)
    }
  }

  // ── Step 2: mint ────────────────────────────────────────────
  async function handleMint() {
    if (busy || !signer) return
    setTxError(null)
    setMintSuccess(null)
    try {
      setTxState('mint-wallet')
      const nft = new ethers.Contract(CASHMONEY_CONTRACT_ADDRESS, CASHMONEY_ABI, signer)
      const tx = await nft.mint(qtyBig, { value: plsTotal })
      setPendingHash(tx.hash)
      setTxState('mint-mining')
      const receipt = await tx.wait()
      setMintSuccess({ hash: receipt.hash, qty })
      // Reveal (display only): extract the minted token IDs from the receipt.
      // Primary source: the Minted event. Fallback: ERC721 Transfer-from-zero
      // logs. onMinted lives in App, so the overlay opens even if the user
      // switched tabs while the tx was mining.
      try {
        let ids = []
        const transferIds = []
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== CASHMONEY_CONTRACT_ADDRESS.toLowerCase()) continue
          const parsed = (() => { try { return nft.interface.parseLog(log) } catch { return null } })()
          if (!parsed) continue
          if (parsed.name === 'Minted') {
            const first = parsed.args.firstTokenId
            ids = Array.from({ length: Number(parsed.args.quantity) }, (_, k) => (first + BigInt(k)).toString())
            break
          }
          if (parsed.name === 'Transfer' && parsed.args.from === ethers.ZeroAddress) {
            transferIds.push(parsed.args.tokenId.toString())
          }
        }
        if (ids.length === 0) ids = transferIds
        console.log('Minted token IDs for reveal:', ids)
        if (ids.length > 0) onMinted?.(ids)
      } catch (err) {
        console.error('Could not extract minted IDs (reveal skipped):', err)
      }
      await Promise.all([mint.refresh(), mint.refreshUser()])
    } catch (err) {
      console.error('Mint failed:', err)
      setTxError(readableTxError(err))
    } finally {
      setTxState('idle')
      setPendingHash(null)
    }
  }

  function ActionButton() {
    if (!isConnected) {
      return (
        <button onClick={connect} disabled={connecting} className="font-cashx-ui btn-accent w-full py-3.5 text-sm font-bold">
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      )
    }
    if (isWrongNetwork) {
      return (
        <button onClick={switchNetwork} className="font-cashx-ui w-full rounded-md border border-red-500 bg-red-500/90 py-3.5 text-sm font-bold text-white">
          Switch to {NETWORK.CHAIN_NAME}
        </button>
      )
    }
    if (!mint.loaded || !user.loaded) {
      return (
        <button disabled className="font-cashx-ui btn-ghost w-full py-3.5 text-sm font-bold">
          Loading…
        </button>
      )
    }
    if (!mintLive) {
      return (
        <button disabled className="font-cashx-ui btn-ghost w-full py-3.5 text-sm font-bold">
          {soldOut ? 'Sold Out' : ended ? 'Mint Ended' : 'Mint Not Started'}
        </button>
      )
    }
    if (needsApproval) {
      return (
        <button onClick={handleApprove} disabled={busy || lowEdai} className="font-cashx-ui btn-accent w-full py-3.5 text-sm font-bold">
          {txState === 'approve-wallet' ? 'Confirm in Wallet…'
            : txState === 'approve-mining' ? 'Approving…'
            : `Approve ${EDAI_SYMBOL}`}
        </button>
      )
    }
    return (
      <button onClick={handleMint} disabled={busy || lowEdai || lowPls} className="font-cashx-ui btn-accent w-full py-3.5 text-sm font-bold">
        {txState === 'mint-wallet' ? 'Confirm in Wallet…'
          : txState === 'mint-mining' ? 'Minting…'
          : 'Mint'}
      </button>
    )
  }

  return (
    <div className="w-full">
      <h1 className="font-cashx-ui text-3xl font-bold sm:text-4xl">Mint CashMoney NFT</h1>

      {/* Supply counter */}
      <div className="mt-6">
        <div className="font-cashx-ui mb-2 flex items-center justify-between gap-4 text-xs font-bold">
          <span>Items minted</span>
          <span className="tabular-nums">{mint.loaded ? `${mint.totalMinted} / ${mint.maxSupply}` : '— / —'}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-md" style={{ background: 'color-mix(in srgb, var(--fg) 9%, transparent)' }}>
          <div
            className="h-full rounded-md transition-all duration-700"
            style={{
              width: `${Math.max(progress, 1)}%`,
              background: 'var(--red)',
            }}
          />
        </div>
      </div>

      {mint.error && <StatusBox tone="error">{mint.error}</StatusBox>}

      {/* OpenSea-style active mint stage */}
      <section className="panel mt-6 overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_26px_minmax(0,1fr)] items-center gap-2 border-b px-5 py-4 sm:px-6" style={{ borderColor: 'color-mix(in srgb, var(--border) 46%, transparent)' }}>
          <div className="flex min-w-0 items-center gap-2.5" style={{ color: approvalComplete ? '#34d399' : 'var(--red)' }}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold" style={{ borderColor: 'currentColor', background: approvalComplete ? 'rgba(52,211,153,0.12)' : 'color-mix(in srgb, var(--red) 12%, transparent)' }}>
              {approvalComplete ? '✓' : '1'}
            </span>
            <span className="truncate text-xs font-bold">Approve {EDAI_SYMBOL}</span>
          </div>
          <span className="text-center text-sm" style={{ color: 'var(--red)' }}>→</span>
          <div className="flex min-w-0 items-center gap-2.5" style={{ color: approvalComplete ? 'var(--red)' : 'color-mix(in srgb, var(--fg) 42%, transparent)' }}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold" style={{ borderColor: 'currentColor', background: approvalComplete ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'transparent' }}>2</span>
            <span className="truncate text-xs font-bold">Mint NFT</span>
          </div>
        </div>
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold tabular-nums">
              <span>{mint.loaded ? fmt(mint.edaiAmount) : '…'} {EDAI_SYMBOL}</span>
              <span className="muted text-sm">+</span>
              <span>{mint.loaded ? fmt(mint.plsAmount) : '…'} {PLS_SYMBOL}</span>
            </div>
            <div className="mt-1.5 text-[10px]">
              <span className="muted">Total · {mint.loaded ? fmt(edaiTotal) : '…'} {EDAI_SYMBOL} + {mint.loaded ? fmt(plsTotal) : '…'} {PLS_SYMBOL}</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="shrink-0">
              <div
                className="flex h-[50px] items-center overflow-hidden rounded-md border"
                style={{ borderColor: 'color-mix(in srgb, var(--border) 62%, transparent)', background: 'color-mix(in srgb, var(--bg) 55%, transparent)' }}
              >
                <button
                  type="button"
                  onClick={() => setQty(v => Math.max(1, v - 1))}
                  disabled={qty <= 1 || busy}
                  className="h-full w-10 text-lg transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-10 text-center text-sm font-bold tabular-nums">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(v => Math.min(maxQty, v + 1))}
                  disabled={qty >= maxQty || busy}
                  className="h-full w-10 text-lg transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>
            <div className="min-w-0 flex-1 sm:w-[140px] sm:flex-none">
              <ActionButton />
            </div>
          </div>
        </div>
      </section>

      {user.loaded && lowEdai && (
        <StatusBox tone="error">You need {fmt(edaiTotal)} {EDAI_SYMBOL} but only have {fmt(user.edaiBalance)}.</StatusBox>
      )}
      {user.loaded && !lowEdai && lowPls && (
        <StatusBox tone="error">You need {fmt(plsTotal)} {PLS_SYMBOL} but only have {fmt(user.plsBalance)}.</StatusBox>
      )}
      {(txState === 'approve-wallet' || txState === 'mint-wallet') && (
        <StatusBox tone="info">Waiting for confirmation in your wallet…</StatusBox>
      )}
      {(txState === 'approve-mining' || txState === 'mint-mining') && (
        <StatusBox tone="info">
          {txState === 'approve-mining' ? 'Approval' : 'Mint'} transaction submitted — waiting for PulseChain…
          {pendingHash && (
            <>
              {' '}
              <a className="underline" href={`${NETWORK.EXPLORER_URL}/tx/${pendingHash}`} target="_blank" rel="noreferrer">View on explorer</a>
            </>
          )}
        </StatusBox>
      )}
      {txError && <StatusBox tone="error">{txError}</StatusBox>}
      {mintSuccess && (
        <StatusBox tone="success">
          Minted {mintSuccess.qty} NFT{mintSuccess.qty > 1 ? 's' : ''} successfully!{' '}
          <a className="underline" href={`${NETWORK.EXPLORER_URL}/tx/${mintSuccess.hash}`} target="_blank" rel="noreferrer">View on explorer</a>
        </StatusBox>
      )}

      <LiveMints edaiAmount={mint.edaiAmount} plsAmount={mint.plsAmount} />

      {/* Wallet balances */}
      {isConnected && !isWrongNetwork && user.loaded && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="panel px-3 py-2.5"><div className="muted text-[8px] uppercase tracking-widest">Your {EDAI_SYMBOL}</div><div className="mt-1 text-xs font-bold tabular-nums">{fmt(user.edaiBalance)}</div></div>
          <div className="panel px-3 py-2.5"><div className="muted text-[8px] uppercase tracking-widest">Your {PLS_SYMBOL}</div><div className="mt-1 text-xs font-bold tabular-nums">{fmt(user.plsBalance)}</div></div>
          <div className="panel px-3 py-2.5"><div className="muted text-[8px] uppercase tracking-widest">Approved {EDAI_SYMBOL}</div><div className="mt-1 text-xs font-bold tabular-nums">{fmt(user.edaiAllowance)}</div></div>
        </div>
      )}

      {/* Contract links */}
      <div className="muted mt-5 border-t pt-3 text-[11px] leading-5" style={{ borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)' }}>
        <div>
          Contract:{' '}
          <a className="underline" href={`${NETWORK.EXPLORER_URL}/address/${CASHMONEY_CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
            {CASHMONEY_CONTRACT_ADDRESS.slice(0, 10)}…{CASHMONEY_CONTRACT_ADDRESS.slice(-8)}
          </a>
          <button
            type="button"
            onClick={() => copyAddress(CASHMONEY_CONTRACT_ADDRESS)}
            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-400/60 bg-sky-950/50 text-sky-300 transition hover:border-sky-300 hover:bg-sky-900/70 hover:text-white"
            aria-label="Copy contract address"
          >
            {copiedAddress === CASHMONEY_CONTRACT_ADDRESS ? 'Copied' : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
                <rect x="9" y="9" width="10" height="10" rx="1" />
                <path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" />
              </svg>
            )}
          </button>
        </div>
        {mint.loaded && mint.edaiAddress && (
          <div>
            {EDAI_SYMBOL} token:{' '}
            <a className="underline" href={`${NETWORK.EXPLORER_URL}/address/${mint.edaiAddress}`} target="_blank" rel="noreferrer">
              {mint.edaiAddress.slice(0, 10)}…{mint.edaiAddress.slice(-8)}
            </a>
            <button
              type="button"
              onClick={() => copyAddress(mint.edaiAddress)}
              className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-400/60 bg-sky-950/50 text-sky-300 transition hover:border-sky-300 hover:bg-sky-900/70 hover:text-white"
              aria-label={`Copy ${EDAI_SYMBOL} token address`}
            >
              {copiedAddress === mint.edaiAddress ? 'Copied' : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
                  <rect x="9" y="9" width="10" height="10" rx="1" />
                  <path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Dev-only: preview the pack reveal without minting (stripped from production builds) */}
      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={() => onMinted?.(['13', '14', '15'])}
          className="muted mt-3 w-full text-center text-[10px] underline opacity-60 hover:opacity-100"
        >
          test reveal animation (dev only)
        </button>
      )}
    </div>
  )
}
