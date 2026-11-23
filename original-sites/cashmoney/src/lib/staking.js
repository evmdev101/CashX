import { ethers } from 'ethers'
import { CASHMONEY_CONTRACT_ADDRESS, NETWORK } from '../config'
import { CASHMONEY_ABI } from '../abi/cashMoney'
import { readProvider } from './rpc'

// CashX's live Nexion CashMoney NFT pool. These details were copied from
// evmdev101/CashX commit 619437b and checked against PulseChain before wiring:
// pool #0 resolves to this app's exact CashMoney collection.
export const STAKING_CONTRACT_ADDRESS = '0x7de1824210c65973bc5C380785C81128834DD08e'
export const STAKING_POOL_ID = 0n
export const NEXION_FARM_URL = 'https://nexionpulse.com/farmexplorer'

export const STAKING_ABI = [
  'function depositNFTs(uint256 _pid, uint256[] _tokenIds) payable',
  'function withdrawNFTs(uint256 _pid, uint256[] _tokenIds)',
  'function claimRewards(uint256 _pid)',
  'function calculateDepositFee(uint256 _pid, uint256 _nftCount) view returns (uint256)',
  'function getUserStakedTokens(uint256 _pid, address _user) view returns (uint256[])',
  'function pendingRewards(uint256 _pid, address _user) view returns (address[] tokens, uint256[] amounts)',
  'function poolInfo(uint256) view returns (address nftContract, uint256 totalStaked, uint256 startTime, uint256 endTime, uint256 lastRewardTime, address creator, uint256 depositFeePerNFT)',
  'function getPoolRewards(uint256 _pid) view returns ((address token, uint256 totalReward, uint256 rewardPerSecond, uint256 accTokenPerShare, uint256 precision)[])',
]

export const REWARD_TOKEN = {
  address: '0x7FB5120D2DB148e91f572d2f69bC04FE454Dbd9b',
  symbol: 'uPLS',
  decimals: 18,
}

const TOKEN_META_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

const PRICE_CALCULATOR_ABI = [
  'function getBatchPrice(address[] tokens) view returns (uint256[])',
]

const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

const NEXION_PRICE_CALCULATOR = '0xC3864afC169C6110cB8f0cCaC4fE1B935951A66F'
const GSX_ADDRESS = '0x395127a44Ac1CDc609C8CC9d048E096e8E8fC30e'
const WPLS_ADDRESS = '0xA1077a294DDE1B09BB078844DF40758a5D0f9a27'
const GSX_WPLS_PAIR = '0x3c2FCC4a47470d81433C659FAb6706f7Aa37b51A'
const GSX_UPLS_PAIR = '0xb52ad4becf857ef9c3b11a47b81943d46d5054bd'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const MAX_ENUMERATED_NFTS = 369

export const isStakingConfigured =
  NETWORK.CHAIN_ID === 369 &&
  /^0x[0-9a-fA-F]{40}$/.test(STAKING_CONTRACT_ADDRESS) &&
  STAKING_CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS &&
  /^0x[0-9a-fA-F]{40}$/.test(CASHMONEY_CONTRACT_ADDRESS)

function assertConfigured() {
  if (!isStakingConfigured) {
    throw new Error('Nexion staking is unavailable on the selected network.')
  }
}

function farmContract(runner = readProvider) {
  assertConfigured()
  return new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, runner)
}

function nftContract(runner = readProvider) {
  return new ethers.Contract(CASHMONEY_CONTRACT_ADDRESS, CASHMONEY_ABI, runner)
}

function sortTokenIds(values) {
  return [...values]
    .map(value => value.toString())
    .sort((left, right) => {
      const a = BigInt(left)
      const b = BigInt(right)
      return a < b ? -1 : a > b ? 1 : 0
    })
}

async function tokenMeta(provider, address, fallback = REWARD_TOKEN) {
  if (!address || address === ZERO_ADDRESS) return fallback
  const token = new ethers.Contract(address, TOKEN_META_ABI, provider)
  const [symbol, decimals] = await Promise.all([
    token.symbol().catch(() => fallback.symbol),
    token.decimals().catch(() => fallback.decimals),
  ])
  return { address, symbol: String(symbol || fallback.symbol), decimals: Number(decimals) }
}

async function derivePairPrice(provider, pairAddress, anchorAddress, anchorPrice, targetAddress) {
  if (!(anchorPrice > 0)) return null
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider)
  const [reserves, token0, token1] = await Promise.all([
    pair.getReserves(),
    pair.token0(),
    pair.token1(),
  ])
  const addresses = [String(token0).toLowerCase(), String(token1).toLowerCase()]
  const anchorIndex = addresses.indexOf(anchorAddress.toLowerCase())
  const targetIndex = addresses.indexOf(targetAddress.toLowerCase())
  if (anchorIndex < 0 || targetIndex < 0 || anchorIndex === targetIndex) return null

  const [anchorMeta, targetMeta] = await Promise.all([
    tokenMeta(provider, addresses[anchorIndex], { symbol: 'GSX', decimals: 18 }),
    tokenMeta(provider, addresses[targetIndex], { symbol: 'TOKEN', decimals: 18 }),
  ])
  const raw = [BigInt(reserves[0]), BigInt(reserves[1])]
  const anchorReserve = Number(ethers.formatUnits(raw[anchorIndex], anchorMeta.decimals))
  const targetReserve = Number(ethers.formatUnits(raw[targetIndex], targetMeta.decimals))
  if (!(anchorReserve > 0) || !(targetReserve > 0)) return null
  return anchorPrice * anchorReserve / targetReserve
}

function rawUsd(raw, scaledPrice, decimals = 18) {
  if (typeof raw !== 'bigint' || !(scaledPrice > 0)) return null
  return Number(ethers.formatUnits(raw, decimals)) * scaledPrice / 1e18
}

function pendingRewardEntries(result) {
  const tokens = Array.from(result?.tokens ?? result?.[0] ?? [], String)
  const amounts = Array.from(result?.amounts ?? result?.[1] ?? [], value => BigInt(value || 0))
  return tokens.map((token, index) => ({ token, amount: amounts[index] || 0n }))
}

// Public pool data used by the CashX-style farm card. Core values still render
// if price discovery is unavailable; only USD/APR fields fall back to null.
export async function getFarmStats() {
  const farm = farmContract()
  const nft = nftContract()
  const [pool, rewards, plsAmount, edaiAmount, edaiAddress] = await Promise.all([
    farm.poolInfo(STAKING_POOL_ID),
    farm.getPoolRewards(STAKING_POOL_ID).catch(() => []),
    nft.plsAmount().catch(() => null),
    nft.edaiAmount().catch(() => null),
    nft.edai().catch(() => null),
  ])

  if (String(pool.nftContract).toLowerCase() !== CASHMONEY_CONTRACT_ADDRESS.toLowerCase()) {
    throw new Error('Nexion pool does not match the CashMoney NFT collection.')
  }

  const reward = rewards[0]
  const rewardAddress = reward?.token ?? reward?.[0] ?? REWARD_TOKEN.address
  const rewardMeta = await tokenMeta(readProvider, rewardAddress, REWARD_TOKEN)
  const rewardPerSecond = BigInt(reward?.rewardPerSecond ?? reward?.[2] ?? 0)
  const rewardRates = await Promise.all(rewards.map(async entry => ({
    ...(await tokenMeta(readProvider, entry?.token ?? entry?.[0], REWARD_TOKEN)),
    rewardPerSecond: BigInt(entry?.rewardPerSecond ?? entry?.[2] ?? 0),
  })))
  const endTime = Number(pool.endTime ?? pool[3] ?? 0)
  const secondsLeft = BigInt(Math.max(endTime - Math.floor(Date.now() / 1000), 0))
  const remainingRewards = rewardPerSecond * secondsLeft

  let rewardScaledPrice = null
  let nftUnitValueUsd = null
  try {
    const calculator = new ethers.Contract(NEXION_PRICE_CALCULATOR, PRICE_CALCULATOR_ABI, readProvider)
    const edaiMeta = await tokenMeta(readProvider, edaiAddress, { symbol: 'eDAI', decimals: 18 })
    const prices = await calculator.getBatchPrice([GSX_ADDRESS, edaiAddress])
    const gsxPrice = prices[0] == null ? null : Number(prices[0])
    const edaiPrice = prices[1] == null ? null : Number(prices[1])
    const [uplsPrice, plsPrice] = await Promise.all([
      derivePairPrice(readProvider, GSX_UPLS_PAIR, GSX_ADDRESS, gsxPrice, rewardAddress),
      derivePairPrice(readProvider, GSX_WPLS_PAIR, GSX_ADDRESS, gsxPrice, WPLS_ADDRESS),
    ])
    rewardScaledPrice = uplsPrice
    const plsMintUsd = typeof plsAmount === 'bigint' ? rawUsd(plsAmount, plsPrice, 18) : null
    const edaiMintUsd = typeof edaiAmount === 'bigint' ? rawUsd(edaiAmount, edaiPrice, edaiMeta.decimals) : null
    if (Number.isFinite(plsMintUsd) && Number.isFinite(edaiMintUsd)) {
      nftUnitValueUsd = plsMintUsd + edaiMintUsd
    }
  } catch (error) {
    console.warn('Nexion NFT price data unavailable:', error)
  }

  const totalStaked = BigInt(pool.totalStaked ?? pool[1] ?? 0)
  const remainingRewardsUsd = rawUsd(remainingRewards, rewardScaledPrice, rewardMeta.decimals)
  const stakedValueUsd = Number.isFinite(nftUnitValueUsd)
    ? Number(totalStaked) * nftUnitValueUsd
    : null
  const tvlUsd = Number.isFinite(stakedValueUsd) || Number.isFinite(remainingRewardsUsd)
    ? (stakedValueUsd || 0) + (remainingRewardsUsd || 0)
    : null
  const annualRewardUsd = rawUsd(rewardPerSecond * 31_536_000n, rewardScaledPrice, rewardMeta.decimals)
  const apr = Number.isFinite(annualRewardUsd) && annualRewardUsd > 0 && stakedValueUsd > 0
    ? annualRewardUsd / stakedValueUsd * 100
    : null

  return {
    nftContract: pool.nftContract,
    totalStaked,
    startTime: Number(pool.startTime ?? pool[2] ?? 0),
    endTime,
    depositFeePerNFT: BigInt(pool.depositFeePerNFT ?? pool[6] ?? 0),
    rewardToken: rewardMeta,
    rewardPerSecond,
    rewardRates,
    remainingRewards,
    remainingRewardsUsd,
    rewardScaledPrice,
    nftUnitValueUsd,
    stakedValueUsd,
    tvlUsd,
    apr,
  }
}

export async function getWalletFarmState(address) {
  assertConfigured()
  if (!ethers.isAddress(address)) throw new Error('Invalid wallet address.')
  const farm = farmContract()
  const nft = nftContract()
  const [balanceRaw, stakedRaw, pendingRaw, approved] = await Promise.all([
    nft.balanceOf(address),
    farm.getUserStakedTokens(STAKING_POOL_ID, address),
    farm.pendingRewards(STAKING_POOL_ID, address).catch(() => [[], []]),
    nft.isApprovedForAll(address, STAKING_CONTRACT_ADDRESS),
  ])

  const balance = Math.min(Number(balanceRaw), MAX_ENUMERATED_NFTS)
  const walletTokens = await Promise.all(
    Array.from({ length: balance }, (_, index) => nft.tokenOfOwnerByIndex(address, index))
  )
  const pending = pendingRewardEntries(pendingRaw)
  const pendingRewards = await Promise.all(pending.map(async reward => ({
    ...(await tokenMeta(readProvider, reward.token, REWARD_TOKEN)),
    amount: reward.amount,
  })))

  return {
    walletBalance: Number(balanceRaw),
    walletTokens: sortTokenIds(walletTokens),
    stakedTokens: sortTokenIds(stakedRaw),
    pendingRewards,
    pendingSyncedAt: Date.now(),
    approved: Boolean(approved),
  }
}

export async function getStakedTokens(address) {
  const state = await getWalletFarmState(address)
  return state.stakedTokens.map(BigInt)
}

async function verifiedWriteContracts(signer) {
  assertConfigured()
  if (!signer?.provider) throw new Error('Connect a wallet before using Nexion staking.')
  const network = await signer.provider.getNetwork()
  if (Number(network.chainId) !== NETWORK.CHAIN_ID) {
    throw new Error(`Switch your wallet to ${NETWORK.CHAIN_NAME}.`)
  }
  const farm = farmContract(signer)
  const pool = await farm.poolInfo(STAKING_POOL_ID)
  if (String(pool.nftContract).toLowerCase() !== CASHMONEY_CONTRACT_ADDRESS.toLowerCase()) {
    throw new Error('Safety check failed: Nexion pool does not match CashMoney NFT.')
  }
  return { farm, nft: nftContract(signer) }
}

function checkedTokenIds(tokenIds) {
  const ids = [...new Set((tokenIds || []).map(value => BigInt(value).toString()))].map(BigInt)
  if (ids.length === 0) throw new Error('Select at least one CashMoney NFT.')
  if (ids.length > MAX_ENUMERATED_NFTS) throw new Error('Too many NFTs selected.')
  if (ids.some(id => id < 0n)) throw new Error('Invalid NFT token ID.')
  return ids
}

export async function approveNftFarm(signer) {
  const { nft } = await verifiedWriteContracts(signer)
  const tx = await nft.setApprovalForAll(STAKING_CONTRACT_ADDRESS, true)
  return tx.wait()
}

export async function stake(signer, tokenIds) {
  const ids = checkedTokenIds(tokenIds)
  const { farm, nft } = await verifiedWriteContracts(signer)
  const owner = await signer.getAddress()
  if (!await nft.isApprovedForAll(owner, STAKING_CONTRACT_ADDRESS)) {
    throw new Error('Approve the Nexion NFT farm before staking.')
  }
  const fee = await farm.calculateDepositFee(STAKING_POOL_ID, ids.length)
  const tx = await farm.depositNFTs(STAKING_POOL_ID, ids, { value: fee })
  return tx.wait()
}

export async function unstake(signer, tokenIds) {
  const ids = checkedTokenIds(tokenIds)
  const { farm } = await verifiedWriteContracts(signer)
  const tx = await farm.withdrawNFTs(STAKING_POOL_ID, ids)
  return tx.wait()
}

export async function claimRewards(signer) {
  const { farm } = await verifiedWriteContracts(signer)
  const tx = await farm.claimRewards(STAKING_POOL_ID)
  return tx.wait()
}

export function friendlyStakingError(error) {
  const raw = String(error?.reason || error?.shortMessage || error?.message || 'Transaction failed')
  const lower = raw.toLowerCase()
  if (lower.includes('user rejected') || lower.includes('user denied')) return 'Transaction cancelled in wallet.'
  if (lower.includes('not owner') || lower.includes('ownership')) return 'One of these NFTs is no longer in this wallet.'
  if (lower.includes('already staked')) return 'One of these NFTs is already staked.'
  if (lower.includes('insufficient funds')) return 'Not enough PLS for the deposit fee and gas.'
  if (lower.includes('network') || lower.includes('timeout')) return 'PulseChain is not responding. Check PulseScan before retrying.'
  if (lower.includes('approve the nexion')) return 'Approve the Nexion NFT farm before staking.'
  if (raw.length < 160 && !/execution reverted|missing revert data/i.test(raw)) return raw
  return 'Transaction failed. Nothing was moved; please try again.'
}
