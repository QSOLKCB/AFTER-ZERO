import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLook,viewFov} from '../public/src/aim.js';
import {forward,view,transform,perspective,multiply} from '../public/src/math.js';
import {Controls} from '../public/src/controls.js';
test('screen centre and firing ray agree at every yaw, steep down/up and all weapon zooms',()=>{
 for(const yaw of [-3,-1,0,1,3])for(const pitch of [-1.5,-.8,0,.8,1.5])for(const weapon of [0,1,2,3,4])for(const ads of [0,.5,1]){
  const eye=[12,3.67,43],dir=forward(yaw,pitch),point=eye.map((v,i)=>v+dir[i]*20),matrix=multiply(perspective(viewFov(weapon,ads)*Math.PI/180,1.5),view(eye,yaw,pitch)),clip=transform(matrix,point);
  assert(clip[3]>0);assert(Math.abs(clip[0]/clip[3])<1e-5);assert(Math.abs(clip[1]/clip[3])<1e-5);
 }
});
test('mouse down lowers pitch, up raises it, invert is explicit, zoom never flips direction',()=>{
 for(const weapon of [0,3])for(const ads of [0,.5,1]){const p={yaw:0,pitch:0};applyLook(p,{mouseY:100},1/120,{weapon,ads});assert(p.pitch<0);applyLook(p,{mouseY:-200},1/120,{weapon,ads});assert(p.pitch>0);}
 const p={yaw:0,pitch:0};applyLook(p,{mouseY:100},1/120,{invert:true});assert(p.pitch>0);
});
test('drag look uses viewport displacement and pending mouse motion is consumed exactly once',()=>{
 const c=new Controls();c.pointerStart(100,100);c.pointerMove({clientX:120,clientY:160,movementX:-200,movementY:-300},false);const i=c.read();assert.equal(i.mouseX,20);assert.equal(i.mouseY,60);assert.equal(c.read().mouseY,0);
 c.pointerMove({movementX:2000,movementY:2000},true);assert.equal(c.read().mouseY,2000);
});
