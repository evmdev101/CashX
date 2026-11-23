import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { CASHMONEY_CONTRACT_ADDRESS } from '../config'
import { CASHMONEY_ABI } from '../abi/cashMoney'
import { ERC20_ABI } from '../abi/erc20'
import { readProvider } from '../lib/rpc'

// Dedicated read-only provider: supply/price data loads without a wallet,
// reads stay correct even if the wallet is on the wrong network, and the
// shared provider automatically fails over between independent RPCs.
const readContract = new ethers.Contract(CASHMONEY_CONTRACT_ADDRESS, CASHMONEY_ABI, readProvider)

const EMPTY_USER = { loaded: false, edaiBalance: 0n, edaiAllowance: 0n, plsBalance: 0n }

export function useMintData(address) {
  const [contractData, setContractData] = useState({
    loaded: false,
    error: null,
    totalMinted: 0n,
    maxSupply: 0n,
    plsAmount: 0n,
    edaiAmount: 0n,
    edaiAddress: null,
    mintStart: 0n,
    mintEnd: 0n,
  })
  const [user, setUser] = useState(EMPTY_USER)

  const refresh = useCallback(async () => {
    try {
      const [totalMinted, maxSupply, plsAmount, edaiAmount, edaiAddress, mintStart, mintEnd] =
        await Promise.all([
          readContract.totalMinted(),
          readContract.maxSupply(),
          readContract.plsAmount(),
          readContract.edaiAmount(),
          readContract.edai(),
          readContract.mintStart(),
          readContract.mintEnd(),
        ])
      setContractData({
        loaded: true, error: null,
        totalMinted, maxSupply, plsAmount, edaiAmount, edaiAddress, mintStart, mintEnd,
      })
    } catch (err) {
      console.error('Failed to load mint data:', err)
      setContractData(data => ({
        ...data,
        error: 'Could not load mint data from PulseChain. Check your connection and refresh.',
      }))
    }
  }, [])

  const refreshUser = useCallback(async () => {
    const { edaiAddress } = contractData
    if (!address || !edaiAddress || edaiAddress === ethers.ZeroAddress) {
      setUser(EMPTY_USER)
      return
    }
    try {
      const edai = new ethers.Contract(edaiAddress, ERC20_ABI, readProvider)
      const [edaiBalance, edaiAllowance, plsBalance] = await Promise.all([
        edai.balanceOf(address),
        edai.allowance(address, CASHMONEY_CONTRACT_ADDRESS),
        readProvider.getBalance(address),
      ])
      setUser({ loaded: true, edaiBalance, edaiAllowance, plsBalance })
    } catch (err) {
      console.error('Failed to load wallet balances:', err)
    }
  }, [address, contractData.edaiAddress]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load on mount, then keep the supply counter fresh
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  // Refresh as soon as the provider sees a new mint. The interval above
  // remains as a fallback if an RPC endpoint misses an event notification.
  useEffect(() => {
    const onMinted = () => refresh()
    readContract.on('Minted', onMinted)
    return () => { readContract.off('Minted', onMinted) }
  }, [refresh])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  return { ...contractData, user, refresh, refreshUser }
}
