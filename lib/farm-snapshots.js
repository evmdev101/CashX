(function(root){
  'use strict';
  const address=value=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
  const uint=value=>typeof value==='string'&&/^\d{1,78}$/.test(value)&&BigInt(value)<2n**256n;
  const key=(contract,wallet)=>`cashx:farms:v1:369:${contract.toLowerCase()}:${(wallet||'public').toLowerCase()}`;
  const poolKeys=['lpToken','rewardToken','totalRewards','lpSupply','startTime','endTime','lastRewardTime','accRewardPerShare','depositFeeBP','withdrawFeeBP','creator','remainingRewards'];
  function save(storage,contract,wallet,results){
    try{
      const entries=results.filter(r=>!r.cached&&!r.error&&r.poolInfo&&r.valuation?.stakeScaledPrice&&r.valuation?.rewardScaledPrice&&
        (wallet?String(r.walletAddress).toLowerCase()===wallet.toLowerCase():r.disconnected)).map(r=>({
        label:r.farm.label,lp:r.farm.lp,pid:r.pid,at:r.readAt,
        pool:poolKeys.map((name,index)=>String(r.poolInfo[name]??r.poolInfo[index])),
        amounts:[r.staked,r.pending,r.walletLp,r.allowance??0n,r.totalStaked].map(String),
        prices:[r.valuation.stakeScaledPrice,r.valuation.rewardScaledPrice]
      }));
      if(entries.length)storage.setItem(key(contract,wallet),JSON.stringify(entries));
    }catch(_){/* Storage is optional. */}
  }
  function load(storage,contract,wallet,farms,now=Date.now()){
    try{
      const saved=JSON.parse(storage.getItem(key(contract,wallet))||'[]');
      if(!Array.isArray(saved)||saved.length>farms.length)return [];
      const seen=new Set();
      return saved.flatMap(entry=>{
        const farm=farms.find(f=>f.label===entry?.label&&f.lp.toLowerCase()===String(entry.lp).toLowerCase());
        if(!farm||seen.has(farm.label)||!Number.isSafeInteger(entry.pid)||entry.pid<0||entry.pid>=300||
          (farm.pid!==undefined&&farm.pid!==entry.pid)||!Number.isFinite(entry.at)||entry.at>now||now-entry.at>86400000)return [];
        if(!Array.isArray(entry.pool)||entry.pool.length!==12||!entry.pool.every((v,i)=>[0,1,10].includes(i)?address(v):uint(v))||entry.pool[0].toLowerCase()!==farm.lp.toLowerCase())return [];
        if(!Array.isArray(entry.amounts)||entry.amounts.length!==5||!entry.amounts.every(uint)||!Array.isArray(entry.prices)||entry.prices.length!==2||!entry.prices.every(v=>typeof v==='string'&&/^\d+(?:\.\d+)?(?:e\+?\d+)?$/i.test(v)&&Number.isFinite(Number(v))&&Number(v)>0))return [];
        seen.add(farm.label);
        const poolInfo=Object.fromEntries(poolKeys.map((name,i)=>[name,[0,1,10].includes(i)?entry.pool[i]:BigInt(entry.pool[i])]));
        const [staked,pending,walletLp,allowance,totalStaked]=entry.amounts.map(BigInt);
        return [{farm,pid:entry.pid,readAt:entry.at,walletAddress:wallet||undefined,staked,pending,walletLp,allowance,totalStaked,poolInfo,
          cached:true,disconnected:!wallet,shareValid:false,countdownEnd:Number(poolInfo.endTime)*1000,
          prices:{stakeScaledPrice:entry.prices[0],rewardScaledPrice:entry.prices[1]}}];
      });
    }catch(_){return [];}
  }
  const api={save,load};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FarmSnapshots=api;
})(typeof window==='object'?window:globalThis);
