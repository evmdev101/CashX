export const UNKNOWN_BURN_SOURCE = {
  address: "",
  name: "Unknown Burner",
  emoji: "🔥",
  logo: "",
  type: "unknown",
  isUnknown: true,
};

export function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase();
}

export function createBurnSourceRegistry(sources = []) {
  return new Map(
    sources
      .filter((source) => normalizeAddress(source.address))
      .map((source) => [normalizeAddress(source.address), source]),
  );
}

export function resolveBurnSource(sources = [], tx = {}) {
  const registry = createBurnSourceRegistry(sources);
  const candidates = [
    tx.sender,
    tx.caller,
    tx.contractAddress,
    tx.sourceAddress,
    tx.from?.hash,
    tx.from,
    tx.to?.hash,
    tx.to,
    tx.counterparty,
    ...(tx.relatedAddresses || []),
  ];

  for (const address of candidates) {
    const source = registry.get(normalizeAddress(address));

    if (source) {
      return { ...source, isUnknown: false };
    }
  }

  return { ...UNKNOWN_BURN_SOURCE };
}

export function withBurnSource(tokenConfig, tx) {
  return {
    ...tx,
    burnSource: resolveBurnSource(tokenConfig?.sources || [], tx),
  };
}
