/* Same-origin bridge: originals share the selected wallet; reads never prompt. */
(() => {
  if (parent === window || !parent.CashXWallets) return;
  const host=parent;
  const listeners=new Map(), subscribers=new Set();
  const address=()=>host.sharedWalletAddr||'';
  const provider=()=>host.CashXWallets.getActiveProvider();
  async function connect(){
    if(!address()) await host.connectWallet();
    const selected=provider();
    if(!selected||!address()) throw new Error('Connect your wallet to continue.');
    return proxy;
  }
  const proxy={
    async request(args){
      if(args.method==='eth_accounts')return address()?[address()]:[];
      if(args.method==='eth_requestAccounts'){await connect();return[address()];}
      const selected=provider();if(!selected)throw new Error('Connect your wallet to continue.');
      return selected.request(args);
    },
    on(event,fn){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(fn);return proxy;},
    removeListener(event,fn){listeners.get(event)?.delete(fn);return proxy;}
  };
  // Do not overwrite window.ethereum: extensions may own a non-configurable property.
  window.cashxHost={address,connect,provider:proxy,subscribe(fn){subscribers.add(fn);void fn();return()=>subscribers.delete(fn);}};
  let previous=address(),previousProvider=provider();
  const emit=(name,value)=>listeners.get(name)?.forEach(fn=>fn(value));
  let chainProvider;
  const chainChanged=value=>emit('chainChanged',value);
  setInterval(()=>{
    const next=address(),nextProvider=provider();
    if(nextProvider!==chainProvider){chainProvider?.removeListener?.('chainChanged',chainChanged);chainProvider=nextProvider;chainProvider?.on?.('chainChanged',chainChanged);}
    if(next!==previous||nextProvider!==previousProvider){previous=next;previousProvider=nextProvider;emit('accountsChanged',next?[next]:[]);subscribers.forEach(fn=>void fn());}
  },1000);
  // Shared controls live in the host; NFT collection tabs float over the app background.
  const css=document.createElement('style');
  css.textContent=`.topbar{position:sticky!important;top:0!important;min-height:54px!important;height:54px!important;grid-template-columns:1fr!important;padding:6px 16px!important}.topbar>.nav-left,.topbar>.nav-right,.topbar>.nav-actions{display:none!important}.topbar>.nav-center{grid-row:1!important;grid-column:1!important;justify-self:center!important}.cx-nav{position:sticky!important;top:0!important;min-height:54px!important;height:54px!important;padding:6px 16px!important;justify-content:center!important}.cx-nav>.cx-nav-left,.cx-nav>.cx-nav-right{display:none!important}.cx-nav+main{padding-top:20px!important}`;
  document.head.append(css);
  // Embedded NFT and exchange apps use the same neutral controls as the host.
  const controls=document.createElement('link');
  controls.rel='stylesheet';
  controls.href='../../styles/neutral-controls.css?v=20261109-neutral';
  document.head.append(controls);
  css.textContent+='html,body{max-width:100%;overflow-x:clip}';
  if (/\/tools\/(cashx-nft|cashmoney)\//.test(window.location?.pathname || '')) css.textContent+='body{padding-top:60px!important;box-sizing:border-box}';
  function syncTheme(){
    const selected=host.getComputedStyle(host.document.body);
    for(const [key,shared] of Object.entries({bg:'bg',fg:'text',panel:'panel',border:'border',red:'accent'})){
      const value=selected.getPropertyValue('--farm-theme-'+shared).trim();
      if(value&&document.documentElement.style.getPropertyValue('--'+key)!==value)document.documentElement.style.setProperty('--'+key,value);
    }
  }
  host.addEventListener('cashx-theme-change',syncTheme);
  new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['style']});
  syncTheme();
})();
