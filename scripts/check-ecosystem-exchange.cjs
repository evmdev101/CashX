const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {POOLS,parseAmount,minimumOutput,validatePool,locateSubmission}=require('../lib/ecosystem-exchange.js');
const source=fs.readFileSync(path.join(__dirname,'../lib/ecosystem-exchange.js'),'utf8');

test('amounts retain all 18 decimals and reject invalid or excessive precision',()=>{
  assert.equal(parseAmount('0.000000000000000001'),1n);
  assert.equal(parseAmount('12345678901234567890.000000000000000001'),12345678901234567890000000000000000001n);
  for(const invalid of ['', '0', '-1', '1e6', 'Infinity', 'NaN', '1,000', '0.0000000000000000001'])assert.throws(()=>parseAmount(invalid));
});
test('treasury minimum is rounded down and refuses missing quotes or invalid tolerances',()=>{
  assert.equal(minimumOutput(12345n,15),10493n);
  assert.equal(minimumOutput(12345n,1),12221n);
  for(const invalid of [0,16,1.5,NaN])assert.throws(()=>minimumOutput(1000n,invalid));
  assert.throws(()=>minimumOutput(0n,15));assert.throws(()=>minimumOutput(1n,15));
});
test('every deployed pool requires its own minter activation and an unpaused exchange',()=>{
  assert.equal(POOLS.length,4);
  for(const pool of POOLS){validatePool(pool,pool.exchange.toLowerCase(),false);assert.throws(()=>validatePool(pool,pool.exchange,true));assert.throws(()=>validatePool(pool,'0x0000000000000000000000000000000000000000',false));}
});

const from='0x'+'11'.repeat(20),to='0x'+'22'.repeat(20),hash='0x'+'33'.repeat(32);
const record=extra=>({wallet:from,to,data:'0xabcd',value:'0',nonce:7,block:100,nonceKnown:false,...extra});
const rpc=transactions=>({getBlockNumber:async()=>100,getBlock:async()=>({prefetchedTransactions:transactions})});
test('unknown broadcast nonce ignores unrelated use of checkpoint nonce and finds exact payload at another nonce',async()=>{
  const unrelated={from,to,data:'0xdead',value:0n,nonce:7,hash:'unrelated'};
  const expected={from,to,data:'0xabcd',value:0n,nonce:9,hash};
  assert.deepEqual(await locateSubmission(record(),rpc([unrelated,expected])),{hash,nonce:9});
  const unresolved=record();assert.equal(await locateSubmission(unresolved,rpc([unrelated])),null);
  assert.equal(unresolved.block,101);
});
test('known nonce allows matching speed-ups and recognizes a different replacement as cancellation',async()=>{
  assert.deepEqual(await locateSubmission(record({nonceKnown:true}),rpc([{from,to,data:'0xabcd',value:0n,nonce:7,hash}])),{hash,nonce:7});
  assert.deepEqual(await locateSubmission(record({nonceKnown:true}),rpc([{from,to,data:'0xdead',value:0n,nonce:7,hash}])),{hash,cancelled:true});
  assert.equal(await locateSubmission(record({nonceKnown:true}),rpc([{from,to,data:'0xabcd',value:0n,nonce:9,hash}])),null);
});
test('submission recovery advances in bounded pages without skipping unavailable blocks',async()=>{
  const pending=record(),seen=[];
  const reader={getBlockNumber:async()=>200,getBlock:async block=>{seen.push(block);return{prefetchedTransactions:[]};}};
  assert.equal(await locateSubmission(pending,reader),null);assert.equal(seen.length,20);assert.equal(pending.block,120);
  assert.equal(await locateSubmission(pending,{...reader,getBlock:async()=>null}),null);assert.equal(pending.block,120);
});

function browserFixture({chain='0x171',paused=false,changeAfterApproval=false}={}) {
  const nodes=new Map(),calls=[];let lastTx,approved=0n;
  function element(id){return{id,value:id==='ex-pool'?'cashx':id==='ex-slippage'?'15':'',textContent:'',disabled:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},append(){},set innerHTML(value){this.html=value;for(const match of value.matchAll(/id="([^"]+)"/g))if(!nodes.has(match[1]))nodes.set(match[1],element(match[1]));},get innerHTML(){return this.html;}};}
  nodes.set('exchange-content',element('exchange-content'));
  let account=from;
  const injected={request:async({method})=>method==='eth_accounts'?[account]:chain};
  const token={decimals:async()=>18,balanceOf:async()=>100000000000000000000n,allowance:async()=>approved};
  const exchange={paused:async()=>paused,totalBurned:async()=>0n,totalLimitedMintedToUsers:async()=>0n,totalPlsToTreasury:async()=>0n,exchangeCount:async()=>0n,quotePlsOut:async()=>{calls.push('quote');return 10000n;}};
  token.approve={estimateGas:async()=>100000n};exchange.burnAndMint={estimateGas:async()=>1000000n};
  const root={sharedWalletAddr:account,addEventListener(){},CashXWallets:{getActiveProvider:()=>injected},ethers:{
    JsonRpcProvider:class{getTransactionCount(){return 0;}getBlockNumber(){return 1;}},BrowserProvider:class{getSigner(){return account;}},formatUnits:value=>(Number(value)/1e18).toString(),
    Contract:function(address){if(address.toLowerCase()===POOLS[0].output.toLowerCase())return{...token,minter:async()=>POOLS[0].exchange};return address.toLowerCase()===POOLS[0].exchange.toLowerCase()?exchange:token;}},
    SiteTransactions:{cancelled:()=>false,createTracker:()=>({pending:()=>[],resume(){},async run(options,operation){return operation({async send(contract,method,args){await options.assertCurrent();calls.push({method,args});lastTx=method;},async wait(){if(lastTx==='approve'){approved=10n**18n;if(changeAfterApproval){account='0x'+'44'.repeat(20);root.sharedWalletAddr=account;}}await options.assertCurrent();}});}})}};
  const context={window:root,document:{getElementById:id=>nodes.get(id),createElement:()=>element('')},console,BigInt,Number,String,Boolean,JSON,Promise,Date,Map,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout};
  vm.runInNewContext(source,context);root.EcosystemExchange.init();
  return{nodes,calls,async ready(){for(let i=0;i<5;i++)await new Promise(setImmediate);},async submit(){nodes.get('ex-amount').value='1';await nodes.get('ex-submit').listeners.click();}};
}
test('opening the tool never submits transactions and wrong chain or paused pool blocks actions',async()=>{
  for(const options of [{chain:'0x1'},{paused:true}]){const fixture=browserFixture(options);await fixture.ready();assert.equal(fixture.calls.length,0);await fixture.submit();assert.equal(fixture.calls.length,0);assert.match(fixture.nodes.get('ex-status').textContent,options.paused?/paused/:/PulseChain/);}
});
test('wallet change after approval prevents exchange and keeps the error visible',async()=>{
  const fixture=browserFixture({changeAfterApproval:true});await fixture.ready();await fixture.submit();assert.deepEqual(fixture.calls.map(call=>call.method||call),['approve']);assert.match(fixture.nodes.get('ex-status').textContent,/Wallet changed/);
});
test('successful exchange approves exact input then obtains a fresh quote and submits the minimum',async()=>{
  const fixture=browserFixture();await fixture.ready();await fixture.submit();assert.deepEqual(fixture.calls.map(call=>call.method||call),['approve','quote','burnAndMint']);
  assert.equal(fixture.calls[0].args[1],10n**18n);assert.equal(fixture.calls[2].args[0],10n**18n);assert.equal(fixture.calls[2].args[1],8500n);assert.equal(fixture.nodes.get('ex-amount').value,'');
});
