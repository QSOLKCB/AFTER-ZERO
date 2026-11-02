import {Game,WEAPONS,moveBody} from './game.js';
import {CLASSES} from './arena-sim.js';
import {applyLook} from './aim.js';
import {clamp} from './math.js';
import {NET,interpolatePlayers} from './arena-network.js';
import {ARENA_API_URL} from './arena-endpoint.js';
const edges=['jump','dash','reload','timePressed','use'];
export class ArenaClient{
 constructor({onUpdate=()=>{},onEvent=()=>{},onError=()=>{}}={}){this.onUpdate=onUpdate;this.onEvent=onEvent;this.onError=onError;this.token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');this.seq=0;this.pending={};this.held={};this.active=false;this.eventId=0;this.latency=0;this.received=0;this.inFlight=0;this.frames=[];this.shots=[];this.actions=[];this.commandId=0;this.shotId=0;this.fireReady=WEAPONS.map(()=>0);this.revision=-1;this.fireUntil=0;this.predictedShots=new Set();}
 async request(body){
  const start=performance.now(),response=await fetch(ARENA_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token,code:this.code,...body}),signal:AbortSignal.timeout(5000)});
  let data;try{data=await response.json();}catch{throw Error('Online rooms need the hosted game server. This static copy supports Campaign and Forge.');}
  if(!response.ok)throw Object.assign(Error(data.error||'Connection interrupted.'),{status:response.status});this.latency=Math.round(performance.now()-start);return data;
 }
 async connect(action,options){const data=await this.request({action,...options});this.code=data.code;this.active=true;this.receive(data.snapshot);this.schedule();return this;}
 schedule(){clearTimeout(this.timer);if(this.active)this.timer=setTimeout(()=>this.poll(),NET.interval);}
 async poll(){
  if(!this.active)return;
  // Schedule before awaiting: 200 ms RTT still sends the same 20 input updates/second.
  this.schedule();if(this.inFlight>=NET.maxInFlight)return;
  const clock=this.snapshot?.clock;
  const payload={action:'sync',seq:++this.seq,input:{...this.held},timing:{protocol:2,receipt:clock?.id,waitMs:Math.max(0,performance.now()-this.received),shots:this.shots.slice(0,32),actions:this.actions.slice(0,16)}};
  this.inFlight++;
  try{const data=await this.request(payload);if(!this.active)return;this.receive(data.snapshot);}
  catch(err){if(!this.active||payload.seq<(this.snapshot?.ack??0))return;this.error=err.message;if(err.status===401||err.status===404){this.active=false;clearTimeout(this.timer);this.onError(err.message);this.onUpdate(this);}else if(performance.now()-this.received>1000)this.onError(err.message);else this.onUpdate(this);}
  finally{this.inFlight--;}
 }
 receive(s){
  if(s.revision<=this.revision)return false;
  this.revision=s.revision;this.error='';
  const acknowledged=new Set((s.shotResults||[]).map(r=>r.id));this.shots=this.shots.filter(q=>!acknowledged.has(q.id));
  const commands=new Set(s.actionAck||[]);this.actions=this.actions.filter(q=>!commands.has(q.id));
  const rejected=(s.shotResults||[]).filter(r=>r.id>(this.resultId||0)&&['late-shot','stale-view','expired-clock'].includes(r.reason));
  if(rejected.length)this.shotWarning='Signal too late — shot outside compensation window';
  else this.shotWarning='';this.resultId=Math.max(this.resultId||0,...(s.shotResults||[]).map(r=>r.id));
  this.received=performance.now();this.snapshot=s;const me=s.players.find(p=>p.id===s.you);if(!me)return;
  if(s.map&&!this.view){this.view=new Game(s.map,{custom:true});this.view.arena=true;}
  const g=this.view,p=g.player,wasAlive=this.me?.alive??false,roundChanged=this.round!==s.round,lifeChanged=this.me?.life!==me.life;this.round=s.round;this.me=me;
  if(roundChanged||lifeChanged){this.frames=[];this.shots=[];this.actions=[];this.fireReady=WEAPONS.map(()=>0);this.fireUntil=0;}
  this.frames.push({time:s.time,players:s.players});this.frames=this.frames.slice(-12);this.renderTime=Math.max(this.frames[0].time,s.time-NET.interpolation);
  if(!wasAlive||roundChanged||lifeChanged||Math.hypot(me.x-p.x,me.z-p.z)>5){p.x=me.x;p.y=me.y;p.z=me.z;p.yaw=me.yaw;p.pitch=me.pitch;p.vy=me.vy;}
  else{p.x+=(me.x-p.x)*.35;p.z+=(me.z-p.z)*.35;p.y+=(me.y-p.y)*.35;}
  p.health=me.health;p.energy=me.energy;p.grounded=me.grounded;
  Object.assign(g,{time:s.time,maxHealth:CLASSES[me.class].health,maxEnergy:100,weapon:me.weapon,unlocked:[0,CLASSES[me.class].weapon],ammo:me.ammo.slice(),reload:me.reload,dashCooldown:me.dashCooldown,score:me.kills,slow:me.field>0,timeScale:1,nodes:s.mode==='dom'?s.nodes:[],stations:s.stations,arenaPlayers:s.players});
  this.targets=new Map(s.players.filter(q=>q.id!==s.you).map(q=>[q.id,q]));
  const old=new Map(g.enemies.map(q=>[q.id,q]));g.enemies=[...this.targets.values()].map(q=>({...old.get(q.id),...q,x:old.get(q.id)?.x??q.x,y:old.get(q.id)?.y??q.y,z:old.get(q.id)?.z??q.z,type:'sentry',phase:s.time,flash:0,charge:0,color:s.mode==='dm'?[1.7,.4,.13]:q.team===0?[.1,1.5,1.8]:[1.8,.35,.55]}));
  g.projectiles=s.projectiles.map(b=>({...b,enemy:s.mode==='dm'?b.owner!==s.you:b.team!==me.team}));
  for(const e of s.events)if(e.id>this.eventId){if(!(e.type==='shot'&&e.player===s.you&&this.predictedShots.has(e.shotId)))this.onEvent(e,s.you);this.eventId=Math.max(this.eventId,e.id);}
  this.onUpdate(this);
 }
 step(dt,input={}){
  const g=this.view,p=g.player;g.time+=dt;
  this.renderTime=Math.min(this.snapshot.time,Math.max(this.frames[0]?.time??0,this.snapshot.time-NET.interpolation+(performance.now()-this.received)/1000));
  const poses=new Map(interpolatePlayers(this.frames,this.renderTime).map(p=>[p.id,p]));
  for(const e of g.enemies){const target=poses.get(e.id);if(target){Object.assign(e,{x:target.x,y:target.y,z:target.z,yaw:target.yaw,alive:target.alive,life:target.life});e.phase=g.time;}}
  if(!this.me?.alive||this.snapshot.status!=='playing'){this.neutral();return;}
  applyLook(p,input,dt,{sensitivity:input.sensitivity??1,invert:input.invert,weapon:g.weapon,ads:g.ads});
  this.held={x:input.x,z:input.z,yaw:p.yaw,pitch:p.pitch,fire:input.fire,aim:input.aim,sprint:input.sprint};
  const action={};for(const key of edges)if(input[key])action[key]=true;if(Number.isInteger(input.weapon))action.weapon=input.weapon;
  if(Object.keys(action).length&&this.actions.length<16)this.actions.push({id:++this.commandId,input:action});
  const now=performance.now();if(input.firePressed)this.fireUntil=now+150;
  if((input.fire||this.fireUntil>now)&&now>=this.fireReady[g.weapon]&&!g.reload&&this.shots.length<32&&this.snapshot.clock){
   const clock=this.snapshot.clock;this.shots.push({id:++this.shotId,receipt:clock.id,elapsedMs:Math.max(0,now-this.received),viewTime:this.renderTime,weapon:g.weapon,yaw:p.yaw,pitch:p.pitch,aim:!!input.aim});
   this.fireReady[g.weapon]=now+WEAPONS[g.weapon].delay*1000;this.fireUntil=0;
   if(g.ammo[g.weapon]>0){this.predictedShots.add(this.shotId);while(this.predictedShots.size>128)this.predictedShots.delete(this.predictedShots.values().next().value);this.onEvent({type:'shot',player:this.snapshot.you,weapon:g.weapon,shotId:this.shotId,predicted:true},this.snapshot.you);}
  }
  g.ads=clamp(g.ads+(input.aim&&!g.reload?1:-1)*dt*8,0,1);g.recoil=Math.max(0,g.recoil-dt*5);g.reload=Math.max(0,g.reload-dt);g.moving=Math.hypot(input.x||0,input.z||0)>.01;
  if(performance.now()-this.received>1000)return;
  let mx=input.x||0,mz=input.z||0,n=Math.hypot(mx,mz);if(n>1){mx/=n;mz/=n;}
  const c=CLASSES[this.me.class],speed=c.speed*(input.sprint?1.3:1)*(input.aim?.65:1),sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
  moveBody(p,(mx*cos+mz*sin)*speed*dt,(mx*sin-mz*cos)*speed*dt,g.world.solids);
 }
 neutral(){this.pending={};this.shots=[];this.actions=[];this.fireUntil=0;this.held={x:0,z:0,fire:false,aim:false,yaw:this.view?.player.yaw||0,pitch:this.view?.player.pitch||0};}
 async changeClass(kind){const data=await this.request({action:'class',kind});this.receive(data.snapshot);}
 async leave(){this.active=false;clearTimeout(this.timer);this.neutral();try{await this.request({action:'leave'});}catch{} }
}
