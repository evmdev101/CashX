const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function fixture(){
  let tick, account='',provider=null;
  const calls=[],events={};
  const host={CashXWallets:{getActiveProvider:()=>provider},get sharedWalletAddr(){return account;},async connectWallet(){calls.push('connect');},getComputedStyle:()=>({getPropertyValue:()=>''}),document:{body:{}},addEventListener(){}};
  const context={parent:host,window:{},document:{head:{append(){}},documentElement:{style:{getPropertyValue(){return'';},setProperty(){}}},createElement:()=>({})},MutationObserver:class{observe(){}},setInterval(fn){tick=fn;}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lib/original-site-bridge.js'),'utf8'),context);
  return{host,api:{...context.window,ethereum:context.window.cashxHost.provider}, calls, tick:()=>tick(),set(address,p){account=address;provider=p;},provider:{async request(args){calls.push(args);return 'result';},on(name,fn){events[name]=fn;},removeListener(){}}};
}
test('opening an original page never asks for authorization and respects main-site disconnect',async()=>{
  const f=fixture();assert.deepEqual(Array.from(await f.api.ethereum.request({method:'eth_accounts'})),[]);f.tick();assert.deepEqual(f.calls,[]);
  f.set('0x123',f.provider);assert.deepEqual(Array.from(await f.api.ethereum.request({method:'eth_accounts'})),['0x123']);
  f.set('',f.provider);assert.deepEqual(Array.from(await f.api.ethereum.request({method:'eth_accounts'})),[]);assert.deepEqual(f.calls,[]);
});
test('original app calls use the selected provider and preserve the transaction payload',async()=>{
  const f=fixture();f.set('0x123',f.provider);const payload={method:'eth_sendTransaction',params:[{to:'0xabc',data:'0x1234',value:'0x10'}]};
  assert.equal(await f.api.ethereum.request(payload),'result');assert.equal(f.calls[0],payload);
  assert.deepEqual(Array.from(await f.api.ethereum.request({method:'eth_requestAccounts'})),['0x123']);assert.equal(f.calls.length,1);
});
test('wallet adoption and explicit disconnect notify originals without reconnecting',()=>{
  const f=fixture(),seen=[],notifications=[];f.api.cashxHost.subscribe(()=>seen.push(f.api.cashxHost.address()));f.api.ethereum.on('accountsChanged',accounts=>notifications.push(Array.from(accounts)));
  f.set('0x123',f.provider);f.tick();f.set('',null);f.tick();assert.deepEqual(seen,['','0x123','']);assert.deepEqual(notifications,[['0x123'],[]]);assert.deepEqual(f.calls,[]);
});
test('an original cannot continue a wallet action when the main connection was cancelled',async()=>{
  const f=fixture();await assert.rejects(f.api.ethereum.request({method:'eth_requestAccounts'}),/Connect your wallet/);assert.deepEqual(f.calls,['connect']);
});
test('all original builds use relative assets and the same-origin wallet bridge',()=>{
  for(const slug of ['exchange','cashx-nft','cashmoney']){
    const html=fs.readFileSync(path.join(root,'tools',slug,'index.html'),'utf8');assert.match(html,/\.\.\/\.\.\/lib\/original-site-bridge\.js/);assert.match(html,/src="\.\/assets\//);assert.doesNotMatch(html,/src="https:\/\/evmdev101/);
  }
  const cashmoney=fs.readdirSync(path.join(root,'tools/cashmoney/assets')).filter(file=>file.endsWith('.js')).map(file=>fs.readFileSync(path.join(root,'tools/cashmoney/assets',file),'utf8')).join('');
  assert.match(cashmoney,/Minting is retired/);assert.doesNotMatch(cashmoney,/mint-wallet/);
});
