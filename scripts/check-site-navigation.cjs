const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function fixture(){
  const node=()=>({hidden:true,classList:{toggle(){}},setAttribute(){},removeAttribute(){}});
  const nodes=new Map(['home','dashboard','farms','reflections','portfolio','exchange','nfts'].map(id=>[id+'-view',node()]));
  const calls={burns:0,redirects:[]};
  const context=vm.createContext({window:{location:{hash:''},scrollTo(){},EcosystemShell:{activate(){}},PortfolioApp:{init(){}}},document:{getElementById:id=>nodes.get(id),body:{classList:{toggle(){}}},querySelectorAll:()=>[]},history:{pushState(){},replaceState(_a,_b,hash){calls.redirects.push(hash);}},refreshDashboard(){calls.burns++;}});
  vm.runInContext(html.slice(html.indexOf('  function showPage('),html.indexOf("  window.addEventListener('hashchange'",html.indexOf('  function showPage('))),context);
  return {nodes,calls,context};
}
test('all six remaining routes select exactly one view and Burns still refreshes its data',()=>{
  const {nodes,calls,context}=fixture();
  const expected={home:'home',burns:'dashboard',farms:'farms',portfolio:'portfolio',exchange:'exchange',nfts:'nfts'};
  for(const [route,id] of Object.entries(expected)){
    context.showPage(route);
    assert.deepEqual([...nodes].filter(([,value])=>!value.hidden).map(([key])=>key),[id+'-view']);
  }
  assert.equal(calls.burns,1);
});
test('the removed ecosystem Dashboard link opens Home without starting Burns',()=>{
  const {nodes,calls,context}=fixture();
  context.showPage('dashboard');
  assert.deepEqual(calls.redirects,['#home']);
  assert.deepEqual([...nodes].filter(([,value])=>!value.hidden).map(([key])=>key),['home-view']);
  assert.equal(calls.burns,0);
});
