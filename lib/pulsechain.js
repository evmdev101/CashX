import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm";
import { CASHX } from "./config.js";
import { ERC20_ABI } from "./contracts.js";

let provider;
let tokenContract;

function withTimeout(promise, ms = 4500) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("PulseChain request timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export function getPulseProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(CASHX.urls.rpc, CASHX.chainId);
  }

  return provider;
}

export function getCashxContract() {
  if (!tokenContract) {
    tokenContract = new ethers.Contract(CASHX.addresses.token, ERC20_ABI, getPulseProvider());
  }

  return tokenContract;
}

export async function readTokenBasics() {
  const contract = getCashxContract();
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    withTimeout(contract.name()).catch(() => CASHX.name),
    withTimeout(contract.symbol()).catch(() => CASHX.symbol),
    withTimeout(contract.decimals()).catch(() => CASHX.decimals),
    withTimeout(contract.totalSupply()),
  ]);

  return {
    name,
    symbol,
    decimals: Number(decimals),
    totalSupply: Number(ethers.formatUnits(totalSupply, Number(decimals))),
  };
}

export async function readTokenBalance(address) {
  const contract = getCashxContract();
  const balance = await withTimeout(contract.balanceOf(address));
  return Number(ethers.formatUnits(balance, CASHX.decimals));
}

export async function readNativeBalance(address) {
  const balance = await withTimeout(getPulseProvider().getBalance(address));
  return Number(ethers.formatEther(balance));
}

export { ethers };
