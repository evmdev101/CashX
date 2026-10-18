// Run with: node --test scripts/check-data-flows.cjs
// Exercise the actual inline functions with controlled RPC/DOM boundaries.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const ethers = require('../vendor/ethers.umd.min.js');
const browse = require('../lib/farm-list-tools.js');
const utilities = require('../lib/site-utilities.js');

test('burn milestones advance at boundaries and reject missing supply', () => {
  assert.equal(utilities.milestone(0,0),null);
  assert.deepEqual(utilities.milestone(1,100),{percent:5,remaining:4});
  assert.deepEqual(utilities.milestone(100,100),{percent:100,remaining:0});
});
test('vault growth uses stake tokens per share rather than changing deposit amounts', () => {
  assert.equal(utilities.growth({ppfs:1,assets:100},{ppfs:1,assets:1000}),0);
  assert.ok(Math.abs(utilities.growth({ppfs:1},{ppfs:1.1})-10)<1e-10);
  assert.equal(utilities.growth({ppfs:0},{ppfs:1}),null);
});
test('transaction handling preserves confirmation, reverts and timeouts without creating a popup', async () => {
  const ctx=context(fs.readFileSync(path.join(__dirname,'../lib/site-utilities.js'),'utf8'),{
    window:{}, setTimeout, clearTimeout, URL,
    document: new Proxy({}, {get(){assert.fail('Transaction handler touched the DOM');}}),
  });
  const api=ctx.window.SiteUtilities;
  const rejection=Object.assign(new Error('Rejected'),{code:'ACTION_REJECTED'});
  await assert.rejects(api.send(()=>Promise.reject(rejection)), e=>e===rejection);
  const tx={hash:'0x'+'a'.repeat(64),wait:async()=>({status:1})};
  assert.equal(await api.send(async()=>tx),tx);
  assert.equal((await api.wait(tx,'Stake',100)).status,1);
  await assert.rejects(api.wait({...tx,wait:async()=>({status:0})},'Stake',100),/reverted/);
  assert.equal(await api.wait({...tx,wait:()=>new Promise(()=>{})},'Stake',1),null);
});

test('farm search combines words, reward, staked and favorites filters', () => {
  const entries = [
    { key: 'a', name: 'GSX / CASHX', label: '#253', address: '0xABCD', rewards: ['GSX'], staked: true },
    { key: 'b', name: 'GSX', label: '#257', address: '0xDEFA', rewards: ['PLSX'], staked: false },
    { key: 'nft', name: 'CashX ECO NFT', label: '#1', rewards: ['GSX', 'CASHX'], staked: true },
  ];
  const favorites = new Set(['a', 'nft']);
  const keys = filters => browse.select(entries, filters, favorites).map(e => e.key);
  assert.deepEqual(keys({ query: 'gsx #253' }), ['a']);
  assert.deepEqual(keys({ query: '0xabcd' }), ['a']);
  assert.deepEqual(keys({ reward: 'plsx' }), ['b']);
  assert.deepEqual(keys({ reward: 'gsx', favoritesOnly: true, stakedOnly: true }), ['a', 'nft']);
  assert.deepEqual(keys({ query: 'missing' }), []);
  assert.deepEqual(keys({}), ['a', 'nft', 'b']);
  assert.deepEqual(entries.map(e => e.key), ['a', 'b', 'nft']);
});

test('favorites survive reload and tolerate corrupt or blocked browser storage', () => {
  let value;
  const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  assert.equal(browse.save(storage, new Set(['farm:1', 'nft:0'])), true);
  assert.deepEqual([...browse.load(storage)], ['farm:1', 'nft:0']);
  value = 'broken'; assert.equal(browse.load(storage).size, 0);
  value = '{}'; assert.equal(browse.load(storage).size, 0);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(browse.load(blocked).size, 0);
  assert.equal(browse.save(blocked, new Set(['farm:1'])), false);
});

test('sorts put favorites first and unknown values last without changing source data', () => {
  const future = Date.now() / 1000 + 10000;
  const entries = [
    { key: 'a', rewards: [], rate: 10, deposit: 300, end: future + 30 },
    { key: 'b', rewards: [], rate: 40, deposit: 100, end: future },
    { key: 'c', rewards: [], rate: null, deposit: null, end: 1 },
  ];
  const ids = (sort, favorites = new Set()) => browse.select(entries, {sort}, favorites).map(e => e.key);
  assert.deepEqual(ids('rate'), ['b','a','c']);
  assert.deepEqual(ids('deposit'), ['a','b','c']);
  assert.deepEqual(ids('ending'), ['b','a','c']);
  assert.deepEqual(ids('rate', new Set(['a'])), ['a','b','c']);
  assert.deepEqual(entries.map(e => e.key), ['a','b','c']);
});

test('browsing preferences persist separately and reject invalid stored values', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) };
  browse.savePreferences(storage, 'farms', { query: 'GSX', sort: 'deposit', stakedOnly: true });
  browse.savePreferences(storage, 'vaults', { query: '#2', reward: 'DIVX', sort: 'ending' });
  assert.equal(browse.loadPreferences(storage, 'farms').stakedOnly, true);
  assert.equal(browse.loadPreferences(storage, 'farms').query, 'GSX');
  assert.equal(browse.loadPreferences(storage, 'vaults').query, '#2');
  assert.equal(browse.loadPreferences(storage, 'vaults').sort, 'ending');
  assert.equal(browse.loadPreferences({ getItem: () => '{broken' }, 'farms').sort, 'default');
  assert.equal(browse.loadPreferences({ getItem: () => '{"sort":"bad","stakedOnly":"yes"}' }, 'farms').stakedOnly, false);
});

test('refresh failure keeps the last successful timestamp', () => {
  const messages = [];
  const ctx = context(section('  function markBrowseRead(', '  function vaultBrowseEntry('), {
    browseReadStatus: { farms: { at: 0, failed: false } }, set: (_, text) => messages.push(text),
  });
  ctx.markBrowseRead('farms', false, true);
  const timestamp = ctx.browseReadStatus.farms.at;
  ctx.markBrowseRead('farms', true, false);
  assert.equal(ctx.browseReadStatus.farms.at, timestamp);
  assert.match(messages[1], /Some updates unavailable.*Latest successful read/);
});

test('ending badges respect seven-day boundary and unknown schedules', () => {
  const now = 1000000;
  assert.equal(browse.ending(0, now), '');
  assert.equal(browse.ending(NaN, now), '');
  assert.equal(browse.ending(now + 7 * 86400, now), '');
  assert.equal(browse.ending(now + 6 * 86400, now), 'Ends in 6 days');
  assert.equal(browse.ending(now + 86400, now), 'Ends in 1 day');
  assert.equal(browse.ending(now + 60, now), 'Ends within 24h');
  assert.equal(browse.ending(now, now), 'Rewards ended');
});

test('vault filters keep favorite identity and use the wrapped farm schedule', () => {
  const ctx = context(section('  function vaultBrowseEntry(', '  function setVaultBrowseFilter('), {
    NEXION_FLUX_VAULT_MANAGER: '0xManager',
    vaultFarmResult: () => ({ poolInfo: { endTime: 2000000 }, countdownEnd: 3000000000 }),
    poolValue: (p, key) => p?.[key], vaultPairName: v => v.name,
    ecosystemVaultSymbol: value => value, vaultApy: v => v.apy, vaultUsd: () => 0,
    window: { FarmListTools: browse }, farmFavorites: new Set(['369:0xmanager:vault:2']),
    vaultBrowseFilters: {}, lastVaultResults: [
      { vaultId: 1, name: 'GSX/WPLS LP', stakeToken: '0xABC', rewardToken: 'DIVX', userShares: 0n, endTime: 1000000, wrapsFarm: true, apy: 90 },
      { vaultId: 2, name: 'DIVX/WPLS LP', stakeToken: '0xDEF', rewardToken: 'GSX', userShares: 1n, endTime: 1500000, wrapsFarm: false, apy: 30 },
    ],
  });
  const ids = () => Array.from(ctx.visibleVaultEntries(), e => e.result.vaultId);
  assert.deepEqual(ids(), [2, 1]);
  assert.equal(ctx.vaultBrowseEntry(ctx.lastVaultResults[0]).end, 2000000);
  assert.equal(ctx.vaultBrowseEntry(ctx.lastVaultResults[1]).end, 1500000);
  ctx.vaultBrowseFilters.reward = 'DIVX'; assert.deepEqual(ids(), [1]);
  ctx.vaultBrowseFilters.reward = ''; ctx.vaultBrowseFilters.stakedOnly = true;
  assert.deepEqual(ids(), [2]);
  ctx.vaultBrowseFilters.query = '0xdef'; assert.deepEqual(ids(), [2]);
  ctx.vaultBrowseFilters.query = '#1'; assert.deepEqual(ids(), []);
  assert.equal(ctx.lastVaultResults.length, 2);
});
function section(start, end) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, start);
  const finish = source.indexOf(end, offset + start.length);
  assert.ok(finish > offset, end);
  return source.slice(offset, finish);
}
function context(code, values = {}) {
  const ctx = vm.createContext({ console, ...values });
  vm.runInContext(code, ctx);
  return ctx;
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('token USD fallback never uses another base token or another chain', async () => {
  const pairs = [
    {chainId:'pulsechain',baseToken:{address:'cashx'},quoteToken:{address:'distrox'},priceUsd:'0.00006364',liquidity:{usd:37722}},
    {chainId:'ethereum',baseToken:{address:'distrox'},priceUsd:'99',liquidity:{usd:999999}},
    {chainId:'pulsechain',baseToken:{address:'DISTROX'},priceUsd:'0.000001787',liquidity:{usd:15524}},
    {chainId:'pulsechain',baseToken:{address:'distrox'},priceUsd:'NaN',liquidity:{usd:99999}}
  ];
  let reads=0;
  const ctx=context(section('    function bestPair(', '    function isPlsSymbol('),{
    prices:{},dexCache:{},DEX_API:'https://example.test/',fetch:async()=>{reads++;return {ok:true,json:async()=>({pairs})};}
  });
  assert.equal(await ctx.tokenPrice('distrox'),.000001787);
  assert.equal(await ctx.tokenPrice('missing'),0);
  const before=reads;
  await ctx.tokenPrice('distrox');assert.equal(reads,before);
  pairs[2].priceUsd='0.000002';
  assert.equal(await ctx.tokenPrice('distrox',true),.000002);
  assert.equal(reads,before+1);
});

test('portfolio uses fresh calculator prices for wallet, reflections and yield on every scan',async()=>{
  let scaled=ethers.parseUnits('0.0000018',18),reads=0,destroyed=0;
  const token={address:'distrox',rewards:true,key:'distrox'};
  const rewardContract={balanceOf:async()=>ethers.parseUnits('16448181.7242',18),decimals:async()=>18,
    pendingReflections:async()=>ethers.parseUnits('100',18),getYieldTokens:async()=>[{tokenAddress:'distrox'}],pendingYields:async()=>ethers.parseUnits('2',18)};
  const ctx=context(section('    async function readPortfolio(', '    return { init, scan,'),{
    TOKENS:[token],RPC:'rpc',PULSE_ID:369,REWARD_ABI:[],ERC20_ABI:[],
    amount:(raw,decimals)=>Number(ethers.formatUnits(raw,decimals)),
    tokenPrice:()=>assert.fail('Valid calculator price must not use Dex fallback'),
    yieldMeta:async(provider,address,raw,readPrice)=>({token:address,value:Number(ethers.formatUnits(raw,18)),usdValue:Number(ethers.formatUnits(raw,18))*await readPrice(address)}),
    ethers:{...ethers,JsonRpcProvider:class{destroy(){destroyed++;}},Contract:class{constructor(address){return address==='distrox'?rewardContract:{getBatchPrice:async()=>{reads++;return [scaled];}};}}}
  });
  let result=(await ctx.readPortfolio('wallet'))[0];
  assert.ok(Math.abs(result.balance*result.price-29.60672710356)<1e-8);
  assert.equal(result.price,.0000018);assert.equal(result.yields[0].usdValue,.0000036);assert.equal(reads,1);
  scaled=ethers.parseUnits('0.000002',18);
  result=(await ctx.readPortfolio('wallet'))[0];
  assert.equal(result.price,.000002);assert.equal(reads,2);assert.equal(destroyed,2);
});

function configuredFarms() {
  const constants = Object.fromEntries([...source.matchAll(/const (\w+)\s*=\s*'(0x[0-9a-fA-F]{40})';/g)].map(m => [m[1], m[2]]));
  return context(section('  const FARMS = [', '  let wProvider') + '\nglobalThis.farms = FARMS;', constants).farms;
}

test('all four new farms contribute to totals, wallet rewards, positions and rankings', () => {
  const farms = configuredFarms();
  const labels = ['#293', '#292', '#291', '#290'];
  const results = farms.map(farm => {
    const i = labels.indexOf(farm.label);
    return { farm, pid: farm.pid, staked: i >= 0 ? 10n : 0n, pending: i >= 0 ? 1n : 0n,
      valuation: { tvl: i >= 0 ? 100 + i : 0, pendingUsd: i >= 0 ? 1 + i : 0, userStakedUsd: i >= 0 ? 10 + i : 0 } };
  });
  const displayed = {};
  const ctx = context(section('  function updateFarmSummaries(', '  function farmClaimableResults(') +
    section('  function farmClaimableResults(', '  function nftFarmClaimableUsd(') +
    section('  function farmActiveStakedResults(', '  function setClaimAllStatus('), {
    FARMS: farms, lastFarmResults: results, farmMeta: () => ({}), farmUsdNumber: n => Number(n || 0),
    nftFarmState: { tvlUsd: 10 }, cashxEcoNftState: { tvlUsd: 20 },
    nftFarmClaimableUsd: () => 0, ecoNftClaimableUsd: () => 0, fmtUsd: String,
    set: (id, value) => { displayed[id] = value; }, updateDailyRewardSummary() {}, updateTvlChange() {}, updateClaimAllButton() {},
  });
  ctx.updateFarmSummaries();
  assert.equal(displayed['nexion-farms-count'], '65 farms');
  assert.equal(displayed['farms-total-tvl'], '436');
  assert.equal(displayed['farms-total-claimable'], '10');
  assert.equal(displayed['farms-total-user-staked'], '46');
  assert.equal(ctx.farmClaimableResults().length, 4);
  assert.equal(ctx.farmActiveStakedResults().length, 4);
  const ranked = context(section('  function rankNumber(', '  function renderFarmRankings('), {
    FARMS: farms, lastFarmResults: results, farmMeta: () => ({}),
    nftFarmState: {}, cashxEcoNftState: {}, farmRankTitleHTML: f => f.label,
  });
  for (const label of labels) for (const metric of ['apr', 'tvl', 'remainingRewardsUsd']) {
    const row = results.find(r => r.farm.label === label);
    const previous = row.valuation[metric]; row.valuation[metric] = 9999;
    const html = ranked.farmRankRows(metric);
    assert.ok(html.includes(`'${row.farm.lp}', '${label}'`));
    row.valuation[metric] = previous;
  }
});

test('daily projections aggregate the new pools by reward token using each pool supply', () => {
  const now = Math.floor(Date.now() / 1000);
  const results = configuredFarms().filter(f => ['#285', '#286', '#287', '#289'].includes(f.label)).map(farm => ({
    farm, staked: 10n, totalStaked: 99999n,
    poolInfo: { lpSupply: 100n, totalReward: ethers.parseEther('1000'), startTime: now - 86400, endTime: now + 9 * 86400 },
    valuation: { rewardScaledPrice: 2e18 },
  }));
  const ctx = context(section('  function dailyRewardProjectionEntries(', '  function formatDailyRewardAmount(') +
    section('  function rewardProjectionRaw(', '  function formatRewardProjection(') + section('  function rawUsd(', '  // pHEX'), {
    ethers, lastFarmResults: results, wAddr: 'wallet', nftFarmState: { stakedTokens: [] }, cashxEcoNftState: { stakedTokens: [] },
    farmRewardAddress: f => f.rewardToken, farmRewardSymbol: f => f.rewardToken, farmTokenDec: () => 18,
    remainingRewardParams: p => p, poolValue: (p, key) => p[key],
  });
  const rewards = ctx.dailyRewardProjectionEntries();
  assert.equal(rewards.length, 3);
  assert.equal(rewards.find(r => r.symbol === 'GSX').raw, ethers.parseEther('20'));
  assert.equal(rewards.find(r => r.symbol === 'CASHX').raw, ethers.parseEther('10'));
  assert.equal(rewards.find(r => r.symbol === 'BURNX').raw, ethers.parseEther('10'));
  assert.equal(rewards.reduce((sum, r) => sum + r.usd, 0), 80);
});

test('staked filter still refreshes unshown farms for global statistics', async () => {
  const rows = [{ pid: 100, staked: 1n }, { pid: 104, staked: 0n }];
  const refreshed = [];
  const ctx = context(section('  const staleFarmReads =', '  function disableFarmBtns('), {
    document: { hidden: false }, window: { location: { hash: '#farms' } },
    wProvider: {}, wAddr: 'wallet', farmInitialLoading:false, saveFarmSnapshot(){}, farmProductView: 'farms', farmStakedOnly: true, lastFarmResults: rows,
    readProvider: () => ({}), fetchFarmPriceMaps: async () => ({}), hasStakedFarm: r => r.staked > 0n,
    refreshFarmData: async pid => { refreshed.push(pid); }, mapLimit: (items, _, fn) => Promise.all(items.map(fn)),
  });
  await ctx.refreshVisibleFarmData();
  assert.deepEqual(refreshed, [100, 104]);
});

test('TVL history excludes previous farm sets but survives sorting the same set', () => {
  const farms = configuredFarms();
  let saved;
  const make = list => context(section('  const FARM_TVL_HIST_KEY =', '  function dailyRewardProjectionEntries('), {
    FARMS: list, FARM_CONTRACT: '0xFarm', localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; } },
  });
  make(farms.slice(4)).recordTvlSnapshot(100);
  const expanded = make(farms).recordTvlSnapshot(200);
  assert.equal(expanded.length, 1); assert.equal(expanded[0].v, 200);
  const reordered = make([...farms].reverse()).recordTvlSnapshot(201);
  assert.equal(reordered.length, 1); assert.equal(reordered[0].v, 200);
});

test('ranking navigation distinguishes farms with the same LP token', () => {
  let targetId;
  const ctx = context(section('  function goToFarm(', '  // Fill the amount input'), {
    farmBrowseFilters: {}, farmStakedOnly: false,
    lastFarmResults: [{ pid: 104, farm: { lp: '0xLP', label: '#289' } }, { pid: 80, farm: { lp: '0xLP', label: '#265' } }],
    requestAnimationFrame: fn => fn(), setTimeout() {},
    document: { getElementById: id => { targetId = id; return { scrollIntoView() {}, classList: { add() {}, remove() {} } }; } },
  });
  ctx.goToFarm('0xLP', '#265'); assert.equal(targetId, 'farm-card-80');
  ctx.goToFarm('0xLP', '#289'); assert.equal(targetId, 'farm-card-104');
});

test('all classic inline scripts parse', () => {
  for (const [, attrs, body] of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(attrs) || /type=["'](?:module|application\/ld\+json)/.test(attrs)) continue;
    new vm.Script(body);
  }
});

test('reward dollars follow Nexion for active and ended farms, including 8 decimals', async () => {
  const code = section('  function rawUsd(', '  // pHEX') + section('  function nexionPendingUsd(', '  function formatCountdown(');
  for (const decimals of [18, 8]) {
    const ctx = context(code, {
      ethers, farmRewardSymbol: () => 'TEST', farmRewardAddress: () => 'token',
      farmTokenDec: () => decimals, poolValue: (p, key) => p[key],
      remainingRewardParams: p => ({ totalReward: p.totalReward }),
      remainingRewardRawNexion: p => p.remaining,
      fmtUsd: v => v, fmtFarmFixed: v => String(v), formatFarmPoolSharePercent: () => '',
    });
    const portfolioPending = section('              const remainingValue = rawUsd(remainingRewardRawNexion(pool)', "              return {kind:farm.single?");
    vm.runInContext(`function portfolioPending(pool,pending,rewardPrices,rewardMeta){${portfolioPending}return pendingUsd;}`,ctx);
    for (const remaining of [100, 50, 0]) {
      const pool = { totalReward: ethers.parseUnits('100', decimals), remaining: ethers.parseUnits(String(remaining), decimals), lpSupply: 100n, endTime: 0 };
      const result = await ctx.fetchNexionValuation(null, {}, pool, 100n, 1n, ethers.parseUnits('10', decimals), { stakeScaledPrice: 1e18, rewardScaledPrice: 1e18 });
      assert.equal(result.pendingUsd, remaining / 10);
      assert.equal(ctx.portfolioPending(pool,ethers.parseUnits('10',decimals),[1e18],{decimals}),result.pendingUsd);
    }
    const emptyPool = { totalReward: ethers.parseUnits('100', decimals), remaining: 0n, lpSupply: 0n, endTime: 0 };
    const empty = await ctx.fetchNexionValuation(null, {}, emptyPool, ethers.parseUnits('999', 18), 0n, 0n,
      { stakeScaledPrice: 1e18, rewardScaledPrice: 1e18 });
    assert.equal(empty.totalStakedUsd, 0, 'reward buffer must not become staked supply');
    assert.equal(ctx.portfolioPending(emptyPool,0n,[],{decimals}),0);
  }
});

test('empty non-CashX chart never invokes the CashX loader', () => {
  let loads = 0, renders = 0;
  const ctx = context(section('  function switchChart(', '  function chartStartOf('), {
    currentChartRange: '24H', currentDashboardToken: 'gsx', cachedChartBurnsData: [],
    document: { querySelectorAll: () => [] }, renderBurnChart: () => renders++, loadBurnActivityChart: () => loads++,
  });
  ctx.switchChart('ALL', { classList: { add() {} } });
  assert.equal(loads, 0); assert.equal(renders, 1);
});

test('CashX response cannot overwrite chart after switching away and back', async () => {
  const request = deferred(); let renders = 0;
  const ctx = context(section('  async function loadBurnActivityChart(', '  const $'), {
    currentDashboardToken: 'cashx', dashboardChartEpoch: 1, _burnActivityLoadPromise: null,
    _getAllBurns: () => request.promise, cachedChartBurnsData: [], currentChartRange: '24H',
    renderBurnChart: () => renders++, _chartCacheSave() {},
  });
  const load = ctx.loadBurnActivityChart();
  ctx.dashboardChartEpoch = 3;
  request.resolve([{ amount: 100 }]);
  await load;
  assert.equal(renders, 0); assert.equal(ctx.cachedChartBurnsData.length, 0);
});

test('delayed chart-library initialization cannot render a stale token', async () => {
  const ready = deferred();
  const ctx = context(section('  async function renderBurnChart(', '  function'), {
    dashboardChartEpoch: 1, burnChartRenderId: 0, ensureChartReady: () => ready.promise,
    window: { Chart: true }, document: { getElementById() { assert.fail('stale chart touched DOM'); } },
  });
  const render = ctx.renderBurnChart([], '24H');
  ctx.dashboardChartEpoch++;
  ready.resolve(true);
  await render;
});

test('public farm totals refresh without a wallet and pause on hidden tabs and Vaults', async () => {
  let reads = 0;
  const ctx = context(section('  const staleFarmReads =', '  function disableFarmBtns('), {
    document: { hidden: false }, window: { location: { hash: '#farms' } },
    wProvider: null, wAddr: null, farmInitialLoading:false, farmProductView: 'farms',
    fetchPublicFarmStats: async () => { reads++; },
  });
  await ctx.refreshVisibleFarmData(); assert.equal(reads, 1);
  ctx.document.hidden = true; await ctx.refreshVisibleFarmData(); assert.equal(reads, 1);
  ctx.document.hidden = false; ctx.farmProductView = 'vaults';
  await ctx.refreshVisibleFarmData(); assert.equal(reads, 1);
  ctx.farmProductView = 'farms'; ctx.window.location.hash = '#portfolio';
  await ctx.refreshVisibleFarmData(); assert.equal(reads, 1);
});

test('farm refresh cannot overlap and pauses on hidden tabs and Vaults', async () => {
  const request = deferred(); let passes = 0;
  const ctx = context(section('  const staleFarmReads =', '  function disableFarmBtns('), {
    document: { hidden: false }, window: { location: { hash: '#farms' } },
    wProvider: {}, wAddr: 'wallet', farmInitialLoading:false, saveFarmSnapshot(){}, farmProductView: 'farms',
    readProvider: () => ({}), fetchFarmPriceMaps: async () => ({}),
    lastFarmResults: [], farmStakedOnly: false, refreshFarmData() {}, mapLimit: () => { passes++; return request.promise; },
  });
  const first = ctx.refreshVisibleFarmData();
  await ctx.refreshVisibleFarmData(); assert.equal(passes, 1);
  request.resolve(); await first;
  ctx.document.hidden = true; await ctx.refreshVisibleFarmData(); assert.equal(passes, 1);
  ctx.document.hidden = false; ctx.farmProductView = 'vaults';
  await ctx.refreshVisibleFarmData(); assert.equal(passes, 1);
  ctx.farmProductView = 'farms'; await ctx.refreshVisibleFarmData(); assert.equal(passes, 2);
});

test('failed farm wallet read preserves cached amounts and reports unavailable', async () => {
  const previous = { pid: 1, farm: { lp: 'lp' }, staked: 123n, pending: 45n };
  let warning = '';
  const ctx = context(section('  async function refreshFarmData(', '  // ── Stake'), {
    console: { error() {} }, wProvider: {}, wAddr: 'wallet', lastFarmResults: [previous],
    readProvider: () => ({}), FARM_CONTRACT: 'farm', FARM_ABI: [], LP_ABI: [],
    ethers: { Contract: class { userInfo() { return Promise.reject(Error('offline')); } pendingReward() { return Promise.resolve(45n); } balanceOf() { return Promise.resolve(1n); } allowance() { return Promise.resolve(0n); } poolInfo() { return Promise.resolve({}); } } },
    staleFarmReads: new Set(), markBrowseRead() {}, setFarmReadStatus: (_, message) => { warning = message; },
  });
  await ctx.refreshFarmData(1);
  assert.equal(previous.staked, 123n); assert.equal(previous.pending, 45n);
  assert.match(warning, /unavailable/);
});

function reflectionFixture() {
  class Card {
    constructor() { this.nodes = {}; }
    cloneNode() { const clone = new Card(); clone.innerHTML = this.innerHTML; return clone; }
    querySelector(selector) {
      if (selector === '[data-scan-error]') return null;
      return this.nodes[selector] ||= { textContent: '', innerHTML: '' };
    }
    get innerHTML() { return JSON.stringify(this.nodes); }
    set innerHTML(value) { this.nodes = JSON.parse(value); }
  }
  const card = new Card();
  const reads = new Map();
  const ctx = context(section('    async function readToken(', '    async function scan('), {
    reflectionScanId: 1, el: () => card,
    ethers: { Contract: class {
      decimals() { return Promise.resolve(18); }
      balanceOf(wallet) { return reads.get(wallet).promise; }
      getTaxes() { return Promise.resolve([]); }
      getTotalTaxs() { return Promise.resolve(0n); }
      pendingReflections() { return Promise.reject(Error('RPC offline')); }
      getYieldTokens() { return Promise.resolve([]); }
    } },
    REWARD_ABI: [], ERC20_ABI: [], TAX_ABI: [], CASHX_TAXES: [],
    tokenPrice: async () => 1, tokenPlsPrice: async () => 1,
    amount: n => Number(n), fmt: String, totalTaxPercent: () => '0%', renderTaxDetails() {},
  });
  return { ctx, card, reads };
}

test('older wallet scan cannot overwrite the latest wallet result', async () => {
  const { ctx, card, reads } = reflectionFixture();
  reads.set('A', deferred()); reads.set('B', deferred());
  const token = { key: 'test', rewards: false };
  const old = ctx.readToken({}, token, 'A', 1);
  ctx.reflectionScanId = 2;
  const latest = ctx.readToken({}, token, 'B', 2);
  reads.get('B').resolve(200n); await latest;
  const committed = card.innerHTML;
  assert.match(committed, /200/);
  reads.get('A').resolve(100n); await old;
  assert.equal(card.innerHTML, committed);
});

test('partial Reflection failure does not replace the last successful card', async () => {
  const { ctx, card, reads } = reflectionFixture();
  card.querySelector('[id="balance"]').textContent = 'Previously read balance';
  const previous = card.innerHTML;
  reads.set('A', deferred());
  const scan = ctx.readToken({}, { key: 'test', rewards: true }, 'A', 1);
  reads.get('A').resolve(300n);
  await assert.rejects(scan, /RPC offline/);
  assert.equal(card.innerHTML, previous);
});

test('missing prices remain unavailable in the Nexion reward estimate', () => {
  const ctx = context(section('  function nexionPendingUsd(', '  async function fetchNexionValuation('), { ethers });
  assert.equal(ctx.nexionPendingUsd(10n, 0, 18, null, 100n), null);
});
