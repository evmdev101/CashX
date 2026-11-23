const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {mintRequest} = require('../lib/ecosystem-nfts.js');
const source = fs.readFileSync(require.resolve('../lib/ecosystem-nfts.js'), 'utf8');

test('NFT payment preserves exact wei and rejects unavailable, closed, sold-out and invalid quantity states', () => {
  const state = {valid:true, active:true, price:1000000000000000000000000n, remaining:10000n};
  assert.deepEqual(mintRequest(state,'3'), {quantity:3n,value:3000000000000000000000000n});
  for (const value of ['0','-1','1.5','1e2','','Infinity','9007199254740993']) assert.throws(() => mintRequest(state,value));
  assert.throws(() => mintRequest(null,'1'));
  assert.throws(() => mintRequest({...state,active:false},'1'), /closed/);
  assert.throws(() => mintRequest({...state,remaining:0n},'1'), /sold out/);
  assert.throws(() => mintRequest({...state,remaining:2n},'3'), /remaining/);
  assert.throws(() => mintRequest({...state,price:0n},'1'), /price/);
});

async function fixture() {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {value:'1', disabled:false, hidden:false, textContent:'',classList:{toggle(){}},events:{},
      addEventListener(name,callback){this.events[name]=callback},removeAttribute(name){delete this[name]},querySelectorAll(){return []},
      set innerHTML(html) { for (const match of html.matchAll(/id="([^"]+)"/g)) node(match[1]); }});
    return nodes.get(id);
  }
  node('nfts-content');
  const wallet='0x1111111111111111111111111111111111111111';
  const state={active:true,chain:'0x171',price:1000000000000000000000000n,remaining:9999n,estimates:0,sends:[],waits:0,requests:[]};
  const selected={async request({method}) {state.requests.push(method);return method==='eth_chainId'?state.chain:[wallet]}};
  const mint=async (quantity,overrides) => {state.sends.push({quantity,overrides});return {hash:'0x'+'a'.repeat(64)}};
  mint.estimateGas=async () => {state.estimates++;if(state.changeDuringEstimate) state.chain='0x1';return 100000n};
  function Contract() {return {PRICE_PER_NFT:async()=>state.price,MAX_SUPPLY:async()=>10000n,totalSupply:async()=>10000n-state.remaining,
    remainingSupply:async()=>state.remaining,saleActive:async()=>state.active,treasury:async()=>wallet,balanceOf:async()=>1n,mint};}
  const root={document:{getElementById:id=>nodes.get(id),hidden:false},setInterval(callback){state.tick=callback},clearInterval(){},sharedWalletAddr:wallet,
    localStorage:{getItem(){return null},setItem(){}},CashXWallets:{getActiveProvider:()=>selected},
    ethers:{FetchRequest:function(){},JsonRpcProvider:function(){return {getBlockNumber:async()=>123}},BrowserProvider:function(){return {getSigner:async()=>({})}},Contract,formatEther:v=>String(v)},
    SiteTransactions:{cancelled:()=>false,createTracker:options=>{state.trackerOptions=options;return {
      resume(){},isPending(){return false},
      async run(options,operation){
        return operation({
          async send(contract,method,args){await options.assertCurrent();return contract[method](...args)},
          async wait(){state.waits++}
        });
      }
    }}}};
  vm.runInNewContext(source,{window:root,console});
  root.EcosystemNFTs.init();
  await new Promise(resolve=>setImmediate(resolve));
  return {root,state,nodes};
}

test('opening NFTs does not request wallet access; mint sends the selected exact PLS amount and waits', async () => {
  const {root,state,nodes}=await fixture();
  assert.deepEqual(state.requests,[]);
  nodes.get('eco-nft-quantity').value='3';
  await root.EcosystemNFTs.mint();
  assert.equal(state.sends.length,1);
  assert.equal(state.sends[0].quantity,3n);
  assert.equal(state.sends[0].overrides.value,state.price*3n);
  assert.equal(state.waits,1);
  assert.equal(state.requests.includes('eth_requestAccounts'),false);
});

test('sale closing after display, or wallet switching before send, prevents mint submission', async () => {
  for (const scenario of ['closed','chain','changedDuringEstimate','price']) {
    const {root,state}=await fixture();
    if(scenario==='closed') state.active=false;
    if(scenario==='chain') state.chain='0x1';
    if(scenario==='changedDuringEstimate') state.changeDuringEstimate=true;
    if(scenario==='price') state.price+=1n;
    await root.EcosystemNFTs.mint();
    assert.equal(state.sends.length,0,scenario);
  }
});

test('old-account settlement cannot display its mint status or transaction link for the new wallet', async () => {
  const {root,state,nodes}=await fixture();
  const original=root.sharedWalletAddr.toLowerCase();
  const record={wallet:original,kind:'ecosystem-nft',phase:'pending',hash:'0x'+'a'.repeat(64)};
  state.trackerOptions.onChange(record);
  assert.equal(nodes.get('eco-nft-tx').hidden,false);
  root.sharedWalletAddr='0x2222222222222222222222222222222222222222';
  state.trackerOptions.onChange({...record,phase:'confirmed'});
  assert.equal(nodes.get('eco-nft-tx').hidden,true);
  assert.equal(nodes.get('eco-nft-tx').href,undefined);
  assert.doesNotMatch(nodes.get('eco-nft-status').textContent,/confirmed|submitted|ready/i);
  const before=nodes.get('eco-nft-status').textContent;
  state.trackerOptions.onSettled({...record,phase:'confirmed'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.get('eco-nft-status').textContent,before);
  // Switching back restores only that account's own transaction display.
  root.sharedWalletAddr=original;
  state.tick();
  assert.equal(nodes.get('eco-nft-tx').hidden,false);
  assert.match(nodes.get('eco-nft-status').textContent,/confirmed/);
});

test('an unavailable NFT image reveals a labelled local-logo fallback', async () => {
  const {nodes}=await fixture();
  nodes.get('eco-nft-artwork').events.error();
  assert.equal(nodes.get('eco-nft-artwork').hidden,true);
  assert.equal(nodes.get('eco-nft-art-fallback').hidden,false);
  assert.match(source,/cashx-logo\.png.*CashX logo.*Collection artwork unavailable/);
});
