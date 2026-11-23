// Quick diagnostic: reads live mint data straight from the chain using
// the same config + ABI as the site. Run with:  npm run check
import { ethers } from 'ethers'
import { CASHMONEY_CONTRACT_ADDRESS, MAINNET_DEPLOYMENT, NETWORK } from '../src/config.js'
import { CASHMONEY_ABI } from '../src/abi/cashMoney.js'
import { ERC20_ABI } from '../src/abi/erc20.js'
import { createReadProvider } from '../src/lib/rpc.js'

const provider = createReadProvider(NETWORK)
const c = new ethers.Contract(CASHMONEY_CONTRACT_ADDRESS, CASHMONEY_ABI, provider)

console.log(`network:  ${NETWORK.CHAIN_NAME} (chain ${NETWORK.CHAIN_ID})`)
console.log(`contract: ${CASHMONEY_CONTRACT_ADDRESS}`)

const code = await provider.getCode(CASHMONEY_CONTRACT_ADDRESS)
if (code === '0x') {
  console.error('ERROR: no contract deployed at this address on this network!')
  process.exit(1)
}

const [totalMinted, maxSupply, plsAmount, edaiAmount, edai, mintStart, mintEnd, treasury] =
  await Promise.all([
    c.totalMinted(), c.maxSupply(), c.plsAmount(), c.edaiAmount(),
    c.edai(), c.mintStart(), c.mintEnd(), c.treasury(),
  ])

console.log(`minted:    ${totalMinted} / ${maxSupply}`)
console.log(`price:     ${ethers.formatEther(plsAmount)} ${NETWORK.CURRENCY.symbol} + ${ethers.formatEther(edaiAmount)} eDAI per NFT`)
console.log(`eDAI:      ${edai}`)
console.log(`treasury:  ${treasury}`)
console.log(`mintStart: ${mintStart} (${new Date(Number(mintStart) * 1000).toISOString()})`)
console.log(`mintEnd:   ${mintEnd} (${new Date(Number(mintEnd) * 1000).toISOString()})`)

const now = Math.floor(Date.now() / 1000)
const status = totalMinted >= maxSupply ? 'SOLD OUT'
  : now < Number(mintStart) ? 'NOT STARTED'
  : now > Number(mintEnd) ? 'ENDED'
  : 'LIVE'
console.log(`status:    ${status}`)

// Mainnet-only launch verification. This confirms the deployed contract
// matches the reviewed source before the website is published.
if (NETWORK.CHAIN_ID === 369) {
  const expected = MAINNET_DEPLOYMENT
  const checks = [
    ['PLS price', plsAmount === ethers.parseEther(expected.PLS_PER_NFT)],
    ['eDAI price', edaiAmount === ethers.parseEther(expected.EDAI_PER_NFT)],
    ['eDAI address', edai.toLowerCase() === expected.EDAI_ADDRESS.toLowerCase()],
    ['treasury address', treasury.toLowerCase() === expected.TREASURY_ADDRESS.toLowerCase()],
    ['base URI', (await c.baseURI()) === expected.BASE_URI],
  ]
  const failed = checks.filter(([, passed]) => !passed)
  for (const [label, passed] of checks) console.log(`verify ${label}: ${passed ? 'OK' : 'MISMATCH'}`)
  if (failed.length) {
    console.error('ERROR: deployed mainnet contract does not match the launch record above.')
    process.exitCode = 1
  }
}

if (edai !== ethers.ZeroAddress) {
  const t = new ethers.Contract(edai, ERC20_ABI, provider)
  const dec = await t.decimals()
  console.log(`eDAI decimals: ${dec}`)
} else {
  console.warn('WARNING: eDAI address not set on contract yet')
}

// String-returning functions — these broke on the old Cancun-compiled
// deployment (MCOPY opcode). Probe them so a bad deploy is caught early.
for (const fn of ['name', 'symbol', 'baseURI', 'uriSuffix']) {
  try {
    console.log(`${fn}():   ${JSON.stringify(await c[fn]())}`)
  } catch (err) {
    console.error(`ERROR ${fn}(): ${err?.info?.error?.message || err.shortMessage || err.message}`)
  }
}
if (totalMinted > 0n) {
  try {
    const firstId = await c.tokenByIndex(0n)
    console.log(`tokenURI(${firstId}): ${JSON.stringify(await c.tokenURI(firstId))}`)
  } catch (err) {
    console.error(`ERROR tokenURI: ${err?.info?.error?.message || err.shortMessage || err.message}`)
  }
}
