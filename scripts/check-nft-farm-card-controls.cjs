const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function source(name){
  const match=new RegExp(`^  (?:async )?function ${name}\\(`,'m').exec(html);
  assert.ok(match,`${name} must exist`);
  const tail=html.slice(match.index),end=tail.search(/\r?\n  }\r?\n/);
  assert.ok(end>=0,`${name} must have a complete body`);
  return tail.slice(0,end)+'\n  }';
}
function load(context,...names){for(const name of names)vm.runInContext(source(name),context);return context;}
function element(){const attributes=new Map();return {hidden:false,disabled:false,textContent:'',dataset:{},attributes,
  setAttribute:(name,value)=>attributes.set(name,String(value)),getAttribute:name=>attributes.get(name),
  classList:{toggle(){}},hasAttribute:name=>attributes.has(name)};}
function controls(kind){
  const prefix=kind==='nft'?'nft-farm':'cashx-eco-nft';
  const state={mode:'stake',selected:new Set(['7','42']),approved:false,busy:false};
  const other={mode:'stake',selected:new Set(),approved:false,busy:false};
  const nodes=new Map(['action-tabs','action-panel','mode-stake','mode-unstake','stake-btn','unstake-btn','approve-btn']
    .map(suffix=>[`${prefix}-${suffix}`,element()]));
  const context=vm.createContext({nftCardActionModes:new Map(),nftFarmState:kind==='nft'?state:other,
    cashxEcoNftState:kind==='eco'?state:other,document:{getElementById:id=>nodes.get(id)||null}});
  load(context,'updateNftCardActions','setNftCardActionMode');
  return {context,state,other,nodes,prefix,node:suffix=>nodes.get(`${prefix}-${suffix}`)};
}

for(const kind of ['nft','eco']){
  test(`${kind} card tabs change the visible selection action without changing an open modal or selected NFTs`,()=>{
    const f=controls(kind),selected=f.state.selected;
    f.context.setNftCardActionMode(kind,'unstake');
    assert.equal(f.context.nftCardActionModes.get(kind),'unstake');
    assert.equal(f.node('stake-btn').hidden,true);assert.equal(f.node('unstake-btn').hidden,false);
    assert.equal(f.node('mode-stake').getAttribute('aria-selected'),'false');
    assert.equal(f.node('mode-unstake').getAttribute('aria-selected'),'true');
    assert.equal(f.state.mode,'stake','browsing a card must not change modal transaction mode');
    assert.equal(f.state.selected,selected);assert.deepEqual([...selected],['7','42']);
    f.context.setNftCardActionMode(kind,'stake');
    assert.equal(f.node('stake-btn').hidden,false);assert.equal(f.node('unstake-btn').hidden,true);
    assert.equal(f.node('mode-stake').getAttribute('aria-selected'),'true');
    assert.equal(f.other.mode,'stake','the other NFT collection must not be affected');
  });

  test(`${kind} card keeps its tab through repeated background renders and preserves pending action state`,()=>{
    const f=controls(kind);
    f.context.setNftCardActionMode(kind,'unstake');
    const button=f.node('unstake-btn');button.disabled=true;button.textContent='Pending…';button.dataset.trackedAction='test-tx';
    for(let tick=0;tick<3;tick++)f.context.updateNftCardActions(kind);
    assert.equal(button.hidden,false);assert.equal(f.node('stake-btn').hidden,true);
    assert.equal(button.disabled,true);assert.equal(button.textContent,'Pending…');
    assert.equal(button.dataset.trackedAction,'test-tx');
    assert.equal(f.node('mode-unstake').getAttribute('aria-selected'),'true');
  });

  test(`${kind} card shows approval only while staking an unapproved collection`,()=>{
    const f=controls(kind);
    f.context.updateNftCardActions(kind);assert.equal(f.node('approve-btn').hidden,false);
    f.state.approved=true;f.context.updateNftCardActions(kind);assert.equal(f.node('approve-btn').hidden,true);
    f.state.approved=false;f.context.setNftCardActionMode(kind,'unstake');assert.equal(f.node('approve-btn').hidden,true);
    f.context.setNftCardActionMode(kind,'stake');assert.equal(f.node('approve-btn').hidden,false);
  });

  test(`${kind} card cannot switch actions while its wallet transaction is busy`,()=>{
    const f=controls(kind);f.context.setNftCardActionMode(kind,'stake');
    f.state.busy=true;f.context.updateNftCardActions(kind);
    assert.equal(f.node('mode-stake').disabled,true);assert.equal(f.node('mode-unstake').disabled,true);
    f.context.setNftCardActionMode(kind,'unstake');assert.equal(f.context.nftCardActionModes.get(kind),'stake');
    assert.equal(f.state.mode,'stake');assert.deepEqual([...f.state.selected],['7','42']);
    f.state.busy=false;f.context.updateNftCardActions(kind);
    assert.equal(f.node('mode-stake').disabled,false);assert.equal(f.node('mode-unstake').disabled,false);
  });

  test(`${kind} card-mode helpers leave the existing table action controls unchanged`,()=>{
    const f=controls(kind);f.nodes.delete(`${f.prefix}-action-tabs`);
    f.node('stake-btn').textContent='Table Stake';f.node('unstake-btn').hidden=false;
    f.context.nftCardActionModes.set(kind,'unstake');
    f.context.updateNftCardActions(kind);
    assert.equal(f.node('stake-btn').textContent,'Table Stake');assert.equal(f.node('stake-btn').hidden,false);
    assert.equal(f.node('unstake-btn').hidden,false);assert.equal(f.node('approve-btn').hidden,false);
  });
}

test('invalid card action kinds and modes do not alter either collection',()=>{
  const f=controls('nft');
  for(const [kind,mode] of [['other','stake'],['nft','claim'],['eco','withdraw']])f.context.setNftCardActionMode(kind,mode);
  assert.equal(f.context.nftCardActionModes.size,0);
  assert.equal(f.state.mode,'stake');assert.deepEqual([...f.state.selected],['7','42']);
});

const account='0x1111111111111111111111111111111111111111';
function submitHarness(kind,{mode='stake',approved=false,approvalConfirmed=true}={}){
  const state={mode,approved,busy:false,selected:new Set(['7','42'])},calls=[];
  const collection=kind==='nft'?'cashmoney-collection':'cashx-collection';
  const context=vm.createContext({nftFarmState:kind==='nft'?state:{},cashxEcoNftState:kind==='eco'?state:{},
    wAddr:account,wProvider:{getSigner:async()=>({})},ensureNftFarmWallet:async()=>true,
    NEXION_NFT_FARM_CONTRACT:'nft-manager',NEXION_NFT_FARM_ABI:[],CASHMONEY_NFT_ABI:[],
    CASHMONEY_NFT_COLLECTION:'cashmoney-collection',CASHX_ECO_NFT_COLLECTION:'cashx-collection',
    NEXION_NFT_POOL_ID:0,CASHX_ECO_NFT_POOL_ID:1,
    ethers:{Contract:class{constructor(address){this.address=address;}async isApprovedForAll(owner,spender){
      assert.equal(owner,account);assert.equal(spender,'nft-manager');return approved;
    }async calculateDepositFee(pool,count){assert.equal(pool,kind==='nft'?0:1);assert.equal(count,2);return 10n;}}},
    setNftFarmStatus(){},setEcoNftStatus(){},renderNftFarmDom(){},renderEcoNftFarmDom(){},renderNftFarmModal(){},renderEcoNftModal(){},
    refreshNftFarmData:async()=>{},refreshEcoNftData:async()=>{},loadNftMetadataForTokens(){},nftFarmTokenIds:()=>[],
    scheduleNftFarmRefresh(){},scheduleEcoNftRefresh(){},closeEcoNftModal(){},nftFarmFriendlyError:String,console
  });
  const action={isCurrent:()=>true,send:async(contract,method,args)=>{calls.push({address:contract.address,method,args});return {hash:String(calls.length)};},
    wait:async(_tx,label)=>label.toLowerCase().includes('approval')&&!approvalConfirmed?null:{status:1}};
  const functionName=kind==='nft'?'submitNftSelection':'submitEcoNftSelection';load(context,functionName);
  return {context,state,calls,collection,submit:()=>context[functionName](action)};
}
for(const kind of ['nft','eco']){
  test(`${kind} selection still approves before depositing the exact selected NFT IDs and fee`,async()=>{
    const f=submitHarness(kind);await f.submit();
    assert.equal(f.calls.length,2);assert.equal(f.calls[0].address,f.collection);
    assert.equal(f.calls[0].method,'setApprovalForAll');assert.deepEqual(Array.from(f.calls[0].args),['nft-manager',true]);
    const deposit=f.calls[1];assert.equal(deposit.address,'nft-manager');assert.equal(deposit.method,'depositNFTs');
    assert.equal(deposit.args[0],kind==='nft'?0:1);assert.deepEqual(Array.from(deposit.args[1]),[7n,42n]);assert.equal(deposit.args[2].value,10n);
  });
  test(`${kind} unstaking never requests approval or sends a deposit fee`,async()=>{
    const f=submitHarness(kind,{mode:'unstake'});await f.submit();
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'withdrawNFTs');assert.equal(f.calls[0].args.length,2);
    assert.deepEqual(Array.from(f.calls[0].args[1]),[7n,42n]);
  });
  test(`${kind} selection cannot deposit after an unconfirmed approval`,async()=>{
    const f=submitHarness(kind,{approvalConfirmed:false});await f.submit();
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'setApprovalForAll');
  });
}
