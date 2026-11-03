import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/sqlite-store.mjs';
import {handleArena} from '../server/arena-api.js';
import {recordHistory} from '../public/src/arena-network.js';
import {ArenaClient} from '../public/src/arena-client.js';
import {emptyMap} from '../public/src/maps.js';

async function call(DB,body,now){
 const response=await handleArena(new Request('https://arena.test/api/arena',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB},now);
 const data=await response.json();assert(response.ok,JSON.stringify(data));return data;
}
const token=i=>i.toString(16).padStart(64,'0');
function map(){const m=emptyMap('TRANSPORT LAB',24,24);m.spawn={x:2,z:21,yaw:0};m.exit={x:21,z:2};return m;}
function arrange(DB,code,shooter,moving=false){
 const state=JSON.parse(DB.sqlite.prepare('SELECT data FROM arena_rooms WHERE code=?').get(code).data);
 for(const p of state.players)Object.assign(p,{bot:false,protocol:2,lastSeen:1e7,inputAt:1e7,x:9,z:9,shield:0,input:{x:0,z:0,yaw:0,pitch:0,weapon:null}});
 const a=state.players.find(p=>p.id===shooter),b=state.players.find(p=>p.team!==a.team);
 Object.assign(a,{x:30,z:40});Object.assign(b,{x:27,z:30,health:1000,class:'assault',input:{x:moving?.4:0,z:0,yaw:0,pitch:0,weapon:null}});recordHistory(state,true);
 DB.sqlite.prepare('UPDATE arena_rooms SET data=? WHERE code=?').run(JSON.stringify(state),code);return b.id;
}

test('14 humans polling at 20 Hz cannot evict another player’s delivered 200 ms clock',async()=>{
 const DB=openStore(':memory:');try{
  const created=await call(DB,{action:'create',token:token(1),kind:'sniper',options:{map:map(),slots:16}},1000),code=created.code;
  for(let i=2;i<=14;i++)await call(DB,{action:'join',code,token:token(i)},1000);
  arrange(DB,code,created.snapshot.you);
  const own=await call(DB,{action:'sync',code,token:token(1),seq:1,input:{}},1000),r=own.snapshot.clock;
  for(let now=1050;now<=1200;now+=50)for(let i=2;i<=14;i++)await call(DB,{action:'sync',code,token:token(i),seq:now,input:{},timing:{protocol:2}},now);
  const result=await call(DB,{action:'sync',code,token:token(1),seq:2,input:{},timing:{protocol:2,receipt:r.id,waitMs:20,shots:[{id:1,receipt:r.id,elapsedMs:20,viewTime:r.time,weapon:3,yaw:0,pitch:0,aim:true}]}},1220);
  assert.equal(result.snapshot.shotResults[0].reason,'accepted');
 }finally{DB.close();}
});

// Virtual wire runs the actual client polling, firing, response handling and API,
// including SQLite serialization. No synthetic shot timestamps or hit claims.
async function wire(t,{rtt=200,jitter=0,moving=false,kind='sniper',fireFor=2500}={}){
 const DB=openStore(':memory:');let now=1000,serial=0;
 t.mock.method(performance,'now',()=>now);
 const queue=[],enqueue=(at,run)=>queue.push({at,order:++serial,run}),results=new Map();
 const c=new ArenaClient();c.token=token(1);
 const created=await call(DB,{action:'create',token:c.token,kind,options:{map:map(),slots:8}},now),code=created.code;
 const targetId=arrange(DB,code,created.snapshot.you,moving);
 c.code=code;c.active=true;
 const initial=await call(DB,{action:'sync',code,token:c.token,seq:0,input:{}},now);initial.snapshot.map=created.snapshot.map;
 now+=rtt/2;c.receive(initial.snapshot);
 c.schedule=function(delay=50){const generation=this.scheduleGeneration=(this.scheduleGeneration||0)+1;this.nextSend=now+delay;enqueue(this.nextSend,()=>{if(this.active&&generation===this.scheduleGeneration)void this.poll();});};
 let requests=0;
 c.request=body=>new Promise((resolve,reject)=>{
  const extra=jitter&&requests++%7===2?jitter:0,started=now;
  enqueue(now+rtt/2+extra,async()=>{
   try{const data=await call(DB,{token:c.token,code,...body},now);for(const r of data.snapshot.shotResults)results.set(r.id,r.reason);
    enqueue(now+rtt/2+extra,()=>{c.latency=now-started;resolve(data);});
   }catch(error){reject(error);}
  });
 });
 c.schedule();
 const start=now,end=start+3500;
 for(let frame=1;frame<=420;frame++)enqueue(start+frame*1000/120,()=>{
  if(!c.active)return;const target=c.view.enemies.find(p=>p.id===targetId),p=c.view.player;
  p.yaw=Math.atan2(target.x-p.x,p.z-target.z);p.pitch=Math.atan2(target.y+1.2-p.y-1.67,Math.hypot(target.x-p.x,target.z-p.z));
  c.step(1/120,{fire:now>start+300&&now<start+300+fireFor,aim:true});
 });
 while(queue.length){queue.sort((a,b)=>a.at-b.at||a.order-b.order);const next=queue.shift();if(next.at>end+500)break;now=next.at;if(now>end)c.active=false;await next.run();await Promise.resolve();await Promise.resolve();}
 const state=JSON.parse(DB.sqlite.prepare('SELECT data FROM arena_rooms WHERE code=?').get(code).data),target=state.players.find(p=>p.id===targetId);
 c.active=false;DB.close();return {results:[...results.values()],damage:1000-target.health,shots:c.shotId};
}

test('real client shots hit a moving target through 30, 90 and 200 ms transport',async t=>{
 for(const rtt of [30,90,200]){
  const result=await wire(t,{rtt,moving:true});
  assert.equal(result.shots,3,JSON.stringify({rtt,...result}));
  assert.deepEqual(result.results,['accepted','accepted','accepted'],JSON.stringify({rtt,...result}));
  assert.equal(result.damage,285,JSON.stringify({rtt,...result}));
 }
});

test('automatic fire survives modest packet jitter without losing rounds to clock drift',async t=>{
 const result=await wire(t,{rtt:200,jitter:35,kind:'assault',fireFor:1200});
 assert(result.shots>=13,JSON.stringify(result));
 assert(result.results.every(reason=>reason==='accepted'),JSON.stringify(result));
});
