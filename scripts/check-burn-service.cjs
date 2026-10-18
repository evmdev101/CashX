// Run with: node --test scripts/check-burn-service.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const moduleBody = value => value.replace(/^import .*;\r?\n/gm, '').replace(/\bexport (?=(?:async )?function|const)/g, '');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const TOKEN = '0x4C450b3C2b89a2DAbE5A3eE39FF475134A30d665';
const DEAD = '0x000000000000000000000000000000000000dEaD';
const ZERO = '0x0000000000000000000000000000000000000000';
const BURNER = '0x1111111111111111111111111111111111111111';
const TREASURY = '0xEda3aa737947337b425227dB8174519f623C041F';
const SECOND_TREASURY = '0x86F4a6b17e91305F697bEf2723EaA24A69E8A70D';
const response = data => ({ ok: true, json: async () => data });
const accountFetch = read => url => new URL(url).searchParams.has('module')
  ? read(url) : response({ items: [] });
const burn = (hash, overrides = {}) => ({
  hash, from: BURNER, to: DEAD, contractAddress: TOKEN,
  value: '1000000000000000000', timeStamp: '1776256745', logIndex: '0',
  ...overrides,
});
const accountQuery = url => {
  const query = new URL(url).searchParams;
  assert.equal(query.get('module'), 'account');
  assert.equal(query.get('action'), 'tokentx');
  assert.equal(query.get('contractaddress'), TOKEN);
  assert.equal(query.get('startblock'), '0');
  assert.equal(query.get('offset'), '250');
  return query;
};

function setup(overrides = {}) {
  let id = 0;
  const timers = new Map();
  const requests = [];
  const ctx = vm.createContext({
    console: { warn() {} }, URLSearchParams, AbortController, Date,
    setTimeout(fn, delay) { const key = ++id; timers.set(key, { fn, delay }); return key; },
    clearTimeout(key) { timers.delete(key); },
    readTokenBasics: async () => ({ totalSupply: 3_600_000_000, decimals: 18 }),
    readTokenBalance: async address => /dead$/i.test(address) ? 120_000_000 : 0,
    readNativeBalance: async () => 250,
    fetch: async (url, options) => {
      requests.push(String(url));
      if (overrides.fetch) return overrides.fetch(String(url), options);
      const data = String(url).includes('dexscreener')
        ? { pairs: [{ priceUsd: '0.001', liquidity: { usd: 2500 } }] }
        : /\/tokens\/[^/]+$/.test(String(url)) ? { holders_count: '123', transfers_count: '456' }
        : new URL(url).searchParams.get('module') === 'account' ? { status: '1', result: [] }
        : { items: [] };
      return { ok: true, json: async () => data };
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'fetch')),
  });
  vm.runInContext([
    moduleBody(source('lib/config.js')),
    moduleBody(source('lib/burnSources.js')),
    moduleBody(source('lib/burnTracker.js')),
  ].join('\n'), ctx);
  return {
    ctx, requests, timers,
    expire(delay) {
      for (const [key, timer] of [...timers]) if (timer.delay === delay) {
        timers.delete(key); timer.fn();
      }
    },
  };
}

test('latest treasury reads both newest wallet feeds and strictly verifies token, sender and burn destination', async () => {
  const { ctx, requests } = setup({ fetch: async url => {
    const query = accountQuery(url);
    assert.equal(query.get('sort'), 'desc');
    assert.equal(query.get('page'), '1');
    const from = query.get('address');
    if (from === SECOND_TREASURY.toLowerCase()) return response({ status: '0', message: 'No transactions found', result: [] });
    assert.equal(from, TREASURY.toLowerCase());
    return response({ status: '1', result: [
      burn('latest-real', { from: TREASURY, to: ZERO, value: '45134844315994476255760', timeStamp: '1791387265', logIndex: '169', blockNumber: '27737558', transactionIndex: '23' }),
      burn('ordinary-transfer', { from, to: BURNER }),
      burn('incoming-transfer', { from: BURNER, to: ZERO }),
      burn('other-token', { from, to: ZERO, contractAddress: BURNER }),
      burn('zero-amount', { from, value: '0' }),
      burn('invalid-time', { from, timeStamp: 'unknown' }),
      burn('other-wallet-burn', { from: SECOND_TREASURY }),
    ] });
  } });
  const latest = await ctx.readLatestTreasuryBurns();
  assert.equal(requests.length, 2);
  assert.equal(latest.available, true);
  assert.equal(latest.errors.length, 0);
  assert.deepEqual(Array.from(latest.items, row => row.hash), ['latest-real']);
  const row = latest.items[0];
  assert.equal(row.rawAmount, '45134844315994476255760');
  assert.equal(row.timestamp, '2026-10-07T15:34:25.000Z');
  assert.equal(row.burnSource.type, 'treasury');
  assert.equal(row.logIndex, '169');
  assert.equal(row.blockNumber, '27737558');
  assert.equal(row.transactionIndex, '23');
});

test('one failed treasury feed keeps the other wallet verified and exposes partial availability', async () => {
  const { ctx } = setup({ fetch: async url => {
    const address = accountQuery(url).get('address');
    if (address === TREASURY.toLowerCase()) throw new Error('Explorer offline');
    return response({ status: '1', result: [burn('secondary-burn', { from: SECOND_TREASURY })] });
  } });
  const latest = await ctx.readLatestTreasuryBurns();
  assert.equal(latest.available, true);
  assert.deepEqual(Array.from(latest.items, row => row.hash), ['secondary-burn']);
  assert.equal(latest.errors.length, 1);
  assert.match(latest.errors[0], /eda3aa/i);
});

test('newest treasury burns publish before global history and never enter the quick activity chart', async () => {
  const blocked = deferred();
  const updates = [];
  const { ctx, expire } = setup({ fetch: async url => {
    const query = new URL(url).searchParams;
    if (query.get('module') === 'account') return response({ status: '1', result:
      query.get('address') === TREASURY.toLowerCase()
        ? [burn('treasury-latest', { from: TREASURY, to: ZERO, timeStamp: '1791387265' })] : [] });
    if (url.includes('/token-transfers?')) return blocked.promise;
    return response(url.includes('dexscreener') ? { pairs: [{ priceUsd: '0.001' }] } : { holders_count: '1' });
  } });
  const pending = ctx.readBurnTrackerState({ onUpdate: state => updates.push(state) });
  await flush();
  const early = updates.find(state => state.available.treasuryBurnHistory);
  assert.ok(early, 'latest treasury burns publish while global history is blocked');
  assert.equal(early.loading, true);
  assert.equal(early.available.burnHistory, false);
  assert.equal(early.treasuryBurns[0].hash, 'treasury-latest');
  assert.equal(early.allBurns.length, 0, 'old wallet burns do not imply the recent chart is complete');
  expire(5500);
  const final = await pending;
  assert.equal(final.treasuryBurns[0].hash, 'treasury-latest');
  assert.equal(final.available.treasuryBurnHistory, true);
  assert.equal(final.available.burnHistory, false);
  blocked.resolve(response({ items: [] }));
  await flush();
});

test('supply publishes while optional explorer requests are pending and final state is bounded', async () => {
  const blocked = deferred();
  const updates = [];
  const { ctx, expire } = setup({
    fetch: async url => {
      if (!url.includes('dexscreener')) return blocked.promise;
      return { ok: true, json: async () => ({ pairs: [{ priceUsd: '0.001' }] }) };
    },
  });
  const pending = ctx.readBurnTrackerState({ onUpdate: state => updates.push(state) });
  await flush();
  const early = updates.find(state => state.supplyAvailable);
  assert.ok(early, 'valid supply should appear before history returns');
  assert.equal(early.totalTrackedBurned, 120_000_000);
  assert.equal(early.available.burnHistory, false);
  assert.equal(early.loading, true);
  expire(5500);
  const final = await pending;
  assert.equal(final.loading, false);
  assert.equal(final.available.supply, true);
  assert.equal(final.available.market, true);
  assert.equal(final.available.holders, false);
  assert.ok(final.errors.some(error => /Explorer token metadata/.test(error)));
  blocked.resolve({ ok: true, json: async () => ({ items: [] }) });
  await flush();
  assert.equal(updates.at(-1).loading, false);
  assert.equal(final.available.burnHistory, false, 'late responses must not change the completed state');
});

test('failed balance reads stay unavailable while verified price, supply and zero balances survive', async () => {
  const { ctx } = setup({
    readTokenBalance: async address => {
      if (/dead$/i.test(address)) throw new Error('RPC offline');
      return 0;
    },
  });
  const final = await ctx.readBurnTrackerState();
  assert.equal(final.totalSupply, 3_600_000_000);
  assert.equal(final.supplyBurned, 100_000_000);
  assert.equal(final.zeroAddressBalance, 0);
  assert.equal(final.deadWalletBalance, null);
  assert.equal(final.available.zeroBalance, true);
  assert.equal(final.available.balances, false);
  assert.equal(final.supplyAvailable, false);
  assert.equal(final.totalTrackedBurned, null);
  assert.equal(final.burnedPercent, null);
  assert.equal(final.priceUsd, 0.001);
  assert.equal(final.available.market, true);
  assert.match(final.errors.join(' '), /Dead wallet balance reads/);
});

test('fast state reads one related-source page and accepts actual empty history and zero holders', async () => {
  const { ctx, requests } = setup({
    fetch: async url => ({ ok: true, json: async () => url.includes('dexscreener')
      ? { pairs: [{ priceUsd: '0.001' }] }
      : /\/tokens\/[^/]+$/.test(url) ? { holders_count: '0', transfers_count: '0' }
      : { items: [], next_page_params: { page: 2 } } }),
  });
  const final = await ctx.readBurnTrackerState();
  assert.equal(final.holders, 0);
  assert.equal(final.available.holders, true);
  assert.equal(final.transfers, 0);
  assert.equal(final.available.burnHistory, true);
  assert.equal(final.available.burns, true);
  assert.equal(final.available.sourceMatching, true);
  assert.equal(final.allBurns.length, 0);
  assert.equal(requests.some(url => url.includes('page=2')), false);
});

test('JSON parsing remains inside fetch timeout and retry handling', async () => {
  let attempts = 0;
  const { ctx, expire } = setup({ fetch: async () => ({
    ok: true,
    async json() {
      attempts++;
      if (attempts === 1) throw new Error('truncated body');
      return { recovered: true };
    },
  }) });
  const pending = ctx.fetchJson('https://example.test/data', 100, 2);
  await flush();
  expire(350);
  const data = await pending;
  assert.equal(data.recovered, true);
  assert.equal(attempts, 2);
});

test('a stalled JSON body is aborted rather than escaping the request deadline', async () => {
  const { ctx, expire } = setup({ fetch: async (_, options) => ({
    ok: true,
    json: () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted body')))),
  }) });
  const pending = ctx.fetchJson('https://example.test/data', 100, 1);
  await flush();
  expire(100);
  await assert.rejects(pending, /aborted body/);
});

test('full history readers still follow requested pagination independently of the quick state', async () => {
  const { ctx, requests } = setup({ fetch: async url => ({ ok: true, json: async () => ({
    items: [], next_page_params: url.includes('page=2') ? null : { page: 2 },
  }) }) });
  await ctx.readBurnTransfers('dead', 'Dead wallet', 2);
  assert.equal(requests.length, 2);
  assert.match(requests[1], /page=2/);
});

test('history outages stay incomplete with per-feed errors rather than becoming a verified empty history', async () => {
  const { ctx } = setup({ fetch: async () => { throw new Error('Explorer unavailable'); } });
  const history = await ctx.readAllBurnTransactions();
  assert.equal(history.complete, false);
  assert.equal(history.items.length, 0);
  assert.equal(history.errors.length, 2);
  assert.match(history.feeds.dead.failed, /Explorer unavailable/);
  assert.match(history.feeds.zero.failed, /Explorer unavailable/);
  assert.equal(history.feeds.dead.complete, false);
  assert.equal(history.feeds.zero.complete, false);
  const top = await ctx.readTopBurnsData();
  assert.equal(top.complete, false);
  assert.equal(top.items.length, 0);
  assert.equal(top.errors.length, 2);
});

test('history retains verified rows while the other burn destination is unavailable', async () => {
  const { ctx } = setup({ fetch: async url => {
    const query = new URL(url).searchParams;
    const address = query.get('address') || url;
    if (/dead(?:\/|$)/i.test(address)) throw new Error('Dead wallet feed unavailable');
    return response({ status: '1', result: [
      burn('smaller', { to: ZERO, value: '2000000000000000000' }),
      burn('larger', { to: ZERO, value: '4000000000000000000' }),
    ] });
  } });
  const history = await ctx.readAllBurnTransactions();
  assert.deepEqual(Array.from(history.items, row => row.hash), ['smaller', 'larger']);
  assert.equal(history.complete, false);
  assert.equal(history.feeds.zero.complete, true);
  assert.equal(history.feeds.dead.complete, false);
  assert.equal(history.errors.length, 1);
  const top = await ctx.readTopBurnsData();
  assert.deepEqual(Array.from(top.items, row => row.amount), [4, 2]);
  assert.equal(top.complete, false);
  const empty = await setup({ fetch: async () => response({ status: '0', message: 'No transactions found', result: [] }) }).ctx.readAllBurnTransactions();
  assert.equal(empty.complete, true, 'successful empty feeds remain valid');
  assert.equal(empty.items.length, 0);
  assert.equal(empty.errors.length, 0);
});

test('all-time history pages ascending in batches of 250 and remains partial until both destinations end', async () => {
  const secondPage = deferred();
  const updates = [];
  const { ctx, requests } = setup({ fetch: accountFetch(async url => {
    const query = accountQuery(url);
    assert.equal(query.get('sort'), 'asc');
    if (query.get('address').toLowerCase() === ZERO) return response({ status: '1', result: [] });
    if (query.get('page') === '2') return secondPage.promise;
    return response({ status: '1', result: Array.from({ length: 250 }, (_, index) => burn(`early-${index}`)) });
  }) });
  const pending = ctx.readAllBurnTransactions({ onProgress: value => updates.push(value) });
  await flush();
  const partial = updates.find(value => value.items.length === 250 && value.feeds.zero.complete);
  assert.ok(partial, 'verified first-page rows should publish without waiting for the full scan');
  assert.equal(partial.complete, false);
  assert.equal(partial.feeds.dead.complete, false);
  assert.equal(partial.feeds.dead.cursor.page, 2);
  secondPage.resolve(response({ status: '1', result: [burn('later-largest', { value: '99000000000000000000' })] }));
  const history = await pending;
  assert.equal(history.items.length, 251);
  assert.equal(history.complete, true);
  assert.equal(history.feeds.dead.pages, 2);
  assert.equal(history.feeds.zero.pages, 1);
  assert.equal(history.items.at(-1).amount, 99);
  assert.deepEqual(requests.filter(url => new URL(url).searchParams.get('address')?.toLowerCase() === DEAD.toLowerCase())
    .map(url => new URL(url).searchParams.get('page')), ['1', '2']);
  assert.ok(updates.slice(0, -1).every(value => !value.complete || (value.feeds.dead.complete && value.feeds.zero.complete)));
});

test('an older-page failure preserves its exact cursor and resumes without restarting successful feeds', async () => {
  let failSecondPage = true;
  const { ctx, requests } = setup({ fetch: accountFetch(async url => {
    const query = accountQuery(url);
    if (query.get('address').toLowerCase() === ZERO) return response({ status: '1', result: [] });
    if (query.get('page') === '1') return response({ status: '1', result: Array.from({ length: 250 }, (_, index) => burn(`first-${index}`)) });
    if (failSecondPage) { failSecondPage = false; throw new Error('temporary upstream failure'); }
    return response({ status: '1', result: [burn('resumed')] });
  }) });
  const partial = await ctx.readAllBurnTransactions();
  assert.equal(partial.complete, false);
  assert.equal(partial.items.length, 250);
  assert.equal(partial.feeds.dead.transport, 'v1');
  assert.equal(partial.feeds.dead.cursor.page, 2);
  assert.match(partial.feeds.dead.failed, /temporary upstream failure/);
  const complete = await ctx.readAllBurnTransactions();
  assert.equal(complete.complete, true);
  assert.equal(complete.items.length, 251);
  assert.equal(complete.errors.length, 0);
  assert.deepEqual(requests.filter(url => new URL(url).searchParams.get('address')?.toLowerCase() === DEAD.toLowerCase())
    .map(url => new URL(url).searchParams.get('page')), ['1', '2', '2']);
  assert.equal(requests.filter(url => new URL(url).searchParams.get('address')?.toLowerCase() === ZERO).length, 1);
});

test('all-time ranking reaches older large burns beyond the previous recent-page window', async () => {
  const { ctx, requests } = setup({ fetch: accountFetch(async url => {
    const query = accountQuery(url);
    if (query.get('address').toLowerCase() === ZERO) return response({ status: '1', result: [] });
    const page = Number(query.get('page'));
    return response({ status: '1', result: page <= 11
      ? Array.from({ length: 250 }, (_, index) => burn(`page-${page}-${index}`))
      : [burn('old-largest', { value: '1000000000000000000000000' })] });
  }) });
  const top = await ctx.readTopBurnsData();
  assert.equal(top.complete, true);
  assert.equal(top.feeds.dead.pages, 12);
  assert.equal(top.items.length, 100);
  assert.equal(top.items[0].hash, 'old-largest');
  assert.equal(top.items[0].amount, 1_000_000);
  assert.equal(requests.filter(url => new URL(url).searchParams.get('address')?.toLowerCase() === DEAD.toLowerCase()).length, 12);
});

test('a scan budget keeps older history resumable without claiming full coverage', async () => {
  let now = 1_000;
  class Clock extends Date { static now() { return now; } }
  const { ctx, requests } = setup({ Date: Clock, fetch: accountFetch(async url => {
    const query = accountQuery(url);
    if (query.get('address').toLowerCase() === ZERO) return response({ status: '1', result: [] });
    if (query.get('page') === '1') {
      now += 101;
      return response({ status: '1', result: Array.from({ length: 250 }, (_, index) => burn(`budget-${index}`)) });
    }
    return response({ status: '1', result: [] });
  }) });
  const partial = await ctx.readAllBurnTransactions({ budgetMs: 100 });
  assert.equal(partial.complete, false);
  assert.equal(partial.items.length, 250);
  assert.equal(partial.feeds.dead.cursor.page, 2);
  assert.equal(partial.errors.length, 0, 'a time budget is not an explorer error');
  const complete = await ctx.readAllBurnTransactions({ budgetMs: 1_000 });
  assert.equal(complete.complete, true);
  assert.equal(complete.items.length, 250);
  assert.deepEqual(requests.filter(url => new URL(url).searchParams.get('address')?.toLowerCase() === DEAD.toLowerCase())
    .map(url => new URL(url).searchParams.get('page')), ['1', '2']);
});

test('live head refresh deduplicates transfer logs, excludes mints and preserves exact raw ranking', async () => {
  const smallerRaw = '9007199254740992000000000000000001';
  const largerRaw = '9007199254740992000000000000000002';
  const { ctx, requests } = setup({ fetch: accountFetch(async url => {
    const query = accountQuery(url);
    assert.equal(query.get('page'), '1');
    if (query.get('address').toLowerCase() === ZERO) return response({ status: '1', result: [burn('zero-old', { to: ZERO })] });
    const old = burn('dead-old');
    if (query.get('sort') === 'asc') return response({ status: '1', result: [old] });
    const first = burn('same-transaction', { value: smallerRaw, logIndex: '0' });
    const second = burn('same-transaction', { value: largerRaw, logIndex: '1' });
    return response({ status: '1', result: [
      first, first, second, old,
      burn('mint', { from: ZERO }),
      burn('wrong-token', { contractAddress: BURNER }),
      burn('not-a-burn', { to: BURNER }),
    ] });
  }) });
  assert.equal((await ctx.readAllBurnTransactions()).items.length, 2);
  const top = await ctx.readTopBurnsData();
  assert.equal(top.complete, true);
  assert.equal(top.items.length, 4);
  assert.deepEqual(Array.from(top.items.slice(0, 2), row => row.rawAmount), [largerRaw, smallerRaw]);
  assert.deepEqual(Array.from(top.items.slice(0, 2), row => row.logIndex), ['1', '0']);
  assert.equal(top.items[0].amount, top.items[1].amount, 'raw ordering must remain exact when numeric values round together');
  assert.equal(top.items.some(row => ['mint', 'wrong-token', 'not-a-burn'].includes(row.hash)), false);
  assert.deepEqual(requests.map(url => new URL(url).searchParams.get('sort')).filter(Boolean), ['asc', 'asc', 'desc', 'desc']);
});

test('legacy fallback validates the actual token and destination and scans the v2 cursor to its end', async () => {
  const transfer = (hash, overrides = {}) => ({
    tx_hash: hash, from: { hash: BURNER }, to: { hash: DEAD },
    token: { address: TOKEN }, total: { value: '1000000000000000000' },
    log_index: 3, timestamp: '2026-04-15T12:39:05.000Z', ...overrides,
  });
  const { ctx, requests } = setup({ fetch: async url => {
    const query = new URL(url).searchParams;
    if (query.has('module')) return response({ status: '0', result: 'Unsupported legacy route' });
    if (!url.toLowerCase().includes(`/addresses/${DEAD.toLowerCase()}/`)) return response({ items: [] });
    if (query.get('page') === '2') return response({ items: [transfer('older')], next_page_params: null });
    return response({ items: [
      transfer('valid'), transfer('wrong-token', { token: { address: BURNER } }),
      transfer('wrong-destination', { to: { hash: BURNER } }),
      transfer('mint', { from: { hash: ZERO } }), transfer('unidentified-token', { token: {} }),
    ], next_page_params: { page: 2 } });
  } });
  const history = await ctx.readAllBurnTransactions();
  assert.equal(history.complete, true);
  assert.equal(history.feeds.dead.transport, 'v2');
  assert.equal(history.feeds.dead.order, 'desc');
  assert.equal(history.feeds.dead.pages, 2);
  assert.deepEqual(Array.from(history.items, row => row.hash), ['valid', 'older']);
  assert.equal(requests.filter(url => url.includes('page=2')).length, 1);
  assert.equal(history.items[0].rawAmount, '1000000000000000000');
  assert.equal(history.items[0].logIndex, 3);
});

test('optional source matching runs beside history, keeps verified associations and stops after three pages', async () => {
  const related = '0x8577f0FB9D709d5BeBd808dDDd0094FbAEc667B4';
  const pair = '0xda942580cee2a69c5fc74109090816157730c64d';
  let relatedFails = false;
  const { ctx, requests } = setup({ fetch: async url => {
    const query = new URL(url).searchParams;
    if (query.has('module')) return response({ status: '1', result: query.get('address').toLowerCase() === ZERO
      ? [] : [burn('related-burn', { from: pair })] });
    assert.ok(url.toLowerCase().includes(related.toLowerCase()));
    if (relatedFails) throw new Error('optional matching offline');
    const page = Number(query.get('page') || 1);
    return response({ items: page === 2 ? [{ hash: 'related-burn' }] : [], next_page_params: { page: page + 1 } });
  } });
  const history = await ctx.readAllBurnTransactions();
  assert.equal(history.complete, true);
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].burnSource.name, 'BURNX');
  assert.equal(history.items[0].burnSource.isUnknown, false);
  assert.equal(requests.filter(url => url.toLowerCase().includes(related.toLowerCase())).length, 3);
  relatedFails = true;
  const refreshed = await ctx.readAllBurnTransactions();
  assert.equal(refreshed.complete, true);
  assert.equal(refreshed.items[0].burnSource.name, 'BURNX', 'a failed optional refresh must retain earlier verified associations');
  assert.equal(refreshed.errors.length, 0, 'optional source matching must not invalidate full destination coverage');
});

test('a stalled optional source request has its own deadline and does not block burn progress', async () => {
  const updates = [];
  const { ctx, expire } = setup({ fetch: async (url, options) => {
    if (new URL(url).searchParams.has('module')) return response({ status: '1', result: [] });
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('optional request aborted'))));
  } });
  const pending = ctx.readAllBurnTransactions({ onProgress: value => updates.push(value) });
  await flush();
  assert.ok(updates.some(value => value.complete), 'destination history can publish complete coverage while source matching waits');
  expire(4500);
  const history = await pending;
  assert.equal(history.complete, true);
  assert.equal(history.errors.length, 0);
});

test('the RPC module reuses local ethers without a remote module dependency', () => {
  const code = source('lib/pulsechain.js');
  assert.doesNotMatch(code, /(?:import|from)\s*\(?\s*["']https?:/);
  assert.match(code, /vendor\/ethers\.umd\.min\.js/);
  const localEthers = { JsonRpcProvider: class {}, Contract: class {} };
  const body = moduleBody(code)
    .replace(/if \(!globalThis\.ethers\) await import\([^;]+;/, '')
    .replace(/^export \{ ethers \};\r?\n?/m, '');
  const ctx = vm.createContext({ ethers: localEthers, setTimeout, clearTimeout, CASHX: { urls: {}, addresses: {} }, ERC20_ABI: [] });
  vm.runInContext(body, ctx);
  assert.ok(ctx.getPulseProvider() instanceof localEthers.JsonRpcProvider);
});
