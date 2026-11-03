import test from 'node:test';
import assert from 'node:assert/strict';
import {Controls} from '../public/src/controls.js';
import {CampaignFrame} from '../public/src/campaign-frame.js';
import {PointerCapture} from '../public/src/pointer-capture.js';
import {Game,STEP} from '../public/src/game.js';
import {emptyMap} from '../public/src/maps.js';
import {forward} from '../public/src/math.js';
const make=()=>{const m=emptyMap('INPUT',20,20);m.spawn={x:10,z:16,yaw:0};m.enemies=[];return new Game(m,{custom:true});};

test('locked fast swipes are conserved; nonfinite motion cannot poison aim',()=>{
 const c=new Controls();c.pointerMove({movementX:1200,movementY:600},true);c.pointerMove({movementX:-200,movementY:-100},true);c.pointerMove({movementX:Infinity,movementY:0},true);
 assert.deepEqual(c.readLook(),{mouseX:1000,mouseY:500});assert.deepEqual(c.readLook(),{mouseX:0,mouseY:0});
});
test('campaign look responds on a display frame without advancing physics or losing action edges',()=>{
 const g=make(),c=new Controls(),clock=new CampaignFrame();g.weapon=0;
 c.pointerMove({movementX:50,movementY:40},true);c.mouseDown(0);c.mouseUp(0);c.keyDown('Space');
 assert.equal(clock.advance(g,c,STEP/2),0);assert.equal(g.time,0);assert.equal(g.shots,0);assert(g.player.pitch<0);assert(Math.abs(g.player.yaw-.11)<1e-12);
 const yaw=g.player.yaw;assert.equal(clock.advance(g,c,STEP/2),1);assert.equal(g.shots,1);assert(!g.player.grounded);assert.equal(g.player.yaw,yaw);
 clock.advance(g,c,STEP);assert.equal(g.shots,1);
});
test('30/60/144/240 Hz conserve mouse motion, fixed steps and movement',()=>{
 const results=[];
 for(const hz of [30,60,144,240]){
  const g=make(),c=new Controls(),clock=new CampaignFrame();c.keyDown('KeyW');
  for(let n=0;n<hz;n++){c.pointerMove({movementX:0,movementY:80/hz},true);clock.advance(g,c,1/hz);}
  results.push(g);assert(Math.abs(g.time-1)<1e-10);assert(Math.abs(g.player.pitch+.176)<1e-10);
 }
 for(const g of results)assert(Math.abs(g.player.z-results[0].player.z)<1e-10);
});
test('firing after a fast turn uses the same new direction as the displayed camera',()=>{
 const g=make(),c=new Controls(),clock=new CampaignFrame();g.weapon=0;
 const yaw=600*.0022,dir=forward(yaw,-.04);g.enemies.push({id:0,type:'sentry',x:g.player.x+dir[0]*9,z:g.player.z+dir[2]*9,y:0,yaw:0,hp:85,alive:true,phase:0,flash:0,cooldown:10,charge:0,alert:false});
 c.pointerMove({movementX:600,movementY:.04/.0022},true);c.mouseDown(0);c.mouseUp(0);clock.advance(g,c,1/60);
 assert.equal(g.shots,1);assert(g.enemies[0].hp<85);assert(Math.abs(g.player.yaw-yaw)<1e-12);
});
test('A/D turning remains default; optional WASD strafe keeps arrows and Z/C usable',()=>{
 const c=new Controls();c.keyDown('KeyD');assert.equal(c.read().turn,1);assert.equal(c.read({strafe:true}).x,1);assert.equal(c.read({strafe:true}).turn,0);
 c.keyDown('ArrowLeft');assert.equal(c.read({strafe:true}).turn,-1);c.keyDown('KeyA');assert.equal(c.read({strafe:true}).x,0);
 c.clear();c.keyDown('KeyZ');assert.equal(c.read({strafe:true}).x,-1);
});
test('combined fire/aim releases independently and neutralization removes every pending edge',()=>{
 const c=new Controls();c.mouseDown(2);c.mouseDown(0);let i=c.read();assert(i.aim&&i.fire&&i.firePressed);c.mouseUp(0);i=c.read();assert(i.aim&&!i.fire);c.mouseUp(2);assert(!c.read().aim);
 c.mouseDown(0);c.mouseDown(2);c.mouseUp(2);assert(c.read().fire);c.mouseUp(0);assert(!c.read().fire);
 c.keyDown('KeyQ');c.mouseDown(0);c.pointerMove({movementX:60,movementY:50},true);c.clear();i=c.read();assert(!i.timePressed&&!i.fire&&!i.firePressed);assert.equal(i.mouseX,0);
});
test('pause reset discards time backlog; a long frame cannot bypass the step bound',()=>{
 const g=make(),c=new Controls(),clock=new CampaignFrame();clock.advance(g,c,STEP/2);clock.reset();assert.equal(clock.advance(g,c,STEP/2),0);
 assert(clock.advance(g,c,10)<=12);const time=g.time;g.status='dead';c.pointerMove({movementX:20},true);const yaw=g.player.yaw;clock.advance(g,c,1);assert.equal(g.time,time);assert.equal(g.player.yaw,yaw);
});
function captureHarness(request){
 const document=new EventTarget();document.pointerLockElement=null;document.exits=0;document.exitPointerLock=()=>{document.exits++;document.pointerLockElement=null;document.dispatchEvent(new Event('pointerlockchange'));};
 const canvas={requestPointerLock:request},events=[];const capture=new PointerCapture(canvas,{document,onAcquire:()=>events.push('acquire'),onRelease:()=>events.push('release'),onError:()=>events.push('error')});
 const grant=()=>{document.pointerLockElement=canvas;document.dispatchEvent(new Event('pointerlockchange'));};return {document,canvas,capture,events,grant};
}
test('capture waits for the actual lock and falls back when raw movement is unsupported',async()=>{
 const options=[];const h=captureHarness(o=>{options.push(o);return o?Promise.reject(Object.assign(new Error(),{name:'NotSupportedError'})):Promise.resolve();});
 h.capture.request();await Promise.resolve();await Promise.resolve();assert.deepEqual(options,[{unadjustedMovement:true},undefined]);assert.deepEqual(h.events,[]);assert(h.capture.pending);
 h.grant();assert.deepEqual(h.events,['acquire']);h.document.exitPointerLock();assert.deepEqual(h.events,['acquire','release']);
});
test('late grants and rejected obsolete requests cannot resume a paused game',async()=>{
 let reject;const h=captureHarness(()=>new Promise((_,r)=>{reject=r;}));h.capture.request();h.capture.release();h.grant();assert.equal(h.document.exits,1);assert(!h.events.includes('acquire'));reject(Error('cancelled'));await Promise.resolve();assert(!h.events.includes('error'));
});
test('legacy event-only capture errors and promise errors produce one actionable failure',async()=>{
 const a=captureHarness(()=>undefined);a.capture.request();a.document.dispatchEvent(new Event('pointerlockerror'));assert.deepEqual(a.events,['error']);
 const b=captureHarness(()=>Promise.reject(Error('denied')));b.capture.request();b.document.dispatchEvent(new Event('pointerlockerror'));await Promise.resolve();assert.deepEqual(b.events,['error']);
});
