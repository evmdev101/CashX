const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseUnits}=require('../vendor/ethers.umd.min.js');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const wallet='0x'+'a'.repeat(40),otherWallet='0x'+'b'.repeat(40),farmAddress='0x'+'c'.repeat(40),token='0x'+'d'.repeat(40);
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,`Missing source section ${start}`);return source.slice(a,b);}
function element(value=''){return {value,textContent:'',innerHTML:'',disabled:false,dataset:{},classList:{contains(){return false;},toggle(){},add(){},remove(){}},setAttribute(){},removeAttribute(){}};}
function fixture({amount='2',allowance=0n,liveAllowance=allowance,balance=parseUnits('10',18),onWait}={}){
  const input=element(amount),button=element(),unstake=element();
  const nodes=new Map([['farm-input-3',input],['farm-stake-3',button],['farm-unstake-3',unstake]]);
  const row={pid:3,farm:{lp:token,name:'TEST / PLS',single:false},walletAddress:wallet,walletLp:balance,allowance,staked:parseUnits('1',18),cached:false,disconnected:false,error:null};
  const sends=[],statuses=[],refreshes=[];let labelUpdates=0,allowanceReads=0;
  let ctx;
  const action={isCurrent:()=>ctx.wAddr===wallet,send:async(contract,method,args)=>{assert.equal(ctx.wAddr,wallet,'a changed wallet must not submit');sends.push({address:contract.address,method,args});return {hash:'0x'+'1'.repeat(64)};},wait:async()=>{if(onWait)onWait(ctx);return {status:1};}};
  ctx=vm.createContext({wAddr:wallet,wProvider:{getSigner:async()=>({wallet})},lastFarmResults:[row],FARM_CONTRACT:farmAddress,FARM_ABI:[],LP_ABI:[],
    document:{getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[]},window:{},
    ethers:{parseUnits,MaxUint256:(1n<<256n)-1n,Contract:class{constructor(address){this.address=address;}async allowance(){allowanceReads++;return liveAllowance;}async balanceOf(){return balance;}}},
    setFarmStatus:(pid,message)=>statuses.push(message),setTimeout(){},scheduleFarmRefresh:pid=>refreshes.push(pid),updateApproveLabel(){labelUpdates++;},friendlyFarmError:String,
    readProvider:()=>({}),syncTrackedActions(){},transactionTracker:{pending:()=>[],isPending:()=>false},
    runTrackedAction:async(kind,pid,name,operation)=>operation(action),connectWallet:async()=>{},console
  });
  vm.runInContext(section('  function inputAmountRaw(', '  function updateApproveLabel('),ctx);
  return {ctx,row,input,button,unstake,sends,statuses,refreshes,action,labelUpdates:()=>labelUpdates,allowanceReads:()=>allowanceReads};
}

test('the shared farm button chooses approval only when the selected amount exceeds allowance',async()=>{
  const f=fixture({allowance:parseUnits('1',18)}),calls=[];
  f.ctx.approveFarm=async pid=>calls.push(['approve',pid]);f.ctx.stakeFarm=async pid=>calls.push(['stake',pid]);
  vm.runInContext(section('  async function submitFarm(', '  async function stakeFarm('),f.ctx);
  await f.ctx.submitFarm(3);assert.deepEqual(calls,[['approve',3]]);
  f.row.allowance=parseUnits('2',18);await f.ctx.submitFarm(3);
  assert.deepEqual(calls,[['approve',3],['stake',3]]);
  f.row.cached=true;await f.ctx.submitFarm(3);f.row.cached=false;
  f.input.value='11';await f.ctx.submitFarm(3);
  assert.equal(calls.length,2,'stale readings or excessive amounts must not invoke a wallet action');
});

test('the primary button describes only the next valid step and cannot enable stale farm readings',()=>{
  const f=fixture();
  vm.runInContext(section('  function updateApproveLabel(', '  // ── Nexion CashMoney NFT farm'),f.ctx);
  f.ctx.updateApproveLabel(3);assert.match(f.button.textContent,/Approve/i);assert.equal(f.button.disabled,false);
  f.row.allowance=parseUnits('2',18);f.ctx.updateApproveLabel(3);assert.match(f.button.textContent,/^Stake$/i);
  f.input.value='';f.ctx.updateApproveLabel(3);assert.match(f.button.textContent,/Enter amount/i);assert.equal(f.button.disabled,true);
  f.input.value='2';f.row.cached=true;f.ctx.updateApproveLabel(3);assert.equal(f.button.disabled,true);
  f.row.cached=false;f.row.error='Read failed';f.ctx.updateApproveLabel(3);assert.equal(f.button.disabled,true);
  f.row.error=null;f.button.dataset.trackedAction='approval';f.button.textContent='Pending…';f.button.disabled=true;
  f.ctx.updateApproveLabel(3);assert.equal(f.button.textContent,'Pending…');assert.equal(f.button.disabled,true);
  delete f.button.dataset.trackedAction;
  f.row.error=null;f.ctx.wAddr='';f.ctx.updateApproveLabel(3);assert.match(f.button.textContent,/Connect wallet/i);
});

test('farm approval grants exactly the entered amount, preserves it, and does not automatically stake',async()=>{
  const f=fixture({amount:'2.123456789123456789'});
  vm.runInContext(section('  async function approveFarm(', '  // ── Unstake'),f.ctx);
  await f.ctx.approveFarm(3,f.action);
  assert.equal(f.sends.length,1);assert.equal(f.sends[0].address,token);assert.equal(f.sends[0].method,'approve');
  assert.deepEqual(Array.from(f.sends[0].args),[farmAddress,parseUnits('2.123456789123456789',18)]);
  assert.equal(f.input.value,'2.123456789123456789');
  assert.equal(f.ctx.lastFarmResults[0].allowance,parseUnits('2.123456789123456789',18));
  assert.ok(f.labelUpdates()>0,'confirmed approval must update the next-step label');
  assert.equal(f.sends.some(tx=>tx.method==='deposit'),false);
});

test('empty, invalid, zero, and excessive approval amounts never become unlimited approvals',async()=>{
  for(const amount of ['', '0', '-1','NaN','2.1234567891234567891','11']){
    const f=fixture({amount});vm.runInContext(section('  async function approveFarm(', '  // ── Unstake'),f.ctx);
    await f.ctx.approveFarm(3,f.action);assert.equal(f.sends.length,0,`submitted approval for ${JSON.stringify(amount)}`);
  }
});

test('an approval confirmed after changing wallets cannot update the new account allowance',async()=>{
  const f=fixture({onWait:ctx=>{ctx.wAddr=otherWallet;}});
  vm.runInContext(section('  async function approveFarm(', '  // ── Unstake'),f.ctx);
  await f.ctx.approveFarm(3,f.action);
  assert.equal(f.sends.length,1);assert.equal(f.row.allowance,0n);assert.equal(f.labelUpdates(),0);
});

test('staking verifies live allowance instead of trusting the displayed allowance',async()=>{
  const f=fixture({allowance:parseUnits('10',18),liveAllowance:0n});
  vm.runInContext(section('  async function stakeFarm(', '  async function approveFarm('),f.ctx);
  await f.ctx.stakeFarm(3,f.action);
  assert.ok(f.allowanceReads()>0,'a fresh allowance is required before deposit');
  assert.equal(f.sends.length,0);assert.equal(f.input.value,'2');
});

test('a sufficient live allowance permits exactly the selected deposit',async()=>{
  const f=fixture({allowance:parseUnits('2',18),liveAllowance:parseUnits('2',18)});
  vm.runInContext(section('  async function stakeFarm(', '  async function approveFarm('),f.ctx);
  await f.ctx.stakeFarm(3,f.action);
  assert.equal(f.sends.length,1);assert.equal(f.sends[0].address,farmAddress);assert.equal(f.sends[0].method,'deposit');
  assert.deepEqual(Array.from(f.sends[0].args),[3,parseUnits('2',18)]);assert.equal(f.input.value,'');
});

test('approval and stake pending states lock the same primary farm button',()=>{
  const button=element();
  const ctx=vm.createContext({document:{querySelectorAll:selector=>selector==='#farm-stake-3'?[button]:[]},nftFarmState:{},cashxEcoNftState:{}});
  vm.runInContext(section('  function trackedActionButtons(', '  function syncTrackedActions('),ctx);
  for(const action of ['approve','stake'])assert.equal(ctx.trackedActionButtons({kind:'farm',target:3,action})[0],button);
});


test('Stake and Unstake tabs retain the amount and choose the matching MAX balance',()=>{
  const f=fixture({amount:'0.5'}),attrs=new Map(),tabs=new Map();
  const existing=f.ctx.document.getElementById;
  for(const id of ['farm-action-tabs-3','farm-mode-stake-3','farm-mode-unstake-3','farm-action-panel-3','farm-entry-max-3']){
    const n=element();n.setAttribute=(name,value)=>attrs.set(id+':'+name,value);tabs.set(id,n);
  }
  f.ctx.document.getElementById=id=>tabs.get(id)||existing(id);
  f.ctx.farmActionModes=new Map();
  const sources=[];f.ctx.fillInput=(pid,source)=>sources.push([pid,source]);
  vm.runInContext(section('  function updateApproveLabel(', '  // ── Nexion CashMoney NFT farm'),f.ctx);
  f.ctx.setFarmActionMode(3,'unstake');
  assert.equal(f.button.hidden,true);assert.equal(f.unstake.hidden,false);
  assert.equal(f.unstake.disabled,false,'withdrawing requires staked balance but no allowance');
  assert.equal(attrs.get('farm-mode-unstake-3:aria-selected'),'true');
  assert.equal(f.input.value,'0.5');
  f.ctx.fillFarmModeMax(3);assert.deepEqual(sources,[[3,'staked']]);
  f.ctx.setFarmActionMode(3,'stake');
  assert.equal(f.button.hidden,false);assert.equal(f.unstake.hidden,true);
  assert.match(f.button.textContent,/Approve/);
  f.ctx.fillFarmModeMax(3);assert.deepEqual(sources,[[3,'staked'],[3,'wallet']]);
});
