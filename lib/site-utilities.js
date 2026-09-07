(function(root) {
  'use strict';
  function milestone(burned, supply) {
    if (!Number.isFinite(burned) || !Number.isFinite(supply) || supply <= 0 || burned < 0 || burned > supply) return null;
    const percent = burned / supply * 100;
    const next = [1,5,10,25,50,75,90,95,99,100].find(p => p > percent);
    return next ? { percent: next, remaining: Math.max(0, supply * next / 100 - burned) } : { percent: 100, remaining: 0 };
  }
  function growth(before, now) {
    if (!before || !now || !Number.isFinite(before.ppfs) || !Number.isFinite(now.ppfs) || before.ppfs <= 0 || now.ppfs <= 0) return null;
    return (now.ppfs / before.ppfs - 1) * 100;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { milestone, growth }; return; }
  const selected = new Map(), histories = new Map();
  let dialog;
  function node(tag, text, parent) { const el = document.createElement(tag); el.textContent = text; parent?.appendChild(el); return el; }
  function modal(title) {
    if (!dialog) { dialog = document.createElement('dialog'); dialog.className = 'farm-changes-dialog utility-dialog'; document.body.appendChild(dialog); }
    dialog.replaceChildren();
    const close = node('button', '×', dialog); close.className = 'share-close'; close.setAttribute('aria-label','Close utility'); close.onclick = () => dialog.close();
    node('h2', title, dialog).id = 'utility-title'; dialog.setAttribute('aria-labelledby','utility-title');
    if (!dialog.open) dialog.showModal();
    return dialog;
  }
  function compare(entry) {
    if (selected.has(entry.key)) selected.delete(entry.key);
    else if (selected.size < 3) selected.set(entry.key, entry);
    else { node('p', 'Choose up to three farms. Remove one selection first.', modal('Farm comparison')); return; }
    syncCompare();
  }
  function syncCompare() {
    document.querySelectorAll('[data-compare-key]').forEach(button => button.setAttribute('aria-pressed', String(selected.has(button.dataset.compareKey))));
    const btn = document.getElementById('show-farm-comparison'); if (btn) { btn.textContent = `Compare (${selected.size}/3)`; btn.disabled = selected.size < 2; }
  }
  function showComparison(entries) {
    const box = modal('Farm comparison');
    const rows = [...selected.keys()].map(key => entries.find(e => e.key === key)).filter(Boolean);
    const wrap = node('div','',box); wrap.className = 'utility-table-scroll';
    const table = node('table','',wrap), head = node('tr','',node('thead','',table));
    node('th','Metric',head);
    for (const e of rows) node('th', `${e.name} ${e.label}`,head);
    for (const [label, key, suffix] of [['APR','rate','%'],['TVL','tvl',' USD'],['Your deposit','deposit',' USD'],['Your farm share','share','%'],['Reward token','reward',''],['Rewards end','end','']]) {
      const row = node('tr','',table); node('th',label,row);
      for (const e of rows) node('td', key === 'reward' ? e.rewards.join(', ') : key === 'end' ? e.end > 0 ? new Date(e.end*1000).toLocaleString() : 'Unavailable' : Number.isFinite(e[key]) ? e[key].toLocaleString(undefined,{maximumFractionDigits:4}) + suffix : 'Unavailable',row);
    }
    node('p','Uses the latest loaded readings. APR and token prices can change. Wallet amounts require a connected wallet. Favorites and filters do not limit your comparison selections.',box).className='changes-note';
    const clear = node('button','Clear comparison',box); clear.onclick=()=>{selected.clear();syncCompare();dialog.close();};
  }
  function observeVaults(vaults, manager) {
    for (const v of vaults) {
      const key=`cashx:vault-growth:v1:${manager.toLowerCase()}:${v.vaultId}`;
      if (!histories.has(key)) {
        let saved=[];try{saved=JSON.parse(localStorage.getItem(key)||'[]');}catch(_){}
        if(!Array.isArray(saved))saved=[];
        histories.set(key,{points:saved.filter(p=>p&&Number.isFinite(p.at)&&p.at<=Date.now()&&Number.isFinite(p.ppfs)&&p.ppfs>0).slice(-90),stored:true});
      }
      const state=histories.get(key), ppfs=Number(v.pricePerFullShare)/1e18;
      if (!Number.isFinite(ppfs)||ppfs<=0)continue;
      state.now={at:v.observedAt,ppfs};
      const last=state.points.at(-1);
      if(v.observedAt && (!last||v.observedAt-last.at>=3600000)) {
        state.points.push(state.now);state.points=state.points.slice(-90);
        try{localStorage.setItem(key,JSON.stringify(state.points));}catch(_){state.stored=false;}
      }
    }
  }
  function vaultGrowth(v, manager, name) {
    const state=histories.get(`cashx:vault-growth:v1:${manager.toLowerCase()}:${v.vaultId}`);
    const box=modal(`${name} · Growth history`), now=state?.now, before=state?.points[0], change=growth(before,now);
    node('p','Tracks stake tokens per vault share. Deposits mint shares and withdrawals burn them, so adding or removing your funds is not counted as growth. This is vault share growth, not your personal lifetime profit.',box);
    if(!now||!before)node('p','Waiting for a successful vault reading.',box);
    else {
      node('p',`Since ${new Date(before.at).toLocaleString()}: ${change>=0?'+':''}${change.toFixed(4)}% stake tokens per share`,box);
      if(now.at===before.at)node('p','First observation saved. Return later to build history.',box);
      const table=node('table','',box),head=node('tr','',table);node('th','Observed',head);node('th','Stake tokens / share',head);
      const rows=[...state.points.filter(p=>p.at!==now.at),now].slice(-8);
      for(const p of rows){const row=node('tr','',table);node('td',new Date(p.at).toLocaleString(),row);node('td',p.ppfs.toLocaleString(undefined,{maximumFractionDigits:8}),row);}
    }
    node('p',state?.stored===false?'Storage unavailable; history will not survive refresh.':'Saved in this browser, at most hourly while visiting. Up to 90 observations are retained. No readings are collected while the site is closed.',box).className='changes-note';
  }
  async function send(action) { return action(); }
  async function wait(tx,label,timeout) {
    let timer;
    try {
      const receipt=await Promise.race([tx.wait(),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeout);})]);
      if(receipt&&Number(receipt.status)!==1)throw Error('Transaction reverted');
      return receipt;
    } finally { clearTimeout(timer); }
  }
  root.SiteUtilities={milestone,compare,syncCompare,showComparison,observeVaults,vaultGrowth,send,wait};
})(typeof window==='undefined'?globalThis:window);
