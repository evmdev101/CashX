// Read-only migration audit. No signer, wallet connection, or transactions.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const ethers=require('../vendor/ethers.umd.min.js');
const tokens={CASHX:'0x510c547318032275e41D1362A465783320d8152f',DISTROX:'0xec03E43e21B337F60F6a63944bC7b61B531c035F',DIVX:'0xB528AFfc72Dfc7Da5d3184C4e233Fc9fc156c4E0',GSX:'0xFA490c52FD934c7b8629E30Ea4c14683ee000b5d'};
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const ctx=vm.createContext({});
vm.runInContext(section('  const FARM_ABI = [','  const FARM_TIME_ABI')+'\nglobalThis.abi=FARM_ABI;',ctx);
const output=path.join(os.tmpdir(),'cashx-migration-audit','chain.json');
const request=new ethers.FetchRequest('https://rpc.pulsechain.com');request.timeout=18000;
const provider=new ethers.JsonRpcProvider(request,369,{staticNetwork:true,batchMaxCount:10});
const safe=async fn=>{try{return await fn();}catch(e){return {error:e.shortMessage||e.message};}};
async function main(){
  const block=await provider.getBlockNumber();
  const report={block,tokens:{},pools:[]};
  for(const [symbol,address] of Object.entries(tokens)){
    const contract=new ethers.Contract(address,[
      'function symbol() view returns(string)','function decimals() view returns(uint8)',
      'function totalSupply() view returns(uint256)','function pendingReflections(address) view returns(uint256)',
      'function getYieldTokens() view returns((address tokenAddress,uint256 reflectionsPerShareAmount)[])',
      'function getTaxes() view returns((uint256 id,uint8 taxType,uint8 taxMoment,uint256 percentage,address receiver,address tokenAddress,address burnAddress,bool rewardInPls,uint256 amountAccumulated)[])',
    ],provider);
    const [name,decimals,supply,pending,yields,taxes,dex]=await Promise.all([
      contract.symbol(),contract.decimals(),contract.totalSupply(),
      safe(()=>contract.pendingReflections('0xEda3aa737947337b425227dB8174519f623C041F')),
      safe(()=>contract.getYieldTokens()),safe(()=>contract.getTaxes()),
      safe(async()=>{const r=await fetch('https://api.dexscreener.com/latest/dex/tokens/'+address,{signal:AbortSignal.timeout(15000)});return r.json();})
    ]);
    report.tokens[symbol]={address,symbol:name,decimals:Number(decimals),supply:String(supply),pending:typeof pending==='object'?pending:String(pending),
      yields:Array.isArray(yields)?yields.map(y=>({address:y[0],amount:String(y[1])})):yields,
      taxes:Array.isArray(taxes)?taxes.map(t=>({id:String(t[0]),type:Number(t[1]),moment:Number(t[2]),percentage:String(t[3]),receiver:t[4],token:t[5],burn:t[6],pls:t[7]})):taxes,
      pairs:(dex.pairs||[]).filter(p=>p.chainId==='pulsechain').map(p=>({address:p.pairAddress,base:p.baseToken,quote:p.quoteToken,liquidity:p.liquidity?.usd,price:p.priceUsd})).sort((a,b)=>(b.liquidity||0)-(a.liquidity||0))};
    console.log(symbol,JSON.stringify({...report.tokens[symbol],taxes:report.tokens[symbol].taxes?.length,pairs:report.tokens[symbol].pairs.slice(0,3)}));
  }
  const farm=new ethers.Contract('0x961130836e52215f3A26f30994b025B4ecDB73ba',ctx.abi,provider);
  for(let start=0;start<160;start+=10){
    const results=await Promise.all(Array.from({length:10},(_,i)=>safe(async()=>{
      const pid=start+i,p=await farm.poolInfo(pid,{blockTag:block});
      return {pid,lp:p.lpToken,reward:p.rewardToken,total:String(p.totalRewards),supply:String(p.lpSupply),start:Number(p.startTime),end:Number(p.endTime),creator:p.creator};
    })));
    const found=results.filter(r=>!r.error);report.pools.push(...found);if(!found.length)break;
  }
  const pairs=[...new Set(report.pools.map(p=>p.lp).filter(p=>!Object.values(tokens).some(t=>t.toLowerCase()===p.toLowerCase())))];
  report.lpTokens={};
  for(let i=0;i<pairs.length;i+=10)await Promise.all(pairs.slice(i,i+10).map(async address=>{
    const lp=new ethers.Contract(address,['function token0() view returns(address)','function token1() view returns(address)'],provider);
    report.lpTokens[address.toLowerCase()]=await safe(async()=>({token0:await lp.token0(),token1:await lp.token1()}));
  }));
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log('POOLS',report.pools.length,'REPORT',output);
  console.log('SAMPLE',JSON.stringify(report.pools.filter(p=>[10,15,55,72,97,108].includes(p.pid))));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>provider.destroy());
