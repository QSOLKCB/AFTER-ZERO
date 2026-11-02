import {createArena,joinArena,leaveArena,acceptInput,advanceArena,restartArena,arenaSnapshot,classKey} from '../public/src/arena-sim.js';
import {issueReceipt,recordHistory} from '../public/src/arena-network.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
async function readBody(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing request.');let bytes=0,parts=[];
 for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>125000){await reader.cancel();throw Error('Request too large.');}parts.push(r.value);}
 const all=new Uint8Array(bytes);let at=0;for(const p of parts){all.set(p,at);at+=p.length;}return JSON.parse(new TextDecoder().decode(all));
}
export async function handleArena(request,env,now=Date.now()){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origin not allowed.'},403);
 if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'JSON required.'},415);
 if(!env.DB)return json({error:'Online rooms are unavailable on this host. Campaign and Forge work offline.'},503);
 try{
  const body=await readBody(request),action=body.action;if(!['create','join','sync','leave','class'].includes(action))return json({error:'Unknown arena action.'},400);
  const token=String(body.token||'');if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Invalid player session.'},401);
  const hash=await digest(token),playerId=hash.slice(0,20),name=body.name,kind=classKey(body.kind);
  if(action==='create'){
   const code=hash.slice(20,28).toUpperCase(),prior=await env.DB.prepare('SELECT data FROM arena_rooms WHERE code = ? AND expires > ?').bind(code,now).first();
   if(prior){const state=JSON.parse(prior.data);return json({code,snapshot:arenaSnapshot(state,playerId,true)});}
   const owner=await digest(request.headers.get('oai-authenticated-user-id')||request.headers.get('CF-Connecting-IP')||'local');
   await env.DB.prepare('DELETE FROM arena_rooms WHERE expires < ?').bind(now).run();
   const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM arena_rooms WHERE owner = ?').bind(owner).first();if(count.n>=6)return json({error:'Six rooms are already active. Rejoin one, or let an unused room expire in 20 minutes.'},429);
   const state=createArena({...body.options,networked:true},now),player=joinArena(state,{id:playerId,name,kind},now);state.sessions={[playerId]:hash};state.revision=0;issueReceipt(state,player,now,crypto.randomUUID());
   await env.DB.prepare('INSERT INTO arena_rooms (code, revision, data, owner, expires) VALUES (?, 0, ?, ?, ?)').bind(code,JSON.stringify(state),owner,now+1200000).run();
   return json({code,snapshot:arenaSnapshot(state,playerId,true)},201);
  }
  const code=String(body.code||'').trim().toUpperCase();if(!/^[A-F0-9]{8}$/.test(code))return json({error:'Enter the eight-character room code.'},400);
  for(let attempt=0;attempt<6;attempt++){
   const row=await env.DB.prepare('SELECT revision, data FROM arena_rooms WHERE code = ? AND expires > ?').bind(code,now).first();if(!row)return json({error:'Room not found or expired. Create a new room.'},404);
   const state=JSON.parse(row.data);state.networked=true;state.impacts??=[];state.deathTimes??=[];for(const p of state.players)p.life??=1;recordHistory(state);advanceArena(state,now);if(state.status==='finished'&&now-state.finishAt>=12000)restartArena(state,now);
   let p=state.players.find(p=>p.id===playerId&&!p.bot);
   if(action==='join'){
    if(!p){p=joinArena(state,{id:playerId,name,kind},now);state.sessions[playerId]=hash;}
    else p.lastSeen=now;
   }else{
    if(!p||state.sessions[playerId]!==hash)return json({error:'Player session expired. Join the room again.'},401);
    if(action==='leave'){leaveArena(state,playerId);delete state.sessions[playerId];}
    else if(action==='class'){p.class=kind;p.health=0;p.alive=false;p.respawnAt=state.time+3;p.lastSeen=now;}
    else acceptInput(state,playerId,body.input,body.seq,now,body.timing);
   }
   // Prune departed sessions. Only opaque hashes are persisted; none enter snapshots.
   for(const id of Object.keys(state.sessions))if(!state.players.some(p=>p.id===id&&!p.bot))delete state.sessions[id];
   state.revision=row.revision+1;if(action!=='leave')issueReceipt(state,p,now,crypto.randomUUID());
   const result=await env.DB.prepare('UPDATE arena_rooms SET data = ?, revision = revision + 1, expires = ? WHERE code = ? AND revision = ?').bind(JSON.stringify(state),now+1200000,code,row.revision).run();
   if(result.meta.changes===1)return json(action==='leave'?{left:true}:{code,snapshot:arenaSnapshot(state,playerId,action==='join')});
  }
  return json({error:'Room is busy. Retrying…'},409);
 }catch(error){
  const safe=/full|distinct objective|Expected an AFTER|boundary|Invalid|Unknown|unreachable|floor|Request too large|JSON|session expired|Name must|share a tile|rectangular|finite facing|list/.test(error.message);
  return json({error:safe?error.message:'Arena request failed. Please retry.'},safe?400:500);
 }
}
