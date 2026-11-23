const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function node(hidden=false){return {hidden,classList:{toggle(){}},setAttribute(){},removeAttribute(){}};}
function navigation(initial='farms'){
  const ids={home:'home',burns:'dashboard',farms:'farms',portfolio:'portfolio',exchange:'exchange',nfts:'nfts'};
  const nodes=new Map(['home','dashboard','farms','reflections','portfolio','exchange','nfts'].map(id=>[id+'-view',node(id!==ids[initial])]));
  const counts={scroll:0,init:0,refresh:0,hash:0,frames:0};
  const context=vm.createContext({
    window:{location:{hash:'#'+initial},scrollY:1850,scrollTo(){counts.scroll++;},EcosystemShell:{activate(){}},FarmsApp:{init(){counts.init++;},refreshAll(){counts.refresh++;}},PortfolioApp:{init(){}}},
    document:{getElementById:id=>nodes.get(id),body:{classList:{toggle(){}}},querySelectorAll:()=>[]},
    history:{pushState(_a,_b,hash){counts.hash++;context.window.location.hash=hash;},replaceState(){}},
    refreshDashboard(){},requestAnimationFrame:fn=>{counts.frames++;fn();}
  });
  vm.runInContext(html.slice(html.indexOf('  function showPage('),html.indexOf("  window.addEventListener('hashchange'",html.indexOf('  function showPage('))),context);
  const start=html.indexOf('  function refreshFarmsTab()');
  vm.runInContext(html.slice(start,html.indexOf('  function switchTokenomicsTab(',start)),context);
  return {context,counts,nodes};
}
test('selecting the already visible Farms tab preserves scroll and avoids another initialization',()=>{
  const {context,counts,nodes}=navigation('farms');context.showPage('farms');
  assert.equal(counts.scroll,0,'same-tab selection must not scroll the page to the top');
  assert.equal(counts.init,0,'same-tab selection must not restart the farm loading pipeline');
  assert.equal(counts.hash,0);
  assert.equal(nodes.get('farms-view').hidden,false);
});
test('manual farm refresh updates data once without navigation or duplicate initialization',()=>{
  const {context,counts}=navigation('farms');context.refreshFarmsTab();
  assert.equal(counts.refresh,1,'manual refresh starts exactly one data refresh');
  assert.equal(counts.init,0,'manual refresh must not initialize farms again');
  assert.equal(counts.scroll,0,'manual refresh must retain the browsing position');
  assert.equal(counts.hash,0);
});
test('entering Farms from another tab still initializes it and starts at the top',()=>{
  const {context,counts,nodes}=navigation('home');context.showPage('farms');
  assert.equal(counts.scroll,1);
  assert.equal(counts.init,1);
  assert.equal(nodes.get('home-view').hidden,true);
  assert.equal(nodes.get('farms-view').hidden,false);
});

test('opening Farms through refresh does not also start a duplicate refresh',()=>{
  const {context,counts,nodes}=navigation('home');context.refreshFarmsTab();
  assert.equal(counts.init,1);
  assert.equal(counts.refresh,0);
  assert.equal(nodes.get('farms-view').hidden,false);
});
