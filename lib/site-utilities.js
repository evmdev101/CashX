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
  const histories = new Map();
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
  root.SiteUtilities={milestone,observeVaults,vaultGrowth,send,wait};
})(typeof window==='undefined'?globalThis:window);
