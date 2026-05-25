export function formatAddress(address, start = 6, end = 4) {
  if (!address || typeof address !== "string") return "—";
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function explorerAddressUrl(explorer, address) {
  return `${explorer}/address/${address}`;
}

export function explorerTokenUrl(explorer, token) {
  return `${explorer}/token/${token}`;
}

export function explorerTxUrl(explorer, hash) {
  return `${explorer}/tx/${hash}`;
}
