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
    set: (id, value) => values.set(id, value), $: () => null,
    fmtPrice: value => '$' + value, fmtUSD: value => '$' + value, fmtN: value => String(value),
    pctText: value => value + '%', DASHBOARD_TOKEN_CONFIG: {cashx: {initialSupply: 100}},
    updateDashboardBurnProgress: (_, burned) => values.set('progress', burned),
    _dashSave() {}, _chartCacheSave() {}, renderTop3Burns() {}, ...extra,
  });
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
    currentChartRange: '24H', _allBurnsPromise: null, currentDashboardToken: 'cashx', dashboardChartEpoch: 1, renderTop3Burns() {},
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    renderBurnChart: items => rendered.push(items),
    getServicesReady: async () => ({readAllBurnTransactions: async () => { reads++; return {items: completeRows, complete: true}; }}),
    withTimeout: promise => promise, toDashboardTx: row => row,
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
    isTreasuryBurn: () => false,
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
