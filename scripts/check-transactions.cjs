const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createTracker} = require('../lib/transactions.js');
const wallet = '0x'+'a'.repeat(40), hash = '0x'+'1'.repeat(64), replacement = '0x'+'2'.repeat(64);
const key = action => `369:${wallet}:farm:3:${action}`;
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush = () => new Promise(setImmediate);
function fixture(extra={}) {
  const values=new Map(), jobs=new Map(), changes=[], settled=[];let sequence=0;
  const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const options={storage,onChange:r=>changes.push({...r}),onSettled:r=>settled.push({...r}),
    schedule:fn=>{jobs.set(++sequence,fn);return sequence;},unschedule:id=>jobs.delete(id),...extra};
  const tracker=createTracker(options);
  return {tracker,values,storage,jobs,changes,settled,options,async tick(){const next=jobs.entries().next().value;assert.ok(next,'scheduled receipt check');jobs.delete(next[0]);await next[1]();await flush();}};
}
function options(action='stake') {return {keys:[key(action)],wallet,chainId:369,kind:'farm',target:3,action};}

test('cancelled wallet requests release the exact action immediately and do not refresh balances',async()=>{
  const f=fixture(), rejection=Object.assign(Error('Rejected'),{code:4001});
  await assert.rejects(f.tracker.run(options(),c=>c.send(()=>Promise.reject(rejection))),e=>e===rejection);
  assert.equal(f.tracker.isPending(key('stake')),false);
  assert.equal(f.tracker.pending().length,0);assert.equal(f.settled.length,0);
});

test('a synchronous duplicate cannot open a second wallet request; other actions and wallets stay available',async()=>{
  const f=fixture(), request=deferred();let sends=0;
  const first=f.tracker.run(options(),async c=>{const tx=await c.send(()=>{sends++;return request.promise;});await c.wait(tx);});
  await flush();
  assert.deepEqual(await f.tracker.run(options(),()=>{assert.fail('duplicate invoked wallet');}),{duplicate:true});
  await f.tracker.run(options('claim'),()=>{});
  assert.equal(sends,1);assert.equal(f.tracker.isPending(key('stake')),true);
  request.reject(Object.assign(Error('cancel'),{code:'ACTION_REJECTED'}));await assert.rejects(first);
});

test('RPC timeouts after a hash keep tracking until a receipt arrives, without a second submission',async()=>{
  let receipt=null, reads=0, sends=0;const f=fixture({readReceipt:async()=>{reads++;if(reads===1)throw Error('offline');return receipt;}});
  const running=f.tracker.run(options(),async c=>{await c.send(()=>{sends++;return {hash,wait:async()=>{throw Error('timeout');}};});return c.wait();});
  await flush();assert.equal(f.tracker.isPending(key('stake')),true);
  await f.tick();assert.equal(f.tracker.isPending(key('stake')),true);
  receipt={status:1,hash};await f.tick();assert.equal((await running).status,1);
  assert.equal(sends,1);assert.equal(f.tracker.pending().length,0);assert.equal(f.settled.length,1);
});

test('a reverted receipt unlocks the action and is never treated as a successful claim',async()=>{
  const f=fixture();let applied=false;
  await assert.rejects(f.tracker.run(options('claim'),async c=>{
    await c.send(()=>({hash,wait:async()=>({status:0})}));await c.wait();applied=true;
  }),/reverted/);
  assert.equal(applied,false);assert.equal(f.tracker.isPending(key('claim')),false);
});

test('repriced replacement confirms the replacement hash; wallet cancellation never applies success',async()=>{
  const f=fixture();const original={hash,wait:async()=>{throw {code:'TRANSACTION_REPLACED',replacement:{hash:replacement},receipt:{status:1},cancelled:false};}};
  await f.tracker.run(options(),async c=>{await c.send(()=>original);assert.equal((await c.wait()).status,1);});
  assert.equal(f.settled[0].hash,replacement);
  await assert.rejects(f.tracker.run(options(),async c=>{
    await c.send(()=>({...original,wait:async()=>{throw {code:'TRANSACTION_REPLACED',cancelled:true,receipt:{status:1}};}}));await c.wait();
  }),/cancelled/);
});

test('submitted actions survive reload and resume receipt checks without asking the wallet to resend',async()=>{
  const f=fixture();f.tracker.run(options('claim'),async c=>{await c.send(()=>({hash,wait:()=>new Promise(()=>{})}));await c.wait();});
  await flush();f.tracker.destroy();
  const restored=fixture({storage:f.storage,readReceipt:async()=>({status:1})});restored.tracker.resume();
  assert.equal(restored.tracker.isPending(key('claim')),true);await flush();
  assert.equal(restored.tracker.isPending(key('claim')),false);assert.equal(restored.settled.length,1);
});

test('a wallet change during mining preserves confirmation but prevents old-wallet success callbacks',async()=>{
  const f=fixture(), mining=deferred();let current=true,applied=false;
  const running=f.tracker.run({...options(),assertCurrent:()=>{if(!current)throw Error('Wallet changed');}},async c=>{
    await c.send(()=>({hash,wait:()=>mining.promise}));await c.wait();applied=true;
  });
  await flush();current=false;mining.resolve({status:1});await assert.rejects(running,/Wallet changed/);
  assert.equal(applied,false);assert.equal(f.tracker.pending().length,0);
});

test('approval followed by deposit retains its lock until the whole requested action ends',async()=>{
  const f=fixture(), second=deferred();let sending=0;
  const run=f.tracker.run(options(),async c=>{
    await c.send(()=>({hash,wait:async()=>({status:1})}));await c.wait();
    assert.equal(f.tracker.isPending(key('stake')),true);
    await c.send(()=>{sending++;return {hash:replacement,wait:()=>second.promise};});await c.wait();
  });
  await flush();assert.equal(sending,1);assert.equal(f.tracker.isPending(key('stake')),true);
  second.resolve({status:1});await run;assert.equal(f.tracker.isPending(key('stake')),false);
});

test('a batch claim and an individual claim cannot submit the same pool twice',async()=>{
  const f=fixture(), request=deferred();
  const batch=f.tracker.run({...options(),keys:[key('claim'),'369:'+wallet+':batch:0:claim']},async c=>{await c.send(()=>request.promise);await c.wait();});
  await flush();assert.deepEqual(await f.tracker.run(options('claim'),()=>assert.fail('overlapping claim')),{duplicate:true});
  request.reject(Object.assign(Error('cancel'),{code:4001}));await assert.rejects(batch);
});

test('an unclear broadcast is found by its nonce and exact intended call, with no automatic resubmission',async()=>{
  let available=false,sends=0;const f=fixture({locateTransaction:async r=>{assert.equal(r.to,'contract');assert.equal(r.data,'0x1234');return available?{hash}:null;},readReceipt:async()=>({status:1})});
  const contract={target:'contract',interface:{getFunction:()=>({inputs:[{}]}),encodeFunctionData:()=> '0x1234'},deposit:async()=>{sends++;throw Error('network timeout');}};
  const run=f.tracker.run({...options(),checkpoint:async()=>({nonce:7,block:100})},async c=>{await c.send(contract,'deposit',[123n]);return c.wait();});
  await flush();assert.equal(f.tracker.pending()[0].phase,'uncertain');assert.equal(f.tracker.isPending(key('stake')),true);
  available=true;await f.tick();assert.equal((await run).status,1);assert.equal(sends,1);
});

test('a different mined transaction at a known nonce releases the action as cancelled',async()=>{
  let found=false;const f=fixture({locateTransaction:async()=>found?{hash:replacement,cancelled:true}:null});
  const run=f.tracker.run({...options(),checkpoint:async()=>({nonce:1,block:100})},async c=>{await c.send(()=>({hash,nonce:1}));await c.wait();});
  const rejected=assert.rejects(run,/replaced/);
  await flush();found=true;await f.tick();await rejected;assert.equal(f.tracker.pending().length,0);
});

test('unavailable browser storage does not prevent submission or confirmation',async()=>{
  const f=fixture({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});f.tracker.resume();
  await f.tracker.run(options(),async c=>{await c.send(()=>({hash,wait:async()=>({status:1})}));await c.wait();});
  assert.equal(f.tracker.pending().length,0);
});

test('the real farm stake handler preserves calldata, deduplicates clicks and refreshes only after confirmation',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/\r/g,'');
  const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  const f=fixture(), mining=deferred(), sent=[], refreshed=[];
  const input={value:'2'};
  const signer={getAddress:async()=>wallet};const provider={getSigner:async()=>signer,getNetwork:async()=>({chainId:369})};
  const ctx=vm.createContext({window:{SiteTransactions:require('../lib/transactions.js')},wAddr:wallet,wProvider:provider,
    transactionTracker:f.tracker,trackedActionKey:(w,k,id,a)=>`369:${w}:${k}:${id}:${a}`,readProvider:()=>({getTransactionCount:async()=>0,getBlockNumber:async()=>100}),
    document:{getElementById:id=>id==='farm-input-3'?input:null},lastFarmResults:[{pid:3,farm:{lp:'token'},walletLp:100n,allowance:100n}],
    ethers:{parseUnits:value=>BigInt(value),Contract:function(){this.target='farm';this.interface={getFunction:()=>({inputs:[{},{}]}),encodeFunctionData:()=> '0x1234'};
      this.allowance=async()=>100n;
      this.deposit=async(...args)=>{sent.push(args);return {hash,wait:()=>mining.promise};};}},FARM_CONTRACT:'farm',FARM_ABI:[],
    LP_ABI:[],
    setFarmStatus(){},updateApproveLabel(){},scheduleFarmRefresh:id=>refreshed.push(id),friendlyFarmError:e=>e, setTimeout:()=>0,
  });
  vm.runInContext(slice('  async function runTrackedAction(', '  // Resume submitted hashes')+
    slice('  async function stakeFarm(', '  async function approveFarm('),ctx);
  const first=ctx.stakeFarm(3);await flush();
  assert.deepEqual(sent,[[3,2n]]);assert.deepEqual(refreshed,[]);
  await ctx.stakeFarm(3);assert.equal(sent.length,1);
  mining.resolve({status:1});await first;
  assert.deepEqual(refreshed,[3]);assert.equal(input.value,'');
});

test('action-state rendering disables only the pending action and restores it on cancellation',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const buttons=new Map(['stake','unstake','claim'].map(name=>[name,{dataset:{},innerHTML:name,textContent:name,disabled:false}]));
  let active=[{id:'one',wallet,kind:'farm',target:3,action:'stake',phase:'wallet'}];
  const ctx=vm.createContext({wAddr:wallet,transactionTracker:{pending:()=>active},trackedActionButtons:r=>[buttons.get(r.action)],
    document:{getElementById:()=>null,querySelectorAll:()=>[...buttons.values()].filter(b=>b.dataset.trackedAction)}});
  const start=source.indexOf('  function syncTrackedActions()'),end=source.indexOf('  function trackedActionStatus(',start);
  vm.runInContext(source.slice(start,end),ctx);ctx.syncTrackedActions();
  assert.equal(buttons.get('stake').disabled,true);assert.equal(buttons.get('unstake').disabled,false);assert.equal(buttons.get('claim').disabled,false);
  active=[];ctx.syncTrackedActions();assert.equal(buttons.get('stake').disabled,false);assert.equal(buttons.get('stake').innerHTML,'stake');
});
