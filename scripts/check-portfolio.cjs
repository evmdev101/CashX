const test=require('node:test');
const assert=require('node:assert/strict');
const {summary,allocatedAssets,classify,cumulative,positionSeries,backfilledSeries}=require('../lib/portfolio-model.js');
const {farmEvents,rewardTransfers}=require('../lib/portfolio-history.js');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const chartSource=fs.readFileSync(path.join(__dirname,'../lib/portfolio.js'),'utf8');
test('fast reward queries filter both sender and recipient, with all required AND operators',async()=>{
  const wallet='0x'+'12'.repeat(20),source='0x'+'34'.repeat(20),token='0x'+'56'.repeat(20),hash='0x'+'78'.repeat(32);
  const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  let calls=0;
  const events=await rewardTransfers({wallet,sources:[source,source.toUpperCase()],fromBlock:2,toBlock:10,request:async url=>{
    calls++;const params=new URL(url).searchParams;
    assert.equal(params.get('topic1'),'0x'+source.slice(2).padStart(64,'0'));assert.equal(params.get('topic2'),'0x'+wallet.slice(2).padStart(64,'0'));
    ['topic0_1_opr','topic0_2_opr','topic1_2_opr'].forEach(key=>assert.equal(params.get(key),'and'));
    assert.equal(params.get('fromBlock'),'2');
    return {ok:true,json:async()=>({status:'1',result:[{address:token,topics:[transfer,params.get('topic1'),params.get('topic2'),null],data:'0x'+'100'.padStart(64,'0'),blockNumber:'0x5',timeStamp:'0x100',logIndex:'0x1',transactionHash:hash}]})};
  }});
  assert.equal(calls,1);assert.equal(events[0].rawAmount,'256');assert.equal(events[0].token,token);
});
test('cached rewards restore immediately for the matching wallet and reject invalid cached amounts',()=>{
  const caches=new Map();
  const valid={complete:true,block:100,at:Date.now()-1000,events:[{at:100,amount:3,token:'a',symbol:'A',hash:'tx',index:1,reward:true}],prices:[['a',2]]};
  caches.set('cashx:rewards:v1:wallet',JSON.stringify(valid));
  const context=vm.createContext({localStorage:{getItem:key=>caches.get(key)},rewardSnapshot:null,rewardReady:false,rewardBlock:-1,historyAsOf:0,rewardPrices:new Map()});
  vm.runInContext(chartSource.slice(chartSource.indexOf('  function restoreRewards('),chartSource.indexOf('  async function loadFastRewards(')),context);
  context.restoreRewards('other-wallet');assert.equal(context.rewardSnapshot,null);
  context.restoreRewards('WALLET');assert.equal(context.rewardSnapshot[0].amount,3);assert.equal(context.rewardReady,true);assert.equal(context.rewardBlock,100);
  context.rewardSnapshot=null;
  caches.set('cashx:rewards:v1:wallet',JSON.stringify({...valid,events:[{...valid.events[0],amount:-1}]}));
  context.restoreRewards('wallet');assert.equal(context.rewardSnapshot,null);
});
test('fast reward refresh merges overlapping logs, retries unknown payouts, and excludes withdrawals',async()=>{
  let cached,fromBlock;
  const context=vm.createContext({AbortController,setTimeout,clearTimeout,scanId:1,rewardBusy:false,rewardReady:true,rewardBlock:1000,historyAsOf:0,rewardController:null,rewardPrices:new Map(),
    rewardSnapshot:[{hash:'old',index:1,at:100,amount:3,token:'token',symbol:'A',reward:true},{hash:'retry',index:2,at:200,amount:9,token:'token',symbol:'A',reward:false,direction:'Unclassified farm payout'}],
    contracts:{farm:'farm',nft:'nft',vault:'vault'},tokens:[{address:'token',key:'a',symbol:'A'}],rows:[{address:'token',key:'a',symbol:'A'}],farmTokens:[{address:'token'}],model:{classify},methodNames:{'0x12345678':'claim','0x87654321':'withdraw'},drawRewards(){},async loadRewardPrices(){},
    localStorage:{setItem:(key,value)=>cached=JSON.parse(value)},
    ethers:{FetchRequest:class{},JsonRpcProvider:class{async getBlockNumber(){return 1100;}async getTransaction(hash){return {data:hash==='withdraw'?'0x87654321':'0x12345678'};}destroy(){}},Contract:class{async decimals(){return 2;}async symbol(){return 'A';}}},
    window:{PortfolioHistory:{rewardTransfers:async params=>{fromBlock=params.fromBlock;return [{hash:'old',index:1,source:'farm',token:'token',rawAmount:'300',at:100},{hash:'retry',index:2,source:'farm',token:'token',rawAmount:'900',at:200},{hash:'withdraw',index:3,source:'farm',token:'token',rawAmount:'1000',at:300}];}}}
  });
  vm.runInContext(chartSource.slice(chartSource.indexOf('  async function loadFastRewards('),chartSource.indexOf('  async function loadPositionHistory(')),context);
  await context.loadFastRewards('wallet',1);
  assert.equal(fromBlock,800);assert.equal(context.rewardSnapshot.length,3);
  assert.equal(cumulative(context.rewardSnapshot)[0].total,12);
  assert.equal(cached.block,1100);assert.equal(cached.events.length,3);assert.equal(context.rewardBusy,false);
});
test('earlier farm history rebuilds deposits and withdrawals and must match live raw balance',()=>{
  const position={kind:'stake',id:1,name:'Token farm',symbol:'TOKEN',decimals:2,amount:12,rawAmount:'1200',value:25};
  const events=[{pid:'1',at:100,block:1,index:0,rawAmount:'1000',withdraw:false},{pid:'1',at:200,block:2,index:0,rawAmount:'500',withdraw:false},{pid:'1',at:300,block:3,index:0,rawAmount:'300',withdraw:true}];
  const observed=[{at:400,positions:[position]}];
  const result=backfilledSeries(events,[position],observed,'stake');
  assert.equal(result[0].backfilled,true);
  assert.deepEqual(result[0].points.map(p=>p.y),[0,10,15,12,12]);
  assert.equal(backfilledSeries(events,[{...position,rawAmount:'1300'}],observed,'stake')[0].backfilled,undefined);
  assert.equal(backfilledSeries([{...events[0],withdraw:true}],[position],observed,'stake')[0].backfilled,undefined);
});
test('farm log fetch filters the raw wallet topics and splits capped ranges without skipping blocks',async()=>{
  const wallet='0x'+'12'.repeat(20),contract='0x'+'34'.repeat(20),deposit='0x'+'56'.repeat(32);
  const account='0x'+wallet.slice(2).padStart(64,'0');
  const requested=[];
  const result=await farmEvents({wallet,contract,toBlock:9,depositTopic:deposit,withdrawTopics:[],request:async url=>{
    const params=new URL(url).searchParams;
    requested.push([params.get('fromBlock'),params.get('toBlock')]);
    assert.equal(params.get('topic1'),account);
    return {ok:true,json:async()=>({status:'1',result:requested.length===1?Array(1000).fill({}):[{address:contract,topics:[deposit,account,'0x'+ '1'.padStart(64,'0')],data:'0x'+'100'.padStart(64,'0'),blockNumber:params.get('fromBlock'),timeStamp:'0x100',logIndex:'0x1'}]})};
  }});
  assert.deepEqual(requested,[['0','9'],['0','4'],['5','9']]);
  assert.equal(result.length,2);assert.equal(result[0].pid,'1');assert.equal(result[0].rawAmount,'256');
});
test('farm logs reject explorer failures and mismatched wallet data',async()=>{
  const params={wallet:'0x'+'12'.repeat(20),contract:'0x'+'34'.repeat(20),toBlock:9,depositTopic:'deposit',withdrawTopics:[]};
  await assert.rejects(farmEvents({...params,request:async()=>({ok:true,json:async()=>({status:'0',message:'rate limited',result:[]})})}));
  await assert.rejects(farmEvents({...params,request:async()=>({ok:true,json:async()=>({status:'1',result:[{topics:['deposit','other']} ]})})}));
});
test('position histories keep pools separate even when LP symbols match',()=>{
  const p=(id,amount)=>({kind:'farm',id,name:`Pool ${id}`,symbol:'LP',amount,value:amount*2});
  const result=positionSeries([{at:100,positions:[p(1,10),p(2,50)]},{at:200,positions:[p(1,15),p(2,40)]}],'farm');
  assert.equal(result.length,2);
  assert.deepEqual(result[0].points,[{x:100,y:10},{x:200,y:15}]);
  assert.equal(result[1].total,40);
});
test('closed positions go to zero only after a complete successful reading',()=>{
  const p={kind:'stake',id:1,name:'CASHX',symbol:'CASHX',amount:20,value:5};
  const result=positionSeries([{at:100,positions:[p]},{at:200,positions:[],positionsPartial:true},{at:300,positions:[]}],'stake');
  assert.deepEqual(result[0].points,[{x:100,y:20},{x:300,y:0}]);
  assert.equal(result[0].value,0);
});
test('vault history uses underlying compounded assets and ignores old aggregate-only snapshots',()=>{
  const p=amount=>({kind:'vault',id:1,name:'GSX vault',symbol:'LP',amount,value:amount*3});
  const result=positionSeries([{at:50,vault:99},{at:100,positions:[p(10)]},{at:200,positions:[p(12)]}],'vault');
  assert.equal(result[0].total,12);
  assert.equal(result[0].points[0].x,100);
  assert.equal(positionSeries([{at:50,total:10}],'farm').length,0);
});
function chartContext(chartLibrary=async()=>{}){
  const nodes=new Map();
  const context=vm.createContext({scanId:1,chartVersions:{},charts:{},chartLibrary,
    palette:['#ffcf78','#7dc6f9'],chartMuted:'#85858f',chartBorder:'#292930',quantity:String,compact:String,money:n=>`$${n}`,escape:String,
    node:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},
    Chart:class{constructor(canvas,config){this.config=config;}destroy(){this.destroyed=true;}}
  });
  vm.runInContext(chartSource.slice(chartSource.indexOf('  async function plot('),chartSource.indexOf('  function drawPositions(')),context);
  return {context,nodes};
}
test('portfolio charts retain independent quantity scales, stepped fades and matching legends',async()=>{
  const {context,nodes}=chartContext();
  const series=[{symbol:'CASHX',total:10,points:[{x:100,y:0},{x:200,y:10}]},{symbol:'GSX',total:20,points:[{x:100,y:0},{x:200,y:20}]}];
  await context.plot('chart',series,'empty');
  const config=context.charts.chart.config;
  assert.equal(config.data.datasets[0].stepped,true);
  assert.notEqual(config.data.datasets[0].yAxisID,config.data.datasets[1].yAxisID);
  assert.match(nodes.get('chart-legend').innerHTML,/CASHX.*10.*GSX.*20/);
  const stops=[];
  config.data.datasets[0].backgroundColor({chart:{ctx:{createLinearGradient:()=>({addColorStop:(...args)=>stops.push(args)})},chartArea:{top:0,bottom:200}}});
  assert.equal(stops[1][1],'#ffcf7800');
  await context.plot('chart',[{symbol:'Portfolio value',points:[{x:100,y:25}]}],'empty',true);
  assert.match(nodes.get('chart-legend').innerHTML,/\$25/);
  assert.equal(context.charts.chart.config.data.datasets[0].yAxisID,'usd');
});
test('delayed chart library cannot overwrite a newer tab selection',async()=>{
  let resolve;
  const {context,nodes}=chartContext(()=>new Promise(done=>{resolve=done;}));
  const pending=context.plot('chart',[{symbol:'CASHX',total:1,points:[{x:100,y:1}]}],'empty');
  await context.plot('chart',[],'empty');
  resolve();await pending;
  assert.equal(context.charts.chart,undefined);
  assert.equal(nodes.get('chart-legend').innerHTML,'');
});
test('reward colors match line and legend without overlapping area fills',async()=>{
  const {context,nodes}=chartContext();
  await context.plot('chart',[{symbol:'CASHX',color:'#ffc65c',total:10,points:[{x:100,y:0},{x:200,y:10}]},{symbol:'DISTROX',color:'#b49aff',total:20,points:[{x:100,y:0},{x:200,y:20}]}],'empty');
  const datasets=context.charts.chart.config.data.datasets;
  assert.equal(datasets[0].borderColor,'#ffc65c');assert.equal(datasets[1].borderColor,'#b49aff');
  assert.equal(datasets[1].fill,false);assert.match(nodes.get('chart-legend').innerHTML,/#ffc65c.*CASHX.*#b49aff.*DISTROX/);
});
test('reward totals exclude withdrawals and label unavailable token prices',()=>{
  const nodes=new Map();
  const context=vm.createContext({rewardSelection:null,FARM_HISTORY_START:1776256745000,rewardSnapshot:null,rewardReady:false,rewardBusy:false,historyDone:true,historyBusy:false,loadedWallet:'wallet',scannedTransfers:0,historyAsOf:400,
    model:{cumulative},tokens:[],rows:[{address:'a',price:2}],rewardPrices:new Map(),rewardColor:()=> '#ffc65c',
    activity:[{token:'a',symbol:'A',reward:true,amount:3,at:100,index:0},{token:'b',symbol:'B',reward:true,amount:4,at:200,index:1},{token:'a',symbol:'A',reward:false,amount:999,at:300,index:2}],
    money:n=>`$${n}`,quantity:String,escape:String,valueOf:(amount,price)=>price>0?amount*price:null,plot(){},
    node:id=>{if(!nodes.has(id))nodes.set(id,{querySelectorAll:()=>[]});return nodes.get(id);}
  });
  vm.runInContext(chartSource.slice(chartSource.indexOf('  function drawRewards('),chartSource.indexOf('  async function loadRewardPrices(')),context);
  context.drawRewards();
  assert.match(nodes.get('pf-earned').innerHTML,/3 A.*\$6/);
  assert.match(nodes.get('pf-earned').innerHTML,/Price unavailable/);
  assert.doesNotMatch(nodes.get('pf-earned').innerHTML,/999/);
});
test('principal counts wallet, farms and vault assets once and keeps rewards separate',()=>{
  const result=summary([{balance:10,price:2,reflections:100}], [{kind:'farm',value:25,amount:1,pendingUsd:3},{kind:'vault',value:40,amount:1,pendingUsd:0},{kind:'nft',value:null,amount:2,rewards:[{value:4}]}]);
  assert.equal(result.total,85);assert.equal(result.pendingFarm,7);assert.equal(result.nfts,2);assert.equal(result.partial,false);
  assert.equal(result.active,2);
});

test('LP and vault principal follows deposited assets, not reward tokens, without double counting',()=>{
  const positions=[
    {kind:'farm',value:100,rewardToken:'distrox',allocations:[{address:'cashx',weight:1}]},
    {kind:'vault',value:40,rewardToken:'divx',allocations:[{address:'gsx',weight:1}]},
    {kind:'farm',value:60,rewardToken:'burnx',allocations:[{address:'cashx',weight:0.25},{address:'gsx',weight:0.75}]}
  ];
  const cashx=allocatedAssets(positions,'CASHX').reduce((sum,p)=>sum+p.value,0);
  const gsx=allocatedAssets(positions,'gsx').reduce((sum,p)=>sum+p.value,0);
  assert.equal(cashx,115);assert.equal(gsx,85);assert.equal(cashx+gsx,200);
  assert.equal(allocatedAssets(positions,'divx').length,0);
  assert.equal(allocatedAssets([{kind:'farm',value:null,allocations:[{address:'gsx',weight:1}]}],'gsx')[0].value,null);
});

test('portfolio reads LP members and weights shared pairs by priced reserves',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const start=source.indexOf("    const ecosystem = ['CASHX'");
  const end=source.indexOf('    try {\n      const farms',start);
  const context=vm.createContext({TOKEN_ADDRESSES:{CASHX:'cashx',DISTROX:'distrox',GSX:'gsx',DIVX:'divx',BURNX:'burnx'},
    LP_ABI:[],provider:{},failures:[],meta:async()=>({decimals:18}),priced:(raw,price)=>Number(raw)*price,
    calculator:{getBatchPrice:async()=>[2,3]},ethers:{Contract:class{
      constructor(address){this.address=address;}async token0(){return this.address==='other-pair'?'hbr':'cashx';}
      async token1(){return ['single-pair','other-pair'].includes(this.address)?'wpls':'gsx';}async getReserves(){return [30n,10n];}
    }}
  });
  vm.runInContext(source.slice(start,end).replace(/\r/g,'')+'\nthis.allocate=allocations;',context);
  assert.deepEqual(JSON.parse(JSON.stringify(await context.allocate('single-pair',true))),[{address:'cashx',weight:1}]);
  assert.deepEqual(JSON.parse(JSON.stringify(await context.allocate('shared-pair',true))),[{address:'cashx',weight:2/3},{address:'gsx',weight:1/3}]);
  assert.deepEqual(JSON.parse(JSON.stringify(await context.allocate('distrox',false))),[{address:'distrox',weight:1}]);
  assert.deepEqual(JSON.parse(JSON.stringify(await context.allocate('other-pair',true))),[{address:'other',weight:1}]);
});
test('missing prices and failed reads produce a partial total',()=>{
  assert.equal(summary([{balance:1,price:0}],[{kind:'stake',value:null,amount:1}]).partial,true);
  assert.equal(summary([{balance:0,price:0}],[]).partial,false);
  assert.equal(summary([{balance:0,price:0}],[],['read failed']).partial,true);
});
const contracts={farm:'farm',vault:'vault',nft:'nft'};
const tokens=[{address:'token',key:'cashx',symbol:'CASHX'}];
const event=(from,to,method='claim')=>({from:{hash:from},to:{hash:to},method,token:{address:'token',symbol:'CASHX',decimals:'8'},total:{value:'125000000',decimals:'8'},timestamp:'2026-09-29T00:00:00Z',tx_hash:'tx',log_index:'1'});
function historyContext(fetch){
  const nodes=new Map();
  const context=vm.createContext({fetch,AbortController,URLSearchParams,setTimeout,clearTimeout,
    scanId:1,historyBusy:false,historyDone:false,historyCursor:null,historyAsOf:0,historyPages:0,scannedTransfers:0,
    activity:[],rewardSnapshot:null,model:{classify},contracts,farmTokens:[],rows:tokens,methodNames:{},
    ethers:{JsonRpcProvider:class{destroy(){}async getTransaction(){return null;}}},
    renderActivity(){},drawRewards(){},drawPositions(){},async loadRewardPrices(){},
    node:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}
  });
  vm.runInContext(chartSource.slice(chartSource.indexOf('  async function loadActivity('),chartSource.indexOf('  async function scan(')),context);
  return {context,nodes};
}
const indexedEvent=index=>({...event('farm','wallet'),token:{...event().token,type:'ERC-20'},log_index:String(index)});
test('all-time history follows every indexed page beyond the old three-page limit',async()=>{
  let calls=0;
  const {context,nodes}=historyContext(async url=>{
    const page=++calls;
    if(page>1)assert.equal(new URL(url).searchParams.get('index'),String(page-1));
    return {ok:true,json:async()=>({items:[indexedEvent(page)],next_page_params:page<5?{index:page}:null})};
  });
  await context.loadActivity('wallet',1);
  assert.equal(calls,5);assert.equal(context.historyDone,true);
  assert.equal(context.activity.length,5);assert.equal(cumulative(context.activity)[0].total,6.25);
  assert.match(nodes.get('pf-history-status').textContent,/All-time indexed history loaded/);
});
test('failed all-time requests retain their cursor and resume without double counting',async()=>{
  let calls=0;
  const {context}=historyContext(async()=>{
    calls++;
    if(calls===2)throw Error('Offline');
    return {ok:true,json:async()=>({items:[indexedEvent(calls===1?1:2)],next_page_params:calls===1?{index:1}:null})};
  });
  await context.loadActivity('wallet',1);
  assert.equal(context.historyDone,false);assert.equal(context.historyBusy,false);
  assert.equal(context.historyCursor.index,1);
  await context.loadActivity('wallet',1);
  assert.equal(context.historyDone,true);assert.equal(context.activity.length,2);
});
test('one unavailable farm transaction cannot block older reward dates',async()=>{
  let calls=0;
  const {context}=historyContext(async()=>{
    const first=++calls===1;
    const item={...indexedEvent(first?1:2),method:first?'unknown':'claim',timestamp:first?'2026-10-06T00:00:00Z':'2026-08-01T00:00:00Z'};
    return {ok:true,json:async()=>({items:[item],next_page_params:first?{index:1}:null})};
  });
  context.farmTokens=[{address:'token'}];
  context.ethers.JsonRpcProvider=class{destroy(){}async getTransaction(){throw Error('RPC unavailable');}};
  await context.loadActivity('wallet',1);
  assert.equal(context.historyDone,true);assert.equal(calls,2);
  assert.equal(cumulative(context.activity)[0].points[1].x,Date.parse('2026-08-01T00:00:00Z'));
  assert.equal(cumulative(context.activity)[0].total,1.25);
});
test('repeated or malformed indexed pages cannot claim all-time completion',async()=>{
  const {context,nodes}=historyContext(async()=>({ok:true,json:async()=>({items:[indexedEvent(1)],next_page_params:{index:1}})}));
  await context.loadActivity('wallet',1);
  assert.equal(context.historyDone,false);assert.equal(context.activity.length,1);
  assert.match(nodes.get('pf-history-status').textContent,/incomplete/);
});
test('old wallet history response cannot update a new wallet scan',async()=>{
  let resolve;
  const {context}=historyContext(()=>new Promise(done=>{resolve=done;}));
  const pending=context.loadActivity('wallet',1);
  context.scanId=2;context.historyBusy=false;
  resolve({ok:true,json:async()=>({items:[indexedEvent(1)],next_page_params:null})});
  await pending;
  assert.equal(context.activity.length,0);assert.equal(context.historyDone,false);
});
test('withdrawals are not earnings, including single-token farms',()=>{
  const withdrawal=classify(event('farm','wallet','withdraw'),'wallet',contracts,[],tokens);
  assert.equal(withdrawal.reward,false);
  const ambiguous=classify(event('farm','wallet','0xunknown'),'wallet',contracts,[{address:'token'}],tokens);
  assert.equal(ambiguous.reward,false);
  assert.equal(classify(event('farm','wallet','unknown'),'wallet',contracts,[],tokens).reward,false);
  assert.equal(classify(event('farm','wallet','emergencyWithdraw'),'wallet',contracts,[],tokens).reward,false);
  const claim=classify(event('farm','wallet'),'wallet',contracts,[{address:'token'}],tokens);
  assert.equal(claim.reward,true);assert.equal(claim.amount,1.25);
});
test('vault withdrawals and self transfers do not inflate earned rewards',()=>{
  assert.equal(classify(event('vault','wallet'),'wallet',contracts,[],tokens).reward,false);
  const self=classify(event('wallet','wallet'),'wallet',contracts,[],tokens);
  assert.equal(self.delta,0);assert.equal(self.reward,false);
});
test('unrelated transfers and malformed decimals are excluded',()=>{
  assert.equal(classify(event('other','elsewhere'),'wallet',contracts,[],tokens),null);
  const invalid=event('farm','wallet');invalid.total.decimals='nope';
  assert.equal(classify(invalid,'wallet',contracts,[],tokens),null);
});
test('reward chart preserves order, quantities and separate tokens',()=>{
  const series=cumulative([{token:'a',symbol:'A',reward:true,amount:3,at:300,index:0},{token:'b',symbol:'B',reward:true,amount:.00000002,at:200,index:0},{token:'a',symbol:'A',reward:true,amount:2,at:100,index:0},{token:'a',symbol:'A',reward:false,amount:999,at:400,index:0}]);
  assert.equal(series[0].total,5);assert.equal(series[0].points[1].y,2);assert.equal(series[1].total,.00000002);
});
test('rewards timeline starts at farm launch without creating earlier earnings or dropping older records',()=>{
  const start=Date.parse('2026-04-15T12:39:05Z');
  const first=start+86400000*30;
  const event={token:'a',symbol:'A',reward:true,amount:5,at:first,index:0};
  const series=cumulative([event],'rewards',start);
  assert.deepEqual(series[0].points,[{x:start,y:0},{x:first,y:5}]);assert.equal(series[0].total,5);
  assert.equal(cumulative([{...event,at:start-1000}],'rewards',start)[0].points[0].x,start-1001);
});
test('deposit and withdrawal histories use actual transferred quantities',()=>{
  const series=cumulative([{token:'lp',symbol:'LP',reward:false,amount:9,delta:-9,at:100,index:0},{token:'lp',symbol:'LP',reward:false,amount:4,delta:-4,at:200,index:0}],'flows');
  assert.equal(series[0].total,13);
});
