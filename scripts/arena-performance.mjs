// Compare this checkout with a clean v0.4.3 worktree. CPU observations are not FPS.
// node scripts/arena-performance.mjs /path/to/baseline > /tmp/arena-performance.json
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {cpus} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as current from '../public/src/arena-sim.js';
import {Renderer} from '../public/src/renderer.js';
import {instrumentRenderer} from '../tests/fixtures/render-probe.mjs';

if(!process.argv[2])throw Error('Provide a clean v0.4.3 baseline checkout');
const baseline=await import(pathToFileURL(resolve(process.argv[2],'public/src/arena-sim.js')));
const {Renderer:OldRenderer}=await import(pathToFileURL(resolve(process.argv[2],'public/src/renderer.js')));
const hash=text=>createHash('sha256').update(text).digest('hex');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
function simulation(module,slots){
 let s=module.createArena({slots,networked:true},1000);const start=performance.now();
 for(let i=1;i<=100;i++){s=JSON.parse(JSON.stringify(s));module.advanceArena(s,1000+i*50);module.finishArenaUpdate(s,1000+i*50);}
 return {ms:performance.now()-start,hash:hash(JSON.stringify(s))};
}
function rendering(Type,workload){
 const start=performance.now(),r=instrumentRenderer(Type),g={weapon:1,ads:0,moving:false,time:0,reload:0,recoil:0},digest=createHash('sha256');let ms=performance.now()-start;
 for(let frame=0;frame<240;frame++){
  g.time=frame/60;
  if(workload==='aim-then-hold')g.ads=Math.min(1,frame/24);
  if(workload==='rapid-change'){g.weapon=frame%5;g.ads=(frame%11)/10;g.moving=true;g.reload=frame%7===0?.65:0;g.recoil=(frame%13)/12;}
  const begin=performance.now();r.draw(r.weapon(g,false),Type===Renderer);ms+=performance.now()-begin;
  digest.update(new Uint8Array(r.drawn.buffer,r.drawn.byteOffset,r.drawn.byteLength));
 }
 return {ms,hash:digest.digest('hex'),...r.calls};
}
function compare(name,runOld,runNew){
 const before=[],after=[];
 for(let i=-2;i<7;i++){
  let a,b;if(i%2===0){a=runOld();b=runNew();}else{b=runNew();a=runOld();}
  assert.equal(a.hash,b.hash,`${name}: exact output parity`);
  if(i>=0){before.push(a);after.push(b);}
 }
 const beforeMedian=median(before.map(r=>r.ms)),afterMedian=median(after.map(r=>r.ms));
 return {name,beforeMedianMs:beforeMedian,afterMedianMs:afterMedian,changePercent:(afterMedian/beforeMedian-1)*100,before,after};
}
const reports=[];
for(const slots of [8,16])reports.push(compare(`${slots} bots / 100 serialized server updates`,()=>simulation(baseline,slots),()=>simulation(current,slots)));
for(const workload of ['settled','aim-then-hold','rapid-change'])reports.push(compare(`240 weapon frames / ${workload}`,()=>rendering(OldRenderer,workload),()=>rendering(Renderer,workload)));
console.log(JSON.stringify({environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model},scope:'Two warm-up pairs and seven alternating measured pairs. Exact state/Float32 output hashes outside timing windows. Renderer API model includes upload copying; no native WebGL or physical GPU timing.',reports},null,2));
