(function(root){
  'use strict';
  async function farmEvents({wallet,contract,fromBlock=0,toBlock,depositTopic,withdrawTopics,signal,request=fetch}){
    const account='0x'+wallet.toLowerCase().replace(/^0x/,'').padStart(64,'0');
    const topicSet=new Set([depositTopic,...withdrawTopics].map(t=>t.toLowerCase()));
    async function range(first,last){
      const params=new URLSearchParams({module:'logs',action:'getLogs',address:contract,fromBlock:String(first),toBlock:String(last),topic1:account});
      const response=await request(`https://api.scan.pulsechain.com/api?${params}`,{signal});
      if(!response.ok)throw Error('Position history request failed');
      const data=await response.json();
      if(data.status!=='1'&&!(data.status==='0'&&data.message==='No logs found'))throw Error('Position history unavailable');
      if(!Array.isArray(data.result))throw Error('Invalid position history');
      // The legacy endpoint caps results at 1,000. Split ranges so no events disappear.
      if(data.result.length>=1000){
        if(first===last)throw Error('Too many events in one block');
        const middle=Math.floor((first+last)/2);
        return [...await range(first,middle),...await range(middle+1,last)];
      }
      return data.result.filter(log=>topicSet.has(log.topics?.[0]?.toLowerCase())).map(log=>{
        if(log.address?.toLowerCase()!==contract.toLowerCase()||log.topics?.[1]?.toLowerCase()!==account||!/^0x[0-9a-f]{64}$/i.test(log.topics?.[2]||'')||!/^0x[0-9a-f]{64}$/i.test(log.data||''))throw Error('Invalid position event');
        const block=Number(BigInt(log.blockNumber)),at=Number(BigInt(log.timeStamp))*1000,index=Number(BigInt(log.logIndex));
        if(!Number.isSafeInteger(block)||block<first||block>last||!Number.isFinite(at)||at<=0||!Number.isSafeInteger(index))throw Error('Invalid event timestamp');
        return {pid:String(BigInt(log.topics[2])),rawAmount:String(BigInt(log.data)),withdraw:log.topics[0].toLowerCase()!==depositTopic.toLowerCase(),block,at,index};
      });
    }
    if(fromBlock>toBlock)return [];
    return range(fromBlock,toBlock);
  }
  async function rewardTransfers({wallet,sources,fromBlock=0,toBlock,signal,request=fetch}){
    const topic=address=>'0x'+address.toLowerCase().replace(/^0x/,'').padStart(64,'0');
    const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    async function range(source,first,last){
      const params=new URLSearchParams({module:'logs',action:'getLogs',fromBlock:String(first),toBlock:String(last),topic0:transfer,topic1:topic(source),topic2:topic(wallet),topic0_1_opr:'and',topic0_2_opr:'and',topic1_2_opr:'and'});
      const response=await request(`https://api.scan.pulsechain.com/api?${params}`,{signal});
      if(!response.ok)throw Error('Rewards request failed');
      const data=await response.json();
      if(!Array.isArray(data.result)||(data.status!=='1'&&!(data.status==='0'&&data.message==='No logs found')))throw Error('Rewards unavailable');
      if(data.result.length>=1000){
        if(first===last)throw Error('Reward log limit exceeded');
        const middle=Math.floor((first+last)/2);
        return [...await range(source,first,middle),...await range(source,middle+1,last)];
      }
      return data.result.filter(log=>!log.topics?.[3]).map(log=>{
        if(log.topics?.[0]!==transfer||log.topics?.[1]?.toLowerCase()!==topic(source)||log.topics?.[2]?.toLowerCase()!==topic(wallet)||!/^0x[0-9a-f]{64}$/i.test(log.data||'')||!/^0x[0-9a-f]{40}$/i.test(log.address||''))throw Error('Invalid reward transfer');
        const block=Number(BigInt(log.blockNumber)),at=Number(BigInt(log.timeStamp))*1000,index=Number(BigInt(log.logIndex));
        if(!Number.isSafeInteger(block)||block<first||block>last||!Number.isFinite(at)||at<=0||!Number.isSafeInteger(index)||!/^0x[0-9a-f]{64}$/i.test(log.transactionHash||''))throw Error('Invalid reward log');
        return {source,token:log.address.toLowerCase(),rawAmount:String(BigInt(log.data)),at,hash:log.transactionHash,index};
      });
    }
    if(fromBlock>toBlock)return [];
    return (await Promise.all([...new Set(sources.map(s=>s.toLowerCase()))].map(source=>range(source,fromBlock,toBlock)))).flat();
  }
  const api={farmEvents,rewardTransfers};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PortfolioHistory=api;
})(typeof window==='undefined'?globalThis:window);
