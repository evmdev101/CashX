const test=require('node:test');
const assert=require('node:assert/strict');
const rankings=require('../lib/burn-rankings.js');
const address=n=>'0x'+n.toString(16).padStart(40,'0');
const hash=n=>'0x'+n.toString(16).padStart(64,'0');
const burn=(value,n,extras={})=>({total:{value:String(value)},tx_hash:hash(n),from:{hash:address(1)},to:{hash:address(0)},timestamp:'2026-10-17T12:00:00Z',...extras});
function storeFixture(){
  const values=new Map();
  return {values,storage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}};
}
test('rankings compare exact raw amounts beyond Number precision and never sum burns',()=>{
  const ranked=rankings.merge([], [burn('9007199254740992',1),burn('9007199254740993',2),burn('10',3),burn('11',4)]);
  assert.deepEqual(ranked.map(item=>item.tx_hash),[hash(2),hash(1),hash(4)]);
  assert.equal(ranked[0].total.value,'9007199254740993');
});
test('a recent small page cannot displace larger burns already discovered',()=>{
  const previous=[burn(1000,1),burn(900,2),burn(800,3)];
  assert.deepEqual(rankings.merge(previous,[burn(1,4),burn(2,5)]).map(item=>item.total.value),['1000','900','800']);
  assert.deepEqual(rankings.merge(previous,[burn(950,6)]).map(item=>item.total.value),['1000','950','900']);
});
test('repeated transfers deduplicate, while separate logs in one transaction remain separate burns',()=>{
  const first=burn(1000,1,{log_index:2}),second=burn(1000,1,{log_index:3});
  const result=rankings.merge([first,second],[{...first,log_index:'0x2'},burn(2000,1,{log_index:4}),burn(10,2),burn(10,2)]);
  assert.equal(result.length,3);
  assert.deepEqual(result.map(item=>item.log_index),['4','2','3']);
  assert.equal(rankings.merge([], [burn(10,1),burn(10,1),burn(20,1)]).length,2);
});
test('new source and timestamp metadata enrich an event without lowering its best amount',()=>{
  const previous=burn(1000,1,{log_index:0,burnSource:{name:'Community',isUnknown:true},sourceAddress:address(4)});
  const richer=burn(900,1,{log_index:'0',timestamp:'2026-10-17T13:00:00+00:00',burnSource:{address:address(5),name:'CashX Treasury',logo:'./favicon.ico',emoji:'🏦',type:'treasury',isUnknown:false},relatedAddresses:[address(5)]});
  const [result]=rankings.merge([previous],[richer]);
  assert.equal(result.total.value,'1000');
  assert.equal(result.burnSource.name,'CashX Treasury');
  assert.equal(result.sourceAddress,address(4));
  assert.equal(result.timestamp,'2026-10-17T13:00:00.000Z');
  assert.deepEqual(result.relatedAddresses,[address(5)]);
  assert.equal(rankings.merge([result],[{...richer,burnSource:{name:'Unknown Burner',isUnknown:true}}])[0].burnSource.name,'CashX Treasury');
});
test('only positive uint256 transfers to zero or dead count, excluding mints and malformed events',()=>{
  const max=(1n<<256n)-1n;
  const invalid=[burn(0,1),burn(-1,2),burn('1.5',3),burn('1e18',4),burn(max+1n,5),burn(1,6,{tx_hash:'bad'}),burn(1,7,{from:{hash:address(0)}}),burn(1,8,{to:{hash:address(2)}}),burn(1,9,{from:{hash:'no'}}),{...burn(1,10),total:{value:1}}];
  assert.deepEqual(rankings.merge([],invalid),[]);
  const result=rankings.merge([], [burn(max,11),burn(1,12,{to:{hash:'0x000000000000000000000000000000000000dEaD'}})]);
  assert.equal(result.length,2);assert.equal(result[0].total.value,String(max));
});
test('cache is scoped by token, normalizes address case, and keeps historical leaders on partial saves',()=>{
  const {storage,values}=storeFixture(),token=address(20);
  rankings.save(storage,token,[burn(1000,1),burn(900,2),burn(800,3)]);
  rankings.save(storage,token.toUpperCase(),[burn(1,4)]);
  assert.deepEqual(rankings.load(storage,token).map(item=>item.total.value),['1000','900','800']);
  assert.deepEqual(rankings.load(storage,address(21)),[]);
  const [key,encoded]=[...values][0];
  const saved=JSON.parse(encoded);saved.tokenAddress=address(21);values.set(key,JSON.stringify(saved));
  assert.deepEqual(rankings.load(storage,token),[]);
});
test('corrupt cache and unavailable storage are harmless; unsafe optional metadata is discarded',()=>{
  const {storage,values}=storeFixture(),token=address(20);
  rankings.save(storage,token,[burn(100,1,{burnSource:{name:'Treasury',logo:'javascript:alert(1)'},relatedAddresses:[address(1),'bad'],timestamp:'invalid'})]);
  const [result]=rankings.load(storage,token);
  assert.equal(result.burnSource.logo,undefined);assert.equal(result.timestamp,undefined);assert.deepEqual(result.relatedAddresses,[address(1)]);
  const [key]=[...values.keys()];
  for(const content of ['{','null','[]',JSON.stringify({version:2,tokenAddress:token,items:[]}),JSON.stringify({version:1,tokenAddress:token,items:[burn(-1,2)]})]){
    values.set(key,content);assert.deepEqual(rankings.load(storage,token),[]);
  }
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.deepEqual(rankings.load(blocked,token),[]);
  assert.doesNotThrow(()=>rankings.save(blocked,token,[burn(1,1)]));
  assert.doesNotThrow(()=>rankings.save(storage,'bad',[burn(1,1)]));
});
