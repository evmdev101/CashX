const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const burnRankings = require('../lib/burn-rankings.js');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
}
function ui(extra = {}) {
  const values = new Map();
  const ctx = vm.createContext({
    console: {warn() {}}, serviceState: null, cachedPrice: 0, chartHistoryComplete: false, window: {},
    cachedChartBurnsData: [], currentChartRange: '24H', currentDashboardToken: 'cashx', renderBurnChart() {},
    set: (id, value) => values.set(id, value), $: () => null,
    fmtPrice: value => '$' + value, fmtUSD: value => '$' + value, fmtN: value => String(value),
    pctText: value => value + '%', DASHBOARD_TOKEN_CONFIG: {cashx: {key: 'cashx', symbol: 'CASHX', token: '0x' + 'a'.repeat(40), initialSupply: 100}},
    updateDashboardBurnProgress: (_, burned) => values.set('progress', burned),
    _dashSave() {}, _chartCacheSave() {}, renderTop3Burns() {}, updateLatestBurns() {}, ...extra,
  });
  vm.runInContext(section('  function mergeBurnChartItems(', '  function _chartCacheSave('), ctx);
  vm.runInContext(section('  function applyCashxDashboardState(', '  let _dashboardRetryTimer'), ctx);
  return {ctx, values};
}

test('price and supply render before history completes and survive unavailable updates', () => {
  const {ctx, values} = ui();
  ctx.applyCashxDashboardState({available: {market: true}, priceUsd: 2, marketCap: 200,
    liquidity: 50, volume24h: 10, priceChange24h: 1, priceChange5m: 0, priceChange1h: 0});
  assert.equal(values.get('c-price'), '$2');
  ctx.applyCashxDashboardState({available: {}, supplyAvailable: true, totalTrackedBurned: 20, burnedPercent: 20});
  assert.equal(values.get('c-burned'), '20');
  assert.equal(values.get('src-community'), '80');
  ctx.applyCashxDashboardState({available: {}, supplyAvailable: false, totalTrackedBurned: null});
  assert.equal(values.get('c-price'), '$2');
  assert.equal(values.get('c-burned'), '20');
  assert.equal(values.get('progress'), 20);
  assert.equal(ctx.serviceState.totalTrackedBurned, 20);
});

test('the independent treasury feed updates latest cards while global burn history is unavailable', () => {
  const updates = [];
  const mapped = [];
  const {ctx} = ui({
    toDashboardTx: tx => {const row = {...tx, tx_hash: tx.hash}; mapped.push(row); return row;},
    updateLatestBurns: (items, cfg) => updates.push({items, cfg}),
  });
  const verified = {hash: '0x' + 'd'.repeat(64), rawAmount: '45134844315994476255760',
    timestamp: '2026-10-07T15:34:25Z', burnSource: {type: 'treasury'}};
  ctx.applyCashxDashboardState({available: {treasuryBurnHistory: true}, treasuryBurns: [verified]});
  assert.equal(updates.length, 1);
  assert.deepEqual(Array.from(updates[0].items), mapped);
  assert.equal(updates[0].items[0].tx_hash, verified.hash);
  assert.equal(updates[0].cfg.key, 'cashx');
});

const LATEST_ZERO = '0x' + '0'.repeat(40);
const latestCfg = key => ({key, symbol: key.toUpperCase(), token: '0x' + (key === 'cashx' ? 'a' : 'b').repeat(40)});
const latestEvent = (id = 'a', overrides = {}) => ({
  tx_hash: '0x' + id.repeat(64), from: {hash: '0x' + '1'.repeat(40)},
  to: {hash: LATEST_ZERO}, total: {value: '2578567128852051855142'},
  timestamp: '2026-10-18T13:44:05Z', block_number: '27829314', log_index: '209',
  ...overrides,
});

function latestUI(storage = new Map(), initialNow = Date.parse('2026-10-18T13:54:05Z')) {
  let now = initialNow;
  class Clock extends Date { static now() { return now; } }
  const values = new Map(), elements = new Map(), intervals = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {dataset: {}, title: '', textContent: ''});
    return elements.get(id);
  };
  const ctx = vm.createContext({
    Date: Clock, ZERO: LATEST_ZERO, latestBurnsByToken: new Map(), currentDashboardToken: 'cashx',
    window: {location: {hash: '#dashboard'}}, explorerWeb: 'https://scan.pulsechain.com',
    activeDashboardConfig: () => latestCfg(ctx.currentDashboardToken),
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    set: (id, value) => {values.set(id, value); element(id).textContent = value;},
    setHTML: (id, value) => {values.set(id, value); element(id).innerHTML = value;}, $: element,
    fmtN: value => String(value), ago: seconds => `${Math.floor((now / 1000 - seconds) / 60)}m ago`,
    isBurnDestination: address => address.toLowerCase() === LATEST_ZERO || address.toLowerCase() === '0x' + '0'.repeat(36) + 'dead',
    isTreasuryBurn: tx => tx.burnSource?.type === 'treasury',
    setInterval: (callback, delay) => {intervals.push({callback, delay});},
  });
  vm.runInContext(section('  function validLatestBurn(', '  async function refreshGenericTokenDashboard('), ctx);
  return {ctx, values, elements, storage, intervals, advance: ms => {now += ms;}};
}

test('latest burn cards keep the newest event through older snapshots, nulls and missing categories', () => {
  const {ctx, values} = latestUI();
  const cfg = latestCfg('cashx');
  const newest = latestEvent('a');
  ctx.updateLatestBurns([newest], cfg);
  const displayed = values.get('latest-community-amt');
  assert.match(displayed, /tx\/0x[a]{64}/);
  ctx.updateLatestBurns([latestEvent('b', {timestamp: '2026-05-10T00:00:00Z'})], cfg);
  ctx.setDashboardLatest('latest-community', null, cfg);
  ctx.updateLatestBurns([], cfg);
  assert.equal(values.get('latest-community-amt'), displayed);
  const treasury = latestEvent('c', {burnSource: {type: 'treasury'}});
  ctx.updateLatestBurns([treasury], cfg);
  assert.match(values.get('latest-treasury-amt'), /tx\/0x[c]{64}/);
  assert.equal(values.get('latest-community-amt'), displayed, 'a treasury-only page cannot erase community history');
});

test('same-transaction latest burns follow the log order rather than the largest amount', () => {
  for (const reverse of [false, true]) {
    const {ctx, values} = latestUI();
    const late = latestEvent('a', {log_index: '209'});
    const early = latestEvent('a', {log_index: '82', total: {value: '39479892981836345005378'}});
    ctx.updateLatestBurns(reverse ? [late, early] : [early, late], latestCfg('cashx'));
    assert.match(values.get('latest-community-amt'), /2578\.567/);
    assert.doesNotMatch(values.get('latest-community-amt'), /39479/);
    assert.equal(ctx.latestBurnsByToken.get('cashx:latest-community').log_index, '209');
  }
});

test('latest burn cache saves raw timestamps and recomputes the age after reload and on the timer', () => {
  const {ctx, storage, values, advance, intervals} = latestUI();
  const cfg = latestCfg('cashx');
  ctx.updateLatestBurns([latestEvent()], cfg);
  assert.equal(values.get('latest-community-time'), '10m ago');
  const saved = JSON.parse(storage.get(`cashx:latest-burns:v1:369:${cfg.token}`));
  assert.equal(saved.items['latest-community'].timestamp, '2026-10-18T13:44:05.000Z');
  assert.equal(Object.hasOwn(saved.items['latest-community'], 'timeAgo'), false);
  advance(5 * 60000);
  assert.equal(intervals[0].delay, 15000);
  intervals[0].callback();
  assert.equal(values.get('latest-community-time'), '15m ago');
  const reload = latestUI(storage, Date.parse('2026-10-18T14:14:05Z'));
  reload.ctx.restoreDashboardLatest(cfg);
  assert.equal(reload.values.get('latest-community-time'), '30m ago');
  assert.match(reload.values.get('latest-community-amt'), /tx\/0x[a]{64}/);
  assert.equal(reload.elements.get('latest-community-time').dataset.burnAt, '1792331045');
});

test('latest burns are isolated by token and callbacks for another token cannot overwrite the active card', () => {
  const {ctx, values, storage} = latestUI();
  const cashx = latestCfg('cashx'), gsx = latestCfg('gsx');
  ctx.updateLatestBurns([latestEvent('a')], cashx);
  const cashxCard = values.get('latest-community-amt');
  ctx.currentDashboardToken = 'gsx';
  ctx.restoreDashboardLatest(gsx);
  assert.equal(values.get('latest-community-amt'), '—');
  ctx.updateLatestBurns([latestEvent('b')], cashx);
  assert.equal(values.get('latest-community-amt'), '—', 'late CASHX callbacks cannot write to GSX');
  ctx.updateLatestBurns([latestEvent('c')], gsx);
  assert.match(values.get('latest-community-amt'), /GSX/);
  assert.match(values.get('latest-community-amt'), /tx\/0x[c]{64}/);
  ctx.currentDashboardToken = 'cashx';
  ctx.restoreDashboardLatest(cashx);
  assert.equal(values.get('latest-community-amt'), cashxCard);
  assert.equal(storage.size, 2);
  const wrongTokenStorage = new Map([[`cashx:latest-burns:v1:369:${cashx.token}`, JSON.stringify({token: gsx.token, items: {'latest-community': latestEvent('d')}})]]);
  const mismatched = latestUI(wrongTokenStorage);
  mismatched.ctx.restoreDashboardLatest(cashx);
  assert.equal(mismatched.values.get('latest-community-amt'), '—');
});

test('invalid cached or live burns cannot replace a verified latest burn', () => {
  const {ctx, values} = latestUI();
  const cfg = latestCfg('cashx');
  ctx.updateLatestBurns([latestEvent('a')], cfg);
  const before = values.get('latest-community-amt');
  for (const invalid of [null, latestEvent('b', {tx_hash: '<script>'}),
    latestEvent('b', {from: {hash: LATEST_ZERO}}), latestEvent('b', {from: {hash: 'broken'}}),
    latestEvent('b', {to: {hash: '0x' + '2'.repeat(40)}}),
    latestEvent('b', {timestamp: 'invalid'}), latestEvent('b', {timestamp: '2026-10-19T00:00:00Z'}),
    latestEvent('b', {total: {value: '-1'}}), latestEvent('b', {total: {value: '0'}}),
    latestEvent('b', {total: {value: 'Infinity'}})]) {
    assert.equal(ctx.validLatestBurn(invalid), null);
    ctx.setDashboardLatest('latest-community', invalid, cfg);
    assert.equal(values.get('latest-community-amt'), before);
  }
});

test('chart ranges work with the quick feed while the complete history is still pending', () => {
  const rendered = [];
  const {ctx} = ui({cachedChartBurnsData: [], chartHistoryComplete: false, _chartCacheSave() {}, _burnCountsReady: true, currentChartRange: '24H',
    cachedBurnsData: [], cachedRecentBurnsData: [], toDashboardTx: tx => tx,
    renderRecentBurnEvents() {}, isTreasuryBurn: () => false, setDashboardLatest() {},
    renderBurnChart: (items, range) => rendered.push({items, range}),
    document: {querySelectorAll: () => []}});
  const items = [{timestamp: '2026-10-17T10:00:00Z'}];
  ctx.applyCashxDashboardState({available: {burnHistory: true}, allBurns: items, recentBurns: items});
  vm.runInContext(section('  function switchChart(', '  function chartStartOf('), ctx);
  ctx.switchChart('7D', {classList: {add() {}}});
  assert.equal(rendered[1].range, '7D');
  assert.deepEqual(Array.from(rendered[1].items), items);
});

test('a failed refresh preserves rendered stats and schedules a retry', async () => {
  let retries = 0;
  const {ctx, values} = ui({currentDashboardToken: 'cashx', dashboardChartEpoch: 1,
    getServicesReady: async () => { throw Error('offline'); }, scheduleDashboardRetry: () => retries++,
    lsSet() {}, lsDone() {}, withTimeout: p => p});
  values.set('c-price', '$2'); values.set('c-burned', '20');
  await ctx.load();
  assert.equal(values.get('c-price'), '$2');
  assert.equal(values.get('c-burned'), '20');
  assert.equal(retries, 1);
  assert.match(values.get('last-up'), /delayed.*retry/);
});

test('progressive CashX callbacks cannot write after switching to another token', async () => {
  let publish, finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const {ctx, values} = ui({currentDashboardToken: 'cashx', dashboardChartEpoch: 1,
    getServicesReady: async () => ({CASHX: {urls: {explorer: 'scan'}},
      readBurnTrackerState: ({onUpdate}) => { publish = onUpdate; return pending; }}),
    lsSet() {}, lsDone() {}, withTimeout: p => p});
  const load = ctx.load();
  await new Promise(setImmediate);
  ctx.currentDashboardToken = 'gsx'; ctx.dashboardChartEpoch++;
  const update = {available: {market: true}, priceUsd: 99};
  publish(update); finish(update); await load;
  assert.equal(values.has('c-price'), false);
});

test('history starts with the live cards and does not block the next refresh', async () => {
  const started = [];
  const ctx = vm.createContext({Date, currentDashboardToken: 'cashx',
    activeDashboardConfig: () => ({key: 'cashx'}),
    loadBurnActivityChart: () => { started.push('chart'); return new Promise(() => {}); },
    runBurnCounts: () => { started.push('counts'); return new Promise(() => {}); },
    load: async () => started.push('cards')});
  vm.runInContext(section('  let _dashboardLoadPromise = null;', '  function copyAddr('), ctx);
  await ctx.refreshDashboard({force: true});
  assert.deepEqual(started, ['chart', 'counts', 'cards']);
  await ctx.refreshDashboard({force: true});
  assert.equal(started.length, 6);
});

test('an unloaded history chart shows a loading message instead of zero burn points', async () => {
  const canvas = {style: {}}, status = {};
  const ctx = vm.createContext({dashboardChartEpoch: 1, burnChartRenderId: 0,
    ensureChartReady: async () => true, window: {Chart: true}, burnChart: null,
    document: {getElementById: id => id === 'burn-chart' ? canvas : id === 'burn-chart-status' ? status : null}});
  vm.runInContext(section('  async function renderBurnChart(', '  function'), ctx);
  await ctx.renderBurnChart([], '24H');
  assert.equal(canvas.style.visibility, 'hidden');
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /Loading/);
});

test('a failed history refresh keeps the completed burn totals instead of replacing them with a recent sample', async () => {
  const ctx = vm.createContext({console: {warn() {}}, currentDashboardToken: 'cashx',
    dashboardChartEpoch: 1, _burnCountsReady: true,
    _getAllBurns: async () => {throw Error('explorer offline');},
    summarizeBurnCards: () => assert.fail('A recent page replaced the complete totals'),
    renderBurnSummaryFallback: () => assert.fail('The completed totals were overwritten')});
  vm.runInContext(section('  async function loadBurnCounts(', '  let _burnActivityLoadPromise'), ctx);
  await ctx.loadBurnCounts(true);
});

function chartCacheUI(initial) {
  const storage = new Map(initial ? [['cashx_chart_burns_v2', JSON.stringify(initial)]] : []);
  let reads = 0;
  const completeRows = [{tx_hash: 'complete', timestamp: '2026-10-01T00:00:00Z'}];
  const rendered = [];
  const ctx = vm.createContext({
    Date, cachedChartBurnsData: [], chartHistoryComplete: false,
    currentChartRange: '24H', _allBurnsPromise: null, _burnActivityLoadPromise: null,
    currentDashboardToken: 'cashx', dashboardChartEpoch: 1, renderTop3Burns() {}, updateLatestBurns() {},
    cachedPrice: 1, DASHBOARD_TOKEN_CONFIG: {cashx: latestCfg('cashx')},
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    renderBurnChart: items => rendered.push(items),
    getServicesReady: async () => ({readAllBurnTransactions: async () => { reads++; return {items: completeRows, complete: true}; }}),
    withTimeout: promise => promise, toDashboardTx: row => row, console: {warn() {}}, set() {},
  });
  vm.runInContext(section("  const _CHART_CACHE_KEY =", '  async function loadBurnActivityChart('), ctx);
  return {ctx, storage, rendered, completeRows, reads: () => reads};
}

test('a saved recent burn feed renders on reload while complete history still loads', async () => {
  const {ctx, storage, rendered, completeRows, reads} = chartCacheUI();
  const recent = [{tx_hash: 'recent', timestamp: '2026-10-17T00:00:00Z'}];
  assert.equal(ctx._chartCacheSave(recent, false), true);
  assert.equal(JSON.parse(storage.get('cashx_chart_burns_v2')).complete, false);
  assert.equal(ctx._chartCacheApply(), true);
  assert.equal(ctx.chartHistoryComplete, false);
  assert.equal(rendered[0][0].tx_hash, 'recent');
  assert.deepEqual((await ctx._getAllBurns()).items, completeRows);
  assert.equal(reads(), 1, 'a recent page cannot stand in for complete history');
});

test('a complete saved chart accepts the latest live burns without discarding old events or double counting logs', async () => {
  const older = latestEvent('b', {timestamp: '2026-05-10T00:00:00Z'});
  const newest = latestEvent('a');
  const {ctx, storage, rendered, reads} = chartCacheUI({_ts: Date.now(), complete: true, items: [older]});
  ctx._chartCacheApply();
  ctx.mergeLiveBurnChart([newest]);
  ctx.mergeLiveBurnChart([newest]);
  assert.equal(ctx.chartHistoryComplete, false, 'new head activity requires a fresh coverage check');
  assert.deepEqual(Array.from(ctx.cachedChartBurnsData, row => row.tx_hash), [older.tx_hash, newest.tx_hash]);
  assert.equal(rendered.length, 2, 'a duplicate live page does not redraw or count the same log twice');
  const saved = JSON.parse(storage.get('cashx_chart_burns_v2'));
  assert.equal(saved.complete, false);
  assert.equal(saved.items.length, 2);
  await ctx._getAllBurns();
  assert.equal(reads(), 1, 'merging a recent page cannot postpone verification through the complete-cache TTL');
});

test('a slow all-time chart response cannot erase a newer live event that arrived while it was loading', async () => {
  let finish;
  const deferred = new Promise(resolve => {finish = resolve;});
  const older = latestEvent('b', {timestamp: '2026-05-10T00:00:00Z'});
  const newest = latestEvent('a');
  const {ctx, storage, rendered} = chartCacheUI();
  ctx.getServicesReady = async () => ({readAllBurnTransactions: () => deferred});
  vm.runInContext(section('  async function loadBurnActivityChart(', '  const $   ='), ctx);
  const pending = ctx.loadBurnActivityChart({force: true});
  await new Promise(setImmediate);
  ctx.mergeLiveBurnChart([newest]);
  finish({items: [older], complete: true});
  await pending;
  assert.equal(ctx.chartHistoryComplete, true);
  assert.deepEqual(Array.from(ctx.cachedChartBurnsData, row => row.tx_hash), [newest.tx_hash, older.tx_hash]);
  assert.equal(rendered.at(-1).length, 2);
  const saved = JSON.parse(storage.get('cashx_chart_burns_v2'));
  assert.equal(saved.complete, true);
  assert.equal(saved.items.length, 2);
});

test('a recent page cannot replace saved complete history', async () => {
  for (const complete of [true]) {
    const saved = {_ts: Date.now(), items: [{tx_hash: 'all-history'}]};
    if (complete !== undefined) saved.complete = complete;
    const {ctx, storage, reads} = chartCacheUI(saved);
    const before = storage.get('cashx_chart_burns_v2');
    assert.equal(ctx._chartCacheSave([{tx_hash: 'recent'}], false), false);
    assert.equal(storage.get('cashx_chart_burns_v2'), before);
    assert.equal(ctx._chartCacheApply(), true);
    assert.equal(ctx.chartHistoryComplete, true);
    assert.equal((await ctx._getAllBurns()).items[0].tx_hash, 'all-history');
    assert.equal(reads(), 0);
  }
});

test('complete history replaces an earlier saved recent feed and forced refresh bypasses it', async () => {
  const {ctx, storage, reads} = chartCacheUI();
  ctx._chartCacheSave([{tx_hash: 'recent'}], false);
  assert.equal(ctx._chartCacheSave([{tx_hash: 'complete'}]), true);
  assert.equal(JSON.parse(storage.get('cashx_chart_burns_v2')).complete, true);
  assert.equal(ctx._chartCacheApply(), true);
  assert.equal(ctx.chartHistoryComplete, true);
  await ctx._getAllBurns(true);
  assert.equal(reads(), 1);
});

test('a fresh recent feed repairs a corrupt chart cache', () => {
  const {ctx, storage} = chartCacheUI();
  storage.set('cashx_chart_burns_v2', '{broken');
  assert.equal(ctx._chartCacheSave([{tx_hash: 'recent'}], false), true);
  assert.equal(ctx._chartCacheApply(), true);
  assert.equal(ctx.cachedChartBurnsData[0].tx_hash, 'recent');
  assert.equal(ctx.chartHistoryComplete, false);
});

function rankingUI(storage = new Map()) {
  const element = {innerHTML: ''};
  const labels = new Map();
  const cfg = {key: 'cashx', token: '0x' + 'a'.repeat(40)};
  const ctx = vm.createContext({
    window: {BurnRankings: burnRankings}, topBurnsByToken: new Map(), topBurnsCoverage: new Map(),
    document: {getElementById: () => element}, localStorage: {
      getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)
    }, activeDashboardConfig: () => cfg, activeDashboardSymbol: () => 'CASHX',
    set: (id, value) => labels.set(id, value), fmtN: value => String(value),
    fmtUSD: value => '$' + value, burnSourceHTML: () => 'source', ago: () => 'earlier', explorerWeb: 'https://scan.pulsechain.com',
  });
  vm.runInContext(section('  function renderTop3Burns(', '  function topBurnsNeedsLoad('), ctx);
  return {ctx, element, labels, storage};
}
const rankEvent = (id, amount) => ({tx_hash: '0x' + id.repeat(64), log_index: '1',
  total: {value: String(BigInt(amount) * 10n ** 18n)},
  from: {hash: '0x' + '1'.repeat(40)}, to: {hash: '0x' + '0'.repeat(40)}, timestamp: '2026-04-10T00:00:00Z'});

test('Top 3 keeps older large burns when a recent smaller page arrives and restores them on reload', () => {
  const {ctx, element, storage} = rankingUI();
  ctx.renderTop3Burns([rankEvent('a', 20_000_000), rankEvent('b', 8_500_000), rankEvent('c', 4_750_000)], 1);
  ctx.renderTop3Burns([rankEvent('d', 55_840), rankEvent('e', 27_520)], 2);
  assert.match(element.innerHTML, /20000000 CASHX/);
  assert.doesNotMatch(element.innerHTML, /55840 CASHX/);
  assert.match(element.innerHTML, /\$40000000/);
  const reload = rankingUI(storage);
  reload.ctx.renderTop3Burns([], 3);
  assert.match(reload.element.innerHTML, /20000000 CASHX/);
  assert.match(reload.element.innerHTML, /scan\.pulsechain\.com\/tx\/0x/);
  assert.equal(reload.labels.get('top3-burns-status'), 'Checking earlier burns…');
});

test('Top 3 only labels a ranking all-time after the scanner verifies completion', () => {
  const {ctx, labels} = rankingUI();
  ctx.renderTop3Burns([rankEvent('a', 20)], 1, {complete: false});
  assert.notEqual(labels.get('top3-burns-status'), 'All-time');
  ctx.renderTop3Burns([rankEvent('b', 30)], 1, {complete: true});
  assert.equal(labels.get('top3-burns-status'), 'All-time');
  ctx.renderTop3Burns([rankEvent('c', 1)], 1);
  assert.equal(labels.get('top3-burns-status'), 'All-time');
});

test('incomplete history is never saved as complete burn totals', async () => {
  const options = [];
  let complete = false;
  const ctx = vm.createContext({console, currentDashboardToken: 'cashx', dashboardChartEpoch: 1,
    cachedPrice: 1, _burnCountsReady: false, serviceState: null,
    _getAllBurns: async () => ({items: [rankEvent('a', 20)], complete}), renderTop3Burns() {},
    isTreasuryBurn: () => false, updateLatestBurns() {}, DASHBOARD_TOKEN_CONFIG: {cashx: latestCfg('cashx')}, cachedBurnsData: [],
    summarizeBurnCards: (_, price, settings) => { options.push(settings); return true; }});
  vm.runInContext(section('  async function loadBurnCounts(', '  let _burnActivityLoadPromise'), ctx);
  assert.equal(await ctx.loadBurnCounts(), false);
  assert.equal(options[0].save, false);
  assert.equal(options[0].markReady, false);
  complete = true;
  assert.equal(await ctx.loadBurnCounts(), true);
  assert.equal(options[1].save, true);
  assert.equal(options[1].markReady, true);
});
