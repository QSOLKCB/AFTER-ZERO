import {sanitizeInput} from '../public/src/arena-sim.js';
const number=v=>Number.isFinite(v)?v:null;
const cleanTiming=t=>t?.protocol===2?{
 protocol:2,receipt:String(t.receipt||'').slice(0,64),waitMs:number(t.waitMs),
 shots:(Array.isArray(t.shots)?t.shots:[]).slice(0,32).filter(Boolean).map(q=>({id:number(q.id),receipt:String(q.receipt||'').slice(0,64),elapsedMs:number(q.elapsedMs),viewTime:number(q.viewTime),weapon:number(q.weapon),yaw:number(q.yaw),pitch:number(q.pitch),aim:q.aim===true})),
 actions:(Array.isArray(t.actions)?t.actions:[]).slice(0,16).filter(Boolean).map(q=>({id:number(q.id),input:sanitizeInput(q.input||{})}))
}:null;
export async function claimArena(DB,{code,playerId,hash,body,now}){
 const lease=crypto.randomUUID(),statements=[];
 if(body.action==='sync'){
  if(!Number.isSafeInteger(body.seq)||body.seq<0)throw Error('Invalid input sequence.');
  const command=JSON.stringify({input:sanitizeInput(body.input||{}),timing:cleanTiming(body.timing)});
  // A session can have only eight queued envelopes. Shots/actions inside them have
  // independent IDs, and the client repeats unacknowledged edges in newer envelopes.
  statements.push(DB.prepare(`INSERT OR IGNORE INTO arena_commands (code,player,seq,received,command)
   SELECT ?,?,?,?,? FROM arena_rooms WHERE code=? AND expires>? AND json_extract(data,?)=?
   AND (SELECT count(*) FROM arena_commands WHERE code=? AND player=?)<8`).bind(code,playerId,body.seq,now,command,code,now,'$.sessions."'+playerId+'"',hash,code,playerId));
 }
 // RETURNING reads the claimed state and inbox in the same statement. Avoid two
 // extra storage queries on every poll, including requests that only queue input.
 statements.push(DB.prepare(`UPDATE arena_rooms SET
  lease_id=CASE WHEN lease_until<=? THEN ? ELSE lease_id END,
  lease_until=CASE WHEN lease_until<=? THEN ? ELSE lease_until END
  WHERE code=? AND expires>?
  RETURNING revision,data,lease_id,
   (SELECT json_group_array(json_object('id',rowid,'player',player,'seq',seq,'received',received,'command',command))
    FROM arena_commands WHERE code=? AND received<=? AND arena_rooms.lease_id=?) AS commands`)
  .bind(now,lease,now,now+1500,code,now,code,now,lease));
 const results=await DB.batch(statements),row=results.at(-1).results[0];
 const commands=JSON.parse(row?.commands||'[]').sort((a,b)=>a.received-b.received||a.seq-b.seq||a.player.localeCompare(b.player));
 return {row,lease,claimed:row?.lease_id===lease,commands};
}
export async function persistArena(DB,{code,lease,revision,state,commands,now}){
 const lastId=Math.max(0,...commands.map(c=>c.id));
 // Fence the commit against eligible inputs that reached storage after the read.
 // Newer commands remain queued; an expired lease can never overwrite a successor.
 const result=await DB.batch([
  DB.prepare(`UPDATE arena_rooms SET data=?, revision=revision+1, expires=?, lease_until=0
   WHERE code=? AND revision=? AND lease_id=?
   AND NOT EXISTS (SELECT 1 FROM arena_commands WHERE code=? AND received<=? AND rowid>?)`)
   .bind(JSON.stringify(state),now+1200000,code,revision,lease,code,now,lastId),
  DB.prepare(`DELETE FROM arena_commands WHERE code=? AND rowid<=? AND received<=?
   AND EXISTS (SELECT 1 FROM arena_rooms WHERE code=? AND revision=? AND lease_id=?)`)
   .bind(code,lastId,now,code,revision+1,lease)
 ]);
 return result[0].meta.changes===1;
}
export async function readCommands(DB,code,now){return (await DB.prepare('SELECT rowid AS id,player,seq,received,command FROM arena_commands WHERE code=? AND received<=? ORDER BY received,seq,player').bind(code,now).all()).results;}
export async function releaseArena(DB,code,lease){await DB.prepare('UPDATE arena_rooms SET lease_until=0 WHERE code=? AND lease_id=?').bind(code,lease).run();}
