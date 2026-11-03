import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,acceptInput,advanceArena,respawn,arenaSnapshot} from '../public/src/arena-sim.js';
import {NET,recordHistory,issueReceipt,historicalPose,interpolatePlayers,confirmationTime,measureTiming,validateShot} from '../public/src/arena-network.js';
import {advanceMotion,replayMotion} from '../public/src/arena-motion.js';
import {ArenaClient} from '../public/src/arena-client.js';

test('the client stops polling when the server pauses arena traffic', async () => {
 const client=new ArenaClient();client.active=true;client.request=async()=>{throw Object.assign(Error('Monthly traffic allowance reached.'),{status:507});};
 await client.poll();assert.equal(client.active,false);assert.equal(client.inFlight,0);assert.match(client.error,/traffic allowance/);
});
import {emptyMap} from '../public/src/maps.js';
import {WEAPONS} from '../public/src/game.js';

function room(networked=true){
 const map=emptyMap('HIT LAB',24,24);map.spawn={x:2,z:21,yaw:0};map.exit={x:21,z:2};
 const s=createArena({mode:'tdm',slots:8,map,networked},1000);
 for(const p of s.players)Object.assign(p,{bot:false,protocol:2,lastSeen:1e7,inputAt:1e7,x:9,z:9,shield:0,input:{x:0,z:0,yaw:0,pitch:0,weapon:null}});
 const [a,b]=s.players;Object.assign(a,{x:30,z:40,class:'sniper',weapon:3,health:90});Object.assign(b,{x:30,z:30,class:'sniper',weapon:3,health:90});
 recordHistory(s,true);s.testNow=1000;return s;
}
function until(s,now){for(let t=s.testNow+10;t<now;t+=10)advanceArena(s,t);advanceArena(s,now);s.testNow=now;}
function clock(s,p,now,id=p.id+'-'+now){until(s,now);return issueReceipt(s,p,now,id);}
function send(s,p,r,{rtt=200,fire=2000,arrival=fire+rtt/2,id=1,seq=id,yaw=0,pitch=Math.atan2(-.47,10),view=r.time-.05,weapon=p.weapon,...extra}={}){
 until(s,arrival);const elapsedMs=fire-r.sentAt-rtt/2;
 const shot={id,receipt:r.id,elapsedMs,viewTime:Math.max(0,view),yaw,pitch,weapon,aim:true,...extra};
 acceptInput(s,p.id,{yaw,pitch},seq,arrival,{protocol:2,receipt:r.id,waitMs:arrival-r.sentAt-rtt,shots:[shot]});return shot;
}
function bolt(s,{height=1.2,damage=30,speed=100,life=2,weapon=0,z=39,...extra}={}){
 const p=s.players[0];s.projectiles.push({id:100,owner:p.id,ownerLife:p.life,team:p.team,weapon,x:30,y:height,z,d:[0,0,-1],speed,damage,life,fireAt:s.time,simAt:s.time,...extra});
}

test('30, 90 and 200 ms RTT all hit a moving target at the validated rendered position',()=>{
 for(const rtt of [30,90,200]){
  const s=room(),[a,b]=s.players;Object.assign(b,{x:24,z:30,class:'assault',health:110,input:{x:1,z:0,yaw:0,pitch:0,weapon:null}});recordHistory(s,true);
  const r=clock(s,a,2000-rtt/2),view=r.time-.05,seen=historicalPose(s,b.id,view);
  const yaw=Math.atan2(seen.x-a.x,10),pitch=Math.atan2(-.47,Math.hypot(seen.x-a.x,10));
  send(s,a,r,{rtt,yaw,pitch});until(s,2500);
  assert.equal(a.net.results[0].reason,'accepted',`${rtt} ms accepted`);assert.equal(b.health,15,`${rtt} ms body hit`);
 }
 // The same old aim without history misses a target that has already moved aside.
 const s=room(false),[a,b]=s.players;Object.assign(b,{x:31.5,z:30,input:{x:1,z:0,yaw:0,pitch:0,weapon:null}});bolt(s);until(s,1400);assert.equal(b.health,90);
});

test('a 200 ms player fires first but arrives last: earlier lethal impact wins over 30/90 ms replies',()=>{
 for(const fast of [30,90])for(const reversed of [false,true]){
  const s=room(),[a,b]=s.players;b.z=34;recordHistory(s,true);
  const ra=clock(s,a,1900),rb=clock(s,b,2000);
  send(s,b,rb,{rtt:fast,fire:2040,arrival:2040+fast/2,yaw:Math.PI,pitch:Math.atan2(-.47,6)});
  send(s,a,ra,{fire:2000,arrival:2100,pitch:Math.atan2(-.47,6)});
  if(reversed){s.players.reverse();s.projectiles.reverse();}
  until(s,2500);assert.equal(b.alive,false);assert.equal(a.alive,true);assert.equal(a.kills,1);assert.equal(b.kills,0);assert.equal(a.health,90);
 }
});

test('rounds fired before a lethal impact remain in flight and can legitimately trade',()=>{
 const s=room(),[a,b]=s.players;const ra=clock(s,a,1900),rb=clock(s,b,1950);
 send(s,b,rb,{rtt:30,fire:2010,arrival:2025,yaw:Math.PI});send(s,a,ra,{fire:2000,arrival:2100});until(s,2500);
 assert.equal(a.alive,false);assert.equal(b.alive,false);assert.equal(a.kills,1);assert.equal(b.kills,1);
});

test('walls, nearest targets, friendly fire, rotated bodies and real head volumes govern hits',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI])for(const height of [1.2,1.8]){
  const s=room(false),b=s.players[1];b.yaw=yaw;bolt(s,{height});until(s,1300);assert.equal(b.health,height===1.8?45:60);
 }
 const blocked=room();blocked.map.tiles[12][10]=1;bolt(blocked);until(blocked,1600);assert.equal(blocked.players[1].health,90);
 const near=room(false),[a,b,friend,far]=near.players;friend.x=30;friend.z=36;far.x=30;far.z=25;far.health=90;bolt(near);until(near,1300);
 assert.equal(friend.health,125);assert.equal(b.health,60);assert.equal(far.health,90);assert.equal(a.health,90);
 const elevated=room(false);elevated.players[1].y=3;elevated.players[1].vy=0;bolt(elevated,{height:4.2,speed:10000});until(elevated,1010);assert.equal(elevated.players[1].health,60);
});

test('all five weapons register travelling damage and lifetime cannot overshoot',()=>{
 for(const weapon of [0,1,2,3,4]){
  const s=room(false);bolt(s,{weapon,speed:10000,damage:10});until(s,1010);assert.equal(s.players[1].health,80,`weapon ${weapon}`);
 }
 const s=room(false);bolt(s,{life:.001,speed:100});until(s,1200);assert.equal(s.players[1].health,90);assert.equal(s.projectiles.length,0);
});

test('forged, future, old and previous-life clocks cannot claim damage; retries spend ammo once',()=>{
 const s=room(),a=s.players[0],r=clock(s,a,1900);const original=send(s,a,r);const ammo=a.ammo[3];
 for(let seq=2;seq<5;seq++)acceptInput(s,a.id,{},seq,2100,{protocol:2,receipt:r.id,waitMs:0,shots:[original]});assert.equal(a.ammo[3],ammo);
 const invalid=[{id:2,receipt:'invented'},{id:3,elapsedMs:1000},{id:4,elapsedMs:-1},{id:5,viewTime:-100},{id:6,yaw:Infinity},{id:7,weapon:99}];
 for(const v of invalid)acceptInput(s,a.id,{},10+v.id,2100,{protocol:2,shots:[{...original,...v}]});
 assert.equal(a.ammo[3],ammo);assert(a.net.results.slice(1).every(r=>r.reason!=='accepted'));
 until(s,2400);acceptInput(s,a.id,{},50,2400,{protocol:2,shots:[{...original,id:20}]});assert.equal(a.net.results.at(-1).reason,'late-shot');
 respawn(s,a);acceptInput(s,a.id,{},51,2400,{protocol:2,shots:[{...original,id:21}]});assert.equal(a.net.results.at(-1).reason,'expired-clock');
});

test('reordered packets retain unique shots and action edges, never replaying duplicates',()=>{
 const s=room(),a=s.players[0],r=clock(s,a,1900);send(s,a,r,{seq:5});
 const energy=a.energy;
 acceptInput(s,a.id,{},4,2100,{protocol:2,receipt:r.id,actions:[{id:1,input:{timePressed:true}}],shots:[]});until(s,2110);
 assert(a.energy<energy-49);
 acceptInput(s,a.id,{},6,2110,{protocol:2,receipt:r.id,actions:[{id:1,input:{timePressed:true}}],shots:[]});until(s,2120);assert(a.energy>49);
 assert.equal(a.net.commands.length,1);assert.equal(a.ammo[3],3);
});

test('spawn shield and respawn identity protect new lives from historical impacts',()=>{
 const s=room(),[a,b]=s.players;b.shield=1;recordHistory(s,true);bolt(s);until(s,1500);assert.equal(b.health,90);
 b.shield=0;recordHistory(s,true);issueReceipt(s,a,1500,'pending');bolt(s);until(s,1650);assert(s.impacts.length>0);respawn(s,b);const health=b.health;until(s,2000);assert.equal(b.health,health);
 assert.equal(a.kills,0);
});

test('history is bounded, serializable and cannot interpolate across respawns',()=>{
 const s=room();until(s,5000);assert(s.history.length<=42);assert(s.history[0].time>=s.time-NET.history-.02);
 const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(historicalPose(restored,s.players[0].id,s.time-.1),historicalPose(s,s.players[0].id,s.time-.1));
 const frames=[{time:1,players:[{id:'a',life:1,alive:false,x:0,y:0,z:0,yaw:0}]},{time:2,players:[{id:'a',life:2,alive:true,x:100,y:0,z:0,yaw:0}]}];
 assert.equal(interpolatePlayers(frames,1.5)[0].x,0);assert.equal(interpolatePlayers(frames,2)[0].x,100);
 assert.equal(historicalPose(s,s.players[0].id,s.time-1),null);
});

test('transport sends at 20 Hz regardless of 30/90/200 ms RTT and caps outstanding requests',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const rtt of [30,90,200,2000]){
  const c=new ArenaClient();c.active=true;let sent=0,max=0;
  c.request=()=>{sent++;max=Math.max(max,c.inFlight);return new Promise(resolve=>setTimeout(()=>resolve({snapshot:{revision:sent}}),rtt));};c.receive=()=>{};c.schedule();
  for(let ms=0;ms<1000;ms+=10){t.mock.timers.tick(10);await Promise.resolve();await Promise.resolve();}
  assert.equal(sent,rtt===2000?NET.maxInFlight:20,`${rtt} ms`);assert(max<=NET.maxInFlight);c.active=false;clearTimeout(c.timer);t.mock.timers.tick(3000);await Promise.resolve();
 }
});

test('a newer acknowledged response releases obsolete stalled polls without losing unacknowledged shots',async()=>{
 const s=room(),a=s.players[0],errors=[],c=new ArenaClient({onError:e=>errors.push(e)});s.revision=1;issueReceipt(s,a,1000,'first');c.receive(arenaSnapshot(s,a.id,true));
 c.active=true;c.schedule=()=>{};c.shots=[{id:9,receipt:'first'}];let latest;
 c.request=(body,{signal}={})=>new Promise((resolve,reject)=>{
  signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});if(body.seq===6)latest=resolve;
 });
 const pending=Array.from({length:6},()=>c.poll());assert.equal(c.inFlight,6);
 s.revision=2;a.seq=6;latest({snapshot:arenaSnapshot(s,a.id)});
 // Every superseded fetch must settle, without waiting for its five-second timeout.
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(c.inFlight,0,'old requests must not occupy the six-slot send window');
 assert.deepEqual(c.shots,[{id:9,receipt:'first'}]);assert.deepEqual(errors,[]);
 c.active=false;await Promise.all(pending);
});

test('older snapshots cannot rewind the client; neutral clears unacknowledged firing',()=>{
 const s=room(),id=s.players[0].id,c=new ArenaClient();s.revision=2;issueReceipt(s,s.players[0],1000,'new');c.receive(arenaSnapshot(s,id,true));
 s.revision=1;s.players[0].health=1;assert.equal(c.receive(arenaSnapshot(s,id)),false);assert.equal(c.me.health,90);
 c.shots=[{id:1}];c.actions=[{id:1,input:{jump:true}}];c.fireUntil=Infinity;c.neutral();assert.deepEqual(c.shots,[]);assert.deepEqual(c.actions,[]);assert.equal(c.held.fire,false);
});

test('queued snapshots preserve the first receipt delivery and allow their newer visible poses',t=>{
 let now=1950;t.mock.method(performance,'now',()=>now);
 const s=room(),a=s.players[0],r=clock(s,a,1900),c=new ArenaClient();
 s.revision=1;c.receive(structuredClone(arenaSnapshot(s,a.id,true)));
 until(s,2000);s.revision=2;now=2050;c.receive(structuredClone(arenaSnapshot(s,a.id)));
 c.step(1/120,{firePressed:true,aim:true});const shot=c.shots[0];
 assert.equal(shot.elapsedMs,100);assert(shot.viewTime>r.time);
 until(s,2100);measureTiming(a,{receipt:r.id,waitMs:100},2100);
 assert.equal(validateShot(s,a,shot,2100).reason,undefined);
 until(s,2300);assert.equal(validateShot(s,a,{...shot,elapsedMs:300,viewTime:s.time-.05},2300).reason,'stale-view','receipt lifetime remains bounded');
});

test('every equipped weapon keeps its cadence under delayed, duplicated and reordered delivery',()=>{
 for(const weapon of [0,1,2,3,4])for(const rtt of [30,90,200]){
  const s=room(),a=s.players[0];a.class=['assault','assault','cqb','sniper','engineer'][weapon];a.weapon=weapon;recordHistory(s,true);
  const r=clock(s,a,2000-rtt/2),w=WEAPONS[weapon];
  const first=send(s,a,r,{rtt,weapon,view:r.time});
  const ammo=a.ammo[weapon];assert.equal(ammo,w.mag-1);
  // A newer packet repeats an unacknowledged first shot alongside its second one.
  const fire=2000+w.delay*1000+2,arrival=fire+rtt/2,receipt=fire-rtt/2>s.testNow?clock(s,a,fire-rtt/2):r;
  const second=send(s,a,receipt,{rtt,weapon,fire,arrival,id:2,seq:3,view:receipt.time});
  acceptInput(s,a.id,{},2,arrival,{protocol:2,shots:[first,second]});
  assert.equal(a.ammo[weapon],w.mag-2,`weapon ${weapon} / ${rtt} ms`);
  acceptInput(s,a.id,{},4,arrival,{protocol:2,shots:[{...second,id:3}]});assert.equal(a.ammo[weapon],w.mag-2);
  assert.equal(a.net.results.at(-1).reason,'recovering');
 }
});

test('exact-time impacts trade regardless of iteration order and expire at their actual lifetime',()=>{
 for(const reverse of [false,true]){
  const s=room(),[a,b]=s.players;bolt(s,{damage:100,z:39.325});
  bolt(s,{id:101,owner:b.id,ownerLife:b.life,team:b.team,x:30,z:30.675,d:[0,0,1],damage:100});
  if(reverse){s.players.reverse();s.projectiles.reverse();}until(s,1500);assert.equal(a.kills,1);assert.equal(b.kills,1);
 }
 const s=room(false);bolt(s,{speed:100,life:.005,z:30.825});until(s,1010);assert.equal(s.players[1].health,60);
});

test('fixed 120 Hz hit results agree across 30, 60 and 144 Hz request schedules',()=>{
 const runs=[30,60,144].map(hz=>{const s=room();bolt(s);for(let i=1;i<=hz;i++)advanceArena(s,1000+i*1000/hz);return {time:s.time,health:s.players[1].health,impacts:s.impacts.length};});
 assert.deepEqual(runs[0],runs[1]);assert.deepEqual(runs[1],runs[2]);assert.equal(runs[0].health,60);
});

test('chronal fields slow caught-up travelling rounds and fresh rounds equally',()=>{
 for(const delayed of [false,true]){
  const s=room(),[a,b]=s.players;b.z=34;a.field=3;recordHistory(s,true);const r=clock(s,a,1900);
  if(delayed)send(s,a,r,{fire:2000,arrival:2100,pitch:Math.atan2(-.47,6)});
  else{until(s,2000);bolt(s,{height:1.2,speed:180,damage:95,z:40});}
  until(s,2100);assert.equal(b.health,90);until(s,2450);assert.equal(b.alive,false);
 }
});

test('a low-ping client cannot claim the full rewind window or enlarge it with forged waiting time',()=>{
 const s=room(),a=s.players[0],r=clock(s,a,1800);until(s,2000);
 acceptInput(s,a.id,{},1,2000,{protocol:2,receipt:r.id,waitMs:170,shots:[{id:1,receipt:r.id,elapsedMs:0,viewTime:r.time,weapon:3,yaw:0,pitch:0}]});
 assert.equal(a.net.rtt,30);assert.equal(a.net.results[0].reason,'late-shot');assert.equal(a.ammo[3],4);
 const next=clock(s,a,2100);until(s,2300);
 acceptInput(s,a.id,{},2,2300,{protocol:2,receipt:next.id,waitMs:200,shots:[{id:2,receipt:next.id,elapsedMs:0,viewTime:next.time,weapon:3,yaw:0,pitch:0}]});
 assert.equal(a.net.results.at(-1).reason,'late-shot');assert.equal(a.ammo[3],4);
});

test('local firing feedback is immediate and the authoritative echo does not play it twice',()=>{
 const s=room(),a=s.players[0],events=[],c=new ArenaClient({onEvent:e=>events.push(e)});s.revision=1;issueReceipt(s,a,1000,'clock');c.receive(arenaSnapshot(s,a.id,true));
 c.step(1/120,{firePressed:true,fire:false});assert.equal(c.shots.length,1);assert.equal(events.filter(e=>e.type==='shot').length,1);
 s.revision=2;s.events=[{id:99,type:'shot',player:a.id,weapon:3,shotId:c.shots[0].id}];c.receive(arenaSnapshot(s,a.id));assert.equal(events.filter(e=>e.type==='shot').length,1);
});

test('confirmation uses outstanding timing permissions instead of imposing 250 ms on every hit',()=>{
 for(const rtt of [30,90,200]){
  const s=room(),a=s.players[0],r=clock(s,a,1800);measureTiming(a,{receipt:r.id,waitMs:0},1800+rtt);
  const latest=clock(s,a,2300);const delay=confirmationTime(s,latest.time)-latest.time;
  assert(Math.abs(delay-(rtt/2+95)/1000)<1e-7,`${rtt} ms gives ${delay}`);assert(delay<.25);
 }
 const s=room(),a=s.players[0],r=clock(s,a,1900);const deadline=confirmationTime(s,.95);measureTiming(a,{receipt:r.id,waitMs:80},2000);
 assert.equal(confirmationTime(s,.95),deadline,'an outstanding receipt keeps its originally granted allowance');
});

test('jump and dash predict immediately; replay uses shared collision and cannot tunnel through cover',()=>{
 const s=room(),a=s.players[0],c=new ArenaClient();issueReceipt(s,a,1000,'prediction');s.revision=1;c.receive(arenaSnapshot(s,a.id,true));
 c.step(1/120,{jump:true,dash:true,z:1});assert(c.view.player.y>0);assert(c.view.player.z<40-.15);assert(c.view.player.dashCooldown>2);
 const solids=[{min:[29,0,35],max:[31,5,36]}],p={...a,x:30,z:40,y:0,vy:0,grounded:true,dashTime:0,dashCooldown:0};
 const history=Array.from({length:42},(_,i)=>({dt:1/120,input:{z:1,yaw:0,dash:i===0}}));
 const predicted=replayMotion(p,history,.35,{speed:6},solids);assert(predicted.z>=36.36-.001);
 const expected={...p};for(const h of history)advanceMotion(expected,h.input,{speed:6},h.dt,solids);assert(Math.abs(expected.z-predicted.z)<1e-6);
});

test('jittered snapshots never rewind remote presentation time and fresh shots flush before the next regular send',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let now=1000;t.mock.method(performance,'now',()=>now);
 const s=room(),a=s.players[0],c=new ArenaClient();s.revision=1;s.time=1;issueReceipt(s,a,2000,'one');c.receive(arenaSnapshot(s,a.id,true));c.active=true;c.request=async()=>new Promise(()=>{});c.schedule();
 c.step(1/120,{firePressed:true});t.mock.timers.tick(0);assert.equal(c.seq,1);assert.equal(c.inFlight,1);
 c.renderTime=1;s.time=1.01;s.revision=2;now+=100;c.receive(arenaSnapshot(s,a.id));c.step(1/120,{});assert(c.renderTime>=1);
 c.active=false;clearTimeout(c.timer);
});

test('movement prediction stays near the same travel distance at 30, 90 and 200 ms RTT',t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const positions=[];
 for(const rtt of [30,90,200]){
  now=0;const s=room(),a=s.players[0],c=new ArenaClient();s.revision=0;issueReceipt(s,a,1000,'start');c.latency=rtt;c.receive(arenaSnapshot(s,a.id,true));
  const upstream=[],downstream=[];let sendAt=50,seq=0,atSpeed=null,maxBackward=0,previous=40;
  for(let tick=1;tick<=216;tick++){
   now=tick*1000/120;
   while(upstream.length&&upstream[0].at<=now+1e-6){const packet=upstream.shift();advanceArena(s,1000+packet.at);acceptInput(s,a.id,packet.input,packet.seq,1000+packet.at);s.revision++;issueReceipt(s,a,1000+packet.at,'clock-'+packet.seq);downstream.push({at:packet.at+rtt/2,snapshot:structuredClone(arenaSnapshot(s,a.id))});}
   while(downstream.length&&downstream[0].at<=now+1e-6)c.receive(downstream.shift().snapshot);
   c.step(1/120,{z:now>=500&&now<1500?1:0});
   if(now>=600&&now<1400)maxBackward=Math.max(maxBackward,c.view.player.z-previous);previous=c.view.player.z;
   if(Math.abs(now-1200)<.01)atSpeed=c.view.player.z;
   if(now+1e-6>=sendAt){upstream.push({at:now+rtt/2,seq:++seq,input:{...c.held}});sendAt+=50;}
  }
  assert(Math.abs(atSpeed-(40-.7*5.3))<.36,`${rtt} ms position ${atSpeed}`);assert(maxBackward<.01,`${rtt} ms pulled back ${maxBackward}`);positions.push(atSpeed);
 }
 assert(Math.max(...positions)-Math.min(...positions)<.2,positions.join(', '));
});
