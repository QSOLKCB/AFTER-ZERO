import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/sqlite-store.mjs';
import {readFileSync} from 'node:fs';
import {handleArena} from '../server/arena-api.js';
import {recordHistory} from '../public/src/arena-network.js';
import {emptyMap} from '../public/src/maps.js';
import {claimArena,persistArena,releaseArena} from '../server/arena-coordinator.js';
function database(){const DB=openStore(':memory:');let conflict=false;const batch=DB.batch.bind(DB);
 DB.batch=async statements=>{const adjusted=statements.map(stmt=>{if(conflict&&stmt.sql.startsWith('UPDATE arena_rooms SET data=')){conflict=false;return DB.prepare(stmt.sql+' AND 0').bind(...stmt.values);}return stmt;});return batch(adjusted);};
 Object.defineProperty(DB,'conflict',{set(v){conflict=v;}});return DB;}
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

test('six overlapping requests queue behind one writer without a CAS retry storm',async()=>{
 const DB=database(),created=await call(DB,{action:'create',token:token1,options:{slots:8}}),code=created.body.code;
 const batch=DB.batch.bind(DB);let writes=0;
 DB.batch=async statements=>{await new Promise(resolve=>setTimeout(resolve,15));writes+=statements.filter(s=>s.sql.startsWith('UPDATE arena_rooms SET data=')).length;return batch(statements);};
 const results=await Promise.all(Array.from({length:6},(_,i)=>call(DB,{action:'sync',token:token1,code,seq:i+1,input:{x:i===5?0:1}},1100)));
 assert(results.every(r=>r.status===200));assert(results.some(r=>r.body.queued));assert(writes<=2,`only ${writes} simulation commits attempted`);
 const settled=await call(DB,{action:'sync',token:token1,code,seq:7,input:{}},1200);assert.equal(settled.body.snapshot.ack,7);
 assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM arena_commands').get().n,0);DB.close();
});

test('expired writers cannot overwrite their successor or consume its queued commands',async()=>{
 const DB=database(),created=await call(DB,{action:'create',token:token1}),code=created.body.code,id=created.body.snapshot.you;
 const state=JSON.parse(DB.sqlite.prepare('SELECT data FROM arena_rooms WHERE code=?').get(code).data),hash=state.sessions[id];
 const args={code,playerId:id,hash,body:{action:'sync',seq:1,input:{}}};
 const old=await claimArena(DB,{...args,now:1100});assert(old.claimed);
 const next=await claimArena(DB,{...args,body:{...args.body,seq:2},now:2700});assert(next.claimed);
 state.revision=1;assert.equal(await persistArena(DB,{code,lease:old.lease,revision:0,state,commands:old.commands,now:1100}),false);
 assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM arena_commands').get().n,2);
 await releaseArena(DB,code,old.lease);assert.equal(DB.sqlite.prepare('SELECT lease_id FROM arena_rooms WHERE code=?').get(code).lease_id,next.lease);
 await releaseArena(DB,code,next.lease);DB.close();
});

test('a writer cannot delete an eligible command inserted after its read; inbox size is bounded',async()=>{
 const DB=database(),created=await call(DB,{action:'create',token:token1}),code=created.body.code,id=created.body.snapshot.you;
 const state=JSON.parse(DB.sqlite.prepare('SELECT data FROM arena_rooms WHERE code=?').get(code).data),hash=state.sessions[id];
 const args={code,playerId:id,hash,now:1100};const owner=await claimArena(DB,{...args,body:{action:'sync',seq:1,input:{}}});
 for(let i=2;i<20;i++)await claimArena(DB,{...args,body:{action:'sync',seq:i,input:{jump:true}}});
 assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM arena_commands').get().n,8);
 state.revision=1;assert.equal(await persistArena(DB,{code,lease:owner.lease,revision:0,state,commands:owner.commands,now:1100}),false);
 assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM arena_commands').get().n,8);
 const forged=await call(DB,{action:'sync',token:token2,code,seq:40,input:{}},1100);assert.equal(forged.status,401);
 assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM arena_commands').get().n,8);await releaseArena(DB,code,owner.lease);DB.close();
});

test('polling a finished round does not move its restart deadline',async()=>{
 const DB=database(),created=await call(DB,{action:'create',token:token1}),code=created.body.code;
 const state=JSON.parse(DB.sqlite.prepare('SELECT data FROM arena_rooms WHERE code=?').get(code).data);state.status='finished';state.finishAt=1000;state.time=300.25;
 DB.sqlite.prepare('UPDATE arena_rooms SET data=? WHERE code=?').run(JSON.stringify(state),code);
 for(let i=1;i<13;i++){const result=await call(DB,{action:'sync',token:token1,code,seq:i,input:{}},1000+i*1000);assert.equal(result.status,200);assert.equal(result.body.snapshot.round,i===12?2:1);}
 DB.close();
});
