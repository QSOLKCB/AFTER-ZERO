import test from 'node:test';
import assert from 'node:assert/strict';
import {Navigation,steerTo} from '../public/src/navigation.js';
import {Game,STEP,moveBody,worldFor} from '../public/src/game.js';
import {CAMPAIGN,emptyMap} from '../public/src/maps.js';
import {generateMap} from '../public/src/generator.js';
import {createArena,advanceArena} from '../public/src/arena-sim.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function travel(map,body,target,{seconds=20,speed=6,radius=.44,others=[body]}={}){
 const nav=new Navigation(map),world=worldFor(map);let closest=dist(body,target),hazard=false;
 for(let n=0;n<seconds/STEP&&dist(body,target)>.2;n++){
  const before={x:body.x,z:body.z},v=steerTo(nav,body,target,{now:n*STEP,dt:STEP,speed,radius,others,stop:.18});
  moveBody(body,v.x*speed*STEP,v.z*speed*STEP,world.solids,radius);
  assert(nav.clear(before,body,Math.max(0,radius-.026)),`clipped a wall at ${body.x},${body.z}`);
  hazard||=map.tiles[Math.round(body.z/3)][Math.round(body.x/3)]===4;closest=Math.min(closest,dist(body,target));
 }return {closest,hazard};
}
test('a runner routes around low cover that it can see over, then reaches melee range',()=>{
 const m=emptyMap('CRATE',20,20);m.spawn={x:10,z:16,yaw:0};m.enemies=[{x:10,z:10,type:'runner'}];m.tiles[13][10]=2;
 const g=new Game(m),b=g.enemies[0];b.alert=true;for(let n=0;n<120*7;n++)g.step(STEP);
 assert(dist(b,g.player)<2.2);assert(g.player.health<100);assert(b.x!==30,'must go around the crate');
});
test('a body follows a one-tile right-angle corridor without clipping the inner corner',()=>{
 const m=emptyMap('CORNER',20,20);for(let z=1;z<19;z++)for(let x=1;x<19;x++)m.tiles[z][x]=1;
 for(let z=3;z<=15;z++)m.tiles[z][3]=0;for(let x=3;x<=15;x++)m.tiles[3][x]=0;
 const b={id:'runner',x:9,z:45,y:0,alive:true},goal={x:45,z:9};assert(travel(m,b,goal,{seconds:16}).closest<.2);
});
test('diagonally touching floor islands do not permit corner cutting or a direct fallback through walls',()=>{
 const m=emptyMap('ISLAND',10,10);for(let z=1;z<9;z++)for(let x=1;x<9;x++)m.tiles[z][x]=1;m.tiles[3][3]=m.tiles[4][4]=0;
 const nav=new Navigation(m),body={x:9,z:9},goal={x:12,z:12};assert.deepEqual(nav.route(body,goal),[]);assert.deepEqual(steerTo(nav,body,goal,{now:0,dt:STEP,speed:6}),{x:0,z:0});
});
test('weighted routes and smoothing prefer safe floor, but permit a necessary plasma crossing',()=>{
 const m=emptyMap('PLASMA',20,20);for(let x=7;x<=12;x++)m.tiles[10][x]=4;
 const b={id:'safe',x:12,z:30,y:0},goal={x:45,z:30},safe=travel(m,b,goal,{seconds:10});assert(safe.closest<.2);assert.equal(safe.hazard,false);
 const corridor=emptyMap('BRIDGE',10,10);for(let z=1;z<9;z++)for(let x=1;x<9;x++)corridor.tiles[z][x]=z===5?0:1;corridor.tiles[5][5]=4;
 const forced=travel(corridor,{id:'cross',x:6,z:15,y:0},{x:21,z:15},{seconds:5});assert(forced.closest<.2);assert(forced.hazard);
});
test('an elevated target projects onto reachable floor instead of pulling enemies inside a crate',()=>{
 const m=emptyMap('HIGH TARGET',20,20);m.tiles[10][10]=2;const nav=new Navigation(m),body={id:1,x:15,z:30,y:0},goal={x:30,z:30,y:1.35};
 const path=nav.route(body,goal);assert(path.length);const end=path.at(-1);assert.equal(m.tiles[Math.round(end.z/3)][Math.round(end.x/3)],0);assert(dist(end,goal)>=3);
 const result=travel(m,body,goal,{seconds:6});assert(result.closest<=3.15);assert(result.closest>=2.8);assert(body.x<30,'approach the near side of the crate');
});
test('a previously corner-pinned body can recenter and regain its route without teleporting',()=>{
 const m=emptyMap('PIN',20,20);m.tiles[10][10]=1;const b={id:'pin',x:28.05,z:30,y:0},goal={x:36,z:30};
 assert(travel(m,b,goal,{seconds:6}).closest<.2);
});
test('a U-shaped barrier can require moving away from the target before approaching it',()=>{
 const m=emptyMap('U SHAPE',20,20);for(let z=6;z<=13;z++){m.tiles[z][7]=1;m.tiles[z][13]=1;}for(let x=7;x<=13;x++)m.tiles[6][x]=1;
 const b={id:'escape',x:30,z:27,y:0},goal={x:30,z:12},nav=new Navigation(m),path=nav.route(b,goal);assert(path[0].z>b.z,'initial route must leave through the open end');assert(travel(m,b,goal,{seconds:18}).closest<.2);
});
test('a moving target triggers a new route while an unchanged target reuses its route',()=>{
 const nav=new Navigation(emptyMap()),b={id:1,x:9,z:9,y:0},a={x:30,z:30};steerTo(nav,b,a,{now:0,dt:STEP,speed:6});const original=b.navigation.path;
 steerTo(nav,b,a,{now:.1,dt:STEP,speed:6});assert.equal(b.navigation.path,original);
 const next={x:45,z:9};steerTo(nav,b,next,{now:.2,dt:STEP,speed:6});assert.notEqual(b.navigation.path,original);assert.deepEqual(b.navigation.path.at(-1),next);
});
test('nearby agents separate while both make progress toward a shared target',()=>{
 const m=emptyMap(),nav=new Navigation(m),world=worldFor(m),bodies=[{id:'a',x:12,z:30,y:0,alive:true},{id:'b',x:12,z:30,y:0,alive:true}],goal={x:45,z:30};
 for(let n=0;n<120*3;n++)for(const b of bodies){const v=steerTo(nav,b,goal,{now:n*STEP,dt:STEP,speed:6,others:bodies});moveBody(b,v.x*6*STEP,v.z*6*STEP,world.solids,.44);}
 for(const b of bodies)assert(b.x>25);assert(dist(...bodies)>.7);
});
test('campaign and generated enemy routes have clear swept footprints from start to destination',()=>{
 const maps=[...CAMPAIGN,...['district','depot','citadel'].map(layout=>generateMap({seed:'NAV-'+layout,layout,size:32,enemies:24}))];
 for(const m of maps){const nav=new Navigation(m),target={x:m.spawn.x*3,z:m.spawn.z*3};for(const e of m.enemies){let at={x:e.x*3,z:e.z*3};const path=nav.route(at,target);assert(path.length,m.name);for(const next of path){assert(nav.clear(at,next,.44),`${m.name}: ${JSON.stringify(at)} → ${JSON.stringify(next)}`);at=next;}assert(dist(at,target)<.01);}}
});
function loneBot(map){
 const s=createArena({mode:'dm',map,slots:8},1000);for(const p of s.players)Object.assign(p,{bot:false,lastSeen:1e9,inputAt:1e9,alive:false,respawnAt:1e9});
 const b=s.players[0],target=s.players[1];Object.assign(b,{bot:true,alive:true,x:15,z:30,yaw:0,class:'cqb',weapon:2,brainAt:0,health:1e5});Object.assign(target,{alive:true,x:45,z:30,health:1e5});return {s,b,target};
}
test('arena movement keeps its world direction while the bot turns to face its opponent',()=>{
 const {s,b}=loneBot(emptyMap('TURN',20,20));let maxDrift=0;for(let n=0;n<15;n++){advanceArena(s,s.at+100);maxDrift=Math.max(maxDrift,Math.abs(b.z-30));}
 assert(b.x>24);assert(maxDrift<1e-8);assert(b.yaw>1,'aim must turn independently');
});
test('arena bots retain combat strafing when they reach their preferred weapon range',()=>{
 const {s,b,target}=loneBot(emptyMap('STRAFE',20,20));b.x=39;b.yaw=Math.PI/2;const before={x:b.x,z:b.z};for(let n=0;n<8;n++)advanceArena(s,s.at+100);
 assert(dist(b,before)>.3);assert(dist(b,target)<8);assert.equal(b.health,1e5);
});
test('arena navigation survives D1-style serialization between requests and goes around cover',()=>{
 const m=emptyMap('ONLINE COVER',20,20);for(let z=8;z<=12;z++)m.tiles[z][10]=2;let {s}=loneBot(m);
 for(let n=0;n<70;n++){s=JSON.parse(JSON.stringify(s));advanceArena(s,s.at+100);}
 const b=s.players[0],target=s.players[1];assert(dist(b,target)<8);assert(b.x>32);assert(b.navigation.path.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
});
