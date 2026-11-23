const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const providerKey='cashx_wallet_provider_v1';
const wallet='0x1111111111111111111111111111111111111111';
function source(name,offset=0){
  const tail=html.slice(offset),match=new RegExp(`^  (?:async )?function ${name}\\(`,'m').exec(tail);
  assert.ok(match,`${name} must exist`);
  const body=tail.slice(match.index),end=body.search(/\r?\n  }\r?\n/);
  assert.ok(end>=0,`${name} must have a complete body`);
  return body.slice(0,end)+'\n  }';
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function provider({accounts=[wallet],chain='0x171',isRabby=false,isMetaMask=false}={}){
  const calls=[];
  return {calls,isRabby,isMetaMask,async request({method}){
    calls.push(method);
    if(method==='eth_accounts')return accounts;
    if(method==='eth_chainId')return chain;
    throw Error(`Silent restoration requested an interactive method: ${method}`);
  }};
}
function fixture({remembered='rabby',injected=provider({isMetaMask:true})}={}){
  const listeners=new Map(),stored=new Map(),timers=new Map();let nextTimer=0,now=0;
  if(remembered)stored.set(providerKey,remembered);
  const window={ethereum:injected,
    addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},
    removeEventListener(type,callback){listeners.get(type)?.delete(callback);},
    dispatchEvent(event){for(const callback of [...(listeners.get(event.type)||[])])callback(event);return true;}
  };
  const storage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key)};
  class FakeDate extends Date {static now(){return now;}}
  const context=vm.createContext({window,localStorage:storage,document:{getElementById:()=>null},console,Date:FakeDate,
    Event:class{constructor(type){this.type=type;}},
    setTimeout(callback,delay=0){const id=++nextTimer;timers.set(id,{callback,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)
  });
  const start=html.indexOf('  window.CashXWallets ='),end=html.indexOf('  function trunc(',start);
  assert.ok(start>=0&&end>start);vm.runInContext(html.slice(start,end),context);
  function announce(selected,name='Rabby',rdns='io.rabby'){
    window.dispatchEvent({type:'eip6963:announceProvider',detail:{provider:selected,info:{name,rdns,uuid:rdns}}});
  }
  async function settle(promise){
    let done=false,result,error;Promise.resolve(promise).then(value=>{done=true;result=value;},reason=>{done=true;error=reason;});
    for(let step=0;!done&&step<100;step++){
      await new Promise(setImmediate);
      if(!done&&timers.size){const [id,timer]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);now=timer.at;timer.callback();}
    }
    assert.ok(done,'restoration must settle within its bounded discovery retry window');if(error)throw error;return result;
  }
  return {context,window,stored,timers,announce,settle,api:window.CashXWallets};
}
function mainRestore(f){
  const connected=[],adopted=[];
  Object.assign(f.context,{PULSE_ID:369,wProvider:null,wAddr:null,walletProvider:null,walletRestorePromise:null,
    ethers:{BrowserProvider:class{constructor(selected){this.selected=selected;}}},
    document:{getElementById:()=>({style:{},textContent:''})},
    trunc:value=>value.slice(0,6)+'...'+value.slice(-4),
    setMainWalletConnectState(ready){if(ready)connected.push(f.context.wAddr);},fetchBalances(){},fetchRewards(){}
  });
  f.window.location={hash:'#farms'};
  f.window.FarmsApp={restoreWallet:(...args)=>adopted.push(args)};
  vm.runInContext(source('onConnected'),f.context);
  vm.runInContext(source('restoreSharedWallet'),f.context);f.window.restoreSharedWallet=f.context.restoreSharedWallet;
  return {...f,connected,adopted};
}

test('refresh restores the remembered wallet rather than a different default injected wallet',async()=>{
  const f=mainRestore(fixture()),selected=provider({isRabby:true});f.announce(selected);
  assert.equal(await f.settle(f.context.restoreSharedWallet()),true);
  assert.equal(f.context.walletProvider,selected);assert.equal(f.context.wAddr,wallet);
  assert.equal(f.api.getActiveProvider(),selected);assert.deepEqual(f.window.ethereum.calls,[]);
  assert.deepEqual(selected.calls,['eth_accounts','eth_chainId']);
  assert.deepEqual(f.connected,[wallet]);assert.equal(f.adopted[0][0],selected);assert.equal(f.adopted[0][1],wallet);
});

test('simultaneous restoration requests share one account and chain read',async()=>{
  const f=mainRestore(fixture()),selected=provider({isRabby:true});f.announce(selected);
  const first=f.context.restoreSharedWallet(),second=f.context.restoreSharedWallet();
  assert.equal(await f.settle(first),true);assert.equal(await f.settle(second),true);
  assert.deepEqual(selected.calls,['eth_accounts','eth_chainId']);assert.equal(f.connected.length,1);assert.equal(f.adopted.length,1);
});

test('provider discovery retries when the remembered wallet injects after the first discovery pass',async()=>{
  const f=fixture(),selected=provider({isRabby:true});let requests=0;
  f.window.addEventListener('eip6963:requestProvider',()=>{requests++;if(requests===2)f.announce(selected);});
  assert.equal(await f.settle(f.api.getRememberedProvider()),selected);
  assert.ok(requests>=2);assert.deepEqual(selected.calls,[],'discovery alone must never open the wallet');
});

test('a successful selected-provider update persists its identity and explicit disconnect clears it',async()=>{
  const f=fixture({remembered:''}),selected=provider({isRabby:true});f.announce(selected);
  await f.settle(f.api.setActiveProvider(selected));
  assert.equal(f.stored.get(providerKey),'rabby');assert.equal(f.api.getActiveProvider(),selected);
  const before=f.api.getConnectionVersion();f.api.clearRememberedProvider();
  assert.equal(f.api.getActiveProvider(),null);assert.equal(f.stored.has(providerKey),false);assert.ok(f.api.getConnectionVersion()>before);
  assert.equal(await f.settle(f.api.getRememberedProvider()),null);
});

test('an explicit disconnect prevents a late discovery result from reactivating the wallet',async()=>{
  const f=mainRestore(fixture()),selected=provider({isRabby:true});
  const restoring=f.context.restoreSharedWallet();f.api.clearRememberedProvider();f.announce(selected);
  assert.equal(await f.settle(restoring),false);assert.equal(f.context.wAddr,null);assert.equal(f.api.getActiveProvider(),null);assert.equal(f.connected.length,0);
});

test('disconnect while account authorization is being read cancels late adoption',async()=>{
  const pending=deferred(),selected=provider({isRabby:true});
  selected.request=async({method})=>{selected.calls.push(method);return method==='eth_accounts'?pending.promise:'0x171';};
  const f=mainRestore(fixture());f.announce(selected);
  const restoring=f.context.restoreSharedWallet();
  for(let step=0;!selected.calls.length&&step<20;step++){
    await new Promise(setImmediate);for(const [id,timer] of [...f.timers]){f.timers.delete(id);timer.callback();}
  }
  assert.ok(selected.calls.includes('eth_accounts'));f.api.clearRememberedProvider();pending.resolve([wallet]);
  assert.equal(await f.settle(restoring),false);assert.equal(f.context.wAddr,null);assert.equal(f.connected.length,0);assert.equal(f.adopted.length,0);
});

for(const scenario of [{name:'wrong chain',accounts:[wallet],chain:'0x1'},{name:'locked or unauthorized wallet',accounts:[],chain:'0x171'}]){
  test(`${scenario.name} does not restore an account or request new authorization`,async()=>{
    const f=mainRestore(fixture()),selected=provider({...scenario,isRabby:true});f.announce(selected);
    assert.equal(await f.settle(f.context.restoreSharedWallet()),false);
    assert.equal(f.context.wAddr,null);assert.equal(f.context.wProvider,null);assert.equal(f.context.walletProvider,null);
    assert.equal(f.connected.length,0);assert.equal(f.adopted.length,0);assert.ok(selected.calls.every(method=>['eth_accounts','eth_chainId'].includes(method)));
  });
}

test('missing remembered connection leaves an authorized default wallet disconnected',async()=>{
  const f=mainRestore(fixture({remembered:''}));
  assert.equal(await f.settle(f.context.restoreSharedWallet()),false);assert.deepEqual(f.window.ethereum.calls,[]);assert.equal(f.context.wAddr,null);
});

test('provider events follow only the selected wallet and are removed on explicit disconnect',()=>{
  function eventProvider(options){
    const selected=provider(options),listeners=new Map();
    selected.on=(event,callback)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(callback);};
    selected.removeListener=(event,callback)=>listeners.get(event)?.delete(callback);
    selected.emit=event=>{for(const callback of [...(listeners.get(event)||[])])callback();};
    selected.listenerCount=()=>[...listeners.values()].reduce((sum,set)=>sum+set.size,0);
    return selected;
  }
  const f=fixture({remembered:''}),first=eventProvider({isRabby:true}),second=eventProvider({isMetaMask:true}),events=[];
  f.window.handleSharedWalletProviderChange=(selected,event)=>events.push([selected,event]);
  f.api.setActiveProvider(first);assert.equal(first.listenerCount(),3);
  first.emit('accountsChanged');assert.deepEqual(events,[[first,'accountsChanged']]);
  f.api.setActiveProvider(second);assert.equal(first.listenerCount(),0);assert.equal(second.listenerCount(),3);
  first.emit('accountsChanged');assert.equal(events.length,1,'an unselected wallet must not change this connection');
  second.emit('chainChanged');assert.deepEqual(events[1],[second,'chainChanged']);
  f.api.clearRememberedProvider();assert.equal(second.listenerCount(),0);
  second.emit('accountsChanged');assert.equal(events.length,2,'explicit disconnect must leave no live provider callbacks');
});

test('Farms initialization adopts shared silent restoration once and never probes the wrong default wallet',async()=>{
  const f=mainRestore(fixture()),selected=provider({isRabby:true});f.announce(selected);let farmConnections=0,disconnected=0;
  const farms=vm.createContext({window:f.window,farmsInitialized:false,wProvider:null,wAddr:null,walletProvider:null,farmProductView:'farms',
    ethers:f.context.ethers,PULSE_ID:369,renderFarmRankings(){},renderPlaceholderFarms(){},fetchVaults(){},
    showDisconnected(){disconnected++;},onConnected(){farmConnections++;},console
  });
  const farmStart=html.indexOf('window.FarmsApp =');
  vm.runInContext(source('restoreWallet',farmStart),farms);vm.runInContext(source('init',farmStart),farms);
  f.window.FarmsApp={restoreWallet:farms.restoreWallet};
  await f.settle(farms.init());
  assert.equal(farms.wAddr,wallet);assert.equal(farms.walletProvider,selected);assert.equal(farmConnections,1);assert.equal(disconnected,0);
  await f.settle(farms.init());assert.equal(farmConnections,1,'selecting Farms again must not restore or initialize twice');
  assert.deepEqual(f.window.ethereum.calls,[]);assert.deepEqual(selected.calls,['eth_accounts','eth_chainId']);
});

test('a wallet restored before opening Farms is reused without another connection read',async()=>{
  const f=mainRestore(fixture()),selected=provider({isRabby:true});f.announce(selected);let farmConnections=0;
  const farms=vm.createContext({window:f.window,farmsInitialized:false,wProvider:null,wAddr:null,walletProvider:null,farmProductView:'farms',
    ethers:f.context.ethers,PULSE_ID:369,renderFarmRankings(){},renderPlaceholderFarms(){},fetchVaults(){},
    showDisconnected(){assert.fail('the already restored wallet must remain connected');},onConnected(){farmConnections++;},console
  });
  const farmStart=html.indexOf('window.FarmsApp =');
  vm.runInContext(source('restoreWallet',farmStart),farms);vm.runInContext(source('init',farmStart),farms);
  f.window.FarmsApp={restoreWallet:farms.restoreWallet};
  assert.equal(await f.settle(f.context.restoreSharedWallet()),true);assert.equal(farmConnections,0);
  await f.settle(farms.init());assert.equal(farmConnections,1);assert.equal(farms.wAddr,wallet);
  assert.deepEqual(selected.calls,['eth_accounts','eth_chainId']);
});
