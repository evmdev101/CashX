const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCache}=require('../lib/read-cache.js');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const fixture=require('./fixtures/migration-20261027.json');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('metadata requests share concurrent work, expire, and retry rejected reads',async()=>{
  let now=0,reads=0;const cache=createCache(()=>now),pending=deferred();
  const read=()=>{reads++;return pending.promise;};
  const first=cache.get('369:token',read,100),second=cache.get('369:token',read,100);
  assert.equal(first,second);pending.resolve('value');await first;assert.equal(reads,1);
  now=50;assert.equal(await cache.get('369:token',()=>assert.fail('fresh value reread')),'value');
  now=101;assert.equal(await cache.get('369:token',()=>{reads++;return 'new';},100),'new');assert.equal(reads,2);
  await assert.rejects(cache.get('bad',()=>Promise.reject(Error('offline'))));
  assert.equal(await cache.get('bad',()=> 'recovered'),'recovered');
});

function lpContext() {
  let now=0,calls=0;
  const farms=fixture.farms.filter(f=>f.token0&&f.token1);
  const pairs=new Map(farms.map(f=>[f.lp.toLowerCase(),f]));
  const context=vm.createContext({window:{ReadCache:{createCache:()=>createCache(()=>now)}},LP_ABI:[],TOKEN_META_ABI:[],
    prettyFarmSymbol:String,farmTokens:()=>['A','B'],fmtLpComponent:raw=>String(raw),console:{warn(){}},
    ethers:{Contract:class {
      constructor(address){this.address=address.toLowerCase();}
      async token0(){calls++;return pairs.get(this.address).token0;}
      async token1(){calls++;return pairs.get(this.address).token1;}
      async getReserves(){calls++;return [100n,200n];}
      async totalSupply(){calls++;return 1000n;}
      async decimals(){calls++;return 18n;}
      async symbol(){calls++;return 'TOKEN';}
    }}});
  vm.runInContext(section('  const publicContractReads =','  async function deriveTokenPriceFromPair(')+
    section('  async function fetchLpBreakdown(', '  function fmtUsd('),context);
  const pass=()=>Promise.all(farms.map(async farm=>{
    const members=await context.fetchLpMembers({},farm.lp);
    return context.fetchLpBreakdown({}, {...farm,single:false},10n,...members);
  }));
  return {context,farms,pass,calls:()=>calls,advance:()=>{now+=2000;}};
}

test('configured LPs reuse metadata and members; repeat passes reread live reserves',async t=>{
  const f=lpContext();await f.pass();const first=f.calls();
  assert.ok(first<f.farms.length*8);
  f.advance();await f.pass();const repeated=f.calls()-first;
  assert.equal(repeated,new Set(f.farms.map(farm=>farm.lp.toLowerCase())).size*2);
  assert.ok(repeated<f.farms.length*6);
  t.diagnostic(`LP detail reads: cold ${f.farms.length*8} → ${first}; repeat ${f.farms.length*6} → ${repeated}. Controlled fixture; not a wall-clock timing.`);
});

test('zero LP positions do not request reserves or token metadata',async()=>{
  const f=lpContext();assert.equal(await f.context.fetchLpBreakdown({}, {...f.farms[0],single:false},0n),null);
  assert.equal(f.calls(),0);
});

test('a missing symbol keeps known decimals and retries instead of caching a fallback',async()=>{
  const f=lpContext();let calls=0;
  f.context.ethers.Contract=class {async decimals(){calls++;return 8n;}async symbol(){calls++;throw Error('offline');}};
  const first=await f.context.fetchTokenMeta({},fixture.tokens.CASHX.address,'pHEX');
  assert.equal(first.decimals,8);assert.equal(first.symbol,'pHEX');
  await f.context.fetchTokenMeta({},fixture.tokens.CASHX.address,'pHEX');assert.equal(calls,4);
});

test('price batches deduplicate LP addresses and combine single-stake and reward token prices',async()=>{
  const calls=[];
  const ctx=vm.createContext({publicContractReads:createCache(),NEXION_LP_CALCULATOR:'calculator',NEXION_PRICE_ABI:[],
    farmRewardAddress:f=>f.reward,retry:fn=>fn(),ethers:{Contract:class{
      async getBatchLpValue(addresses){calls.push(['lp',...addresses]);return addresses.map(()=>100n);}
      async getBatchPrice(addresses){calls.push(['token',...addresses]);return addresses.map(()=>200n);}
    }}});
  vm.runInContext(section('  async function fetchFarmPriceMaps(', '  function prefetchedPrices('),ctx);
  const farms=[{farm:{lp:'LP',reward:'TOKEN',single:false}},{farm:{lp:'lp',reward:'token',single:false}},{farm:{lp:'token',reward:'other',single:true}}];
  const [one,two]=await Promise.all([ctx.fetchFarmPriceMaps({},farms),ctx.fetchFarmPriceMaps({},farms)]);
  assert.deepEqual(calls,[['lp','lp'],['token','other','token']]);
  assert.equal(one.stakePriceOf.get('token'),200n);assert.equal(two.rewardPriceOf.get('other'),200n);
});

test('hidden vaults make no network request; opening the vault tab enables loading',async()=>{
  let started=0;const ctx=vm.createContext({farmProductView:'farms',resetVaultWallet(){},vaultsLoading:false,vaultRequestId:0,
    wAddr:null,lastVaultResults:[],renderVaultResults(){},readProvider(){started++;throw Error('end controlled read');},
    markBrowseRead(){},console:{error(){}},set(){},document:{getElementById:()=>null}});
  vm.runInContext(section('  async function fetchVaults(', '  function resetVaultWallet('),ctx);
  await ctx.fetchVaults();assert.equal(started,0);
  ctx.farmProductView='vaults';await ctx.fetchVaults();assert.equal(started,1);
});

test('changing wallets clears old vault values without starting a hidden request',()=>{
  const ctx=vm.createContext({wAddr:'NEW',vaultResultsWallet:'old',vaultRequestId:0,vaultsLoading:true,
    lastVaultResults:[{userAssets:100n}],vaultMessages:new Map([['old','status']])});
  vm.runInContext(section('  function resetVaultWallet()', '  function setProductView('),ctx);ctx.resetVaultWallet();
  assert.equal(ctx.lastVaultResults.length,0);assert.equal(ctx.vaultsLoading,false);assert.equal(ctx.vaultMessages.size,0);
});
