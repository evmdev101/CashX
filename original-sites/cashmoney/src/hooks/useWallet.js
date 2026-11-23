import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { NETWORK, CHAIN_PARAMS } from '../config'

function getEthereum() {
  return typeof window !== 'undefined' ? window.ethereum ?? null : null
}

// Wallet connection state — MetaMask / Rabby injected provider.
// All state lives in React; nothing is persisted.
export function useWallet() {
  const [address, setAddress]       = useState(null)
  const [signer, setSigner]         = useState(null)
  const [chainId, setChainId]       = useState(null)
  const [connecting, setConnecting] = useState(false)

  const isConnected    = Boolean(address)
  const isWrongNetwork = isConnected && chainId !== NETWORK.CHAIN_ID

  const switchNetwork = useCallback(async () => {
    const eth = getEthereum()
    if (!eth) return
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: NETWORK.CHAIN_ID_HEX }] })
    } catch (err) {
      // 4902 = chain not added to the wallet yet
      if (err.code === 4902 || err?.data?.originalError?.code === 4902) {
        await eth.request({ method: 'wallet_addEthereumChain', params: [CHAIN_PARAMS] })
      }
    }
  }, [])

  const connect = useCallback(async () => {
    const eth = getEthereum()
    if (!eth) {
      alert('No wallet detected. Please install MetaMask or Rabby.')
      return
    }
    setConnecting(true)
    try {
      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const walletSigner = await provider.getSigner()
      const addr = await walletSigner.getAddress()
      const network = await provider.getNetwork()
      const cid = Number(network.chainId)

      setSigner(walletSigner)
      setAddress(addr)
      setChainId(cid)

      if (cid !== NETWORK.CHAIN_ID) await switchNetwork()
    } catch (err) {
      console.error('Connect failed:', err)
    } finally {
      setConnecting(false)
    }
  }, [switchNetwork])

  const disconnect = useCallback(() => {
    setAddress(null)
    setSigner(null)
    setChainId(null)
  }, [])

  // Silent reconnect if the wallet already authorized this site
  useEffect(() => {
    const eth = getEthereum()
    if (!eth) return
    eth.request({ method: 'eth_accounts' }).then(accounts => {
      if (accounts.length > 0) connect()
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // React to account / chain changes. Re-running connect() rebuilds the
  // signer (already authorized, so no wallet popup appears).
  useEffect(() => {
    const eth = getEthereum()
    if (!eth) return

    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) disconnect()
      else connect()
    }
    const onChainChanged = () => {
      if (address) connect()
    }

    eth.on('accountsChanged', onAccountsChanged)
    eth.on('chainChanged', onChainChanged)
    return () => {
      eth.removeListener('accountsChanged', onAccountsChanged)
      eth.removeListener('chainChanged', onChainChanged)
    }
  }, [address, connect, disconnect])

  return {
    address, signer, chainId,
    isConnected, isWrongNetwork, connecting,
    connect, disconnect, switchNetwork,
  }
}
