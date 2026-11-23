import { useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { IMAGES_CID, NETWORK } from '../config'
import { resolveToken } from '../hooks/useGallery'
import { useNow } from '../hooks/useNow'
import { ipfsToHttp, retryImageFromFallback } from '../lib/ipfs'
import {
  NEXION_FARM_URL,
  REWARD_TOKEN,
  approveNftFarm,
  claimRewards,
  friendlyStakingError,
  getFarmStats,
  getWalletFarmState,
  isStakingConfigured,
  stake,
  unstake,
} from '../lib/staking'

const EMPTY_WALLET_STATE = {
  walletBalance: 0,
  walletTokens: [],
  stakedTokens: [],
  pendingRewards: [],
  pendingSyncedAt: 0,
  approved: false,
}

function formatUsd(value, loading = '—') {
  if (!Number.isFinite(value)) return loading
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
}

function formatToken(raw, decimals = 18, digits = 2) {
  if (typeof raw !== 'bigint') return '—'
  const value = Number(ethers.formatUnits(raw, decimals))
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function rawUsd(raw, scaledPrice, decimals = 18) {
  if (typeof raw !== 'bigint' || !(scaledPrice > 0)) return null
  return Number(ethers.formatUnits(raw, decimals)) * scaledPrice / 1e18
}

function formatCountdown(endTime, now) {
  if (!endTime) return 'Loading'
  const total = Math.max(endTime - now, 0)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${days}d ${hours}h ${minutes}m ${seconds}s`
}

function formatShare(count, total) {
  if (typeof total !== 'bigint' || total <= 0n || count === 0) return '0%'
  const scaled = BigInt(count) * 1_000_000n / total
  if (scaled === 0n) return '<0.0001%'
  const percent = Number(scaled) / 10_000
  const digits = percent < 1 ? 3 : 2
  return `${percent.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

function RewardIcon({ symbol }) {
  const normalizedSymbol = symbol.toLowerCase()
  if (normalizedSymbol === 'upls') return <img className="stake-reward-icon" src="/upls.png" alt={symbol} />
  if (normalizedSymbol === 'vpls') return <img className="stake-reward-icon" src="/vouchpls.png" alt={symbol} />
  return <span className="stake-reward-icon stake-reward-icon-fallback" aria-label={symbol}>{symbol.slice(0, 1)}</span>
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19V9m7 10V5m7 14v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 21h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function AprPopover({ apr }) {
  const rows = [
    ['Daily', 365],
    ['Weekly', 52],
    ['Monthly', 12],
    ['Yearly', 1],
  ]
  return (
    <span className="stake-popover-wrap">
      <button className="stake-popover-button stake-apr-calc" type="button" aria-label="NFT APR breakdown">🧮</button>
      <span className="stake-popover stake-apr-popover" role="tooltip">
        <span className="stake-popover-title"><span>🧮</span> APR Breakdown</span>
        <span className="stake-popover-rows">
          {rows.map(([label, divisor]) => (
            <span key={label}><span>{label}:</span><strong>{Number.isFinite(apr) ? `${(apr / divisor).toFixed(2)}%` : '—'}</strong></span>
          ))}
        </span>
      </span>
    </span>
  )
}

function RewardPopover({ projection, symbol, decimals, price }) {
  const rows = [
    ['Daily', 86400],
    ['Weekly', 604800],
    ['Monthly', 2592000],
    ['Yearly', 31536000],
  ]
  return (
    <span className="stake-popover-wrap stake-reward-popover-wrap">
      <button className="stake-popover-button" type="button" aria-label="NFT rewards projection"><ChartIcon /></button>
      <span className="stake-popover stake-reward-popover" role="tooltip">
        <span className="stake-popover-title"><ChartIcon /> Your NFT Rewards Projection</span>
        <span className="stake-popover-rows stake-projection-rows">
          {rows.map(([label, seconds]) => {
            const raw = projection(seconds)
            return (
              <span key={label}>
                <span>{label}:</span>
                <strong>{formatToken(raw, decimals, 2)} {symbol} ({formatUsd(rawUsd(raw, price, decimals))})</strong>
              </span>
            )
          })}
        </span>
      </span>
    </span>
  )
}

function NftSelector({ mode, tokenIds, selected, cards, loading, busy, status, error, onToggle, onSelectAll, onClose, onSubmit }) {
  const action = mode === 'unstake' ? 'Unstake' : 'Stake'
  return (
    <div className="stake-nft-modal" role="dialog" aria-modal="true" aria-labelledby="stake-nft-modal-title" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <div className="stake-nft-dialog">
        <header className="stake-nft-modal-head">
          <div>
            <div className="stake-nft-eyebrow">Nexion <span>CashMoney Pool</span></div>
            <h2 id="stake-nft-modal-title">Select NFTs to {action}</h2>
            <p>Choose the CashMoney NFTs for this Nexion transaction.</p>
          </div>
          <button type="button" className="stake-nft-close" onClick={onClose} disabled={busy} aria-label="Close NFT selector">×</button>
        </header>

        <div className={`stake-nft-modal-status ${error ? 'error' : ''}`}>
          {error || status || (loading
            ? 'Loading token details from PulseChain…'
            : `${tokenIds.length} ${mode === 'unstake' ? 'staked' : 'wallet'} NFT${tokenIds.length === 1 ? '' : 's'} detected`)}
        </div>

        {tokenIds.length > 1 && (
          <div className="stake-nft-controls">
            <div>Selected: {selected.size} / {tokenIds.length}</div>
            <button type="button" onClick={() => onSelectAll(true)} disabled={busy}>Select All</button>
            <button type="button" onClick={() => onSelectAll(false)} disabled={busy || selected.size === 0}>Deselect All</button>
          </div>
        )}

        <div className="stake-nft-grid-wrap">
          <div className="stake-nft-grid">
            {tokenIds.length === 0 ? (
              <div className="stake-nft-empty">
                {mode === 'unstake' ? 'You do not have any NFTs staked in this pool.' : 'No unstaked CashMoney NFTs were found in this wallet.'}
              </div>
            ) : tokenIds.map(tokenId => {
              const card = cards.get(tokenId)
              const isSelected = selected.has(tokenId)
              return (
                <button
                  key={tokenId}
                  type="button"
                  className={`stake-nft-token ${isSelected ? 'selected' : ''}`}
                  onClick={() => onToggle(tokenId)}
                  disabled={busy}
                  aria-pressed={isSelected}
                >
                  <span className="stake-nft-check" aria-hidden="true">✓</span>
                  <span className="stake-nft-art">
                    {card?.image ? (
                      <img
                        src={card.image}
                        alt={card.name || `CashMoney #${tokenId}`}
                        loading="lazy"
                        onError={event => {
                          if (!retryImageFromFallback(event)) event.currentTarget.style.opacity = '0.18'
                        }}
                      />
                    ) : <span className="stake-nft-art-placeholder">369</span>}
                  </span>
                  <span className="stake-nft-id">#{tokenId}</span>
                </button>
              )
            })}
          </div>
        </div>

        <footer className="stake-nft-modal-footer">
          <button type="button" className="stake-nft-submit" onClick={onSubmit} disabled={busy || selected.size === 0}>
            {busy ? 'Waiting for wallet / confirmation…' : `${action} Selected NFT${selected.size === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </div>
  )
}

export default function StakePanel({ wallet }) {
  const now = useNow()
  const [stats, setStats] = useState(null)
  const [walletState, setWalletState] = useState(EMPTY_WALLET_STATE)
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingWallet, setLoadingWallet] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState('')
  const [actionError, setActionError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [busy, setBusy] = useState('')
  const [modalMode, setModalMode] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [cards, setCards] = useState(() => new Map())
  const [loadingCards, setLoadingCards] = useState(false)

  const refreshStats = useCallback(async () => {
    if (!isStakingConfigured) return
    setLoadingStats(true)
    try {
      setStats(await getFarmStats())
      setLoadError('')
    } catch (error) {
      console.error('Nexion NFT farm stats failed:', error)
      setLoadError('Could not load the Nexion farm from PulseChain. Please retry shortly.')
    } finally {
      setLoadingStats(false)
    }
  }, [])

  const refreshWallet = useCallback(async () => {
    if (!wallet.isConnected || !wallet.address || !isStakingConfigured) {
      setWalletState(EMPTY_WALLET_STATE)
      return
    }
    setLoadingWallet(true)
    try {
      setWalletState(await getWalletFarmState(wallet.address))
    } catch (error) {
      console.error('Nexion NFT wallet data failed:', error)
      setActionError('Could not load your Nexion staking position.')
    } finally {
      setLoadingWallet(false)
    }
  }, [wallet.address, wallet.isConnected])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStats(), refreshWallet()])
  }, [refreshStats, refreshWallet])

  useEffect(() => {
    refreshStats()
    const interval = setInterval(refreshStats, 60_000)
    return () => clearInterval(interval)
  }, [refreshStats])

  useEffect(() => {
    refreshWallet()
    if (!wallet.isConnected) return undefined
    const interval = setInterval(refreshWallet, 20_000)
    return () => clearInterval(interval)
  }, [refreshWallet, wallet.isConnected])

  const modalTokenIds = useMemo(
    () => modalMode === 'unstake' ? walletState.stakedTokens : walletState.walletTokens,
    [modalMode, walletState.stakedTokens, walletState.walletTokens],
  )

  useEffect(() => {
    if (!modalMode) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [modalMode])

  useEffect(() => {
    if (!modalMode) return
    let active = true
    const initial = new Map(modalTokenIds.map(id => [id, {
      id,
      name: `CashMoney #${id}`,
      image: ipfsToHttp(`ipfs://${IMAGES_CID}/${id}.png`),
    }]))
    setCards(initial)
    setLoadingCards(modalTokenIds.length > 0)
    Promise.all(modalTokenIds.map(id => resolveToken(BigInt(id))))
      .then(resolved => {
        if (!active) return
        setCards(new Map(resolved.map((card, index) => {
          const fallback = initial.get(modalTokenIds[index])
          return [modalTokenIds[index], card.image ? card : fallback]
        })))
      })
      .finally(() => { if (active) setLoadingCards(false) })
    return () => { active = false }
  }, [modalMode, modalTokenIds])

  function openSelector(mode, selectAll = false) {
    if (!wallet.isConnected || wallet.isWrongNetwork || busy) return
    const ids = mode === 'unstake' ? walletState.stakedTokens : walletState.walletTokens
    setSelected(new Set(selectAll ? ids : []))
    setActionError('')
    setModalMode(mode)
  }

  function toggleToken(id) {
    if (busy) return
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllTokens(select) {
    setSelected(new Set(select ? modalTokenIds : []))
  }

  function recordReceipt(receipt, message) {
    setStatus(message)
    setTxHash(receipt?.hash || receipt?.transactionHash || '')
  }

  async function handleApprove() {
    if (!wallet.signer || busy) return
    setBusy('approve')
    setStatus('Confirm the Nexion NFT farm approval in your wallet…')
    setActionError('')
    setTxHash('')
    try {
      const receipt = await approveNftFarm(wallet.signer)
      recordReceipt(receipt, 'Nexion NFT farm approved.')
      await refreshWallet()
    } catch (error) {
      console.error('NFT farm approval failed:', error)
      setActionError(friendlyStakingError(error))
      setStatus('')
    } finally {
      setBusy('')
    }
  }

  async function handleClaim() {
    if (!wallet.signer || busy) return
    setBusy('claim')
    setStatus('Confirm the reward claim in your wallet…')
    setActionError('')
    setTxHash('')
    try {
      const receipt = await claimRewards(wallet.signer)
      recordReceipt(receipt, 'NFT rewards claimed.')
      await refreshAll()
    } catch (error) {
      console.error('NFT reward claim failed:', error)
      setActionError(friendlyStakingError(error))
      setStatus('')
    } finally {
      setBusy('')
    }
  }

  async function handleSelectionSubmit() {
    if (!wallet.signer || !modalMode || selected.size === 0 || busy) return
    const ids = [...selected]
    const mode = modalMode
    setBusy(mode)
    setActionError('')
    setTxHash('')
    try {
      if (mode === 'stake') {
        if (!walletState.approved) {
          setStatus('First confirm the Nexion NFT farm approval in your wallet…')
          const approvalReceipt = await approveNftFarm(wallet.signer)
          recordReceipt(approvalReceipt, 'Approval confirmed. Now confirm the stake transaction…')
          setWalletState(previous => ({ ...previous, approved: true }))
        } else {
          setStatus('Confirm the stake transaction in your wallet…')
        }
        const receipt = await stake(wallet.signer, ids)
        recordReceipt(receipt, `${ids.length} CashMoney NFT${ids.length === 1 ? '' : 's'} staked on Nexion.`)
      } else {
        setStatus('Confirm the unstake transaction in your wallet…')
        const receipt = await unstake(wallet.signer, ids)
        recordReceipt(receipt, `${ids.length} CashMoney NFT${ids.length === 1 ? '' : 's'} unstaked from Nexion.`)
      }
      setSelected(new Set())
      setModalMode(null)
      await refreshAll()
    } catch (error) {
      console.error(`NFT ${mode} failed:`, error)
      setActionError(friendlyStakingError(error))
      setStatus('')
    } finally {
      setBusy('')
    }
  }

  const walletStakedCount = walletState.stakedTokens.length
  const totalStaked = stats?.totalStaked
  const farmLive = Boolean(stats) && now >= stats.startTime && (!stats.endTime || now < stats.endTime)
  const syncSecond = Math.floor(walletState.pendingSyncedAt / 1000)
  const accrualEnd = stats?.endTime ? Math.min(now, stats.endTime) : now
  const elapsed = Math.max(accrualEnd - syncSecond, 0)
  const primaryReward = stats?.rewardToken || REWARD_TOKEN
  const pendingRewards = walletState.pendingRewards.map(reward => ({
    ...reward,
    rewardPerSecond: stats?.rewardRates?.find(rate => rate.address.toLowerCase() === reward.address.toLowerCase())?.rewardPerSecond ?? 0n,
  })).map(reward => ({
    ...reward,
    amount: typeof totalStaked === 'bigint' && totalStaked > 0n && walletStakedCount > 0 && syncSecond
      ? reward.amount + (reward.rewardPerSecond * BigInt(elapsed) * BigInt(walletStakedCount) / totalStaked)
      : reward.amount,
  }))
  const displayRewards = pendingRewards.length ? pendingRewards : [{ ...primaryReward, amount: 0n }]
  const hasPendingRewards = pendingRewards.some(reward => reward.amount > 0n)
  const stakedUsd = Number.isFinite(stats?.nftUnitValueUsd) ? walletStakedCount * stats.nftUnitValueUsd : null

  const projectReward = useCallback((seconds, rewardPerSecond = stats?.rewardPerSecond ?? 0n) => {
    if (!stats || typeof totalStaked !== 'bigint' || totalStaked <= 0n || walletStakedCount === 0) return 0n
    return rewardPerSecond * BigInt(seconds) * BigInt(walletStakedCount) / totalStaked
  }, [stats, totalStaked, walletStakedCount])

  const connected = wallet.isConnected && !wallet.isWrongNetwork
  const actionsDisabled = !connected || Boolean(busy) || !farmLive
  const explorerTx = txHash ? `${NETWORK.EXPLORER_URL}/tx/${txHash}` : ''

  if (!isStakingConfigured) {
    return (
      <div className="panel w-full max-w-2xl p-8 text-center">
        <h1 className="font-cashx-display text-3xl font-extrabold uppercase tracking-wide">Stake</h1>
        <p className="muted mt-3 text-sm">Nexion staking is unavailable on the selected network.</p>
      </div>
    )
  }

  return (
    <div className="stake-farm-page">
      <div className="stake-farm-page-head">
        <div className="stake-farm-total">
          <span>Total Staked:</span>
          <strong>{formatUsd(stats?.tvlUsd, loadingStats ? 'Loading…' : '—')}</strong>
        </div>
      </div>

      {!wallet.isConnected && (
        <button type="button" className="stake-connect-strip" onClick={wallet.connect} disabled={wallet.connecting}>
          {wallet.connecting ? 'Connecting wallet…' : 'Connect your wallet to stake, unstake, and claim rewards'}
        </button>
      )}
      {wallet.isWrongNetwork && (
        <button type="button" className="stake-connect-strip warning" onClick={wallet.switchNetwork}>
          Switch wallet to PulseChain to use the Nexion farm
        </button>
      )}
      {loadError && <div className="stake-read-error">{loadError}</div>}

      <article className="stake-farm-card">
        <header className="stake-farm-card-head">
          <div className="stake-farm-title">
            <img src={ipfsToHttp(`ipfs://${IMAGES_CID}/348.png`)} alt="CashMoney NFT #348" />
            <strong>CashMoney (CASH) NFT</strong>
          </div>
          <a href={NEXION_FARM_URL} target="_blank" rel="noreferrer">View on Nexion</a>
        </header>

        <div className="stake-metric-grid">
          <section className="stake-metric stake-apr-metric">
            <span className="stake-metric-label">APR</span>
            <div className="stake-apr-value">
              <strong>{Number.isFinite(stats?.apr) ? `${stats.apr.toFixed(2)}%` : loadingStats ? 'Loading' : '—'}</strong>
              <AprPopover apr={stats?.apr} />
            </div>
          </section>

          <section className="stake-metric">
            <span className="stake-metric-label">Balance</span>
            <div className="stake-balance-row">
              <strong>{wallet.isConnected ? loadingWallet ? 'Loading' : walletState.walletBalance : '0'}</strong>
              <button type="button" onClick={() => openSelector('stake', true)} disabled={actionsDisabled || walletState.walletTokens.length === 0}>[MAX]</button>
            </div>
            <span className="stake-metric-sub">NFTs in wallet</span>
          </section>

          <section className="stake-metric">
            <span className="stake-metric-label">Remaining Rewards</span>
            <strong className="stake-metric-long">
              {stats ? `${formatToken(stats.remainingRewards, stats.rewardToken.decimals, 2)} ${stats.rewardToken.symbol}` : 'Loading'}
            </strong>
            <span className="stake-metric-sub">{formatUsd(stats?.remainingRewardsUsd, loadingStats ? 'Loading' : '—')}</span>
          </section>

          <section className="stake-metric">
            <span className="stake-metric-label">Staked</span>
            <div className="stake-staked-row">
              <strong>{wallet.isConnected ? loadingWallet ? 'Loading' : walletStakedCount : '0'}</strong>
              <span>/ {typeof totalStaked === 'bigint' ? totalStaked.toLocaleString('en-US') : 'Loading'} total</span>
            </div>
            <span className="stake-metric-sub">{formatUsd(stakedUsd, walletStakedCount === 0 ? '$0.00 USD' : '—')} ({formatShare(walletStakedCount, totalStaked)})</span>
          </section>

          <section className="stake-metric stake-rewards-metric">
            <span className="stake-metric-label">Pending Rewards</span>
            <div className="stake-reward-list">
              {displayRewards.map(reward => {
                const isPrimary = reward.address.toLowerCase() === primaryReward.address.toLowerCase()
                const rewardUsd = rawUsd(reward.amount, isPrimary ? stats?.rewardScaledPrice : null, reward.decimals)
                return (
                  <div className="stake-reward-entry" key={reward.address}>
                    <div className="stake-reward-line">
                      <RewardIcon symbol={reward.symbol} />
                      <strong>{wallet.isConnected ? `${formatToken(reward.amount, reward.decimals, 2)} ${reward.symbol}` : `0.00 ${reward.symbol}`}</strong>
                      <RewardPopover projection={seconds => projectReward(seconds, reward.rewardPerSecond)} symbol={reward.symbol} decimals={reward.decimals} price={isPrimary ? stats?.rewardScaledPrice : null} />
                    </div>
                    <span className="stake-reward-usd">{formatUsd(rewardUsd, '$0.00 USD')}</span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <button type="button" className="stake-claim-button" onClick={handleClaim} disabled={!connected || Boolean(busy) || !hasPendingRewards}>
          {busy === 'claim' ? 'Claiming…' : 'Claim'}
        </button>

        {(status || actionError) && (
          <div className={`stake-transaction-status ${actionError ? 'error' : ''}`}>
            {actionError || status}
            {explorerTx && !actionError && <a href={explorerTx} target="_blank" rel="noreferrer">View transaction</a>}
          </div>
        )}

        <div className="stake-action-row">
          <button type="button" onClick={() => openSelector('stake')} disabled={actionsDisabled || walletState.walletTokens.length === 0}>Stake</button>
          <button type="button" onClick={() => openSelector('unstake')} disabled={!connected || Boolean(busy) || walletStakedCount === 0}>Unstake</button>
        </div>

        <button
          type="button"
          className="stake-approve-button"
          onClick={handleApprove}
          disabled={!connected || Boolean(busy) || walletState.approved}
          title="Allows the verified Nexion farm to transfer CashMoney NFTs for staking"
        >
          {busy === 'approve' ? 'Approving NFT Farm…' : walletState.approved ? 'NFT Farm Approved' : 'Approve NFT Farm'}
        </button>

        <footer className="stake-farm-footer">
          <span>Time Left: <strong>{formatCountdown(stats?.endTime, now)}</strong></span>
          <span>TVL: <strong>{formatUsd(stats?.tvlUsd, loadingStats ? 'Loading' : '—')}</strong></span>
          <span>#1</span>
        </footer>
      </article>

      <p className="stake-approval-note">
        Staking uses Nexion pool #0 on PulseChain. NFT approval grants that verified farm permission to move CashMoney NFTs for staking.
      </p>

      {modalMode && (
        <NftSelector
          mode={modalMode}
          tokenIds={modalTokenIds}
          selected={selected}
          cards={cards}
          loading={loadingCards || loadingWallet}
          busy={Boolean(busy)}
          status={status}
          error={actionError}
          onToggle={toggleToken}
          onSelectAll={selectAllTokens}
          onClose={() => setModalMode(null)}
          onSubmit={handleSelectionSubmit}
        />
      )}
    </div>
  )
}
