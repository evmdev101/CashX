(() => {
  'use strict';
  const order=['cashx','distrox','gsx','divx','burnx'];
  const tokens=[...window.ReflectionApp.tokens].sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
  const model=window.PortfolioModel;
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const quantity=value=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:value>0&&value<.001?10:4}):'\u2014';
  const money=value=>!Number.isFinite(value)?'\u2014':value>0&&value<.01?'<$0.01':value.toLocaleString('en-US',{style:'currency',currency:'USD'});
  const valueOf=(amount,price)=>amount===0?0:price>0?amount*price:null;
  const node=id=>document.getElementById(id);
  const contracts={farm:'0x961130836e52215f3A26f30994b025B4ecDB73ba',vault:'0x71240Fac3426AC8323871bA2Da765952A9272039',nft:'0x7de1824210c65973bc5C380785C81128834DD08e'};
  // Verified poolInfo(0).startTime: April 15, 2026, 12:39:05 UTC.
  const FARM_HISTORY_START=1776256745000;
  let rows=tokens,positions=[],failures=[],farmTokens=[],activity=[],snapshots=[],scanId=0,loadedWallet='',historyCursor=null,pageCursor=0,chartPromise,historyController;
  let historyPages=0,scannedTransfers=0;
  let positionsReady=false,historyBusy=false,historyDone=false,historyAsOf=0;
  let observationBusy=false;
  let farmHistory=[],farmHistoryBlock=-1,farmHistoryBusy=false,farmHistoryStatus='',farmHistoryController;
  let rewardSnapshot=null,rewardReady=false,rewardBusy=false,rewardBlock=-1,rewardController;
  let rewardSelection=null;
  const charts={};
  const chartVersions={};
  let rewardPrices=new Map();
  let palette=[];
  let chartMuted,chartBorder;
  const rewardColors={CASHX:'#ffc65c',DISTROX:'#b49aff',DIVX:'#ff965c',GSX:'#65c9ff',BURNX:'#ff7296',INC:'#8ee08d',HEX:'#ed91da',UPLS:'#50dac7',VPLS:'#d8df77',HBR:'#e9b97b'};
  function rewardColor(symbol,index){return rewardColors[String(symbol).toUpperCase()]||['#ffc65c','#b49aff','#65c9ff','#ff965c','#50dac7','#ed91da','#8ee08d','#ff7296','#d8df77','#e9b97b'][index%10];}
  function syncTheme(){
    const style=getComputedStyle(document.body);
    const accent=style.getPropertyValue('--farm-theme-accent').trim();
    const text=style.getPropertyValue('--farm-theme-text').trim();
    const mix=weight=>'#'+[1,3,5].map(offset=>Math.round(parseInt(accent.slice(offset,offset+2),16)*weight+parseInt(text.slice(offset,offset+2),16)*(1-weight)).toString(16).padStart(2,'0')).join('');
    palette=[accent,text,mix(.75),mix(.25),mix(.5)];
    chartMuted=style.getPropertyValue('--farm-theme-muted').trim();
    chartBorder=style.getPropertyValue('--farm-theme-border').trim();
  }
  syncTheme();
  const compact=value=>value>0&&value<1?quantity(value):new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(value);
  const methodNames=Object.fromEntries(['deposit(uint256,uint256)','withdraw(uint256,uint256)','claim(uint256)','claimMany(uint256[])','withdrawAll(uint256)','claimRewards(uint256)'].map(sig=>[ethers.id(sig).slice(0,10),sig.split('(')[0]]));
  document.querySelectorAll('.top-nav').forEach(nav=>{
    const group=document.createElement('div');group.className='top-nav-group';
    group.innerHTML='<button class="nav-tab top-nav-item" data-page-tab="portfolio" onclick="showPage(\'portfolio\')">Portfolio</button>';
    const burns=nav.querySelector('[data-page-tab="dashboard"]')?.closest('.top-nav-group');
    if(burns){
      burns.before(group);
      const reflections=nav.querySelector('[data-page-tab="reflections"]')?.closest('.top-nav-group');
      if(reflections)reflections.before(burns);else nav.append(burns);
    }else nav.append(group);
  });
  const view=document.createElement('div');view.id='portfolio-view';view.className='page-view';view.hidden=true;
  const nav=document.querySelector('#reflections-view>nav').cloneNode(true);
  const navIds={'reflections-wallet-connect-btn':'portfolio-wallet-connect-btn','reflections-wallet-connected-btn':'portfolio-wallet-connected-btn','reflections-wc-addr':'portfolio-wc-addr'};
  nav.querySelectorAll('[id]').forEach(el=>{
    if(navIds[el.id])el.id=navIds[el.id];else el.removeAttribute('id');
  });
  view.append(nav);
  const tokenOptions=tokens.map(t=>`<option value="${t.key}">${t.symbol}</option>`).join('');
  view.insertAdjacentHTML('beforeend',`
    <main class="portfolio-main">
      <div class="pf-kicker">Portfolio</div>
      <p class="pf-intro">Wallet balances, single stakes, farm LP, vaults and rewards across the CashX ecosystem.</p>
      <div hidden>
        <form class="pf-wallet" id="pf-form"><input id="pf-address" aria-label="Portfolio wallet address" placeholder="Connect wallet or enter an address" autocomplete="off" spellcheck="false"><button class="pf-button" id="pf-scan" type="submit">View Portfolio</button><button class="pf-button" id="pf-export" type="button" disabled>Export CSV</button></form>
        <div class="pf-status" id="pf-status" role="status">Connect a wallet or enter an address to view your portfolio.</div>
      </div>
      <section class="pf-frame" aria-label="Portfolio value"><div class="pf-label">PORTFOLIO VALUE <span title="Wallet tokens plus known stakes, farm LP and vault assets. Pending rewards are separate. NFT principal is not priced.">\u24d8</span></div><div class="pf-total" id="pf-total">\u2014</div><div class="pf-breakdown" id="pf-breakdown"></div><p class="pf-note" id="pf-coverage">Pending rewards are separate from the total. LP positions are attributed to deposited ecosystem tokens; NFT principal is not priced.</p></section>
      <section class="pf-frame"><h2>Your portfolio</h2><div class="pf-stats">
        <div class="pf-stat"><span class="pf-label">In wallet</span><strong id="pf-wallet-value">\u2014</strong><small>Five ecosystem tokens</small></div>
        <div class="pf-stat"><span class="pf-label">Staked + farm LP</span><strong id="pf-farm-total">\u2014</strong><small id="pf-farm-count">Single stakes and liquidity positions</small></div>
        <div class="pf-stat"><span class="pf-label">In vaults</span><strong id="pf-vault-total">\u2014</strong><small>Auto-compounded assets</small></div>
        <div class="pf-stat"><span class="pf-label">Unclaimed rewards</span><strong id="pf-reward-total">\u2014</strong><small>Reflections, yield and farm rewards</small></div>
      </div><div class="pf-section-head"><h2>Token positions</h2><a class="pf-link" href="#reflections">Manage reflections + yield \u2192</a></div><div class="pf-scroll"><table class="pf-table"><thead><tr><th>Token</th><th>In wallet</th><th>Price</th><th>Wallet value</th><th>Reflections</th><th>Yield</th></tr></thead><tbody id="pf-positions"></tbody></table></div></section>
      <section class="pf-frame"><div class="pf-section-head"><h2>Farm + vault positions</h2><a class="pf-link" href="#farms">Manage stakes, vaults + claims \u2192</a></div><div class="pf-scroll pf-defi-scroll" tabindex="0" role="region" aria-label="Farm and vault positions"><table class="pf-table"><thead><tr><th>Position</th><th>Amount</th><th>Worth</th><th>Unclaimed</th><th>Reward period</th><th>Withdrawal fee</th></tr></thead><tbody id="pf-defi"></tbody></table></div><p class="pf-note" id="pf-defi-status">Connect a wallet to load positions.</p></section>
      <section class="pf-frame"><div class="pf-section-head"><h2>Position history</h2><select id="pf-history-mode" aria-label="Position history view"><option value="total">Portfolio value</option><option value="wallet">Wallet value</option><option value="farm">Stakes + farm LP</option><option value="vault">Vault assets</option></select></div><p class="pf-note" id="pf-snapshot-note">Observed values saved in this browser while you view this wallet.</p><div class="pf-chart"><canvas id="pf-position-chart" aria-label="Observed portfolio position history" role="img"></canvas><div class="pf-chart-empty" id="pf-position-empty">No observations yet.</div></div></section>
      <section class="pf-frame"><div class="pf-section-head"><h2>Rewards earned</h2><select id="pf-reward-token" aria-label="Rewards chart token"><option value="all">All reward tokens</option>${tokenOptions}</select></div><p class="pf-note">Cumulative claimed rewards, with a separate scale for each token. Dollar values use current prices; unclaimed rewards are tracked separately.</p><div class="pf-reward-totals" id="pf-earned"></div><div class="pf-chart"><canvas id="pf-reward-chart" aria-label="Cumulative recorded reward payouts" role="img"></canvas><div class="pf-chart-empty" id="pf-reward-empty">No recorded payouts loaded.</div></div></section>
      <section class="pf-frame"><div class="pf-section-head"><h2>Your activity</h2><div class="pf-filters"><select id="pf-filter" aria-label="Filter activity by token"><option value="all">All tokens</option>${tokenOptions}<option value="other">LP + other rewards</option></select><select id="pf-category" aria-label="Filter activity by category"><option value="all">All activity</option><option value="wallet">Wallet transfers</option><option value="farm">Stakes + farming</option><option value="vault">Vaults</option><option value="nft">NFT rewards</option><option value="rewards">Token payouts</option></select></div></div><p class="pf-note" id="pf-history-status">Indexed wallet transfers, newest first.</p><div class="pf-scroll"><table class="pf-table"><thead><tr><th>Action</th><th>When</th><th>Token</th><th>Amount</th><th>Transaction</th></tr></thead><tbody id="pf-activity"></tbody></table></div><div class="pf-pagination"><button class="pf-button" id="pf-prev" disabled>Previous</button><span id="pf-page">Page 1</span><button class="pf-button" id="pf-next" disabled>Next</button><button class="pf-button" id="pf-older" disabled>Load older activity</button></div></section>
    </main>`);
  document.body.append(view);
  node('pf-history-mode').innerHTML='<option value="stake">Single stakes</option><option value="vault">Auto-compound vaults</option><option value="farm">Farm LP</option><option value="total">Portfolio value</option>';
  const positionPanels=document.createElement('div');positionPanels.id='pf-position-panels';positionPanels.className='pf-position-panels';positionPanels.hidden=true;
  positionPanels.tabIndex=0;positionPanels.setAttribute('role','region');positionPanels.setAttribute('aria-label','Position history charts');
  node('pf-position-chart').parentElement.after(positionPanels);
  function chartTabs(id,onChange){
    const select=node(id),group=document.createElement('div');
    let value=select.value;
    group.id=id;group.className='pf-chart-tabs';group.setAttribute('role','group');group.setAttribute('aria-label',select.getAttribute('aria-label'));
    [...select.options].forEach(option=>{
      const button=document.createElement('button');button.type='button';button.textContent=option.textContent;button.dataset.value=option.value;
      button.setAttribute('aria-pressed',String(option.value===value));
      button.addEventListener('click',()=>{
        value=option.value;group.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));onChange();
      });
      group.append(button);
    });
    select.replaceWith(group);
    return {value:()=>value,label:()=>group.querySelector('[aria-pressed="true"]').textContent};
  }
  const historyTabs=chartTabs('pf-history-mode',drawPositions);
  node('pf-reward-token').remove();
  node('pf-earned').insertAdjacentHTML('afterend','<div class="pf-reward-controls"><span>Click a token to show or hide its line.</span><button type="button" class="pf-link" id="pf-reward-top">Top 3</button><button type="button" class="pf-link" id="pf-reward-all">Show all</button></div>');
  node('pf-reward-chart').parentElement.classList.add('pf-reward-chart');
  node('pf-reward-top').addEventListener('click',()=>{rewardSelection=null;drawRewards();});
  node('pf-reward-all').addEventListener('click',()=>{rewardSelection=new Set(model.cumulative(rewardSnapshot??activity).map(s=>s.token));drawRewards();});
  ['pf-position-chart','pf-reward-chart'].forEach(id=>{
    const legend=document.createElement('div');legend.id=`${id}-legend`;legend.className='pf-chart-legend';node(id).parentElement.after(legend);
  });
  const earnedStatus=document.createElement('p');earnedStatus.id='pf-earned-status';earnedStatus.className='pf-note';earnedStatus.setAttribute('role','status');node('pf-earned').before(earnedStatus);
  node('pf-older').textContent='Retry history';
  new ResizeObserver(()=>{if(!view.hidden)view.style.setProperty('--pf-nav-height',`${nav.getBoundingClientRect().height}px`);}).observe(nav);

  function render(){
    node('pf-breakdown').innerHTML=rows.map(t=>{
      const valid=t.balance!==undefined&&!t.error;
      const assets=model.allocatedAssets(positions,t.address);
      const value=valid?valueOf(t.balance,t.price):null;
      const reward=valid&&!t.rewardsError?valueOf(t.reflections,t.price):null;
      const yieldValue=valid&&!t.rewardsError?t.yields.reduce((s,y)=>y.value>0&&!y.usdValue?NaN:s+y.usdValue,0):null;
      const line=(label,value)=>`<div class="pf-line"><span>${label}</span><strong>${escape(money(value))}</strong></div>`;
      const vaultRows=assets.filter(p=>p.kind==='vault'&&p.amount>0).map(p=>`<div class="pf-line pf-vault-line"><span>${escape(p.name)}</span><strong>${escape(money(p.value))}</strong></div>`).join('');
      const groupValue=positionsReady&&value!==null&&!assets.some(p=>p.value===null)?value+assets.reduce((s,p)=>s+p.value,0):null;
      const farmRewards=positionsReady&&!failures.length?positions.flatMap(p=>p.kind==='nft'?p.rewards.filter(r=>r.address.toLowerCase()===t.address.toLowerCase()).map(r=>r.value):String(p.rewardToken).toLowerCase()===t.address.toLowerCase()?[p.pendingUsd]:[]).reduce((sum,value)=>Number.isFinite(value)?sum+value:NaN,0):null;
      return `<div class="pf-coin"><div class="pf-coin-head"><span><img src="${t.logo}" alt="">${t.symbol}</span><strong>${escape(money(groupValue))}</strong></div>${line('In wallet',value)}${['stake','farm','vault'].map(kind=>line({stake:'Single stakes',farm:'Staked farm LP',vault:'Auto-compound vaults'}[kind],positionsReady?assets.filter(p=>p.kind===kind).reduce((s,p)=>p.value===null?NaN:s+p.value,0):null)).join('')}${vaultRows}${line('Unclaimed reflections',reward)}${line('Unclaimed yield',yieldValue)}${line('Unclaimed farm rewards',farmRewards)}<div class="pf-coin-amount">${valid?`${quantity(t.balance)} ${t.symbol} in wallet`:t.error?'Read unavailable':'Awaiting wallet'}</div></div>`;
    }).join('');
    const otherAssets=positions.filter(p=>p.kind!=='nft').map(p=>{
      const supportedWeight=(p.allocations||[]).filter(a=>tokens.some(t=>t.address.toLowerCase()===a.address.toLowerCase())).reduce((sum,a)=>sum+a.weight,0);
      return {...p,value:Number.isFinite(p.value)?p.value*Math.max(0,1-supportedWeight):null,unassigned:supportedWeight<1-1e-10};
    }).filter(p=>p.unassigned);
    if(otherAssets.length){
      const otherValue=otherAssets.reduce((sum,p)=>Number.isFinite(p.value)?sum+p.value:NaN,0);
      node('pf-breakdown').innerHTML+=`<div class="pf-coin"><div class="pf-coin-head"><span>Other farm assets</span><strong>${escape(money(otherValue))}</strong></div>${['stake','farm','vault'].map(kind=>`<div class="pf-line"><span>${{stake:'Single stakes',farm:'Staked farm LP',vault:'Auto-compound vaults'}[kind]}</span><strong>${escape(money(otherAssets.filter(p=>p.kind===kind).reduce((sum,p)=>Number.isFinite(p.value)?sum+p.value:NaN,0)))}</strong></div>`).join('')}</div>`;
    }
    node('pf-positions').innerHTML=rows.map(t=>{
      const valid=t.balance!==undefined&&!t.error;
      const price=valid&&t.price>0?'$'+t.price.toLocaleString('en-US',{maximumFractionDigits:10}):'\u2014';
      return `<tr><td><span class="pf-token"><img src="${t.logo}" alt="">${t.symbol}</span><small>${escape(t.name)}</small></td><td>${valid?quantity(t.balance):'\u2014'}</td><td>${escape(price)}</td><td>${escape(money(valid?valueOf(t.balance,t.price):null))}</td><td>${valid&&!t.rewardsError?quantity(t.reflections):'\u2014'}<small>${t.symbol}</small></td><td>${valid&&!t.rewardsError?t.yields.filter(y=>y.value>0).map(y=>`${quantity(y.value)} ${escape(y.symbol)}`).join('<br>')||'0':'\u2014'}</td></tr>`;
    }).join('');
    node('pf-defi').innerHTML=positions.length?positions.map(p=>`<tr><td>${escape(p.name)}<small>${{stake:'Single stake',farm:'Liquidity farm',vault:'Auto-compound vault',nft:'NFT farm'}[p.kind]}</small></td><td>${quantity(p.amount)}<small>${escape(p.symbol)}${p.kind==='vault'?` \u00b7 ${quantity(p.shares)} shares`:''}</small></td><td>${escape(money(p.value))}${p.kind==='vault'?`<small>${quantity(p.ppfs)} assets / share</small>`:''}</td><td>${p.kind==='nft'?p.rewards.map(r=>`${quantity(r.amount)} ${escape(r.symbol)}`).join('<br>'):p.kind==='vault'?'Auto-compounded':`${quantity(p.pending)} ${escape(p.rewardSymbol)}`}<small>${p.kind==='vault'?'Included in assets':escape(money(p.pendingUsd))}</small></td><td>${p.endTime?`${p.endTime*1000<Date.now()?'Ended':'Ends'} ${new Date(p.endTime*1000).toLocaleDateString()}`:'\u2014'}</td><td>${p.fee===undefined?'\u2014':`${p.fee}%`}</td></tr>`).join(''):`<tr><td colspan="6"><div class="pf-empty">${positionsReady?'No active positions found in supported pools.':'Awaiting wallet scan.'}</div></td></tr>`;
    node('pf-defi-status').textContent=failures.length?`${failures.length} reads unavailable. ${failures.slice(0,3).join(' ')}`:positionsReady?`${positions.length} positions. NFT principal is excluded from USD totals.`:'Connect a wallet to load positions.';
    if(!positionsReady&&!rows.some(t=>t.balance!==undefined))return;
    const summary=model.summary(rows,positions,failures);
    node('pf-total').textContent=positionsReady?money(summary.total)+(summary.partial?' (partial)':''):'Loading positions...';
    node('pf-wallet-value').textContent=money(summary.wallet);
    node('pf-farm-total').textContent=positionsReady?money(summary.farm):'\u2014';node('pf-vault-total').textContent=positionsReady?money(summary.vault):'\u2014';
    node('pf-farm-count').textContent=`${summary.active} active farm/stake positions${summary.nfts?` \u00b7 ${summary.nfts} staked NFTs`:''}`;
    const refs=rows.reduce((s,t)=>t.error||t.rewardsError||valueOf(t.reflections,t.price)===null?NaN:s+t.reflections*t.price,0);
    const yields=rows.reduce((s,t)=>t.error||t.rewardsError?NaN:s+t.yields.reduce((sum,y)=>y.value>0&&!y.usdValue?NaN:sum+y.usdValue,0),0);
    const rewardsKnown=positionsReady&&!failures.length&&positions.every(p=>p.kind==='nft'?p.rewards.every(r=>Number.isFinite(r.value)):Number.isFinite(p.pendingUsd));
    node('pf-reward-total').textContent=rewardsKnown?money(refs+yields+summary.pendingFarm):'\u2014';
    node('pf-coverage').textContent=`${positionsReady&&summary.partial?'Partial coverage: some reads or LP allocations are unavailable. ':''}Pending rewards are separate from the total. Full LP value is attributed to its ecosystem token; shared ecosystem pairs are split by reserve value. NFT principal is not priced.`;
  }
  function filteredActivity(){return activity.filter(e=>(node('pf-filter').value==='all'||e.key===node('pf-filter').value)&&(node('pf-category').value==='all'||e.category===node('pf-category').value));}
  function renderActivity(){
    const filtered=filteredActivity();pageCursor=Math.min(pageCursor,Math.max(0,Math.ceil(filtered.length/20)-1));
    node('pf-activity').innerHTML=filtered.length?filtered.slice(pageCursor*20,pageCursor*20+20).map(e=>`<tr><td>${escape(e.direction)}</td><td>${Number.isFinite(e.at)?new Date(e.at).toLocaleString():'\u2014'}</td><td>${escape(e.symbol)}</td><td>${quantity(e.amount)}</td><td><a class="pf-link" href="https://scan.pulsechain.com/tx/${encodeURIComponent(e.hash)}" target="_blank" rel="noopener">View transaction \u2197</a></td></tr>`).join(''):'<tr><td colspan="5"><div class="pf-empty">No matching activity in the loaded history.</div></td></tr>';
    node('pf-page').textContent=`Page ${pageCursor+1} \u00b7 ${filtered.length} events`;
    node('pf-prev').disabled=pageCursor===0;node('pf-next').disabled=(pageCursor+1)*20>=filtered.length;
    node('pf-older').disabled=historyBusy||historyDone||!loadedWallet||!positionsReady;
  }
  async function chartLibrary(){
    if(window.Chart)return;
    if(!chartPromise)chartPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/chart.umd.min.js';script.onload=resolve;script.onerror=()=>{chartPromise=null;reject(Error('Charts unavailable'));};document.head.append(script);});
    await chartPromise;
  }
  async function plot(key,series,emptyId,usd=false){
    const rewardChart=key==='pf-reward-chart';
    const id=scanId,version=chartVersions[key]=(chartVersions[key]||0)+1;node(emptyId).hidden=series.length>0;
    const color=index=>series[index].color||palette[index%palette.length];
    node(`${key}-legend`).innerHTML=series.length?`${key==='pf-reward-chart'?'':'<span class="pf-legend-now">Now</span>'}${series.map((s,index)=>`<span class="pf-legend-item"><i style="background:${color(index)}"></i><span>${escape(s.symbol)}</span><strong>${escape(usd?money(s.points.at(-1).y):quantity(s.total))}</strong></span>`).join('')}`:'';
    if(charts[key]){charts[key].destroy();delete charts[key];}
    if(!series.length)return;
    try{await chartLibrary();}catch(error){node(emptyId).hidden=false;node(emptyId).textContent='Chart could not load. Values remain available above.';return;}
    if(id!==scanId||version!==chartVersions[key])return;
    const datasets=series.map((s,index)=>({label:s.name?`${s.name} (${s.symbol})`:s.symbol,data:s.points,yAxisID:usd?'usd':`axis${index}`,borderColor:color(index),backgroundColor:context=>{
      const {ctx,chartArea}=context.chart;
      if(!chartArea)return 'transparent';
      const gradient=ctx.createLinearGradient(0,chartArea.top,0,chartArea.bottom);
      gradient.addColorStop(0,color(index)+(index===0?(rewardChart?'66':'38'):'08'));
      if(rewardChart&&index===0)gradient.addColorStop(.55,color(index)+'28');
      gradient.addColorStop(1,color(index)+'00');return gradient;
    },borderWidth:rewardChart?3.5:2,borderJoinStyle:'miter',pointRadius:s.points.length===1?4:0,pointHoverRadius:4,pointHitRadius:12,stepped:true,fill:s.color&&index>0?false:'origin'}));
    const times=series.flatMap(s=>s.points.map(p=>p.x));
    const shortRange=Math.max(...times)-Math.min(...times)<86400000;
    const first=Math.min(...times),last=Math.max(...times);
    const scales={x:{type:'linear',min:first===last?first-60000:first,max:first===last?last+60000:last,grid:{display:false},border:{color:chartBorder},ticks:{color:chartMuted,maxTicksLimit:2,maxRotation:0,callback:value=>shortRange?new Date(value).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'})}}};
    datasets.forEach(d=>scales[d.yAxisID]={display:false,beginAtZero:true,grace:rewardChart?'18%':'12%'});
    const valueLabels={id:'portfolioValues',afterDatasetsDraw(chart){
      const {ctx,chartArea}=chart;
      if(!chartArea)return;
      ctx.save();ctx.font=rewardChart?'13px monospace':'11px monospace';ctx.textBaseline='middle';
      const firstScale=chart.scales[datasets[0].yAxisID];
      const peak=Math.max(...series[0].points.map(p=>p.y));
      ctx.fillStyle=series[0].color||chartMuted;ctx.textAlign='right';ctx.fillText(usd?money(peak):compact(peak),chartArea.left-8,firstScale.getPixelForValue(peak));
      const labels=series.slice(1).map((s,index)=>({index:index+1,value:s.points.at(-1).y,y:chart.scales[datasets[index+1].yAxisID].getPixelForValue(s.points.at(-1).y)})).sort((a,b)=>a.y-b.y);
      let previous=chartArea.top-16;
      labels.forEach((label,index)=>{
        label.y=Math.max(previous+16,Math.min(label.y,chartArea.bottom-(labels.length-index-1)*16));previous=label.y;
        ctx.fillStyle=color(label.index);ctx.textAlign='left';ctx.fillText(usd?money(label.value):`${compact(label.value)}${series[label.index].color&&!rewardChart?' '+series[label.index].symbol:''}`,chartArea.right+10,label.y);
      });
      ctx.restore();
    }};
    charts[key]=new Chart(node(key),{type:'line',data:{datasets},plugins:[valueLabels],options:{responsive:true,maintainAspectRatio:false,animation:false,layout:{padding:{top:rewardChart?20:12,left:rewardChart?78:usd?70:62,right:series.length>1?(rewardChart?105:series.some(s=>s.color)?130:90):8}},interaction:{mode:'nearest',intersect:false},scales,plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>new Date(items[0].parsed.x).toLocaleString(),label:item=>`${item.dataset.label}: ${usd?money(item.parsed.y):quantity(item.parsed.y)}`}}}}});
  }
  function drawPositions(){
    const mode=historyTabs.value();
    const panelScrollTop=node('pf-position-panels').scrollTop;
    Object.keys(chartVersions).filter(key=>key.startsWith('pf-pool-chart-')).forEach(key=>{chartVersions[key]++;});
    Object.keys(charts).filter(key=>key.startsWith('pf-pool-chart-')).forEach(key=>{charts[key].destroy();delete charts[key];});
    node('pf-position-panels').innerHTML='';
    const individual=mode!=='total';
    node('pf-position-panels').hidden=!individual;
    node('pf-position-chart').parentElement.hidden=individual;
    node('pf-position-chart-legend').hidden=individual;
    if(individual){
      // Invalidate any pending aggregate chart before replacing it with pool charts.
      chartVersions['pf-position-chart']=(chartVersions['pf-position-chart']||0)+1;
      if(charts['pf-position-chart']){charts['pf-position-chart'].destroy();delete charts['pf-position-chart'];}
      const series=model.backfilledSeries(farmHistory,positions,snapshots,mode);
      node('pf-snapshot-note').textContent=mode==='vault'?'Vault charts use saved readings of underlying assets, including auto-compounding. Earlier vault growth is not available from farm events.':`${farmHistoryStatus||'One chart per position, in its own token units.'} Earlier farm balances are rebuilt from contract events only when they match the live balance.`;
      if(!series.length){node('pf-position-panels').innerHTML=`<div class="pf-empty">${!loadedWallet?'Connect a wallet to view position history.':!positionsReady?'Loading positions...':`No ${mode==='stake'?'single stakes':mode==='vault'?'auto-compound vaults':'farm LP positions'} recorded yet.`}</div>`;return;}
      node('pf-position-panels').innerHTML=series.map((s,index)=>{
        const key=`pf-pool-chart-${index}`;
        return `<section class="pf-position-pool"><div class="pf-pool-head"><span>${escape(s.name)}</span><strong>${escape(quantity(s.total))} ${escape(s.symbol)}<small>${escape(money(s.value))}</small></strong></div><div class="pf-chart pf-pool-chart"><canvas id="${key}" aria-label="${escape(s.name)} balance history" role="img"></canvas><div class="pf-chart-empty" id="${key}-empty" hidden></div></div><div id="${key}-legend" hidden></div></section>`;
      }).join('');
      node('pf-position-panels').scrollTop=panelScrollTop;
      series.forEach((s,index)=>plot(`pf-pool-chart-${index}`,[s],`pf-pool-chart-${index}-empty`));
      return;
    }
    const points=snapshots.filter(p=>Number.isFinite(p[mode])).map(p=>({x:p.at,y:p[mode]}));
    node('pf-position-empty').textContent='No observations yet.';
    node('pf-snapshot-note').textContent=points.length?`${points.length} observed values saved in this browser for this wallet. No readings are collected while the site is closed. ${snapshots.some(p=>p.partial)?'Some observations contain partial totals.':''}`:'Observed values saved in this browser while you view this wallet.';
    plot('pf-position-chart',points.length?[{symbol:historyTabs.label(),points}]:[],'pf-position-empty',true);
  }
  function drawRewards(){
    const earnedActivity=rewardSnapshot??activity;
    const complete=rewardSnapshot!==null?rewardReady:historyDone;
    const busy=rewardBusy||historyBusy;
    const unidentified=earnedActivity.filter(e=>e.direction==='Unclassified farm payout').length;
    const dates=earnedActivity.map(e=>e.at).filter(Number.isFinite);
    const oldest=dates.length?new Date(Math.min(...dates)).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'';
    node('pf-earned-status').textContent=complete?(unidentified?`${unidentified} farm transfers could not be identified and are excluded from rewards.`:''):busy?`Loading rewards${oldest?' · reached '+oldest:''}. Totals are partial until complete.`:loadedWallet?'Earlier history is incomplete. Loading will retry automatically.':'Awaiting wallet scan.';
    node('pf-earned-status').hidden=complete&&!unidentified;
    const series=model.cumulative(earnedActivity,'rewards',FARM_HISTORY_START);
    series.sort((a,b)=>{
      const rank=s=>{const index=tokens.findIndex(t=>t.address.toLowerCase()===s.token);return index<0?tokens.length:index;};
      return rank(a)-rank(b)||a.symbol.localeCompare(b.symbol);
    });
    series.forEach((s,index)=>s.color=rewardColor(s.symbol,index));
    series.forEach(s=>{if(historyAsOf>s.points.at(-1).x)s.points.push({x:historyAsOf,y:s.total});});
    series.forEach(s=>s.usd=valueOf(s.total,rows.find(t=>t.address.toLowerCase()===s.token)?.price||rewardPrices.get(s.token)));
    const top=[...series].sort((a,b)=>(b.usd??-1)-(a.usd??-1)).slice(0,3);
    const selected=rewardSelection??new Set(top.map(s=>s.token));
    node('pf-earned').innerHTML=series.map(s=>{
      return `<button type="button" class="pf-reward-stat" data-reward-token="${escape(s.token)}" aria-pressed="${selected.has(s.token)}" aria-label="Show ${escape(s.symbol)} rewards" style="--reward-color:${s.color}"><strong>${quantity(s.total)} ${escape(s.symbol)}</strong><small title="Current USD value of recorded payouts, not historical proceeds">${s.usd===null?'Price unavailable':escape(money(s.usd))}</small></button>`;
    }).join('');
    node('pf-earned').querySelectorAll('[data-reward-token]').forEach(button=>button.addEventListener('click',()=>{
      rewardSelection=new Set(selected);const token=button.dataset.rewardToken;
      if(rewardSelection.has(token))rewardSelection.delete(token);else rewardSelection.add(token);drawRewards();
    }));
    node('pf-reward-empty').textContent=series.length?'Select a token above to show its rewards.':'No recorded payouts loaded.';
    const visible=series.filter(s=>selected.has(s.token));
    plot('pf-reward-chart',visible,'pf-reward-empty');
  }
  async function loadRewardPrices(provider,id,force=false){
    const addresses=model.cumulative(rewardSnapshot??activity).map(s=>s.token).filter(address=>force||!rewardPrices.has(address));
    if(!addresses.length)return;
    try{
      const calculator=new ethers.Contract('0xC3864afC169C6110cB8f0cCaC4fE1B935951A66F',['function getBatchPrice(address[] tokens) view returns (uint256[])'],provider);
      const prices=await calculator.getBatchPrice(addresses);
      if(id!==scanId)return;
      addresses.forEach((address,index)=>{
        const price=Number(ethers.formatUnits(prices[index],18));
        if(Number.isFinite(price)&&price>0)rewardPrices.set(address,price);
      });
    }catch(error){/* Wallet prices remain available if the calculator cannot be read. */}
  }
  function saveObservation(wallet){
    const key=`cashx:portfolio:v3:${wallet.toLowerCase()}`;
    try{const saved=JSON.parse(localStorage.getItem(key)||'[]');snapshots=Array.isArray(saved)?saved.filter(p=>Number.isFinite(p.at)&&p.at<=Date.now()):[];}catch(error){snapshots=[];}
    const summary=model.summary(rows,positions,failures);if(rows.every(t=>t.error)&&!positions.length)return;
    const point={at:Date.now(),...summary,positionsPartial:failures.length>0,positions:positions.filter(p=>p.kind!=='nft').map(p=>({kind:p.kind,id:p.id,name:p.name,symbol:p.symbol,amount:p.amount,value:p.value}))};
    if(snapshots.length&&point.at-snapshots.at(-1).at<60000)snapshots[snapshots.length-1]=point;else snapshots.push(point);
    snapshots=snapshots.slice(-180);try{localStorage.setItem(key,JSON.stringify(snapshots));}catch(error){}
    drawPositions();
  }
  async function refreshObservation(){
    if(observationBusy||!positionsReady||!loadedWallet||view.hidden||document.hidden)return;
    if(!historyBusy&&!historyDone)loadActivity(loadedWallet,scanId);
    if(!rewardBusy)loadFastRewards(loadedWallet,scanId);
    observationBusy=true;
    const id=scanId,wallet=loadedWallet;
    try{
      const [result,walletRows]=await Promise.all([window.FarmsApp.readPortfolioPositions(wallet),window.ReflectionApp.readPortfolio(wallet)]);
      if(id!==scanId)return;
      rows=walletRows.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
      positions=result.positions;failures=result.failures;farmTokens=result.farmTokens;
      render();saveObservation(wallet);loadPositionHistory(wallet,id);
    }catch(error){/* Keep the previous reading when a refresh fails. */}
    finally{observationBusy=false;}
  }
  function restoreRewards(wallet){
    try{
      const cache=JSON.parse(localStorage.getItem(`cashx:rewards:v1:${wallet.toLowerCase()}`)||'null');
      if(cache?.complete&&Number.isSafeInteger(cache.block)&&cache.block>=0&&Number.isFinite(cache.at)&&cache.at<=Date.now()&&Array.isArray(cache.events)&&cache.events.every(e=>Number.isFinite(e.at)&&Number.isFinite(e.amount)&&e.amount>=0&&typeof e.token==='string'&&typeof e.symbol==='string'&&typeof e.hash==='string')){
        rewardSnapshot=cache.events;rewardReady=true;historyAsOf=cache.at;
        rewardBlock=cache.block;
        if(Array.isArray(cache.prices))rewardPrices=new Map(cache.prices);
      }
    }catch(error){/* A missing or invalid cache falls back to a live query. */}
  }
  async function loadFastRewards(wallet,id,ready=Promise.resolve()){
    if(rewardBusy)return;
    rewardBusy=true;drawRewards();
    const controller=new AbortController();rewardController=controller;
    const timeout=setTimeout(()=>controller.abort(),45000);
    const connection=new ethers.FetchRequest('https://rpc.pulsechain.com');connection.timeout=12000;
    const provider=new ethers.JsonRpcProvider(connection,369);
    try{
      const head=await provider.getBlockNumber();
      const logs=await window.PortfolioHistory.rewardTransfers({wallet,sources:[contracts.farm,contracts.nft,...tokens.map(t=>t.address)],fromBlock:Math.max(0,rewardBlock-200),toBlock:head,signal:controller.signal});
      await ready;
      if(id!==scanId)return;
      const metadata=new Map(),transactions=new Map();
      const meta=address=>{
        if(!metadata.has(address))metadata.set(address,(async()=>{const token=new ethers.Contract(address,['function decimals() view returns(uint8)','function symbol() view returns(string)'],provider);const [decimals,symbol]=await Promise.all([token.decimals(),token.symbol()]);return {decimals:Number(decimals),symbol};})());
        return metadata.get(address);
      };
      const eventMap=new Map((rewardSnapshot||[]).map(event=>[`${event.hash}:${event.index}`,event]));
      const known=new Set([...eventMap.values()].filter(event=>event.direction!=='Unclassified farm payout').map(event=>`${event.hash}:${event.index}`));
      const unseen=logs.filter(log=>!known.has(`${log.hash}:${log.index}`));
      for(let offset=0;offset<unseen.length;offset+=6){
        if(controller.signal.aborted)throw Error('Reward loading timed out');
        const batch=await Promise.all(unseen.slice(offset,offset+6).map(async log=>{
          const info=await meta(log.token);
          let method='';
          if([contracts.farm,contracts.nft].some(address=>address.toLowerCase()===log.source.toLowerCase())){
            if(!transactions.has(log.hash))transactions.set(log.hash,provider.getTransaction(log.hash));
            try{const tx=await transactions.get(log.hash);method=methodNames[tx?.data.slice(0,10)]||'';}catch(error){}
          }
          return model.classify({from:{hash:log.source},to:{hash:wallet},token:{address:log.token,symbol:info.symbol,type:'ERC-20'},total:{value:log.rawAmount,decimals:info.decimals},method,timestamp:new Date(log.at).toISOString(),tx_hash:log.hash,log_index:log.index},wallet,contracts,farmTokens,rows);
        }));
        if(id!==scanId)return;
        batch.filter(Boolean).forEach(event=>eventMap.set(`${event.hash}:${event.index}`,event));
      }
      if(id!==scanId)return;
      const events=[...eventMap.values()];
      rewardSnapshot=events;rewardReady=true;rewardBlock=head;historyAsOf=Date.now();drawRewards();
      await loadRewardPrices(provider,id,true);
      if(id!==scanId)return;
      drawRewards();
      try{localStorage.setItem(`cashx:rewards:v1:${wallet.toLowerCase()}`,JSON.stringify({complete:true,block:rewardBlock,at:historyAsOf,events,prices:[...rewardPrices]}));}catch(error){}
    }catch(error){/* Keep cached rewards or use the full activity scan as a fallback. */}
    finally{clearTimeout(timeout);provider.destroy();if(id===scanId){rewardBusy=false;drawRewards();}}
  }
  async function loadPositionHistory(wallet,id){
    if(farmHistoryBusy)return;
    farmHistoryBusy=true;farmHistoryStatus='Loading earlier farm history...';drawPositions();
    const controller=new AbortController();farmHistoryController=controller;
    const timeout=setTimeout(()=>controller.abort(),60000);
    const provider=new ethers.JsonRpcProvider('https://rpc.pulsechain.com',369);
    try{
      const head=await provider.getBlockNumber();
      const events=await window.PortfolioHistory.farmEvents({wallet,contract:contracts.farm,fromBlock:farmHistoryBlock+1,toBlock:head,depositTopic:ethers.id('Deposit(address,uint256,uint256)'),withdrawTopics:[ethers.id('Withdraw(address,uint256,uint256)'),ethers.id('EmergencyWithdraw(address,uint256,uint256)')],signal:controller.signal});
      if(id!==scanId)return;
      farmHistory.push(...events);farmHistoryBlock=head;farmHistoryStatus='Earlier farm history loaded.';
    }catch(error){if(id===scanId)farmHistoryStatus='Earlier farm history could not finish loading. Saved readings remain available.';}
    finally{clearTimeout(timeout);provider.destroy();if(id===scanId){farmHistoryBusy=false;drawPositions();}}
  }
  async function loadActivity(wallet,id){
    if(historyBusy||historyDone)return;historyBusy=true;renderActivity();drawRewards();
    const controller=new AbortController();historyController=controller;
    const provider=new ethers.JsonRpcProvider('https://rpc.pulsechain.com',369);
    try{
      if(!historyAsOf)historyAsOf=Date.now();
      const txCache=new Map(),seen=new Set(activity.map(e=>`${e.hash}:${e.index}`));
      const cursorKey=cursor=>JSON.stringify(Object.entries(cursor||{}).sort(([a],[b])=>a.localeCompare(b)));
      const cursors=new Set();
      while(!historyDone){
        if(id!==scanId)return;
        const currentKey=cursorKey(historyCursor);
        if(cursors.has(currentKey))throw Error('Repeated history cursor');
        cursors.add(currentKey);
        const params=new URLSearchParams({type:'ERC-20',...(historyCursor||{})});
        const timeout=setTimeout(()=>controller.abort(),30000);
        let data;
        try{
          const response=await fetch(`https://api.scan.pulsechain.com/api/v2/addresses/${encodeURIComponent(wallet)}/token-transfers?${params}`,{signal:controller.signal});
          if(!response.ok)throw Error('History request failed');
          data=await response.json();
        }finally{clearTimeout(timeout);}
        if(id!==scanId)return;
        if(!Array.isArray(data.items)||!Object.hasOwn(data,'next_page_params'))throw Error('Invalid history response');
        const items=data.items.filter(item=>item.token?.type==='ERC-20'&&item.tx_hash&&item.log_index!==undefined);
        for(let offset=0;offset<items.length;offset+=4){
          const events=await Promise.all(items.slice(offset,offset+4).map(async item=>{
            let event=model.classify(item,wallet,contracts,farmTokens,rows);
            if(event?.direction==='Unclassified farm payout'){
              if(!txCache.has(item.tx_hash))txCache.set(item.tx_hash,provider.getTransaction(item.tx_hash));
              try{
                const tx=await txCache.get(item.tx_hash);
                event=model.classify({...item,method:methodNames[tx?.data.slice(0,10)]||item.method},wallet,contracts,farmTokens,rows);
              }catch(error){/* Retain an unidentified transfer, but keep paging into older dates. */}
            }
            return event;
          }));
          if(id!==scanId)return;
          events.forEach(event=>{if(event&&!seen.has(`${event.hash}:${event.index}`)){activity.push(event);seen.add(`${event.hash}:${event.index}`);}});
        }
        const next=data.next_page_params;
        if(next&&(typeof next!=='object'||Array.isArray(next)||!Object.keys(next).length||cursorKey(next)===currentKey))throw Error('Invalid history cursor');
        historyCursor=next;historyDone=next===null;historyPages++;scannedTransfers+=data.items.length;
        activity.sort((a,b)=>b.at-a.at||Number(b.index)-Number(a.index));
        node('pf-history-status').textContent=historyDone?`${activity.length} supported events. All-time indexed history loaded.`:`Loading all-time history: ${historyPages} pages, ${scannedTransfers.toLocaleString()} transfers checked.`;
        renderActivity();drawRewards();drawPositions();
        // Price lookups must not delay paging into older dates.
        if(historyDone&&rewardSnapshot===null)await loadRewardPrices(provider,id);
        if(id!==scanId)return;
        drawRewards();
      }
    }catch(error){if(id===scanId)node('pf-history-status').textContent='All-time history is incomplete. Retry history to continue from the last loaded page.';}
    finally{provider.destroy();if(id===scanId){historyBusy=false;renderActivity();drawRewards();}}
  }
  async function scan(address){
    const wallet=address||node('pf-address').value.trim()||window.sharedWalletAddr;
    if(!ethers.isAddress(wallet||'')){node('pf-status').textContent='Connect a wallet or enter a valid address.';return;}
    historyController?.abort();farmHistoryController?.abort();rewardController?.abort();
    const id=++scanId;loadedWallet=wallet;node('pf-address').value=wallet;
    farmHistory=[];farmHistoryBlock=-1;farmHistoryBusy=false;farmHistoryStatus='';
    rewardSnapshot=null;rewardReady=false;rewardBusy=false;rewardBlock=-1;rewardSelection=null;
    rows=tokens;positions=[];failures=[];farmTokens=[];activity=[];snapshots=[];rewardPrices=new Map();positionsReady=false;historyBusy=false;historyDone=false;historyCursor=null;historyAsOf=0;historyPages=0;scannedTransfers=0;pageCursor=0;
    restoreRewards(wallet);
    ['pf-total','pf-wallet-value','pf-farm-total','pf-vault-total','pf-reward-total'].forEach(key=>node(key).textContent='\u2014');
    node('pf-scan').disabled=true;node('pf-export').disabled=true;node('pf-status').textContent='Loading wallet balances, stakes, farms and vaults...';
    render();renderActivity();drawPositions();drawRewards();
    try{
      const reads=Promise.allSettled([window.ReflectionApp.readPortfolio(wallet),window.FarmsApp.readPortfolioPositions(wallet)]);
      loadFastRewards(wallet,id,reads);
      const results=await reads;
      if(id!==scanId)return;
      rows=results[0].status==='fulfilled'?results[0].value.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key)):tokens.map(t=>({...t,error:true}));
      if(results[1].status==='fulfilled'){positions=results[1].value.positions;failures=results[1].value.failures;farmTokens=results[1].value.farmTokens;}else failures=['Farm and vault reads unavailable.'];
      positionsReady=true;render();saveObservation(wallet);loadPositionHistory(wallet,id);node('pf-export').disabled=false;
      node('pf-status').textContent=`Portfolio for ${wallet.slice(0,6)}...${wallet.slice(-4)}. Updated ${new Date().toLocaleTimeString()}. ${model.summary(rows,positions,failures).partial?'Some values are unavailable.':''}`;
      node('pf-history-status').textContent='Loading on-chain activity...';await loadActivity(wallet,id);
    }catch(error){if(id===scanId)node('pf-status').textContent='Portfolio could not be loaded. Retry View Portfolio.';}
    finally{if(id===scanId)node('pf-scan').disabled=false;}
  }
  function exportCsv(){
    const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    const data=[['Wallet',loadedWallet],['Observed',new Date().toISOString()],[],['Type','Position','Amount','Symbol','USD value','Pending amount','Pending token'],...rows.map(t=>['wallet',t.name,t.balance,t.symbol,t.error?'':valueOf(t.balance,t.price),t.reflections,t.symbol]),...positions.map(p=>[p.kind,p.name,p.amount,p.symbol,p.value,p.pending,p.rewardSymbol])];
    const url=URL.createObjectURL(new Blob([data.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`cashx-portfolio-${loadedWallet.slice(0,8)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  window.PortfolioApp={scan,init(){if(window.sharedWalletAddr&&window.sharedWalletAddr!==loadedWallet)scan(window.sharedWalletAddr);}};
  node('pf-form').addEventListener('submit',event=>{event.preventDefault();scan();});
  ['pf-filter','pf-category'].forEach(id=>node(id).addEventListener('change',()=>{pageCursor=0;renderActivity();}));
  node('pf-prev').addEventListener('click',()=>{pageCursor--;renderActivity();});node('pf-next').addEventListener('click',()=>{pageCursor++;renderActivity();});
  node('pf-older').addEventListener('click',()=>loadActivity(loadedWallet,scanId));
  node('pf-export').addEventListener('click',exportCsv);
  render();renderActivity();drawPositions();
  setInterval(refreshObservation,60000);
  window.addEventListener('cashx-theme-change',()=>{syncTheme();drawPositions();drawRewards();});
  if(window.location.hash==='#portfolio')showPage('portfolio',{updateHash:false,instant:true});
})();
