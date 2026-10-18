(function(root) {
  'use strict';
  const key = value => String(value || '').toLowerCase();
  const sum = values => values.reduce((total,value) => Number.isFinite(value) ? total + value : total,0);
  function summary(tokens, positions, failures = []) {
    const wallet = sum(tokens.map(t => t.error ? null : t.balance === 0 ? 0 : t.price > 0 ? t.balance*t.price : null));
    const assets = positions.filter(p => p.kind !== 'nft');
    const farm = sum(assets.filter(p => p.kind !== 'vault').map(p=>p.value));
    const vault = sum(assets.filter(p => p.kind === 'vault').map(p=>p.value));
    const partial = failures.length > 0 || tokens.some(t=>t.error || t.balance === undefined || (t.balance > 0 && !(t.price>0))) || assets.some(p=>!Number.isFinite(p.value));
    const pendingFarm = sum(positions.flatMap(p => p.kind === 'nft' ? p.rewards.map(r=>r.value) : [p.pendingUsd]));
    return {wallet,farm,vault,total:wallet+farm+vault,pendingFarm,partial,
      active:positions.filter(p=>p.kind!=='vault'&&p.amount>0).length,nfts:sum(positions.filter(p=>p.kind==='nft').map(p=>p.amount))};
  }
  function allocatedAssets(positions,address) {
    return positions.filter(p=>p.kind!=='nft').flatMap(p=>{
      const weight = (p.allocations || []).filter(a=>key(a.address)===key(address)).reduce((total,a)=>total+a.weight,0);
      return weight>0 ? [{...p,value:Number.isFinite(p.value)?p.value*weight:null}] : [];
    });
  }
  function classify(item,wallet,contracts,farmTokens,tokens) {
    const from = key(item.from?.hash), to = key(item.to?.hash), address = key(item.token?.address);
    const outgoing = from === key(wallet), incoming = to === key(wallet);
    if (!outgoing && !incoming) return null;
    const supported = tokens.find(t=>key(t.address)===address);
    const stake = farmTokens.find(t=>key(t.address)===address);
    const contractKeys = Object.fromEntries(Object.entries(contracts).map(([name,address])=>[name,key(address)]));
    const counterparty = outgoing ? to : from;
    const kind = Object.keys(contractKeys).find(name=>contractKeys[name]===counterparty);
    const rewardSource = tokens.some(t=>key(t.address)===from);
    if(!supported && !stake && !kind && !rewardSource) return null;
    const decimals = Number(item.total?.decimals ?? item.token?.decimals);
    if (!Number.isInteger(decimals) || decimals<0 || decimals>36 || !/^\d+$/.test(item.total?.value || '')) return null;
    const amount = Number(item.total.value) / 10**decimals;
    if(!Number.isFinite(amount)) return null;
    let category = 'wallet', action = outgoing ? 'Sent' : 'Received', reward = false;
    const method = key(item.method);
    if(from === to) action = 'Self-transfer';
    else if(kind) {
      category = kind;
      if(outgoing) action = kind==='vault' ? 'Vault deposit' : 'Farm deposit';
      else {
        const withdrawal = method.includes('withdraw');
        const ambiguousStake = stake && !method.includes('claim') && !method.includes('harvest');
        reward = kind !== 'vault' && !withdrawal && !ambiguousStake && ['claim','harvest','deposit'].some(name=>method.includes(name));
        action = reward ? 'Rewards received' : kind==='vault' ? 'Vault withdrawal' : withdrawal ? 'Farm withdrawal' : 'Unclassified farm payout';
      }
    } else if(incoming && rewardSource) {category='rewards';action='Token payout';reward=true;}
    return {key:supported?.key || 'other',symbol:item.token.symbol || supported?.symbol || 'TOKEN',token:address,
      direction:action,category,reward,amount,delta:from===to?0:outgoing?-amount:amount,
      at:Date.parse(item.timestamp),hash:item.tx_hash,index:item.log_index};
  }
  function cumulative(events,mode='rewards',startAt=null) {
    const series = new Map();
    const sorted = [...events].filter(e=>Number.isFinite(e.at)).sort((a,b)=>a.at-b.at || Number(a.index)-Number(b.index));
    for(const event of sorted) {
      if(mode==='rewards' && !event.reward) continue;
      const id = `${event.token}:${event.symbol}`;
      if(!series.has(id)) series.set(id,{symbol:event.symbol,token:event.token,total:0,points:[{x:Number.isFinite(startAt)?Math.min(startAt,event.at-1):event.at-1,y:0}]});
      const entry = series.get(id);
      entry.total += mode==='rewards' ? event.amount : Math.abs(event.delta);
      entry.points.push({x:event.at,y:entry.total});
    }
    return [...series.values()];
  }
  function positionSeries(observations,kind) {
    const series=new Map();
    const sorted=observations.filter(p=>Number.isFinite(p.at)&&Array.isArray(p.positions)).sort((a,b)=>a.at-b.at);
    for(const observation of sorted){
      const entries=observation.positions.filter(p=>p.kind===kind&&Number.isFinite(p.amount));
      for(const position of entries){
        const id=`${position.kind}:${position.id}`;
        if(!series.has(id))series.set(id,{id,name:position.name,symbol:position.symbol,points:[]});
        const entry=series.get(id);
        entry.total=position.amount;entry.value=position.value;
        entry.points.push({x:observation.at,y:position.amount});
      }
      // An absent position means zero only when that scan successfully read every pool.
      if(!observation.positionsPartial){
        for(const entry of series.values()){
          if(!entries.some(p=>`${p.kind}:${p.id}`===entry.id)){
            entry.total=0;entry.value=0;entry.points.push({x:observation.at,y:0});
          }
        }
      }
    }
    return [...series.values()].filter(s=>s.points.some(p=>p.y>0));
  }
  function backfilledSeries(events,positions,observations,kind){
    const observed=positionSeries(observations,kind);
    if(!['farm','stake'].includes(kind))return observed;
    const result=positions.filter(p=>p.kind===kind&&p.amount>0).map(position=>{
      const history=events.filter(e=>String(e.pid)===String(position.id)).sort((a,b)=>a.at-b.at||a.block-b.block||a.index-b.index);
      if(!history.length)return null;
      let balance=0n,valid=true;
      const points=[{x:history[0].at-1,y:0}];
      for(const event of history){
        balance+=event.withdraw?-BigInt(event.rawAmount):BigInt(event.rawAmount);
        if(balance<0n){valid=false;break;}
        points.push({x:event.at,y:Number(balance)/10**position.decimals});
      }
      // Never present a reconstructed history that disagrees with the live contract balance.
      if(!valid||position.rawAmount===undefined||balance!==BigInt(position.rawAmount))return null;
      const saved=observed.find(s=>s.id===`${kind}:${position.id}`);
      if(saved)points.push(...saved.points.filter(p=>p.x>points.at(-1).x));
      return {id:`${kind}:${position.id}`,name:position.name,symbol:position.symbol,total:position.amount,value:position.value,points,backfilled:true};
    }).filter(Boolean);
    return [...result,...observed.filter(s=>!result.some(r=>r.id===s.id))];
  }
  const api = {summary,allocatedAssets,classify,cumulative,positionSeries,backfilledSeries};
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PortfolioModel=api;
})(typeof window==='undefined'?globalThis:window);
