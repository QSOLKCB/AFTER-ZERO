import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from '../public/src/game.js';
import {referenceWeapon} from './fixtures/weapon-reference.mjs';

import {instrumentRenderer} from './fixtures/render-probe.mjs';

const model=(weapon=1)=>({weapon,ads:0,moving:false,time:0,reload:0,recoil:0});

test('weapon cache preserves every Float32 vertex through aim, movement, reload, fire and switching',()=>{
 const r=instrumentRenderer();
 for(let frame=0;frame<240;frame++){
  const g={weapon:frame%5,ads:(frame%11)/10,moving:frame%3===0,time:frame/60,reload:frame%7===0?.65:0,recoil:(frame%13)/12},reduced=frame%2===0;
  const reference=referenceWeapon(g,reduced),actual=r.weapon(g,reduced);r.draw(actual,true);
  assert.deepEqual(actual.data.subarray(0,actual.length),reference.data.subarray(0,reference.length));assert.deepEqual(r.drawn,reference.data.subarray(0,reference.length));
 }
});

test('240 settled frames need one weapon build/upload; changed colour, reset and failed uploads invalidate safely',()=>{
 const r=instrumentRenderer(),g=model();let boxes=0;const box=r.gun.box.bind(r.gun);r.gun.box=(...args)=>{boxes++;return box(...args);};
 r.draw(r.weapon(g,false),true);const firstBoxes=boxes;
 for(let frame=1;frame<240;frame++){g.time=frame/60;r.draw(r.weapon(g,false),true);}
 assert.equal(boxes,firstBoxes);assert.equal(r.calls.uploads,1);assert.equal(r.calls.allocations,1);assert.equal(r.calls.draws,240);
 const color=WEAPONS[1].color;try{WEAPONS[1].color=[.3,.9,1];r.gl.fail=true;assert.throws(()=>r.draw(r.weapon(g,false),true),/upload/);assert.equal(r.gun.uploaded,false);r.gl.fail=false;r.draw(r.weapon(g,false),true);assert.equal(r.calls.uploads,2);}finally{WEAPONS[1].color=color;}
 r.dispose();assert.equal(r.buffers.size,0);r.draw(r.weapon(g,false),true);assert.equal(r.calls.uploads,3);assert.equal(r.calls.allocations,2);
 const previous=r.gunSignature;assert.throws(()=>r.weapon({...g,recoil:Infinity},false),/Invalid weapon/);assert.equal(r.gunSignature,previous);
});

test('retained GPU storage handles growth, shrink and empty without drawing stale tails',()=>{
 const r=instrumentRenderer(),m=r.dynamic;
 for(const count of [1,4,2,0,3,8,1]){
  m.clear();for(let i=0;i<count;i++)m.box(i,0,0,1,1,1,[1,0,0]);const before=r.calls.draws;r.draw(m);
  if(count)assert.deepEqual(r.drawn,m.data.subarray(0,m.length));else assert.equal(r.calls.draws,before);
 }
 assert.equal(r.calls.allocations,3);assert.equal(r.calls.uploads,6);
 const capacity=m.gpuBytes;m.clear();for(let i=0;i<12;i++)m.box(i,0,0,1,1,1,[0,1,0]);r.gl.fail=true;assert.throws(()=>r.draw(m),/upload/);assert.equal(m.gpuBytes,capacity);
 r.gl.fail=false;r.draw(m);assert(m.gpuBytes>capacity);assert.deepEqual(r.drawn,m.data.subarray(0,m.length));
});
