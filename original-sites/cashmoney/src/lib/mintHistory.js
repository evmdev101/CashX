import { ethers } from 'ethers'
import { CASHMONEY_ABI } from '../abi/cashMoney.js'
import { CASHMONEY_CONTRACT_ADDRESS } from '../config.js'
import { withHistoryProvider } from './rpc.js'

const LOOKBACK_BLOCKS = 500_000

// Load recent Minted events and their timestamps through archive-capable RPCs.
// The whole operation retries together so events and blocks always come from
// the same healthy provider.
export async function loadMintHistory(maxRows) {
  return withHistoryProvider(async provider => {
    const contract = new ethers.Contract(
      CASHMONEY_CONTRACT_ADDRESS,
      CASHMONEY_ABI,
      provider,
    )
    const tip = await provider.getBlockNumber()
    const from = Math.max(0, tip - LOOKBACK_BLOCKS)
    const events = await contract.queryFilter(contract.filters.Minted(), from, tip)
    const recent = events.slice(-maxRows).reverse()
    const blockNumbers = [...new Set(recent.map(event => event.blockNumber))]
    const blocks = await Promise.all(blockNumbers.map(block => provider.getBlock(block)))
    const timestamps = new Map(
      blocks.filter(Boolean).map(block => [block.number, Number(block.timestamp)]),
    )

    return recent.map(event => {
      const quantity = Number(event.args.quantity)
      const firstTokenId = Number(event.args.firstTokenId)

      return {
        key: `${event.transactionHash}-${event.index}`,
        buyer: event.args.buyer,
        qty: quantity,
        first: firstTokenId,
        last: firstTokenId + quantity - 1,
        time: timestamps.get(event.blockNumber),
        tx: event.transactionHash,
      }
    })
  })
}
