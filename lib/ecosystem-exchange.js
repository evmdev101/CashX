/* Native Limited Exchange integration.
 * ABI, deployed pools and split: evmdev101/Limited-Exchange app/page.tsx
 * (blob 5f1c058590ed73ed2c2ca4e87224b02cb095beee), and
 * contracts/deployment/pulsechain-pools.json (37d7a54319fc5c1894243f92c86943ef6501bd20).
 * This integration reads live activation/paused state; it never assumes activation.
 */
(function(root) {
  'use strict';
  const POOLS = [
    {key:'cashx',symbol:'CASHX',limited:'LCASHX',logo:'cashx-logo.png',token:'0x510c547318032275e41D1362A465783320d8152f',output:'0x57cBC908078b291117242385Fe7C0cf3582fA460',exchange:'0xE346B08433BE131A7964a7e1F46c6fC28eC69003'},
    {key:'distrox',symbol:'DISTROX',limited:'LDISTROX',logo:'distrox.jpg',token:'0xec03E43e21B337F60F6a63944bC7b61B531c035F',output:'0xfC961146971679Cc4E731F60D72B60eb3dd8b036',exchange:'0x3EbC49f2e89260655D957774E73440e20e942934'},
    {key:'divx',symbol:'DIVX',limited:'LDIVX',logo:'divx.png',token:'0xB528AFfc72Dfc7Da5d3184C4e233Fc9fc156c4E0',output:'0x8DbD0923c0c2dd4973806B655036251610aE11BC',exchange:'0x2b199B79E84f74e06c1E08baf92249Be4003EBa0'},
    {key:'gsx',symbol:'GSX',limited:'LGSX',logo:'gsx.png',token:'0xFA490c52FD934c7b8629E30Ea4c14683ee000b5d',output:'0xCc6A42F028905096c76E5631aed78e20f5CDDFBa',exchange:'0x9548c4b026b5B4026C60edd39D17D72EABa97093'}
  ];
  const TOKEN_ABI=['function decimals() view returns (uint8)','function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)','function minter() view returns (address)'];
  const EXCHANGE_ABI=['function paused() view returns (bool)','function quotePlsOut(uint256) view returns (uint256)','function burnAndMint(uint256,uint256)','function totalBurned() view returns (uint256)','function totalLimitedMintedToUsers() view returns (uint256)','function totalPlsToTreasury() view returns (uint256)','function exchangeCount() view returns (uint256)'];
  function parseAmount(text,decimals=18) {
    if (!/^\d+(\.\d+)?$/.test(String(text).trim())) throw new Error('Enter a positive token amount using numbers and a decimal point.');
    const [whole,fraction='']=String(text).trim().split('.');
    if (fraction.length>decimals) throw new Error(`Use no more than ${decimals} decimal places.`);
    const amount=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');
    if (amount<=0n) throw new Error('Enter an amount greater than zero.');
    return amount;
  }
  function minimumOutput(quote,percent) {
    if (!Number.isInteger(percent)||percent<1||percent>15) throw new Error('Choose a treasury swap tolerance between 1% and 15%.');
    const minimum=BigInt(quote)*BigInt(100-percent)/100n;
    if (minimum<=0n) throw new Error('The current treasury swap quote is too small.');
    return minimum;
  }
  function validatePool(pool,minter,paused) {
    if (String(minter).toLowerCase()!==pool.exchange.toLowerCase()) throw new Error(`The ${pool.limited} exchange is awaiting minter activation.`);
    if (paused) throw new Error(`The ${pool.limited} exchange is paused.`);
  }
  async function locateSubmission(record,rpc) {
    if(!Number.isInteger(record.nonce)||!Number.isInteger(record.block)||!record.to||!record.data)return null;
    const head=await rpc.getBlockNumber(),last=Math.min(head,record.block+19);
    // Before a hash is returned the checkpoint nonce is only a hint: the wallet
    // may choose another nonce. An unrelated transaction cannot cancel that work.
    for(let block=record.block;block<=last;block++) {
      const data=await rpc.getBlock(block,true);if(!data)break;
      for(const tx of data.prefetchedTransactions)if(String(tx.from).toLowerCase()===record.wallet) {
        const matches=String(tx.to).toLowerCase()===record.to&&String(tx.data).toLowerCase()===record.data&&String(tx.value)===String(record.value);
        if(matches&&(!record.nonceKnown||tx.nonce===record.nonce))return{hash:tx.hash,nonce:tx.nonce};
        if(record.nonceKnown&&tx.nonce===record.nonce)return{hash:tx.hash,cancelled:true};
      }
      record.block=block+1;
    }
    return null;
  }
  if (typeof module!=='undefined'&&module.exports) {module.exports={POOLS,parseAmount,minimumOutput,validatePool,locateSubmission};return;}
  const ethers=root.ethers;
  const $=id=>document.getElementById(id);
  const esc=text=>String(text??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let provider,tracker,mounted=false,active=false,serial=0,selected='cashx',snapshot=null,busy=false,refreshTimer;
  const currentPool=()=>POOLS.find(p=>p.key===selected);
  const wallet=()=>String(root.sharedWalletAddr||'').toLowerCase();
  const reader=()=>provider||(provider=new ethers.JsonRpcProvider('https://rpc.pulsechain.com',369));
  const qty=value=>Number(ethers.formatUnits(value,18)).toLocaleString('en-US',{maximumFractionDigits:6});
  const short=address=>address.slice(0,6)+'…'+address.slice(-4);
  function status(message,hash) {
    const node=$('ex-status');if(!node)return;
    node.textContent=message;
    if (/^0x[0-9a-f]{64}$/i.test(hash||'')) {const link=document.createElement('a');link.href='https://scan.pulsechain.com/tx/'+hash;link.target='_blank';link.rel='noopener';link.textContent=' View transaction ↗';node.append(link);}
  }
  function pending() {return tracker?.pending().some(r=>r.wallet===wallet()&&r.target===selected)||false;}
  function controls() {
    if(!mounted)return;
    const locked=busy||pending();
    $('ex-pool').disabled=locked;$('ex-amount').disabled=locked;$('ex-slippage').disabled=locked;$('ex-max').disabled=locked||!snapshot?.wallet;
    $('ex-submit').disabled=locked||Boolean(wallet()&&!snapshot?.ready);
    $('ex-submit').textContent=locked?'Transaction in progress…':!wallet()?'Connect Wallet':snapshot?.ready?'Approve & exchange':'Exchange unavailable';
    $('ex-output-symbol').textContent=currentPool().limited;
    try {$('ex-output').textContent=ethers.formatUnits(parseAmount($('ex-amount').value),18);}catch(_){$('ex-output').textContent='0';}
  }
  function ensureTracker() {
    if(tracker)return;
    // Isolate storage from the existing farms tracker, which owns its own saved records.
    const storage={getItem:()=>{try{return localStorage.getItem('cashx:exchange:pending:v1');}catch(_){return null;}},setItem:(_,value)=>{try{localStorage.setItem('cashx:exchange:pending:v1',value);}catch(_){}}};
    tracker=root.SiteTransactions.createTracker({storage,readReceipt:r=>reader().getTransactionReceipt(r.hash),
      locateTransaction:r=>locateSubmission(r,reader()),
      onChange:r=>{if(r.wallet===wallet()&&r.target===selected){controls();if(['pending','uncertain'].includes(r.phase))status(r.phase==='uncertain'?'Checking the submission. Please wait before trying again.':'Submitted; waiting for confirmation.',r.hash);}},
      onSettled:r=>{if(r.wallet===wallet()&&r.target===selected){status(r.phase==='confirmed'?'Transaction confirmed.':r.phase==='cancelled'?'Transaction cancelled in wallet.':'Transaction reverted.',r.hash);if(active)refresh();}}
    });tracker.resume();
  }
  function mount() {
    if(mounted)return;
    const host=$('exchange-content');if(!host)return;
    host.innerHTML=`<div class="ex-layout"><section class="ex-trade"><div class="ex-eyebrow">LIMITED EXCHANGE · PULSECHAIN</div><h2>Original in.<br>Limited out.</h2><p class="ex-intro">Exchange ecosystem tokens for their limited editions at a 1:1 rate.</p>
      <label class="ex-label" for="ex-pool">Choose a token</label><select id="ex-pool">${POOLS.map(p=>`<option value="${p.key}">${p.symbol} → ${p.limited}</option>`).join('')}</select>
      <div class="ex-amount-box"><div class="ex-field-head"><label for="ex-amount">You exchange</label><button id="ex-max" type="button">Max</button></div><input id="ex-amount" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-describedby="ex-balance"><div id="ex-balance" class="ex-note">Connect a wallet to view your balance.</div></div>
      <div class="ex-direction" aria-hidden="true">↓</div><div class="ex-receive"><span>You receive</span><strong id="ex-output">0</strong><b id="ex-output-symbol">LCASHX</b><small id="ex-limited-balance">1 original token = 1 limited token</small></div>
      <div class="ex-tolerance"><label for="ex-slippage">Treasury swap tolerance</label><select id="ex-slippage"><option value="1">1%</option><option value="3">3%</option><option value="5">5%</option><option value="10">10%</option><option value="15" selected>15% (original setting)</option></select></div><p class="ex-note">This applies to the 20% swapped to PLS. Your limited-token mint remains 1:1. A higher tolerance accepts a lower PLS return to the treasury.</p>
      <button class="ex-primary" id="ex-submit" type="button">Connect Wallet</button><p class="ex-status" id="ex-status" role="status" aria-live="polite">Loading the selected exchange…</p></section>
      <aside class="ex-details"><section class="ex-card"><h3>Where your tokens go</h3><div class="ex-split"><span style="width:80%"></span><span style="width:20%"></span></div><div class="ex-split-row"><b>80%</b><span>Burned from the original supply</span></div><div class="ex-split-row"><b>20%</b><span>Swapped to PLS for the exchange treasury</span></div><p class="ex-note">You receive an equal amount of limited tokens. An additional 5% limited-token allocation is minted to management.</p></section>
      <section class="ex-card"><div class="ex-card-head"><h3>Selected exchange</h3><button id="ex-refresh" type="button">Refresh</button></div><div id="ex-pool-state" class="ex-state">Checking availability…</div><dl class="ex-stats"><div><dt>Original tokens burned</dt><dd id="ex-burned">—</dd></div><div><dt>Limited tokens minted to users</dt><dd id="ex-minted">—</dd></div><div><dt>PLS sent to treasury</dt><dd id="ex-treasury">—</dd></div><div><dt>Completed exchanges</dt><dd id="ex-count">—</dd></div></dl><p id="ex-updated" class="ex-note">Live contract reads load when you open this tool.</p></section>
      <details class="ex-card"><summary>Contracts & source</summary><div id="ex-contracts" class="ex-contracts"></div><a href="https://github.com/evmdev101/Limited-Exchange/blob/main/contracts/deployment/pulsechain-pools.json" target="_blank" rel="noopener">Original deployment configuration ↗</a></details></aside></div>`;
    mounted=true;
    $('ex-pool').addEventListener('change',()=>{selected=$('ex-pool').value;snapshot=null;$('ex-amount').value='';controls();refresh();});
    $('ex-amount').addEventListener('input',controls);
    $('ex-max').addEventListener('click',()=>{if(snapshot?.wallet===wallet())$('ex-amount').value=ethers.formatUnits(snapshot.balance,18);controls();});
    $('ex-refresh').addEventListener('click',()=>refresh());$('ex-submit').addEventListener('click',submit);
    const changed=()=>{snapshot=null;controls();if(active)refresh();};
    root.addEventListener('cashx-wallet-change',changed);
  }
  async function refresh(preserveStatus=false) {
    if(!mounted||!active)return;
    const id=++serial,pool=currentPool(),account=wallet();snapshot=null;controls();
    $('ex-pool-state').textContent='Checking availability…';
    for(const key of ['burned','minted','treasury','count'])$('ex-'+key).textContent='—';
    $('ex-balance').textContent=account?'Loading wallet balance…':'Connect a wallet to view your balance.';
    $('ex-limited-balance').textContent='1 original token = 1 limited token';
    $('ex-contracts').innerHTML=[['Original token',pool.token],['Limited token',pool.output],['Exchange',pool.exchange]].map(([name,address])=>`<a href="https://scan.pulsechain.com/address/${address}" target="_blank" rel="noopener"><span>${name}</span><code>${esc(short(address))} ↗</code></a>`).join('');
    try {
      const token=new ethers.Contract(pool.token,TOKEN_ABI,reader()),limited=new ethers.Contract(pool.output,TOKEN_ABI,reader()),exchange=new ethers.Contract(pool.exchange,EXCHANGE_ABI,reader());
      const [minter,paused,decimals,outDecimals,balance,limitedBalance,burned,minted,treasury,count]=await Promise.all([limited.minter(),exchange.paused(),token.decimals(),limited.decimals(),account?token.balanceOf(account):0n,account?limited.balanceOf(account):0n,exchange.totalBurned(),exchange.totalLimitedMintedToUsers(),exchange.totalPlsToTreasury(),exchange.exchangeCount()]);
      if(id!==serial||pool.key!==selected||account!==wallet()||!active)return;
      if(Number(decimals)!==18||Number(outDecimals)!==18)throw new Error('The token decimals differ from the original deployment. Exchange disabled.');
      let issue='';try{validatePool(pool,minter,paused);}catch(e){issue=e.message;}
      snapshot={ready:!issue,balance,limitedBalance,wallet:account,at:Date.now()};
      $('ex-pool-state').textContent=issue||'Active · 1:1 mint';
      $('ex-balance').textContent=account?`Balance: ${qty(balance)} ${pool.symbol}`:'Connect a wallet to view your balance.';
      $('ex-limited-balance').textContent=account?`Your limited balance: ${qty(limitedBalance)} ${pool.limited}`:'1 original token = 1 limited token';
      $('ex-burned').textContent=qty(burned)+' '+pool.symbol;$('ex-minted').textContent=qty(minted)+' '+pool.limited;$('ex-treasury').textContent=qty(treasury)+' PLS';$('ex-count').textContent=count.toLocaleString();
      $('ex-updated').textContent='Updated '+new Date().toLocaleTimeString();
      if(!preserveStatus&&!busy&&!pending())status(issue||'Ready. Review the token split before exchanging.');
    } catch(e) {
      if(id!==serial||!active)return;snapshot=null;$('ex-pool-state').textContent='Live data unavailable';$('ex-balance').textContent='Wallet balance unavailable.';$('ex-updated').textContent='Unable to read this exchange. Use Refresh to retry.';if(!preserveStatus&&!busy&&!pending())status(e?.shortMessage||e?.message||'Unable to read the exchange.');
    } finally {if(id===serial)controls();}
  }
  function describeFailure(error) {
    if(root.SiteTransactions.cancelled(error))return 'Cancelled in wallet.';
    const blob=String(error?.shortMessage||error?.message||'')+' '+JSON.stringify(error?.data||'');
    const reasons={'0x3c5583b1':'Reflection balances changed during the trade. Refresh and try again.','0x538c0ddb':'The original burn differed from the expected amount. Refresh and try again.','0x09b0df66':'The original supply changed during the trade. Refresh and try again.','0x81397d17':'The router could not spend the expected allowance. Refresh and try again.','0x3848b495':'The original balance changed during the treasury swap. Refresh and try again.','0x780a55f6':'The treasury swap output fell below the allowed minimum. Refresh and try again.','0x0af46499':'The limited-token exchange has not been activated.','0xd93c0665':'This exchange is paused.','0xc2f5625a':'The amount is too small for the exchange split.','0x501e45b2':'The treasury swap quote is empty.'};
    return Object.entries(reasons).find(([code])=>blob.includes(code))?.[1]||error?.shortMessage||error?.message||'Unable to complete the exchange.';
  }
  async function submit() {
    if(busy||pending())return;
    if(!wallet()){await root.connectWallet?.();if(active)refresh();return;}
    const pool=currentPool(),account=wallet(),injected=root.CashXWallets?.getActiveProvider?.();
    if(!injected){status('Connect your wallet using the site wallet button.');return;}
    busy=true;controls();
    try {
      const amount=parseAmount($('ex-amount').value),tolerance=Number($('ex-slippage').value);
      minimumOutput(100n,tolerance);
      const browser=new ethers.BrowserProvider(injected);
      async function assertCurrent() {
        const [accounts,chain]=await Promise.all([injected.request({method:'eth_accounts'}),injected.request({method:'eth_chainId'})]);
        if(wallet()!==account||root.CashXWallets?.getActiveProvider?.()!==injected||accounts[0]?.toLowerCase()!==account)throw new Error('Wallet changed. Review the exchange again.');
        if(Number(chain)!==369)throw new Error('Switch your wallet to PulseChain before exchanging.');
      }
      await assertCurrent();
      const signer=await browser.getSigner(account),token=new ethers.Contract(pool.token,TOKEN_ABI,signer),limited=new ethers.Contract(pool.output,TOKEN_ABI,reader()),exchange=new ethers.Contract(pool.exchange,EXCHANGE_ABI,signer);
      async function preflight() {
        await assertCurrent();
        const [minter,paused,balance]=await Promise.all([limited.minter(),exchange.paused(),token.balanceOf(account)]);
        validatePool(pool,minter,paused);if(balance<amount)throw new Error('Your original-token balance is below the exchange amount.');
      }
      await preflight();
      await tracker.run({keys:[`369:${account}:exchange:${pool.key}:mint`],wallet:account,chainId:369,kind:'exchange',target:pool.key,action:'mint',assertCurrent,
        checkpoint:async()=>{const [nonce,block]=await Promise.all([reader().getTransactionCount(account,'pending'),reader().getBlockNumber()]);return{nonce,block};}},async context=>{
        const allowance=await token.allowance(account,pool.exchange);
        if(allowance<amount) {
          status(`Approve exactly ${ethers.formatUnits(amount,18)} ${pool.symbol} in your wallet.`);
          const gas=await token.approve.estimateGas(pool.exchange,amount);
          await context.send(token,'approve',[pool.exchange,amount,{gasLimit:gas*2n<400000n?400000n:gas*2n}]);await context.wait();
        }
        await preflight();
        // Quote again after approval; the original deployment uses a PLS minimum.
        const quote=await exchange.quotePlsOut(amount),minimum=minimumOutput(quote,tolerance);
        if(await token.allowance(account,pool.exchange)<amount)throw new Error('The token approval is not available yet. Refresh and try again.');
        const estimate=await exchange.burnAndMint.estimateGas(amount,minimum);
        const gas=estimate*3n<4000000n?4000000n:estimate*3n;
        if(gas>20000000n)throw new Error('The current exchange gas estimate is unusually high. Refresh and try again.');
        status(`Confirm ${pool.symbol} → ${pool.limited} in your wallet.`);
        await context.send(exchange,'burnAndMint',[amount,minimum,{gasLimit:gas}]);await context.wait();
        if(account===wallet()&&selected===pool.key){$('ex-amount').value='';status(`${pool.limited} mint confirmed.`);}
      });
    } catch(e) {status(describeFailure(e));}
    finally {busy=false;controls();if(active)await refresh(true);}
  }
  root.EcosystemExchange={
    init(){mount();if(!mounted)return;active=true;ensureTracker();refresh();clearInterval(refreshTimer);let lastWallet=wallet();refreshTimer=setInterval(()=>{if(!active)return;if(lastWallet!==wallet()){lastWallet=wallet();refresh();}},2000);},
    deactivate(){active=false;serial++;clearInterval(refreshTimer);},pools:POOLS
  };
})(typeof window==='undefined'?globalThis:window);
