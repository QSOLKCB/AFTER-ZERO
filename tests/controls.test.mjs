import test from 'node:test';
import assert from 'node:assert/strict';
import {Controls} from '../public/src/controls.js';
import {Game,STEP} from '../public/src/game.js';
import {emptyMap} from '../public/src/maps.js';
import {Renderer} from '../public/src/renderer.js';
import {Mesh} from '../public/src/mesh.js';
const make=()=>new Game(emptyMap(),{custom:true});
const tick=(g,t,input={})=>{for(let n=0;n<Math.round(t/STEP);n++)g.step(STEP,input);};
test('A/D turn; Z/C strafe; opposing keys cancel; turning works in slow time',()=>{
 const c=new Controls(),g=make(),x=g.player.x;c.keyDown('KeyD');tick(g,.5,c.read());assert(g.player.yaw>1);assert.equal(g.player.x,x);
 c.keyDown('KeyA');assert.equal(c.read().turn,0);c.clear();c.keyDown('KeyC');assert.equal(c.read().x,1);assert.equal(c.read().turn,0);
 const a=make(),b=make();b.toggleTime();tick(a,.5,{turn:1});tick(b,.5,{turn:1});assert.equal(a.player.yaw,b.player.yaw);
});
test('a click released before the simulation tick still fires once and clear removes held input',()=>{
 const c=new Controls(),g=make();g.weapon=0;c.mouseDown(0);c.mouseUp(0);g.step(STEP,c.read());assert.equal(g.shots,1);tick(g,.5,c.read());assert.equal(g.shots,1);
 c.keyDown('KeyW');c.mouseDown(0);c.mouseDown(2);c.clear();assert.equal(c.read().fire,false);assert.equal(c.read().z,0);assert.equal(c.read().aim,false);
});
test('early taps buffer briefly, expire during long recovery, and pause cancels a queued shot',()=>{
 const g=make();g.weapon=0;g.shoot();tick(g,.13);g.step(STEP,{firePressed:true});tick(g,.2);assert.equal(g.shots,2);
 const r=make();r.weapon=3;r.shoot();r.step(STEP,{firePressed:true});tick(r,1.2);assert.equal(r.shots,1);
 const p=make();p.weapon=0;p.shoot();tick(p,.13);p.step(STEP,{firePressed:true});p.cancelAttack();tick(p,.3);assert.equal(p.shots,1);
});
test('switching cannot bypass the rail recovery and switching cancels buffered fire',()=>{
 const g=make();g.weapon=3;g.shoot();g.switchWeapon(0);tick(g,.2);g.switchWeapon(3);tick(g,.2,{fire:true});assert.equal(g.shots,1);tick(g,.7,{fire:true});assert.equal(g.shots,2);
 const p=make();p.weapon=0;p.shoot();tick(p,.13);p.step(STEP,{firePressed:true});p.switchWeapon(1);tick(p,.4);assert.equal(p.shots,1);
});
test('wheel ignores zero and tiny movement, accumulates trackpad movement and cycles only unlocked weapons',()=>{
 const c=new Controls();c.cycle(0,0,[0,1],0);assert.equal(c.read().weapon,null);c.cycle(10,0,[0,1],0);assert.equal(c.read().weapon,null);c.cycle(20,0,[0,1],0);assert.equal(c.read().weapon,1);
 c.cycle(100,0,[0,1,2],0);c.cycle(100,0,[0,1,2],0);assert.equal(c.read().weapon,2);
});
test('all aimed weapon geometry stays below the combat sight line',()=>{
 const g=make(),renderer={gun:new Mesh()};g.ads=1;
 for(let id=0;id<5;id++){g.weapon=id;const m=Renderer.prototype.weapon.call(renderer,g,true);let max=-Infinity;for(let n=1;n<m.length;n+=9)max=Math.max(max,m.data[n]);assert(max<0,`weapon ${id}: ${max}`);}
});
