const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ethers=require('../vendor/ethers.umd.min.js');
const snapshots=require('../lib/farm-snapshots.js');
const verified=require('./fixtures/migration-20261027.json');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const portfolio=fs.readFileSync(path.join(__dirname,'../lib/portfolio.js'),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
function tokens(){const ctx=vm.createContext({});vm.runInContext(section('    const TOKENS = [','    const ERC20_ABI')+'\nglobalThis.tokens=TOKENS;',ctx);return Array.from(ctx.tokens);}

test('all migrated token readers and links use the independently verified current contracts',()=>{
  const configured=tokens();
  const config=fs.readFileSync(path.join(__dirname,'../lib/config.js'),'utf8');
  for(const [symbol,token] of Object.entries(verified.tokens)){
    assert.equal(ethers.getAddress(token.address),token.address);
    assert.equal(configured.find(t=>t.symbol===symbol).address,token.address);
    assert.equal(configured.find(t=>t.symbol===symbol).autoRewards,true);
    for(const content of [source,config])assert.ok(!content.toLowerCase().includes(token.retiredAddress.toLowerCase()),`Retired ${symbol} is still used`);
  }
  assert.ok(config.includes(verified.tokens.CASHX.pair));
  assert.equal(configured.find(t=>t.symbol==='BURNX').autoRewards,undefined);
});

test('every configured farm matches the current on-chain LP, reward token and explicit pool ID',()=>{
  const ctx=vm.createContext({CASHX_ADDR:verified.tokens.CASHX.address,DISTROX_ADDR:verified.tokens.DISTROX.address,DIVX_ADDR:verified.tokens.DIVX.address,NEXION_WPLS_ADDRESS:'0xA1077a294DDE1B09BB078844DF40758a5D0f9a27'});
  vm.runInContext(section('  const FARMS = [','  let wProvider')+section('  const TOKEN_ADDRESSES = {','  function farmRewardSymbol(')+'\nglobalThis.farms=FARMS;globalThis.addresses=TOKEN_ADDRESSES;',ctx);
  assert.equal(ctx.farms.length,verified.farms.length);
  for(const current of ctx.farms){
    const expected=verified.farms.find(f=>f.label===current.label);
    assert.ok(expected,current.label);
    assert.equal(current.pid,expected.pid,current.label+' pool ID');
    assert.equal(current.lp.toLowerCase(),expected.lp.toLowerCase(),current.label+' LP');
    assert.equal(String(current.rewardAddress||ctx.addresses[current.rewardToken]).toLowerCase(),expected.reward.toLowerCase(),current.label+' reward');
  }
  vm.runInContext(section('  function matchFarmPools(', '  async function discoverFarmPools('),ctx);
  assert.equal(ctx.matchFarmPools(null).length,verified.farms.length,'a fresh browser can use verified IDs without scanning retired LPs');
});

test('automatic reward tokens load wallet values without calling removed pending-reward functions',async()=>{
  let pendingCalls=0;
  const automatic=tokens().filter(t=>t.autoRewards);
  const ctx=vm.createContext({TOKENS:automatic,RPC:'rpc',PULSE_ID:369,NEXION_LP_CALCULATOR:'calculator',REWARD_ABI:[],ERC20_ABI:[],
    ethers:{formatUnits:ethers.formatUnits,JsonRpcProvider:class{destroy(){}},Contract:class{
      balanceOf(){return Promise.resolve(10n*10n**18n);}
      decimals(){return Promise.resolve(18);}
      getBatchPrice(addresses){return Promise.resolve(addresses.map(()=>10n**18n));}
      pendingReflections(){pendingCalls++;throw Error('Removed function');}
      getYieldTokens(){pendingCalls++;throw Error('Removed function');}
    }},amount:(raw,decimals)=>Number(ethers.formatUnits(raw,decimals))});
  vm.runInContext(section('    async function readPortfolio(','    return { init, scan,'),ctx);
  const rows=await ctx.readPortfolio('wallet');
  assert.equal(rows.length,4);
  assert.equal(pendingCalls,0);
  rows.forEach(row=>{assert.equal(row.balance,10);assert.equal(row.price,1);assert.equal(row.reflections,0);assert.equal(row.yields.length,0);assert.equal(row.rewardsError,false);});
});

test('manual claim entry points never request a signer for the migrated automatic tokens',async()=>{
  const ctx=vm.createContext({TOKENS:tokens(),signerContract:()=>assert.fail('Automatic token requested a transaction'),setStatus:()=>assert.fail('Automatic token started a claim')});
  vm.runInContext(section('    async function claimAll(key)','    function init()'),ctx);
  for(const token of tokens().filter(t=>t.autoRewards)){
    await ctx.claimAll(token.key);await ctx.claimYield(token.key);
  }
});

test('pre-migration farm and reward snapshots cannot populate the new token portfolio',()=>{
  const contract='0x'+'11'.repeat(20),wallet='0x'+'22'.repeat(20);
  const old=new Map([[`cashx:farms:v1:369:${contract}:${wallet}`,JSON.stringify([{label:'#1'}])]]);
  assert.deepEqual(snapshots.load({getItem:key=>old.get(key)},contract,wallet,[]),[]);
  const payload={complete:true,block:100,at:Date.now()-1000,events:[{at:100,amount:3,token:verified.tokens.CASHX.retiredAddress,symbol:'CASHX',hash:'tx',reward:true}],prices:[]};
  const ctx=vm.createContext({localStorage:{getItem:key=>key===`cashx:rewards:v1:${wallet}`?JSON.stringify(payload):null},rewardSnapshot:null,rewardReady:false,rewardBlock:-1,historyAsOf:0,rewardPrices:new Map()});
  vm.runInContext(portfolio.slice(portfolio.indexOf('  function restoreRewards('),portfolio.indexOf('  async function loadFastRewards(')),ctx);
  ctx.restoreRewards(wallet);
  assert.equal(ctx.rewardSnapshot,null);assert.equal(ctx.rewardReady,false);
});
