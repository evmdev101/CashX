const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

function source(name){
  const start=html.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));
  assert.notEqual(start,-1,`${name} must be present`);
  const tail=html.slice(start);
  const end=tail.search(/\r?\n  }\r?\n/);
  assert.notEqual(end,-1,`${name} must have a complete body`);
  return tail.slice(0,end)+'\n  }';
}
function load(context,...names){
  for(const name of names)vm.runInContext(source(name),context);
  return context;
}
const wallet='0x1111111111111111111111111111111111111111';
const farm={pid:2,label:'#2',name:'CASHX / GSX',lp:'0x2222222222222222222222222222222222222222'};
const pool={lpSupply:100n,endTime:9999999999n};
const oldValuation={userStaked:'10',userStakedUsd:'$250.00 USD',pending:'2',pendingUsd:'$12.50 USD',
  totalStaked:'100',tvl:'$2,600.00 USD',apr:'45%',stakeScaledPrice:'25',rewardScaledPrice:'6.25'};
function previousRow(){return {farm,pid:2,walletAddress:wallet,readAt:1,staked:10n,pending:2n,walletLp:5n,allowance:20n,
  totalStaked:100n,poolInfo:pool,valuation:{...oldValuation},lpTokens:['token0','token1'],lpBreakdown:[{symbol:'CASHX',amount:'3,070,000'},{symbol:'GSX',amount:'10,730,000'}],
  cached:false,disconnected:false,shareValid:true};}

test('fresh valuation wins without replacing it with the previous reading',async()=>{
  const fresh={...oldValuation,pendingUsd:'$13.00 USD'};
  const context=load(vm.createContext({fetchNexionValuation:async()=>fresh}),'farmRefreshValuation');
  assert.equal(await context.farmRefreshValuation({},farm,pool,100n,10n,2n,{stakeScaledPrice:26n,rewardScaledPrice:7n},oldValuation),fresh);
});

test('a price outage recomputes current quantities using the last successful prices',async()=>{
  const calls=[];
  const recomputed={...oldValuation,userStaked:'11',userStakedUsd:'$275.00 USD',pending:'3',pendingUsd:'$18.75 USD'};
  const context=load(vm.createContext({fetchNexionValuation:async(...args)=>{
    calls.push(args);
    return Number(args[6]?.stakeScaledPrice)===25 ? recomputed : null;
  }}),'farmRefreshValuation');
  const result=await context.farmRefreshValuation({},farm,pool,100n,11n,3n,{stakeScaledPrice:undefined,rewardScaledPrice:undefined},oldValuation);
  assert.equal(result,recomputed);
  assert.equal(calls.at(-1)[4],11n,'the fallback must value the newly read stake');
  assert.equal(calls.at(-1)[5],3n,'the fallback must value the newly read rewards');
  assert.equal(Number(calls.at(-1)[6].stakeScaledPrice),25);
  assert.equal(Number(calls.at(-1)[6].rewardScaledPrice),6.25);
});

test('an unavailable valuation leaves the last successful dollar values intact',async()=>{
  const context=load(vm.createContext({fetchNexionValuation:async()=>null,fmtFarmFixed:value=>String(value),
    farmTokenDec:()=>18,farmRewardAddress:()=>farm.lp}),'farmRefreshValuation');
  const result=await context.farmRefreshValuation({},farm,null,null,11n,3n,undefined,oldValuation);
  assert.equal(result.userStakedUsd,oldValuation.userStakedUsd);
  assert.equal(result.pendingUsd,oldValuation.pendingUsd);
  assert.equal(result.tvl,oldValuation.tvl);
  assert.equal(result.userStaked,'11','known token quantities must not become stale along with optional pricing');
  assert.equal(result.pending,'3');
});

test('a farm without any successful valuation remains unknown during a price outage',async()=>{
  const context=load(vm.createContext({fetchNexionValuation:async()=>null}),'farmRefreshValuation');
  assert.equal(await context.farmRefreshValuation({},farm,null,null,10n,2n,undefined,null),null);
});

function fetchHarness({balanceFailure=false,detailsFailure=false,previous=previousRow()}={}){
  const renders=[];
  const errors=[];
  const context=vm.createContext({
    wProvider:{},wAddr:wallet,farmLoadId:0,farmInitialLoading:false,lastFarmResults:[previous],FARMS:[farm],
    FARM_CONTRACT:'farm',FARM_TIME_ABI:[],LP_ABI:[],document:{getElementById:()=>({})},
    console:{error:(...args)=>errors.push(args),warn(){}},
    readProvider:()=>({}),getCachedFarmPools:()=>({}),matchFarmPools:()=>[{farm,pid:2}],
    restoreFarmSnapshot:async()=>{},renderPlaceholderFarms(){throw Error('same-wallet refresh must retain visible rows');},
    set(){},markBrowseRead(){},saveFarmSnapshot(){},
    renderFarmResults(rows){context.lastFarmResults=rows;renders.push(rows.map(row=>({...row,valuation:row.valuation&&{...row.valuation}})));},
    farmBatchProgress:()=>row=>row,mapLimit:(rows,_limit,fn)=>Promise.all(rows.map(fn)),retry:fn=>fn(),
    fmtFarm:value=>String(value),fmtFarmFixed:value=>String(value),farmTokenDec:()=>18,farmRewardAddress:()=>farm.lp,
    fetchLpMembers:async()=>detailsFailure?null:['token0','token1'],
    fetchLpBreakdown:async()=>detailsFailure?null:[{symbol:'CASHX',amount:'25'}],
    fetchFarmPriceMaps:async()=>({}),prefetchedPrices:()=>detailsFailure?{stakeScaledPrice:undefined,rewardScaledPrice:undefined}:{stakeScaledPrice:'25',rewardScaledPrice:'6.25'},
    fetchNexionValuation:async(_provider,_farm,poolInfo,totalStaked,_staked,_pending,prices)=>
      poolInfo&&typeof totalStaked==='bigint'&&prices?.stakeScaledPrice ? {...oldValuation} : null,
    ethers:{Contract:class {constructor(address){
      if(address==='farm')return {
        userInfo:async()=>{if(balanceFailure)throw Error('RPC unavailable');return {amount:10n};},
        pendingReward:async()=>2n,
        poolInfo:async()=>{if(detailsFailure)throw Error('RPC unavailable');return pool;}
      };
      return {balanceOf:async address=>{if(address==='farm'&&detailsFailure)throw Error('RPC unavailable');return address==='farm'?100n:5n;},allowance:async()=>20n};
    }}}
  });
  load(context,'farmRefreshValuation','fetchFarms');
  return {context,renders,errors};
}

test('same-wallet balance refresh keeps dollar readings and does not disable fresh balances as cached',async()=>{
  const {context,renders,errors}=fetchHarness();
  await context.fetchFarms();
  assert.deepEqual(errors,[]);
  assert.ok(renders.length>=2,'the balance and detail stages should both render');
  for(const rows of renders){
    assert.equal(rows[0].cached,false,'fresh wallet quantities must remain actionable while prices load');
    assert.equal(rows[0].valuation.userStakedUsd,oldValuation.userStakedUsd);
    assert.equal(rows[0].valuation.pendingUsd,oldValuation.pendingUsd);
  }
  assert.equal(context.farmInitialLoading,false);
});

test('missing optional pool data preserves the previous pool, token metadata and valuation',async()=>{
  const {context,errors}=fetchHarness({detailsFailure:true});
  await context.fetchFarms();
  assert.deepEqual(errors,[]);
  const row=context.lastFarmResults[0];
  assert.equal(row.poolInfo,pool);
  assert.equal(row.totalStaked,100n);
  assert.deepEqual(Array.from(row.lpTokens),['token0','token1']);
  assert.equal(row.valuation.userStakedUsd,oldValuation.userStakedUsd);
  assert.equal(row.valuation.pendingUsd,oldValuation.pendingUsd);
  assert.deepEqual(row.lpBreakdown,previousRow().lpBreakdown);
});

test('failed wallet reads preserve the last successful quantities and dollar readings',async()=>{
  const {context,errors}=fetchHarness({balanceFailure:true});
  await context.fetchFarms();
  assert.deepEqual(errors,[]);
  const row=context.lastFarmResults[0];
  assert.equal(row.staked,10n);
  assert.equal(row.pending,2n);
  assert.equal(row.walletLp,5n);
  assert.equal(row.valuation.userStakedUsd,oldValuation.userStakedUsd);
  assert.equal(row.valuation.pendingUsd,oldValuation.pendingUsd);
});

test('the periodic refresh retains priced values and metadata when optional services fail',async()=>{
  const {context,errors}=fetchHarness({detailsFailure:true});
  const pendingUpdates=[];
  const stakeValue={};
  const stakeDetails={};
  Object.assign(context,{
    FARM_ABI:[],staleFarmReads:new Set(),farmStakedOnly:false,
    document:{getElementById:id=>id==='farm-staked-2'?stakeValue:id==='farm-staked-sub-2'?stakeDetails:null},
    window:{LiveView:{update(node,html){node.innerHTML=html;}}},
    farmLpCompact:new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}),
    formatFarmPoolSharePercent:()=>'',tokenLogoHTML:symbol=>`<img alt="${symbol} logo">`,
    fmtFarmAllowance:value=>String(value),withUsdLabel:value=>value,
    setFarmReadStatus(){},setFarmPendingDom:(_pid,_pending,valuation)=>pendingUpdates.push(valuation),
    setFarmRemainingDom(){},updateFarmSummaries(){},updateApproveLabel(){},renderFarmRankings(){}
  });
  load(context,'aprNumber','aprBreakdownHTML','hasStakedFarm','farmSafeText','prettyFarmSymbol','farmStakedDisplay','farmCardAmount','farmLpComponentsHTML','farmStakedSubHTML','refreshFarmData');
  await context.refreshFarmData(2,{});
  assert.deepEqual(errors,[]);
  const row=context.lastFarmResults[0];
  assert.equal(row.poolInfo,pool);
  assert.equal(row.totalStaked,100n);
  assert.equal(row.valuation.userStakedUsd,oldValuation.userStakedUsd);
  assert.equal(stakeValue.textContent,'$250.00');
  assert.match(stakeDetails.innerHTML.replace(/<[^>]+>/g,' '),/3,070,000\s+CASHX.*10,730,000\s+GSX/);
  assert.equal(row.valuation.pendingUsd,oldValuation.pendingUsd);
  assert.equal(pendingUpdates[0].pendingUsd,oldValuation.pendingUsd,'the DOM must receive a retained valuation, not a zero-dollar fallback');
  assert.equal(row.detailsStale,true);
  assert.ok(row.readAt>1,'successful wallet quantities should still advance the read time');
});

test('portfolio summaries keep last-known priced totals while farm details refresh',()=>{
  const displayed=new Map();
  const rows=[{...previousRow(),detailsLoading:true}];
  const context=load(vm.createContext({
    lastFarmResults:rows,FARMS:[farm],nftFarmState:{tvlUsd:0},cashxEcoNftState:{tvlUsd:0},
    farmMeta:()=>({}),farmUsdNumber:value=>Number(String(value||'').replace(/[^\d.-]/g,''))||0,
    nftFarmClaimableUsd:()=>0,ecoNftClaimableUsd:()=>0,
    fmtUsd:value=>`$${value.toFixed(2)} USD`,set:(id,value)=>displayed.set(id,value),
    updateLivePendingSummary(){},updateTvlChange(){},updateClaimAllButton(){}
  }),'updateFarmSummaries');
  context.updateFarmSummaries(rows);
  assert.equal(displayed.get('farms-total-user-staked'),'$250.00 USD');
  assert.equal(displayed.get('farms-total-claimable'),'$12.50 USD');
});
