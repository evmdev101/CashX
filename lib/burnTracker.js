import { CASHX, CASHX_BURN_TRACKER_CONFIG, FALLBACK_BURN_STATE } from "./config.js";
import { normalizeAddress, withBurnSource } from "./burnSources.js";
import { readNativeBalance, readTokenBalance, readTokenBasics } from "./pulsechain.js";

const lower = (value) => String(value || "").toLowerCase();

async function fetchJson(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function readDexPair(pairAddress) {
  const data = await fetchJson(`https://api.dexscreener.com/latest/dex/pairs/pulsechain/${pairAddress}`);
  return data.pairs?.[0] || null;
}

function normalizeTransfer(tx, destinationLabel) {
  const amount = Number(tx.total?.value || tx.value || 0) / 10 ** CASHX.decimals;
  const hash = tx.tx_hash || tx.transaction_hash || tx.hash || "";
  const from = tx.from?.hash || tx.from || "";
  const to = tx.to?.hash || tx.to || "";

  return withBurnSource(CASHX_BURN_TRACKER_CONFIG, {
    amount: Number.isFinite(amount) ? amount : 0,
    from,
    to,
    hash,
    timestamp: tx.timestamp || tx.block_timestamp || null,
    destinationLabel,
    raw: tx,
  });
}

async function readBurnTransfers(address, destinationLabel, pageLimit = 1) {
  const zero = lower(CASHX.addresses.zero);
  const transfers = [];
  let page = 0;
  let url = `${CASHX.urls.explorerApi}/addresses/${address}/token-transfers?${new URLSearchParams({
    token: CASHX.addresses.token,
    filter: "to",
    limit: "100",
  })}`;

  while (url && page < pageLimit) {
    const data = await fetchJson(url);
    transfers.push(
      ...(data.items || [])
        .filter((tx) => lower(tx.from?.hash || tx.from) !== zero)
        .map((tx) => normalizeTransfer(tx, destinationLabel))
        .filter((tx) => tx.amount > 0),
    );

    const next = data.next_page_params;
    url = next
      ? `${CASHX.urls.explorerApi}/addresses/${address}/token-transfers?token=${CASHX.addresses.token}&filter=to&limit=100&${new URLSearchParams(next)}`
      : null;
    page += 1;
  }

  return transfers;
}

// Fetches burns directly FROM treasury addresses — much faster than scanning
// all incoming burns to dead/zero, because treasury has far fewer outgoing burns.
async function readOutgoingBurnsFromAddress(fromAddress, pageLimit = 30) {
  const burnAddresses = new Set([lower(CASHX.addresses.dead), lower(CASHX.addresses.zero)]);
  const transfers = [];
  let page = 0;
  let url = `${CASHX.urls.explorerApi}/addresses/${fromAddress}/token-transfers?${new URLSearchParams({
    token: CASHX.addresses.token,
    filter: "from",
    limit: "50",
  })}`;

  while (url && page < pageLimit) {
    const data = await fetchJson(url);
    transfers.push(
      ...(data.items || [])
        .filter((tx) => burnAddresses.has(lower(tx.to?.hash || tx.to)))
        .map((tx) => normalizeTransfer(tx, "Treasury burn"))
        .filter((tx) => tx.amount > 0),
    );

    const next = data.next_page_params;
    url = next
      ? `${CASHX.urls.explorerApi}/addresses/${fromAddress}/token-transfers?token=${CASHX.addresses.token}&filter=from&limit=50&${new URLSearchParams(next)}`
      : null;
    page += 1;
  }

  return transfers;
}

export async function readTreasuryBurnsQuick() {
  const treasuryAddresses = CASHX_BURN_TRACKER_CONFIG.sources
    .filter((s) => s.type === "treasury")
    .map((s) => s.address);

  const results = await Promise.all(
    treasuryAddresses.map((addr) => readOutgoingBurnsFromAddress(addr).catch(() => [])),
  );

  return results.flat();
}

async function readRelatedTransferHashes(source, pageLimit = 3) {
  const hashes = new Set();
  let page = 0;
  let url = `${CASHX.urls.explorerApi}/addresses/${source.address}/token-transfers?${new URLSearchParams({
    limit: "50",
  })}`;

  while (url && page < pageLimit) {
    const data = await fetchJson(url);

    for (const tx of data.items || []) {
      const hash = tx.tx_hash || tx.transaction_hash || tx.hash;

      if (hash) {
        hashes.add(hash);
      }
    }

    const next = data.next_page_params;
    url = next
      ? `${CASHX.urls.explorerApi}/addresses/${source.address}/token-transfers?limit=50&${new URLSearchParams(next)}`
      : null;
    page += 1;
  }

  return hashes;
}

async function readRelatedSourceHashes() {
  const sources = CASHX_BURN_TRACKER_CONFIG.sources.filter(
    (source) => source.matchRelatedCashxTransfers,
  );
  const entries = await Promise.all(
    sources.map(async (source) => [source, await readRelatedTransferHashes(source)]),
  );

  return entries;
}

function applyRelatedSourceMatches(burns, relatedSourceHashes) {
  const pairAddress = normalizeAddress(CASHX.addresses.pair);

  return burns.map((burn) => {
    for (const [source, hashes] of relatedSourceHashes) {
      const shouldOverride =
        hashes.has(burn.hash) &&
        (burn.burnSource?.isUnknown || normalizeAddress(burn.from) === pairAddress);

      if (shouldOverride) {
        return {
          ...burn,
          burnSource: { ...source, isUnknown: false },
          relatedAddresses: [...(burn.relatedAddresses || []), source.address],
        };
      }
    }

    return burn;
  });
}

async function readExplorerTokenMeta() {
  const data = await fetchJson(`${CASHX.urls.explorerApi}/tokens/${CASHX.addresses.token}`);

  return {
    holders: data.holders ? Number(data.holders) : null,
    transfers: data.transfer_count || data.transfers_count ? Number(data.transfer_count || data.transfers_count) : null,
  };
}

export async function readAllBurnTransactions(pageLimit = 200) {
  // Run all three fetches in parallel — related source hashes no longer waits
  // for burn pages to finish, saving several seconds of sequential latency.
  const [deadBurns, zeroBurns, relatedSourceHashes] = await Promise.all([
    readBurnTransfers(CASHX.addresses.dead, "Dead wallet", pageLimit).catch(() => []),
    readBurnTransfers(CASHX.addresses.zero, "Zero address", pageLimit).catch(() => []),
    readRelatedSourceHashes().catch(() => []),
  ]);
  return applyRelatedSourceMatches(deadBurns.concat(zeroBurns), relatedSourceHashes);
}

export async function readTopBurnsData(pageLimit = 50) {
  const [deadBurns, zeroBurns] = await Promise.all([
    readBurnTransfers(CASHX.addresses.dead, "Dead wallet", pageLimit).catch(() => []),
    readBurnTransfers(CASHX.addresses.zero, "Zero address", pageLimit).catch(() => []),
  ]);
  return deadBurns.concat(zeroBurns).sort((a, b) => b.amount - a.amount).slice(0, 100);
}

export async function readBurnTrackerState() {
  const errors = [];
  const state = { ...FALLBACK_BURN_STATE };

  const tokenPromise = readTokenBasics().catch((error) => {
    errors.push("PulseChain token reads failed.");
    console.warn(error);
    return { totalSupply: CASHX.initialSupply, decimals: CASHX.decimals };
  });

  const balancesPromise = Promise.all([
    readTokenBalance(CASHX.addresses.dead).catch(() => 0),
    readTokenBalance(CASHX.addresses.zero).catch(() => 0),
    readNativeBalance(CASHX.addresses.treasury).catch(() => null),
  ]).catch((error) => {
    errors.push("Wallet balance reads failed.");
    console.warn(error);
    return [0, 0, null];
  });

  const marketPromise = Promise.all([
    readDexPair(CASHX.addresses.pair).catch(() => null),
    readDexPair(CASHX.addresses.wplsUsdcPair).catch(() => null),
  ]).catch((error) => {
    errors.push("Market data failed.");
    console.warn(error);
    return [null, null];
  });

  const explorerPromise = readExplorerTokenMeta().catch((error) => {
    errors.push("Explorer token metadata failed.");
    console.warn(error);
    return { holders: null, transfers: null };
  });

  const burnsPromise = Promise.all([
    readBurnTransfers(CASHX.addresses.dead, "Dead wallet").catch(() => []),
    readBurnTransfers(CASHX.addresses.zero, "Zero address").catch(() => []),
  ]).catch((error) => {
    errors.push("Burn transaction feed failed.");
    console.warn(error);
    return [[], []];
  });

  const relatedSourcesPromise = readRelatedSourceHashes().catch((error) => {
    errors.push("Related burn source matching failed.");
    console.warn(error);
    return [];
  });

  const [
    token,
    [deadWalletBalance, zeroAddressBalance, treasuryPls],
    [pair, plsPair],
    explorerMeta,
    burnLists,
    relatedSourceHashes,
  ] = await Promise.all([
    tokenPromise,
    balancesPromise,
    marketPromise,
    explorerPromise,
    burnsPromise,
    relatedSourcesPromise,
  ]);

  const supplyBurned = Math.max(CASHX.initialSupply - token.totalSupply, 0);
  const walletBurned = deadWalletBalance + zeroAddressBalance;
  const allBurns = applyRelatedSourceMatches(burnLists.flat(), relatedSourceHashes)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const recentBurns = allBurns.slice(0, 25);
  const totalTrackedBurned = Math.max(supplyBurned, walletBurned);
  const burnedPercent = CASHX.initialSupply > 0 ? (totalTrackedBurned / CASHX.initialSupply) * 100 : 0;
  const plsUsd = Number(plsPair?.priceUsd || 0);

  return {
    ...state,
    priceUsd: Number(pair?.priceUsd || 0),
    marketCap: Number(pair?.fdv || pair?.marketCap || 0),
    liquidity: Number(pair?.liquidity?.usd || 0),
    volume24h: Number(pair?.volume?.h24 || 0),
    priceChange24h: Number(pair?.priceChange?.h24 || 0),
    priceChange5m: Number(pair?.priceChange?.m5 || 0),
    priceChange1h: Number(pair?.priceChange?.h1 || 0),
    txns24h: pair?.txns?.h24 || null,
    holders: explorerMeta.holders,
    transfers: explorerMeta.transfers,
    treasuryPls,
    treasuryUsd: treasuryPls && plsUsd ? treasuryPls * plsUsd : null,
    totalSupply: token.totalSupply,
    supplyBurned,
    deadWalletBalance,
    zeroAddressBalance,
    totalTrackedBurned,
    burnedPercent,
    allBurns,
    recentBurns,
    errors,
    updatedAt: new Date(),
  };
}
