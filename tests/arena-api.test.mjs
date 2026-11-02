import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleArena} from '../server/arena-api.js';
import {recordHistory} from '../public/src/arena-network.js';
import {emptyMap} from '../public/src/maps.js';
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_moaning_karnak.sql',import.meta.url),'utf8'));let conflict=false;
 return {sqlite,set conflict(v){conflict=v;},prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return sqlite.prepare(sql).get(...values)||null;},async run(){if(conflict&&sql.startsWith('UPDATE')){conflict=false;return {meta:{changes:0}};}const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}};}};}};}
const token1='ab'.repeat(32),token2='cd'.repeat(32),token3='ef'.repeat(32);
async function call(DB,body,now=1000,origin='https://arena.test'){const r=await handleArena(new Request('https://arena.test/api/arena',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}),{DB},now);return {status:r.status,body:await r.json()};}
test('two independent human sessions share one server room; credentials never appear in snapshots',async()=>{
 const DB=database(),a=await call(DB,{action:'create',token:token1,name:'Alice',kind:'sniper',options:{mode:'tdm',slots:8}});assert.equal(a.status,201);const code=a.body.code;
 const b=await call(DB,{action:'join',code,token:token2,name:'Bob',kind:'engineer'});assert.equal(b.status,200);assert.equal(b.body.snapshot.players.filter(p=>!p.bot).length,2);const humans=b.body.snapshot.players.filter(p=>!p.bot);assert.notEqual(humans[0].team,humans[1].team);
 const sync=await call(DB,{action:'sync',token:token1,code,seq:1,input:{fire:true,yaw:0,pitch:0}},1100);assert.equal(sync.status,200);assert.equal(sync.body.snapshot.players.filter(p=>!p.bot).length,2);assert(!JSON.stringify(sync.body).includes(token1));assert(!JSON.stringify(sync.body).includes('sessions'));
 const impostor=await call(DB,{action:'sync',token:token3,code,seq:999,input:{damage:999}},1200);assert.equal(impostor.status,401);
 const left=await call(DB,{action:'leave',token:token2,code},1300);assert.equal(left.status,200);const after=await call(DB,{action:'sync',token:token1,code,seq:2,input:{}},1400);assert.equal(after.body.snapshot.players.filter(p=>!p.bot).length,1);assert.equal(after.body.snapshot.players.length,8);
});
test('CAS conflict retries safely and duplicate input does not replay a one-shot action',async()=>{
 const DB=database(),a=await call(DB,{action:'create',token:token1,options:{slots:8}}),code=a.body.code;DB.conflict=true;
 const first=await call(DB,{action:'sync',token:token1,code,seq:1,input:{timePressed:true}},1100);assert.equal(first.status,200);
 const second=await call(DB,{action:'sync',token:token1,code,seq:1,input:{timePressed:true}},1200);const own=second.body.snapshot.players.find(p=>p.id===second.body.snapshot.you);assert(own.energy>=50&&own.energy<52);
 const again=await call(DB,{action:'sync',token:token1,code,seq:1,input:{timePressed:true}},1300);assert(again.body.snapshot.players.find(p=>p.id===again.body.snapshot.you).energy>=own.energy);
});
test('room creation retries are idempotent; origins, expired rooms and oversized inputs are rejected',async()=>{
 const DB=database(),body={action:'create',token:token1,options:{slots:8}},a=await call(DB,body),b=await call(DB,body);assert.equal(a.body.code,b.body.code);assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM arena_rooms').get().n,1);
 assert.equal((await call(DB,body,1000,'https://foreign.test')).status,403);
 assert.equal((await call(DB,{action:'join',token:token2,code:a.body.code},1201001)).status,404);
 assert.equal((await call(DB,{...body,name:'x'.repeat(125000)})).status,400);
});

test('timed shots survive persisted CAS retries and timing receipts are private to each player',async()=>{
 const DB=database(),map=emptyMap('NETWORK',24,24);map.spawn={x:2,z:21,yaw:0};map.exit={x:21,z:2};
 const created=await call(DB,{action:'create',token:token1,kind:'sniper',options:{map,slots:8}}),code=created.body.code,first=created.body.snapshot;
 const state=JSON.parse(DB.sqlite.prepare('SELECT data FROM arena_rooms WHERE code=?').get(code).data);
 for(const p of state.players)Object.assign(p,{bot:false,protocol:2,lastSeen:1e7,inputAt:1e7,x:9,z:9,shield:0,input:{x:0,z:0,yaw:0,pitch:0,weapon:null}});
 const [a,b]=state.players;Object.assign(a,{x:30,z:40});Object.assign(b,{x:30,z:30,health:90});recordHistory(state,true);
 DB.sqlite.prepare('UPDATE arena_rooms SET data=? WHERE code=?').run(JSON.stringify(state),code);
 const shot={id:1,receipt:first.clock.id,elapsedMs:0,viewTime:0,weapon:3,yaw:0,pitch:Math.atan2(-.47,10),aim:true};
 const body={action:'sync',token:token1,code,seq:1,input:{},timing:{protocol:2,receipt:first.clock.id,waitMs:0,shots:[shot]}};
 DB.conflict=true;const accepted=await call(DB,body,1100);assert.equal(accepted.body.snapshot.shotResults[0].reason,'accepted');assert.equal(accepted.body.snapshot.players.find(p=>p.id===a.id).ammo[3],3);
 const duplicate=await call(DB,body,1200);assert.equal(duplicate.body.snapshot.shotResults.length,1);assert.equal(duplicate.body.snapshot.players.find(p=>p.id===a.id).ammo[3],3);
 await call(DB,{...body,seq:2,timing:{protocol:2,shots:[]}},1300);const settled=await call(DB,{...body,seq:3,timing:{protocol:2,shots:[]}},1400);
 assert.equal(settled.body.snapshot.players.find(p=>p.id===b.id).alive,false);assert(settled.body.snapshot.revision>accepted.body.snapshot.revision);
 assert(!JSON.stringify(settled.body.snapshot).includes('history'));assert(!JSON.stringify(settled.body.snapshot).includes('sentAt":1000'));

 const otherDB=database(),room=await call(otherDB,{action:'create',token:token1}),joined=await call(otherDB,{action:'join',token:token2,code:room.body.code});
 const forged=await call(otherDB,{action:'sync',token:token2,code:room.body.code,seq:1,input:{},timing:{protocol:2,shots:[{...shot,receipt:room.body.snapshot.clock.id}]}},1100);
 assert.equal(forged.body.snapshot.shotResults[0].reason,'expired-clock');assert.notEqual(joined.body.snapshot.clock.id,room.body.snapshot.clock.id);DB.sqlite.close();otherDB.sqlite.close();
});
