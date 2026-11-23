/* New tools are separate views. Their code and public reads start on first open. */
(() => {
  'use strict';
  const entries={exchange:{id:'exchange',module:'exchange',app:'EcosystemExchange',title:'Limited Exchange'},nfts:{id:'nfts',module:'nfts',app:'EcosystemNFTs',title:'NFT collections'}};
  const loading=new Map();
  let current=null,walletTimer;
  function syncWallets(){
    const wallet=window.sharedWalletAddr;
    document.querySelectorAll('[data-ecosystem-wallet]').forEach(button=>{
      button.textContent=wallet?wallet.slice(0,6)+'…'+wallet.slice(-4):'Connect Wallet';
      button.setAttribute('aria-label',wallet?'My Wallet':'Connect Wallet');
    });
  }
  Object.values(entries).forEach(entry=>{
    const view=document.createElement('div');view.id=entry.id+'-view';view.className='page-view ecosystem-view';view.hidden=true;
    const nav=document.querySelector('#home-view > nav').cloneNode(true);
    nav.classList.add('dashboard-nav');nav.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    nav.querySelector('.h-wallet-chip')?.remove();
    const wallet=nav.querySelector('.nav-dash-btn');wallet.dataset.ecosystemWallet='';wallet.removeAttribute('onclick');
    wallet.addEventListener('click',async()=>{if(window.sharedWalletAddr)showWalletActions('main');else await connectWallet();syncWallets();});
    view.append(nav);
    const main=document.createElement('main');main.className='ecosystem-main';main.id=entry.id+'-content';
    main.innerHTML='<p class="eco-note" role="status">Open this tab to load its tools.</p>';view.append(main);document.body.append(view);
  });
  function load(entry){
    if(!loading.has('originals'))loading.set('originals',new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='./lib/original-sites.js?v=20261103-cashx-nft-label';
      script.onload=()=>resolve();script.onerror=()=>{script.remove();loading.delete('originals');reject(Error('Unable to load tool'));};document.head.append(script);
    }));
    return loading.get('originals');
  }
  async function activate(page){
    current=page;clearInterval(walletTimer);syncWallets();
    Object.entries(entries).forEach(([key,entry])=>{if(key!==page)window[entry.app]?.deactivate?.();});
    const entry=entries[page];if(!entry)return;
    walletTimer=setInterval(()=>{if(!document.hidden)syncWallets();},1000);
    try {await load(entry);if(current===page)window.OriginalSites.init(page);}
    catch(error){
      const main=document.getElementById(entry.id+'-content');
      main.innerHTML='<section class="eco-panel"><h1>Tool unavailable</h1><p class="eco-note">This tool could not load. Your other tabs are still available.</p><button class="eco-button" type="button">Try again</button></section>';
      main.querySelector('button').addEventListener('click',()=>activate(page));
    }
  }
  window.EcosystemShell={activate};
})();
