import { CASHX, CASHX_BURN_TRACKER_CONFIG, FALLBACK_BURN_STATE } from "./config.js";
import { normalizeAddress, withBurnSource } from "./burnSources.js";
import { readNativeBalance, readTokenBalance, readTokenBasics } from "./pulsechain.js";

const lower = (value) => String(value || "").toLowerCase();

async function fetchJson(url, timeoutMs = 6500, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

async function readDexPair(pairAddress, request = {}) {
  const data = await fetchJson(`https://api.dexscreener.com/latest/dex/pairs/pulsechain/${pairAddress}`, request.timeoutMs, request.attempts);
  return data.pairs?.[0] || null;
}

function normalizeTransfer(tx, destinationLabel) {
  const rawAmount = String(tx.total?.value ?? tx.value ?? "0");
  const amount = Number(rawAmount) / 10 ** CASHX.decimals;
  const hash = tx.tx_hash || tx.transaction_hash || tx.hash || "";
  const from = tx.from?.hash || tx.from || "";
  const to = tx.to?.hash || tx.to || "";

  return withBurnSource(CASHX_BURN_TRACKER_CONFIG, {
    amount: Number.isFinite(amount) ? amount : 0,
    rawAmount,
    logIndex: tx.log_index ?? tx.logIndex ?? tx.index ?? null,
    blockNumber: tx.block_number ?? tx.blockNumber ?? tx.block ?? null,
    transactionIndex: tx.transaction_index ?? tx.transactionIndex ?? null,
    from,
    to,
    hash,
    timestamp: tx.timestamp || tx.block_timestamp || (tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString() : null),
    destinationLabel,
    raw: tx,
  });
}

async function readBurnTransferPage(address, destinationLabel, cursor = null, request = {}) {
  const zero = lower(CASHX.addresses.zero);
  const url = `${CASHX.urls.explorerApi}/addresses/${address}/token-transfers?${new URLSearchParams({
    ...(cursor || {}),
    token: CASHX.addresses.token,
    filter: "to",
    limit: "100",
  })}`;
  const data = await fetchJson(url, request.timeoutMs, request.attempts);
  if (!Array.isArray(data.items)) throw new Error("Invalid burn transfer response");
  return {
    items: data.items
      .filter((tx) => lower(tx.token?.address || tx.token?.hash || tx.contractAddress || tx.token_address) === lower(CASHX.addresses.token)
        && lower(tx.to?.hash || tx.to) === lower(address)
        && lower(tx.from?.hash || tx.from) !== zero)
      .map((tx) => normalizeTransfer(tx, destinationLabel))
      .filter((tx) => tx.amount > 0),
    next: data.next_page_params || null,
  };
}

async function readBurnTransfers(address, destinationLabel, pageLimit = 1, request = {}) {
  const transfers = [];
  let page = 0;
  let cursor = null;
  do {
    const result = await readBurnTransferPage(address, destinationLabel, cursor, request);
    transfers.push(...result.items);
    cursor = result.next;
    page += 1;
  } while (cursor && page < pageLimit);
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
        .filter((tx) => lower(tx.from?.hash || tx.from) === lower(fromAddress)
          && lower(tx.token?.address || tx.token?.address_hash || tx.contractAddress) === lower(CASHX.addresses.token)
          && burnAddresses.has(lower(tx.to?.hash || tx.to)))
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

// A treasury wallet can have many ordinary transfers after its last burn.
// Read its newest indexed transfers directly so the latest card does not wait
// for a complete scan of either global burn destination or the wallet history.
export async function readLatestTreasuryBurns(request = { timeoutMs: 4500, attempts: 1 }) {
  const addresses = [...new Set(CASHX_BURN_TRACKER_CONFIG.sources
    .filter(source => source.type === "treasury").map(source => lower(source.address)))];
  const destinations = new Set([lower(CASHX.addresses.dead), lower(CASHX.addresses.zero)]);
  const api = CASHX.urls.explorerApi.replace(/\/v2\/?$/, "");
  const results = await Promise.allSettled(addresses.map(async address => {
    const url = `${api}?${new URLSearchParams({
      module: "account", action: "tokentx", address,
      contractaddress: CASHX.addresses.token, startblock: "0", endblock: "999999999",
      sort: "desc", page: "1", offset: "250",
    })}`;
    const data = await fetchJson(url, request.timeoutMs, request.attempts);
    if (!Array.isArray(data.result)) {
      if (String(data.status) === "0" && /no (?:token )?transfers|no transactions|no records/i.test(`${data.message || ""} ${data.result || ""}`)) return [];
      throw new Error("Invalid treasury transfer response");
    }
    return data.result.filter(tx => lower(tx.contractAddress) === lower(CASHX.addresses.token)
      && lower(tx.from) === address && destinations.has(lower(tx.to))
      && /^\d+$/.test(String(tx.value ?? "")) && BigInt(tx.value) > 0n
      && Number.isFinite(Number(tx.timeStamp)) && Number(tx.timeStamp) > 0)
      .map(tx => normalizeTransfer(tx, "Treasury burn"));
  }));
  return {
    items: results.filter(result => result.status === "fulfilled").flatMap(result => result.value),
    available: results.some(result => result.status === "fulfilled"),
    errors: results.flatMap((result, index) => result.status === "rejected"
      ? [`Treasury burn history ${addresses[index]} failed.`] : []),
  };
}

async function readRelatedTransferHashes(source, pageLimit = 3, request = {}) {
  const hashes = new Set();
  let page = 0;
  let url = `${CASHX.urls.explorerApi}/addresses/${source.address}/token-transfers?${new URLSearchParams({
    limit: "50",
  })}`;

  while (url && page < pageLimit && (!request.deadline || Date.now() < request.deadline)) {
    const timeoutMs = request.deadline
      ? Math.max(1, Math.min(request.timeoutMs || 6500, request.deadline - Date.now()))
      : request.timeoutMs;
    const data = await fetchJson(url, timeoutMs, request.attempts);

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

async function readRelatedSourceHashes(pageLimit = 3, request = {}) {
  const sources = CASHX_BURN_TRACKER_CONFIG.sources.filter(
    (source) => source.matchRelatedCashxTransfers,
  );
  const entries = await Promise.all(
    sources.map(async (source) => [source, await readRelatedTransferHashes(source, pageLimit, request)]),
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

async function readExplorerTokenMeta(request = {}) {
  const data = await fetchJson(`${CASHX.urls.explorerApi}/tokens/${CASHX.addresses.token}`, request.timeoutMs, request.attempts);
  const count = value => value === null || value === undefined || value === "" ? null : Number(value);

  return {
    holders: count(data.holders_count ?? data.token_holders_count ?? data.holders),
    transfers: count(data.transfer_count ?? data.transfers_count),
  };
}

let burnHistoryScan = null;
let burnHistoryRequest = null;
const burnHistoryListeners = new Set();

function burnEventKey(tx) {
  const index = tx.logIndex ?? tx.raw?.log_index ?? tx.raw?.index;
  const hash = lower(tx.hash || tx.tx_hash);
  return index !== null && index !== undefined
    ? `${hash}:${String(index)}`
    : `${hash}:${lower(tx.from)}:${lower(tx.to)}:${tx.rawAmount || ""}`;
}

function createBurnHistoryScan() {
  return {
    items: new Map(), related: [],
    feeds: {
      dead: { address: CASHX.addresses.dead, label: "Dead wallet", cursor: null, transport: "v1", order: "asc", pages: 0, complete: false, failed: null },
      zero: { address: CASHX.addresses.zero, label: "Zero address", cursor: null, transport: "v1", order: "asc", pages: 0, complete: false, failed: null },
    },
  };
}

async function readBurnHistoryPage(feed, request) {
  if (feed.transport === "v2") return readBurnTransferPage(feed.address, feed.label, feed.cursor, request);
  const page = Number(feed.cursor?.page || 1);
  const api = CASHX.urls.explorerApi.replace(/\/v2\/?$/, "");
  const url = `${api}?${new URLSearchParams({
    module: "account", action: "tokentx", address: feed.address,
    contractaddress: CASHX.addresses.token, startblock: "0", endblock: "999999999",
    sort: feed.order, page: String(page), offset: "250",
  })}`;
  try {
    const data = await fetchJson(url, request.timeoutMs, request.attempts);
    if (!Array.isArray(data.result)) {
      if (String(data.status) === "0" && /no (?:token )?transfers|no transactions|no records/i.test(`${data.message || ""} ${data.result || ""}`)) {
        return { items: [], next: null };
      }
      throw new Error("Invalid account transfer history response");
    }
    const items = data.result
      .filter(tx => lower(tx.contractAddress) === lower(CASHX.addresses.token)
        && lower(tx.to) === lower(feed.address) && lower(tx.from) !== lower(CASHX.addresses.zero))
      .map(tx => normalizeTransfer(tx, feed.label)).filter(tx => tx.amount > 0);
    return { items, next: data.result.length >= 250 ? { page: page + 1 } : null };
  } catch (error) {
    // An unavailable legacy route can fall back to the public v2 cursor API.
    // Starting it from the head is deliberate: only reaching its end can prove
    // that the replacement route has covered the entire history.
    if (feed.pages === 0 || /Invalid account transfer history response|Request failed: (400|404|501)/.test(error.message || "")) {
      feed.transport = "v2";
      feed.cursor = null;
      feed.order = "desc";
      feed.stopAtKnown = false;
      return readBurnTransferPage(feed.address, feed.label, null, request);
    }
    throw error;
  }
}

function burnHistorySnapshot(scan, added = []) {
  const feeds = Object.fromEntries(Object.entries(scan.feeds).map(([key, feed]) => [key, {
    address: feed.address, transport: feed.transport, order: feed.order, pages: feed.pages, complete: feed.complete,
    cursor: feed.cursor ? { ...feed.cursor } : null, failed: feed.failed,
  }]));
  return {
    items: applyRelatedSourceMatches([...scan.items.values()], scan.related),
    added: applyRelatedSourceMatches(added, scan.related),
    complete: Object.values(scan.feeds).every(feed => feed.complete),
    feeds,
    errors: Object.values(scan.feeds).filter(feed => feed.failed).map(feed => feed.failed),
    updatedAt: new Date(),
  };
}

function publishBurnHistory(scan, added = []) {
  const result = burnHistorySnapshot(scan, added);
  for (const listener of burnHistoryListeners) {
    try { listener(result); } catch (error) { console.warn("Burn history update failed:", error); }
  }
  return result;
}

export async function readAllBurnTransactions({ onProgress, budgetMs = 45000, reset = false } = {}) {
  if (typeof onProgress === "function") burnHistoryListeners.add(onProgress);
  if (!burnHistoryRequest) {
    if (reset || !burnHistoryScan) burnHistoryScan = createBurnHistoryScan();
    const scan = burnHistoryScan;
    // Once history is complete, refresh only the new head until an existing
    // event is reached. An unfinished scan retains its exact older-page cursor.
    if (Object.values(scan.feeds).every(feed => feed.complete)) {
      for (const feed of Object.values(scan.feeds)) {
        feed.complete = false;
        feed.stopAtKnown = true;
        feed.cursor = null;
        feed.order = "desc";
      }
    }
    const deadline = Date.now() + Math.max(1, Math.min(Number(budgetMs) || 45000, 45000));
    burnHistoryRequest = (async () => {
      publishBurnHistory(scan, [...scan.items.values()]);
      async function scanFeed(feed) {
        while (!feed.complete && Date.now() < deadline) {
          try {
            const result = await readBurnHistoryPage(feed, {
              attempts: 1, timeoutMs: Math.max(1, Math.min(6500, deadline - Date.now())),
            });
            const foundKnown = feed.stopAtKnown && result.items.some(tx => scan.items.has(burnEventKey(tx)));
            const added = [];
            for (const tx of result.items) {
              const key = burnEventKey(tx);
              if (!scan.items.has(key)) added.push(tx);
              scan.items.set(key, tx);
            }
            feed.pages += 1;
            feed.failed = null;
            if (!result.next || foundKnown) {
              feed.complete = true;
              feed.cursor = null;
              feed.stopAtKnown = false;
            } else {
              if (JSON.stringify(result.next) === JSON.stringify(feed.cursor)) throw new Error("Explorer repeated a history cursor");
              feed.cursor = result.next;
            }
            publishBurnHistory(scan, added);
          } catch (error) {
            feed.failed = `${feed.label} history: ${error.message || error}`;
            publishBurnHistory(scan);
            break;
          }
        }
      }
      const related = (async () => {
        if (Date.now() >= deadline) return;
        try {
          const entries = await readRelatedSourceHashes(3, {
            attempts: 1, timeoutMs: 4500, deadline: Math.min(deadline, Date.now() + 4500),
          });
          // Keep earlier verified associations when only the latest related
          // transfers can be checked within this optional request budget.
          const known = new Map(scan.related.map(([source, hashes]) => [lower(source.address), [source, new Set(hashes)]]));
          for (const [source, hashes] of entries) {
            const existing = known.get(lower(source.address)) || [source, new Set()];
            for (const hash of hashes) existing[1].add(hash);
            known.set(lower(source.address), existing);
          }
          scan.related = [...known.values()];
          publishBurnHistory(scan);
        } catch (error) {
          console.warn("Related burn source matching failed:", error);
        }
      })();
      await Promise.all([...Object.values(scan.feeds).map(scanFeed), related]);
      return publishBurnHistory(scan);
    })().finally(() => { burnHistoryRequest = null; });
  }
  try {
    return await burnHistoryRequest;
  } finally {
    if (typeof onProgress === "function") burnHistoryListeners.delete(onProgress);
  }
}

export async function readTopBurnsData(options = {}) {
  const result = await readAllBurnTransactions(options);
  return { ...result, items: [...result.items].sort((a, b) => {
    const left = BigInt(a.rawAmount || "0"), right = BigInt(b.rawAmount || "0");
    return left > right ? -1 : left < right ? 1 : 0;
  }).slice(0, 100) };
}

export async function readBurnTrackerState({ onUpdate } = {}) {
  const state = {
    ...FALLBACK_BURN_STATE,
    priceUsd: null, marketCap: null, liquidity: null, volume24h: null,
    priceChange24h: null, priceChange5m: null, priceChange1h: null,
    holders: null, transfers: null, treasuryPls: null, treasuryUsd: null,
    totalSupply: null, supplyBurned: null, deadWalletBalance: null,
    zeroAddressBalance: null, totalTrackedBurned: null, burnedPercent: null,
    allBurns: [], recentBurns: [], treasuryBurns: [], errors: [], loading: true,
    available: {
      token: false, deadBalance: false, zeroBalance: false, balances: false,
      supply: false, treasury: false, market: false, holders: false,
      transfers: false, burnHistory: false, treasuryBurnHistory: false, burns: false, sourceMatching: false,
    },
    supplyAvailable: false,
  };
  // These requests supply the first screen. Deep history uses the separate
  // paginated readers above, so a slow optional source cannot hold up supply.
  const request = { timeoutMs: 4500, attempts: 1 };
  let plsUsd = null;
  let burnLists = [[], []];
  let relatedSourceHashes = [];
  const nonnegative = value => Number.isFinite(value) && value >= 0;

  function snapshot() {
    state.available.balances = state.available.deadBalance && state.available.zeroBalance;
    state.available.supply = state.available.token && state.available.balances;
    state.supplyAvailable = state.available.supply;
    state.available.burns = state.available.burnHistory;
    if (state.supplyAvailable) {
      state.totalTrackedBurned = Math.max(state.supplyBurned, state.deadWalletBalance + state.zeroAddressBalance);
      state.burnedPercent = CASHX.initialSupply > 0 ? state.totalTrackedBurned / CASHX.initialSupply * 100 : 0;
    }
    if (state.available.treasury && plsUsd !== null) state.treasuryUsd = state.treasuryPls * plsUsd;
    state.allBurns = applyRelatedSourceMatches(burnLists.flat(), relatedSourceHashes)
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    state.recentBurns = state.allBurns.slice(0, 25);
    state.updatedAt = new Date();
    return { ...state, available: { ...state.available }, errors: [...state.errors] };
  }

  function publish() {
    const update = snapshot();
    if (typeof onUpdate === "function") {
      try { onUpdate(update); } catch (error) { console.warn("Burn dashboard update failed:", error); }
    }
    return update;
  }

  async function branch(label, read, apply) {
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), 5500);
      });
      const value = await Promise.race([Promise.resolve().then(read), deadline]);
      apply(value);
    } catch (error) {
      state.errors.push(`${label} failed.`);
      console.warn(error);
    } finally {
      clearTimeout(timer);
      publish();
    }
  }

  publish();
  await Promise.all([
    branch("PulseChain token reads", readTokenBasics, token => {
      if (!nonnegative(token?.totalSupply)) throw new Error("Invalid token supply");
      state.totalSupply = token.totalSupply;
      state.supplyBurned = Math.max(CASHX.initialSupply - token.totalSupply, 0);
      state.available.token = true;
    }),
    branch("Dead wallet balance reads", () => readTokenBalance(CASHX.addresses.dead), balance => {
      if (!nonnegative(balance)) throw new Error("Invalid dead wallet balance");
      state.deadWalletBalance = balance;
      state.available.deadBalance = true;
    }),
    branch("Zero address balance reads", () => readTokenBalance(CASHX.addresses.zero), balance => {
      if (!nonnegative(balance)) throw new Error("Invalid zero address balance");
      state.zeroAddressBalance = balance;
      state.available.zeroBalance = true;
    }),
    branch("Treasury balance reads", () => readNativeBalance(CASHX.addresses.treasury), balance => {
      if (!nonnegative(balance)) throw new Error("Invalid treasury balance");
      state.treasuryPls = balance;
      state.available.treasury = true;
    }),
    branch("Market data", () => readDexPair(CASHX.addresses.pair, request), pair => {
      const price = Number(pair?.priceUsd);
      if (!Number.isFinite(price) || price <= 0) throw new Error("CashX price unavailable");
      state.priceUsd = price;
      state.marketCap = Number(pair.fdv || pair.marketCap || 0);
      state.liquidity = Number(pair.liquidity?.usd || 0);
      state.volume24h = Number(pair.volume?.h24 || 0);
      state.priceChange24h = Number(pair.priceChange?.h24 || 0);
      state.priceChange5m = Number(pair.priceChange?.m5 || 0);
      state.priceChange1h = Number(pair.priceChange?.h1 || 0);
      state.txns24h = pair.txns?.h24 || null;
      state.available.market = true;
    }),
    branch("PLS market data", () => readDexPair(CASHX.addresses.wplsUsdcPair, request), pair => {
      const price = Number(pair?.priceUsd);
      if (!Number.isFinite(price) || price <= 0) throw new Error("PLS price unavailable");
      plsUsd = price;
    }),
    branch("Explorer token metadata", () => readExplorerTokenMeta(request), meta => {
      if (nonnegative(meta.holders)) { state.holders = meta.holders; state.available.holders = true; }
      if (nonnegative(meta.transfers)) { state.transfers = meta.transfers; state.available.transfers = true; }
      if (!state.available.holders && !state.available.transfers) throw new Error("Token metadata unavailable");
    }),
    branch("Dead wallet burn feed", () => readBurnTransfers(CASHX.addresses.dead, "Dead wallet", 1, request), items => {
      burnLists[0] = items;
      state.available.burnHistory = true;
    }),
    branch("Zero address burn feed", () => readBurnTransfers(CASHX.addresses.zero, "Zero address", 1, request), items => {
      burnLists[1] = items;
      state.available.burnHistory = true;
    }),
    branch("Latest treasury burn feed", () => readLatestTreasuryBurns(request), result => {
      state.treasuryBurns = result.items;
      state.available.treasuryBurnHistory = result.available;
      state.errors.push(...result.errors);
    }),
    branch("Related burn source matching", () => readRelatedSourceHashes(1, request), entries => {
      relatedSourceHashes = entries;
      state.available.sourceMatching = true;
    }),
  ]);
  state.loading = false;
  return publish();
}
