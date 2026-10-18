const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const snapshots=require('../lib/farm-snapshots.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const addr=n=>'0x'+n.toString(16).padStart(40,'0');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function snapshotFixture(){
  const storage=new Map();
  const store={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
  const farm={label:'#1',lp:addr(1),pid:0};
  const row={farm,pid:0,readAt:Date.now(),walletAddress:addr(2),staked:12n,pending:3n,walletLp:4n,allowance:100n,totalStaked:120n,
    poolInfo:[addr(1),addr(3),100n,120n,1n,2n,1n,0n,0n,0n,addr(4),90n],valuation:{stakeScaledPrice:'1e+20',rewardScaledPrice:'100'}};
  return {storage,store,farm,row};
}
test('saved farm readings restore exact raw amounts, scoped to wallet and contract, with actions awaiting fresh reads',()=>{
  const {store,farm,row}=snapshotFixture();
  snapshots.save(store,addr(5),addr(2),[row]);
  const restored=snapshots.load(store,addr(5),addr(2).toUpperCase(),[farm]);
  assert.equal(restored[0].staked,12n);assert.equal(restored[0].pending,3n);assert.equal(restored[0].cached,true);
  assert.equal(restored[0].shareValid,false);assert.equal(restored[0].poolInfo.endTime,2n);
  assert.equal(snapshots.load(store,addr(5),addr(9),[farm]).length,0);
  assert.equal(snapshots.load(store,addr(6),addr(2),[farm]).length,0);
  assert.equal(snapshots.load(store,addr(5),'',[farm]).length,0);
});
test('saved farms reject expired, corrupt and mismatched records and unavailable storage',()=>{
  const {storage,store,farm,row}=snapshotFixture();
  snapshots.save(store,addr(5),addr(2),[row]);
  const [[key,encoded]]=storage;
  assert.equal(snapshots.load(store,addr(5),addr(2),[farm],row.readAt+86400001).length,0);
  for(const change of [e=>e.amounts[0]='-1',e=>e.pool[0]=addr(9),e=>e.pid=99,e=>e.prices[0]='<img>',e=>e.at=Date.now()+60000]){
    const entries=JSON.parse(encoded);change(entries[0]);storage.set(key,JSON.stringify(entries));
    assert.equal(snapshots.load(store,addr(5),addr(2),[farm]).length,0);
  }
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.deepEqual(snapshots.load(blocked,addr(5),addr(2),[farm]),[]);
  assert.doesNotThrow(()=>snapshots.save(blocked,addr(5),addr(2),[row]));
});
function farmFixture(){
  const tail=deferred(),firstBatch=deferred();let writes=0,paints=0;
  const farms=Array.from({length:9},(_,pid)=>({label:`#${pid}`,lp:addr(pid+1),pid,single:true}));
  const context=vm.createContext({FARMS:farms,wAddr:addr(20),wProvider:{},farmLoadId:0,farmInitialLoading:false,
    lastFarmResults:farms.map(farm=>({farm,pid:farm.pid,staked:0n,disconnected:true})),
    FARM_CONTRACT:addr(30),FARM_TIME_ABI:[],LP_ABI:[],document:{getElementById:()=>({}),activeElement:null},
    console:{error(){}},set(){},markBrowseRead(){},readProvider:()=>({}),restoreFarmSnapshot:async()=>{},saveFarmSnapshot(){writes++;},
    renderPlaceholderFarms(){assert.fail('existing shell was replaced');},
    getCachedFarmPools:()=>({}),matchFarmPools:()=>farms.map(farm=>({farm,pid:farm.pid})),
    fetchFarmPriceMaps:async()=>({}),prefetchedPrices:()=>({}),retry:fn=>fn(),
    mapLimit:(items,limit,fn)=>Promise.all(items.map(fn)),fetchLpBreakdown:async()=>null,fetchNexionValuation:async()=>({tvl:'$10'}),
    renderFarmResults(results){context.lastFarmResults=results;paints++;if(results.filter(r=>r.valuation).length===8)firstBatch.resolve();},
    ethers:{Contract:class{
      async userInfo(pid){if(pid===8)await tail.promise;return {amount:BigInt(pid+1)};}
      async pendingReward(){return 1n;}async balanceOf(){return 100n;}async allowance(){return 100n;}
      async poolInfo(){return {endTime:2n};}
      getFunction(){assert.fail('valid ended pools must not probe speculative countdown methods');}
    }}
  });
  vm.runInContext(section('  function farmBatchProgress(', '  let farmLoadId'),context);
  vm.runInContext(section('  async function fetchFarms(', '  function metaOrLive('),context);
  return {context,tail,firstBatch,counts:()=>({writes,paints})};
}
test('farm batches paint before the last RPC resolves and ended pools do not trigger countdown probing',async()=>{
  const {context,tail,firstBatch,counts}=farmFixture();
  const loading=context.fetchFarms();await firstBatch.promise;
  assert.equal(context.lastFarmResults.filter(r=>r.valuation).length,8);assert.equal(context.farmInitialLoading,true);
  tail.resolve();await loading;
  assert.equal(context.lastFarmResults.length,9);assert.equal(context.lastFarmResults[8].staked,9n);
  assert.equal(context.farmInitialLoading,false);assert.equal(counts().writes,1);
});
test('switching wallets during a farm load prevents late results and snapshots from being committed',async()=>{
  const {context,tail,firstBatch,counts}=farmFixture();
  const loading=context.fetchFarms();await firstBatch.promise;
  const painted=counts().paints;context.wAddr=addr(21);context.lastFarmResults=[];
  tail.resolve();await loading;
  assert.equal(counts().paints,painted);assert.equal(counts().writes,0);assert.equal(context.lastFarmResults.length,0);
});
