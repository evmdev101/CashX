const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('function startFarmThemeFrameLoop(');
const end=source.indexOf('function stopFarmThemeAnimation()',start);
assert.ok(start>=0&&end>start,'background frame loop must be present');

function eventTarget(initial={}) {
  const listeners=new Map();
  return Object.assign(initial,{
    addEventListener(name,fn) {
      if(!listeners.has(name))listeners.set(name,new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
    emit(name){for(const fn of [...(listeners.get(name)||[])])fn();},
    listenerCount(name){return listeners.get(name)?.size||0;},
  });
}

function environment({hidden=false,reduced=false}={}) {
  const document=eventTarget({visibilityState:hidden?'hidden':'visible'});
  const motion=eventTarget({matches:reduced});
  const frames=new Map();
  let nextFrame=0,draws=0,alive=true;
  const context=vm.createContext({document,window:{matchMedia:query=>{
    assert.equal(query,'(prefers-reduced-motion: reduce)');
    return motion;
  }},requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},
  cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext(source.slice(start,end),context);
  const loop=context.startFarmThemeFrameLoop(()=>draws++,()=>alive);
  return {document,motion,frames,loop,draws:()=>draws,kill:()=>{alive=false;},
    tick(time){
      assert.equal(frames.size,1,'exactly one background frame should be scheduled');
      const [id,callback]=frames.entries().next().value;
      frames.delete(id);callback(time);
    },
    visibility(value){document.visibilityState=value;document.emit('visibilitychange');},
    reduced(value){motion.matches=value;motion.emit('change');},
  };
}

test('a background starts with a visible frame and keeps one bounded animation loop',()=>{
  const env=environment();
  assert.equal(env.draws(),1);
  assert.equal(env.frames.size,1);
  env.loop.redraw();env.loop.redraw();
  assert.equal(env.frames.size,1,'redrawing must not multiply pending loops');
  for(let time=0;time<1000;time+=1000/144)env.tick(time);
  assert.ok(env.draws()<=65,'high-refresh monitors must not run effects above 60 frames per second');
  assert.ok(env.draws()>30,'the visible background should continue animating');
  env.loop.stop();
});

test('background work pauses while hidden and resumes once visible',()=>{
  const env=environment();
  env.visibility('hidden');
  assert.equal(env.frames.size,0);
  const paused=env.draws();
  env.loop.redraw();
  assert.equal(env.draws(),paused);
  assert.equal(env.frames.size,0);
  env.visibility('visible');
  assert.equal(env.draws(),paused+1);
  assert.equal(env.frames.size,1);
  env.tick(1000);
  assert.equal(env.frames.size,1);
  env.loop.stop();
});

test('an initially hidden page performs no rendering until visible',()=>{
  const env=environment({hidden:true});
  assert.equal(env.draws(),0);
  assert.equal(env.frames.size,0);
  env.visibility('visible');
  assert.equal(env.draws(),1);
  assert.equal(env.frames.size,1);
  env.loop.stop();
});

test('reduced motion renders a still background and responds to preference changes',()=>{
  const env=environment({reduced:true});
  assert.equal(env.draws(),1);
  assert.equal(env.frames.size,0);
  env.reduced(false);
  assert.equal(env.frames.size,1);
  env.tick(0);
  const moving=env.draws();
  env.reduced(true);
  assert.equal(env.draws(),moving+1,'preference change should leave a fresh static frame');
  assert.equal(env.frames.size,0);
  env.visibility('hidden');env.visibility('visible');
  assert.equal(env.frames.size,0,'visibility changes must keep reduced motion respected');
  env.loop.stop();
});

test('teardown cancels work, removes listeners, and cannot restart an old background',()=>{
  const env=environment();
  const staleCallback=env.frames.values().next().value;
  assert.equal(env.document.listenerCount('visibilitychange'),1);
  assert.equal(env.motion.listenerCount('change'),1);
  env.loop.stop();env.loop.stop();
  assert.equal(env.frames.size,0);
  assert.equal(env.document.listenerCount('visibilitychange'),0);
  assert.equal(env.motion.listenerCount('change'),0);
  const stopped=env.draws();
  staleCallback(100);env.loop.redraw();
  env.visibility('hidden');env.visibility('visible');env.reduced(false);
  assert.equal(env.draws(),stopped);
  assert.equal(env.frames.size,0);
});

test('a replaced background cannot render or schedule another frame',()=>{
  const env=environment();
  const before=env.draws();
  env.kill();env.tick(17);
  assert.equal(env.draws(),before);
  assert.equal(env.frames.size,0);
  env.loop.redraw();env.visibility('hidden');env.visibility('visible');
  assert.equal(env.draws(),before);
  assert.equal(env.frames.size,0);
  env.loop.stop();
});

const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const settingsSource=section('const FARM_THEME_EFFECT_DEFAULTS =','function farmHexToRgb(')+
  section('function defaultFarmEffectSettings(','function setFarmTheme(');

test('Starlight restores saved color, strength, size, and glass preferences',()=>{
  const context=vm.createContext({});
  vm.runInContext(settingsSource,context);
  const theme={fg:'#f4f4f5',red:'#f5b331'};
  const defaults=context.normalizeFarmEffectSettings(null,'obsidian',theme);
  assert.equal(defaults.pattern,'starlight');
  assert.equal(defaults.color,'#f4f4f5');
  assert.equal(defaults.intensity,60);
  for(const size of [30,100,250]) {
    const saved={pattern:'starlight',color:'#A1b2C3',intensity:35,size,frosted:true};
    const restored=context.normalizeFarmEffectSettings(JSON.parse(JSON.stringify(saved)),'obsidian',theme);
    assert.deepEqual(JSON.parse(JSON.stringify(restored)),saved);
  }
  assert.equal(context.normalizeFarmEffectSettings({size:0},'obsidian',theme).size,30);
  assert.equal(context.normalizeFarmEffectSettings({size:500},'obsidian',theme).size,250);
  assert.equal(context.normalizeFarmEffectSettings({pattern:'missing',color:'invalid'},'obsidian',theme).pattern,'starlight');
});

function classList(initial=[]) {
  const values=new Set(initial);
  return {values,add:(...names)=>names.forEach(name=>values.add(name)),
    remove:(...names)=>names.forEach(name=>values.delete(name)),
    toggle(name,on){if(on)values.add(name);else values.delete(name);},
  };
}

test('Starlight and None clear a prior moving background without starting new canvas work',()=>{
  let stops=0,starts=0,activeCanvas=true,synced;
  const classes=classList(['farm-bg-pattern-rain','farm-theme-frosted']);
  const properties=new Map(),storage=new Map();
  const context=vm.createContext({document:{body:{classList:classes},documentElement:{style:{setProperty:(name,value)=>properties.set(name,value)}}},
    FARM_THEME_EFFECT_KEY:'effect',
    stopFarmThemeAnimation(){stops++;activeCanvas=false;},
    startFarmThemeAnimation(){starts++;activeCanvas=true;},
    syncFarmEffectControls:effect=>{synced=effect;},
    localStorage:{setItem:(key,value)=>storage.set(key,value)},
  });
  vm.runInContext(section('function applyFarmThemeEffect(','function startFarmThemeAnimation('),context);
  const starlight={pattern:'starlight',color:'#f4f4f5',intensity:60,size:250,frosted:false};
  context.applyFarmThemeEffect(starlight);
  assert.equal(stops,1);assert.equal(starts,0);assert.equal(activeCanvas,false);
  assert.equal(classes.values.has('farm-bg-pattern-rain'),false);
  assert.equal(classes.values.has('farm-theme-frosted'),false);
  assert.equal(classes.values.has('farm-bg-pattern-starlight'),true);
  assert.equal(properties.get('--farm-bg-effect-color'),'#f4f4f5');
  assert.equal(properties.get('--farm-bg-effect-opacity'),'0.6');
  assert.equal(properties.get('--farm-bg-effect-scale'),'2.5');
  assert.equal(synced,starlight);
  assert.deepEqual(JSON.parse(storage.get('effect')),starlight);
  context.applyFarmThemeEffect({...starlight,pattern:'none'},false);
  assert.equal(stops,2);assert.equal(starts,0);
  assert.equal(classes.values.has('farm-bg-pattern-starlight'),false);
  assert.equal(classes.values.has('farm-bg-pattern-none'),true);
  assert.equal(JSON.parse(storage.get('effect')).pattern,'starlight','unsaved previews should not overwrite saved preferences');
});

test('each moving pattern renders on one canvas and disposes its frame and resize listener',()=>{
  const document=eventTarget({visibilityState:'visible',body:{children:[]}});
  document.body.prepend=canvas=>{document.body.children.unshift(canvas);canvas.parentNode=document.body;};
  document.body.removeChild=canvas=>{document.body.children.splice(document.body.children.indexOf(canvas),1);canvas.parentNode=null;};
  const gradient={addColorStop(){}};
  let paintCalls=0;
  const ctx=new Proxy({}, {get(target,name){
    if(name in target)return target[name];
    if(name==='createLinearGradient'||name==='createRadialGradient')return ()=>gradient;
    return ()=>{paintCalls++;};
  }});
  document.createElement=()=>({style:{},setAttribute(){},getContext:()=>ctx});
  const motion=eventTarget({matches:false});
  const window=eventTarget({innerWidth:1000,innerHeight:700,devicePixelRatio:1,matchMedia:()=>motion});
  const frames=new Map();let frameId=0;
  const context=vm.createContext({document,window,Math,requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},
    cancelAnimationFrame:id=>frames.delete(id),getComputedStyle:()=>({getPropertyValue:()=> '#09090f'})});
  vm.runInContext('let farmThemeAnimation = null;'+
    section('function farmHexToRgb(','function farmHexToHsl(')+
    section('function startFarmThemeFrameLoop(','function applyFarmThemeEffect(')+
    section('function startFarmThemeAnimation(','function initFarmThemeEffectControls('),context);
  for(const pattern of ['synapse','rain','constellations','perlin-flow','petals','sparkles','embers']) {
    const before=paintCalls;
    context.startFarmThemeAnimation({pattern,color:'#f4f4f5',intensity:60,size:100});
    assert.equal(document.body.children.length,1,pattern+' should use one background canvas');
    assert.equal(frames.size,1,pattern+' should use one frame loop');
    assert.equal(window.listenerCount('resize'),1,pattern+' should use one resize listener');
    assert.ok(paintCalls>before,pattern+' should draw an initial frame');
    context.stopFarmThemeAnimation();
    assert.equal(frames.size,0,pattern+' should cancel its pending frame');
    assert.equal(document.body.children.length,0,pattern+' should remove its canvas');
    assert.equal(window.listenerCount('resize'),0,pattern+' should remove its resize listener');
    assert.equal(document.listenerCount('visibilitychange'),0);
    assert.equal(motion.listenerCount('change'),0);
  }
});
