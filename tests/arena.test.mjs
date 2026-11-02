import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,joinArena,leaveArena,acceptInput,advanceArena,restartArena,arenaSnapshot,sanitizeInput,CLASSES} from '../public/src/arena-sim.js';
import {emptyMap} from '../public/src/maps.js';
function make(mode='tdm'){const map=emptyMap('ARENA',24,24);map.spawn={x:2,z:21,yaw:0};map.exit={x:21,z:2};return createArena({mode,slots:8,map},1000);}
function quiet(s){for(const p of s.players){p.bot=false;p.lastSeen=1e7;p.inputAt=1e7;p.input={x:0,z:0,yaw:p.yaw,pitch:0,weapon:null};p.shield=0;}}
function ticks(s,seconds){for(let n=0;n<Math.ceil(seconds*10);n++)advanceArena(s,s.at+100);}
test('mixed teams balance human joins, retain bots, backfill departures and rebalance',()=>{
 const s=make();assert.deepEqual(s.players.filter(p=>p.team===0).map(p=>p.class),s.players.filter(p=>p.team===1).map(p=>p.class));for(let n=0;n<6;n++)joinArena(s,{id:'human-'+n,name:'Player',kind:Object.keys(CLASSES)[n%4]},1000);
 assert.deepEqual([0,1].map(t=>s.players.filter(p=>p.team===t&&!p.bot).length),[3,3]);assert.throws(()=>joinArena(s,{id:'overflow'},1000),/full/);
 leaveArena(s,'human-0');leaveArena(s,'human-2');assert.equal(s.players.length,8);assert.equal(s.players.filter(p=>!p.bot).length,4);assert.equal(s.players.filter(p=>p.team===0&&!p.bot).length,2);
});
test('bots and humans carry the same class health, ammunition and weapons',()=>{
 const s=make();for(const kind of Object.keys(CLASSES)){const p=joinArena(s,{id:kind,name:kind,kind},1000);assert.equal(p.health,CLASSES[kind].health);assert.equal(p.weapon,CLASSES[kind].weapon);assert(s.players.some(b=>b.bot&&b.class===kind&&b.health===p.health));}
});
test('server inputs reject client positions, damage, invalid numbers and stale sequence numbers',()=>{
 const s=make(),p=joinArena(s,{id:'h'},1000);const x=p.x;acceptInput(s,'h',{x:1e10,z:NaN,health:9999,damage:999,yaw:NaN,pitch:-999},1,1000);assert.equal(p.x,x);assert.equal(p.input.x,1);assert.equal(p.input.z,0);assert.equal(p.health,110);assert.equal('health' in p.input,false);
 assert.equal(acceptInput(s,'h',{fire:true},1,1000),false);assert.equal(p.input.fire,false);assert(Number.isFinite(sanitizeInput({yaw:Infinity}).yaw));
});
test('poll frequency cannot accelerate time and stale input stops moving',()=>{
 const s=make(),p=joinArena(s,{id:'h'},1000);p.x=30;p.z=40;acceptInput(s,'h',{z:1,yaw:0},1,1000);advanceArena(s,1100);const z=p.z,t=s.time;for(let n=0;n<10;n++)advanceArena(s,1100);assert.equal(s.time,t);assert.equal(p.z,z);advanceArena(s,2000);assert.equal(p.z,z);
});
test('server rounds score kills, disable friendly fire and respawn victims',()=>{
 const s=make();quiet(s);const a=s.players[0],b=s.players[1],friend=s.players[2];Object.assign(a,{x:30,z:40,yaw:0});Object.assign(b,{x:30,z:30,health:10});Object.assign(friend,{x:30,z:35});
 for(const p of s.players.slice(3))Object.assign(p,{x:9,z:9});
 s.projectiles.push({owner:a.id,team:a.team,weapon:0,x:30,y:1.2,z:39,d:[0,0,-1],speed:100,damage:30,life:2});ticks(s,.2);assert.equal(friend.health,CLASSES[friend.class].health);assert.equal(b.alive,false);assert.equal(a.kills,1);assert.equal(s.scores[0],1);ticks(s,3.2);assert(b.alive);assert.equal(b.health,CLASSES[b.class].health);
});
test('a chronal field slows hostile and friendly rounds by the same factor',()=>{
 const s=make();quiet(s);for(const p of s.players){p.x=9;p.z=9;}const p=s.players[0];p.field=3;p.x=30;p.z=30;
 s.projectiles=[0,1].map(team=>({owner:s.players[team].id,team,weapon:0,x:27,y:3,z:30+team,d:[1,0,0],speed:40,damage:1,life:2}));advanceArena(s,1100);assert(Math.abs(s.projectiles[0].x-28)<.02);assert(Math.abs(s.projectiles[0].x-s.projectiles[1].x)<1e-9);
});
test('domination captures, contested points freeze, held nodes score and reset on new rounds',()=>{
 const s=make('dom');quiet(s);for(const p of s.players){p.x=9;p.z=9;}const a=s.players[0],b=s.players[1],node=s.nodes[1];a.x=node.x;a.z=node.z;ticks(s,4.2);assert.equal(node.owner,0);ticks(s,1.1);assert(s.scores[0]>0);b.x=node.x;b.z=node.z;const score=s.scores[0];ticks(s,1.2);assert(node.contested);assert.equal(s.scores[0],score);restartArena(s,s.at);assert.equal(s.nodes[1].owner,null);assert.equal(s.scores[0],0);assert.equal(s.round,2);
});
test('engineer repair cannot heal through a wall and has a cooldown',()=>{
 const s=make();quiet(s);const p=s.players[3];Object.assign(p,{class:'engineer',x:30,z:30,health:30,input:{use:true,yaw:0,pitch:0}});advanceArena(s,1100);assert.equal(s.stations.length,1);assert(p.ability>21);assert(p.health>30);const q=s.players[1];q.x=36;q.z=30;q.health=10;s.map.tiles[10][11]=1;ticks(s,.5);assert.equal(q.health,10);assert.equal(s.stations.length,1);
});
test('real AI agents route, fight and score in every mode',()=>{
 for(const mode of ['dm','tdm','dom']){const s=createArena({mode,slots:8,seed:'BOT-TEST'},1000);ticks(s,70);assert(s.players.some(p=>p.kills>0),mode);assert(s.players.some(p=>p.deaths>0),mode);if(mode==='dom')assert(s.scores.some(v=>v>0));}
});
test('public snapshots omit credentials, RNG and opponent inputs',()=>{
 const s=make();s.sessions={secret:'token'};const r=arenaSnapshot(s,s.players[0].id,true);assert(!('sessions' in r));assert(!('rng' in r));assert(r.players.every(p=>!('input' in p)&&!('lastSeen' in p)));
});
