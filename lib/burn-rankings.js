(function(root){
  'use strict';
  const ZERO='0x'+'0'.repeat(40);
  const DEAD='0x'+'0'.repeat(36)+'dead';
  const MAX_UINT=(1n<<256n)-1n;
  const address=value=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)?value.toLowerCase():null;
  const key=token=>`cashx:burn-rankings:v1:369:${token}`;
  function uint(value){
    if(typeof value!=='string'||!/^\d{1,78}$/.test(value))return null;
    const amount=BigInt(value);
    return amount<=MAX_UINT?amount:null;
  }
  function index(value){
    if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?String(value):null;
    if(typeof value!=='string'||!(/^(?:\d{1,78}|0x[\da-f]{1,64})$/i.test(value)))return null;
    const parsed=BigInt(value);
    return parsed<=MAX_UINT?String(parsed):null;
  }
  const text=(value,max)=>typeof value==='string'&&value.length<=max?value:undefined;
  function source(value){
    if(!value||typeof value!=='object'||!text(value.name,256))return undefined;
    const result={name:value.name};
    for(const [field,max] of [['emoji',32],['type',64]]){
      const valid=text(value[field],max);
      if(valid!==undefined)result[field]=valid;
    }
    const sourceAddress=address(value.address);
    if(sourceAddress)result.address=sourceAddress;
    const logo=text(value.logo,2048);
    if(logo!==undefined&&(!logo||/^https?:\/\//i.test(logo)||/^(?:\.\.?\/|\/(?!\/))[\w./%() -]+$/.test(logo)))result.logo=logo;
    if(typeof value.isUnknown==='boolean')result.isUnknown=value.isUnknown;
    if(typeof value.matchRelatedCashxTransfers==='boolean')result.matchRelatedCashxTransfers=value.matchRelatedCashxTransfers;
    return result;
  }
  function normalize(item){
    if(!item||typeof item!=='object')return null;
    const amount=uint(item.total?.value);
    const hash=typeof item.tx_hash==='string'&&/^0x[\da-f]{64}$/i.test(item.tx_hash)?item.tx_hash.toLowerCase():null;
    const from=address(item.from?.hash||item.from),to=address(item.to?.hash||item.to);
    if(amount===null||amount===0n||!hash||!from||from===ZERO||(to!==ZERO&&to!==DEAD))return null;
    const result={total:{value:String(amount)},tx_hash:hash,from:{hash:from},to:{hash:to}};
    const logIndex=index(item.log_index);
    if(logIndex!==null)result.log_index=logIndex;
    if(typeof item.timestamp==='string'&&item.timestamp.length<=80&&Number.isFinite(Date.parse(item.timestamp)))result.timestamp=new Date(item.timestamp).toISOString();
    const burnSource=source(item.burnSource);
    if(burnSource)result.burnSource=burnSource;
    for(const field of ['sender','caller','contractAddress','sourceAddress','counterparty']){
      const valid=address(item[field]);
      if(valid)result[field]=valid;
    }
    if(Array.isArray(item.relatedAddresses))result.relatedAddresses=[...new Set(item.relatedAddresses.slice(0,100).map(address).filter(Boolean))];
    const label=text(item.destination_label,100);
    if(label)result.destination_label=label;
    for(const field of ['block_number','transaction_index']){
      const valid=index(item[field]);
      if(valid!==null)result[field]=valid;
    }
    return result;
  }
  const identity=item=>item.log_index!==undefined?`${item.tx_hash}:log:${item.log_index}`:`${item.tx_hash}:transfer:${item.from.hash}:${item.to.hash}:${item.total.value}`;
  function combine(previous,incoming){
    // The same log cannot shrink because a later partial response rounded its amount.
    const result={...previous,...incoming,total:BigInt(previous.total.value)>BigInt(incoming.total.value)?previous.total:incoming.total};
    if(previous.burnSource||incoming.burnSource){
      const oldSource=previous.burnSource,newSource=incoming.burnSource;
      result.burnSource=oldSource&&!oldSource.isUnknown&&newSource?.isUnknown?oldSource:{...oldSource,...newSource};
    }
    if(previous.relatedAddresses||incoming.relatedAddresses)result.relatedAddresses=[...new Set([...(previous.relatedAddresses||[]),...(incoming.relatedAddresses||[])])].slice(0,100);
    return result;
  }
  function merge(previous,incoming,limit=3){
    const events=new Map();
    const count=Number.isSafeInteger(limit)&&limit>=0?limit:3;
    for(const collection of [previous,incoming]){
      if(!Array.isArray(collection))continue;
      for(const item of collection){
        const valid=normalize(item);
        if(!valid)continue;
        const eventKey=identity(valid),old=events.get(eventKey);
        events.set(eventKey,old?combine(old,valid):valid);
      }
    }
    return [...events.values()].sort((a,b)=>{
      const av=BigInt(a.total.value),bv=BigInt(b.total.value);
      return av===bv?identity(a).localeCompare(identity(b)):av>bv?-1:1;
    }).slice(0,count);
  }
  function load(storage,tokenAddress){
    try{
      const token=address(tokenAddress);
      if(!token)return [];
      const saved=JSON.parse(storage.getItem(key(token))||'null');
      if(!saved||saved.version!==1||saved.tokenAddress!==token||!Array.isArray(saved.items)||saved.items.length>3)return [];
      return merge([],saved.items);
    }catch(_){return [];}
  }
  function save(storage,tokenAddress,items){
    try{
      const token=address(tokenAddress);
      if(!token)return;
      const ranked=merge(load(storage,token),items);
      storage.setItem(key(token),JSON.stringify({version:1,tokenAddress:token,items:ranked}));
    }catch(_){/* Rankings still work when browser storage is unavailable. */}
  }
  const api={merge,load,save};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BurnRankings=api;
})(typeof window==='object'?window:globalThis);
