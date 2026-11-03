// Shared deterministic arena rules. Production advances this state on the server only.
import {firstWall,enemyRay,WEAPONS,STEP} from './game.js';
import {steerTo} from './navigation.js';
import {arenaGeometry} from './arena-geometry.js?v=0.4.4';
import {clamp,forward} from './math.js';
import {generateMap,seedNumber} from './generator.js';
import {cloneMap,parseMap} from './maps.js';
import {advanceMotion} from './arena-motion.js';
import {NET,recordHistory,historicalPose,playerNetwork,measureTiming,validateShot,rememberShot,confirmationTime} from './arena-network.js?v=0.4.4';
export const MODES={dm:'Deathmatch',tdm:'Team deathmatch',dom:'Domination'};
export const CLASSES={
 sniper:{name:'Sniper',weapon:3,health:90,speed:5.3,role:'NULL rail · long-range precision'},
 cqb:{name:'CQB',weapon:2,health:125,speed:6.5,role:'BREACH scattergun · fast flanker'},
 assault:{name:'Assault',weapon:1,health:110,speed:6,role:'RAZOR automatic · flexible frontline'},
 engineer:{name:'Engineer',weapon:4,health:105,speed:5.6,role:'HELIX plasma · E deploys a repair station'}
};
export const classKey=v=>Object.hasOwn(CLASSES,v)?v:'assault';
const neutral=()=>({x:0,z:0,turn:0,look:0,fire:false,aim:false,sprint:false,yaw:0,pitch:0});
export function sanitizeInput(v={}){
 const n=(key,a,b)=>Number.isFinite(v[key])?clamp(v[key],a,b):0;
 return {x:n('x',-1,1),z:n('z',-1,1),yaw:n('yaw',-1e6,1e6)%(Math.PI*2),pitch:n('pitch',-Math.PI*.48,Math.PI*.48),fire:v.fire===true,firePressed:v.firePressed===true,aim:v.aim===true,sprint:v.sprint===true,jump:v.jump===true,dash:v.dash===true,reload:v.reload===true,timePressed:v.timePressed===true,use:v.use===true,weapon:Number.isInteger(v.weapon)?v.weapon:null};
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function random(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
export function createArena({mode='tdm',slots=12,seed='NEON-ARENA',map=null,networked=false}={},now=Date.now()){
 mode=Object.hasOwn(MODES,mode)?mode:'tdm';slots=[8,12,16].includes(Number(slots))?Number(slots):12;
 map=map?parseMap(JSON.stringify(map)):generateMap({seed,size:24,layout:'depot',enemies:0,symmetric:true});
 map=cloneMap(map);map.enemies=[];map.terminals=[];map.pickups=[];
 const floors=[];map.tiles.forEach((r,z)=>r.forEach((t,x)=>{if(t===0)floors.push({x:x*3,z:z*3});}));
 const centre={x:map.tiles[0].length*1.5-1.5,z:map.tiles.length*1.5-1.5};
 const near=p=>floors.slice().sort((a,b)=>distance(a,p)-distance(b,p))[0];
 const spawnA={x:map.spawn.x*3,z:map.spawn.z*3},spawnB={x:map.exit.x*3,z:map.exit.z*3};
 const nodes=[near(spawnA),near(centre),near(spawnB)].map((p,i)=>({...p,label:'ABC'[i],owner:null,capture:null,progress:0,contested:false}));
 if(new Set(nodes.map(p=>`${p.x},${p.z}`)).size!==3)throw Error('Arena needs three distinct objective areas. Move the start and exit farther apart.');
 const s={mode,slots,map,floors,nodes,players:[],projectiles:[],stations:[],tracers:[],events:[],eventId:0,scores:[0,0],rng:seedNumber(seed),time:0,at:now,round:1,limit:mode==='dm'?25:mode==='tdm'?60:150,status:'playing',winner:null,finishAt:0,domTick:0};
 for(let i=0;i<slots;i++){const p={id:'slot-'+i,bot:true,name:'AGENT '+String(i+1).padStart(2,'0'),team:mode==='dm'?i:i%2,class:Object.keys(CLASSES)[(mode==='dm'?i:Math.floor(i/2))%4],kills:0,deaths:0,seq:-1,lastSeen:now,inputAt:now,input:neutral(),brainAt:0,brain:neutral(),target:null};s.players.push(p);respawn(s,p);}
 s.networked=networked;s.impacts=[];s.deathTimes=[];recordHistory(s);return s;
}
export function respawn(s,p){
 p.life=(p.life||0)+1;p.net=undefined;p.pendingEdges={};
 const c=CLASSES[p.class],foes=s.players.filter(q=>q!==p&&q.alive&&(s.mode==='dm'||q.team!==p.team));
 const home=s.mode==='dm'?null:s.nodes[p.team===0?0:2];
 let choices=s.floors.filter(q=>!home||distance(q,home)<14);if(choices.length<4)choices=s.floors;
 let best=choices[0],score=-Infinity;
 for(const q of choices){const safety=foes.length?Math.min(...foes.map(f=>distance(q,f))):25;const value=safety+random(s)*3;if(value>score){score=value;best=q;}}
 Object.assign(p,{x:best.x,z:best.z,y:0,vy:0,yaw:p.team===1?Math.PI:0,pitch:0,grounded:true,alive:true,health:c.health,energy:100,weapon:c.weapon,ammo:WEAPONS.map(w=>w.mag),ready:WEAPONS.map(()=>0),reload:0,cooldown:0,switchReady:0,ads:0,recoil:0,fireBuffer:0,dashCooldown:0,dashTime:0,ability:0,field:0,shield:1.7,respawnAt:0,input:neutral(),brain:neutral(),brainAt:0,target:null,targetYaw:p.team===1?Math.PI:0,targetPitch:0,navigation:null,moveGoal:null,moveTarget:null});
}
export function joinArena(s,{id,name,kind='assault'},now){
 let candidates=s.players.filter(p=>p.bot);
 if(s.mode!=='dm'){
  const human=[0,1].map(team=>s.players.filter(p=>!p.bot&&p.team===team).length);
  candidates=candidates.filter(p=>s.players.filter(q=>q.bot&&q.team===p.team).length>1);
  candidates.sort((a,b)=>human[a.team]-human[b.team]);
 }else if(candidates.length<=1)candidates=[];
 if(!candidates.length)throw Error('Human slots are full. One AI slot per team is reserved for mixed teams.');
 const p=candidates[0];Object.assign(p,{id,bot:false,name:String(name||'RUNNER').replace(/[\x00-\x1f<>]/g,'').trim().slice(0,18)||'RUNNER',class:classKey(kind),kills:0,deaths:0,lastSeen:now,inputAt:now,seq:-1});respawn(s,p);recordHistory(s,true);return p;
}
export function leaveArena(s,id){const p=s.players.find(v=>v.id===id);if(!p)return;Object.assign(p,{bot:true,id:'bot-'+(++s.eventId),name:'AGENT '+String(s.eventId%99).padStart(2,'0'),seq:-1});p.input=neutral();p.brainAt=0;balanceHumans(s);}
function balanceHumans(s){
 if(s.mode==='dm')return;
 const humans=[0,1].map(t=>s.players.filter(p=>!p.bot&&p.team===t));
 if(Math.abs(humans[0].length-humans[1].length)<=1)return;
 const from=humans[0].length>humans[1].length?0:1,p=humans[from].at(-1),bot=s.players.find(q=>q.bot&&q.team===1-from);if(!bot)return;
 bot.team=from;p.team=1-from;respawn(s,p);respawn(s,bot);event(s,'balance',{name:p.name});
}
export function acceptInput(s,id,input,seq,now,timing,receivedAt=now){
 const p=s.players.find(v=>v.id===id&&!v.bot);if(!p)throw Error('Session expired. Join the room again.');
 p.lastSeen=now;
 if(s.networked&&timing?.protocol===2){
  measureTiming(p,timing,receivedAt);p.protocol=2;
  const clock=playerNetwork(p).receipts.find(r=>r.id===timing.receipt);
  if(clock&&clock.round===s.round&&clock.life===p.life&&now-clock.sentAt<500){
   for(const command of (Array.isArray(timing.actions)?timing.actions:[]).slice(0,16)){
    const n=playerNetwork(p);if(!command||!Number.isSafeInteger(command.id)||command.id<1||n.commands.includes(command.id))continue;
    n.commands.push(command.id);n.commands=n.commands.slice(-64);p.pendingEdges??={};
    const v=sanitizeInput(command.input);for(const k of ['jump','dash','reload','timePressed','use'])if(v[k])p.pendingEdges[k]=true;
    if(v.weapon!==null)p.pendingEdges.weapon=v.weapon;
   }
  }
  // Retransmitted edges have their own IDs: an older packet can still contain a new shot.
  const shots=Array.isArray(timing.shots)?timing.shots.slice(0,32):[];
  const valid=[];
  for(const shot of shots){
   if(!shot||!Number.isSafeInteger(shot.id)||shot.id<1||playerNetwork(p).seen.includes(shot.id))continue;
   const proof=validateShot(s,p,shot,receivedAt);
   rememberShot(p,shot.id,proof.reason||'queued');if(!proof.reason)valid.push({shot,proof});
  }
  valid.sort((a,b)=>a.proof.at-b.proof.at||a.shot.id-b.shot.id);
  for(const {shot,proof} of valid){
   const result=playerNetwork(p).results.find(r=>r.id===shot.id);
   result.reason=shoot(s,p,{...sanitizeInput(shot),aim:shot.aim===true},{...proof,clientShotId:shot.id})||'accepted';
  }
 }
 if(Number.isSafeInteger(seq)&&seq>p.seq){p.input=sanitizeInput(input);if(p.protocol===2){for(const k of ['firePressed','jump','dash','reload','timePressed','use'])p.input[k]=false;p.input.weapon=null;}p.seq=seq;p.inputAt=receivedAt;return true;}return false;
}
function event(s,type,data={}){s.events.push({id:++s.eventId,type,...data});s.events=s.events.slice(-32);}
function botInput(s,p,world,nav,dt){
 if(s.time>=p.brainAt){
  p.brainAt=s.time+.2+random(s)*.1;
  const targets=s.players.filter(q=>q!==p&&q.alive&&(s.mode==='dm'||q.team!==p.team)).sort((a,b)=>distance(p,a)-distance(p,b));
  const eye=[p.x,p.y+1.67,p.z];let target=null;
  for(const q of targets){const v=[q.x-p.x,q.y-p.y-.3,q.z-p.z],d=Math.hypot(...v);if(d<65&&firstWall(eye,v.map(n=>n/Math.max(.001,d)),world.solids,d)>=d-.05){target=q;break;}}
  let dest=target||targets[0];
  if(s.mode==='dom'){const goals=s.nodes.filter(n=>n.owner!==p.team||n.contested);if(goals.length)dest=goals[(Number(p.id.replace(/\D/g,''))||0)%goals.length];}
  if(!dest)dest=s.nodes[1];
  p.target=target?.id??null;p.aimError=target?(random(s)-.5)*.055:0;
  p.moveTarget=dest.id??null;p.moveGoal={x:dest.x,z:dest.z};
  p.stopDistance=dest===target?(p.class==='sniper'?24:p.class==='cqb'?7:15):2;
  p.brain={...neutral(),fire:!!target&&p.shield===0,aim:!!target&&p.class==='sniper',sprint:!target,reload:p.ammo[p.weapon]===0};
 }
 const target=s.players.find(q=>q.id===p.target&&q.alive),destination=s.players.find(q=>q.id===p.moveTarget&&q.alive)||p.moveGoal||p;
 const speed=CLASSES[p.class].speed*(p.brain.sprint?1.3:1)*(p.brain.aim?.65:1);
 const move=steerTo(nav,p,destination,{now:s.time,dt,speed,radius:.36,others:s.players,stop:p.stopDistance??2});
 if(target){p.targetYaw=Math.atan2(target.x-p.x,-(target.z-p.z))+(p.aimError||0);p.targetPitch=Math.atan2(target.y-p.y-.3,Math.max(1,distance(p,target)));}
 else if(Math.hypot(move.x,move.z)>.01){p.targetYaw=Math.atan2(move.x,-move.z);p.targetPitch=0;}
 const diff=((p.targetYaw-p.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
 p.yaw+=clamp(diff,-2.4*dt,2.4*dt);p.pitch+=(p.targetPitch-p.pitch)*Math.min(1,dt*5);
 // Recompute body-local inputs after turning on every tick. World-space route direction stays fixed.
 const sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
 if(target===destination&&distance(p,target)<=(p.stopDistance??2)){
  // Preserve combat strafing, but check the body's clearance before either sidestep.
  const strafe=Math.sin(s.time+p.team)*.35,probe=Math.max(.5,speed*dt);
  for(const sign of [1,-1]){const x=cos*strafe*sign,z=sin*strafe*sign;if(nav.clear(p,{x:p.x+x*probe,z:p.z+z*probe},.36,{avoidHazards:true})){move.x=x;move.z=z;break;}}
 }
 return {...p.brain,x:move.x*cos+move.z*sin,z:move.x*sin-move.z*cos,fire:p.brain.fire&&!!target,yaw:p.yaw,pitch:p.pitch,use:p.class==='engineer'&&p.health<CLASSES[p.class].health*.6&&p.ability<=0,timePressed:p.health<45&&p.energy>=50&&p.field<=0};
}
function hurt(s,target,damage,source,at=s.time,historical=false){
 if(!target.alive||(!historical&&target.shield>0))return;target.health=Math.max(0,target.health-damage);event(s,'damage',{player:target.id});
 if(target.health<=0){target.alive=false;target.deaths++;target.respawnAt=s.time+3;target.field=0;source.kills++;source.energy=Math.min(100,source.energy+15);if(s.mode==='tdm')s.scores[source.team]++;event(s,'kill',{player:source.id,target:target.id,name:source.name,victim:target.name});
  if(s.networked)s.deathTimes.push({id:target.id,life:target.life,at});
 }
}
function shoot(s,p,input,proof=null){
 const at=proof?.at??s.time,origin=proof?.origin??p,weapon=proof?input.weapon:p.weapon,w=WEAPONS[weapon];
 if(s.status!=='playing'||at>=300||!p.alive)return 'not-alive';
 if(!w||![0,CLASSES[p.class].weapon].includes(weapon)||weapon!==p.weapon||origin.weapon!==weapon)return 'weapon-changed';
 if(p.reload>0||origin.reload>0||at+1e-6<p.ready[weapon]||at+1e-6<(p.switchReady||0)||(!proof&&p.cooldown>0))return 'recovering';
 if(p.ammo[weapon]<=0){p.reload=w.reload;p.fireBuffer=0;return 'empty';}
 p.shield=0;p.ammo[weapon]--;p.cooldown=Math.max(0,at+w.delay-s.time);p.ready[weapon]=at+w.delay;p.recoil=1;p.fireBuffer=0;
 // Every combatant uses travelling rounds, including rail. Chronal fields affect both teams identically.
 const speeds=[95,100,85,180,48],damages=[26,15,13,95,60];
 for(let i=0;i<w.pellets;i++){const spread=w.spread*(input.aim?.3:1),d=forward((proof?input.yaw:p.yaw)+(random(s)-.5)*spread,(proof?input.pitch:p.pitch)+(random(s)-.5)*spread);s.projectiles.push({id:++s.eventId,owner:p.id,ownerLife:p.life,team:p.team,weapon,x:origin.x,y:origin.y+1.67,z:origin.z,d,speed:speeds[weapon],damage:damages[weapon],life:2.5,fireAt:at,simAt:at,viewLag:proof?.viewLag??0});}
 event(s,'shot',{player:p.id,weapon,shotId:proof?.clientShotId});return null;
}
function disallowedShot(s,b){return (s.deathTimes||[]).some(d=>d.id===b.owner&&d.life===b.ownerLife&&b.fireAt>d.at+1e-6);}
function impact(s,b,target,pose,damage,at){
 const owner=s.players.find(p=>p.id===b.owner);if(!owner||pose.shield>0)return;
 if(!s.networked){hurt(s,target,damage,owner);return;}
 s.impacts.push({at,fireAt:b.fireAt,owner:b.owner,ownerLife:b.ownerLife,target:target.id,targetLife:pose.life,damage,projectile:b.id});
}
function settleImpacts(s){
 if(!s.networked)return;
 // Outstanding timing permissions determine when game-time ordering is final.
 s.impacts.sort((a,b)=>a.at-b.at||a.projectile-b.projectile);
 while(s.impacts.length&&confirmationTime(s,s.impacts[0].at)<=s.time+1e-7){
  const at=s.impacts[0].at,batch=[];
  while(s.impacts.length&&s.impacts[0].at<=at+1e-7)batch.push(s.impacts.shift());
  const eligible=batch.filter(h=>!disallowedShot(s,h));
  // Exact-time hits are a batch, so reversing player/projectile arrays cannot pick a winner.
  for(const h of eligible){const target=s.players.find(p=>p.id===h.target),owner=s.players.find(p=>p.id===h.owner);
   if(target&&owner&&target.life===h.targetLife&&owner.life===h.ownerLife)hurt(s,target,h.damage,owner,h.at,true);
  }
 }
 s.deathTimes=s.deathTimes.filter(d=>d.at>s.time-3);
}
function stepProjectile(s,b,world,dt){
 if(disallowedShot(s,b)){b.life=0;return;}
 const start=b.simAt??s.time-dt,endTime=start+Math.min(dt,b.life),duration=endTime-start,viewStart=start-(b.viewLag||0),viewEnd=endTime-(b.viewLag||0);
 const getPose=(p,t)=>s.networked?historicalPose(s,p.id,t):p;
 const poses=s.players.map(p=>({p,a:getPose(p,viewStart),q:getPose(p,viewEnd)}));
 const slowed=poses.some(({a:p})=>p?.alive&&p.field>0&&Math.hypot(p.x-b.x,p.y+1-b.y,p.z-b.z)<9);
 const travel=b.speed*duration*(slowed?.25:1),origin=[b.x,b.y,b.z],delta=b.d.map(v=>v*travel);
 const wall=firstWall(origin,b.d,world.solids,travel+1e-6),wallFraction=travel>0?Math.min(1,wall/travel):1;
 let fraction=wallFraction,target=null,targetPose=null,head=false;
 for(const {p,a,q} of poses){
  if(!a?.alive||!q||a.life!==q.life||p.id===b.owner||(s.mode!=='dm'&&p.team===b.team))continue;
  // Sweep in the target's moving frame: neither a fast round nor a crossing player tunnels.
  const relative=[delta[0]-(q.x-a.x),delta[1]-(q.y-a.y),delta[2]-(q.z-a.z)],length=Math.hypot(...relative);
  if(length<1e-10)continue;
  const hit=enemyRay([origin[0],origin[1]-a.y,origin[2]],relative.map(v=>v/length),{...a,type:'sentry'},length);
  const f=hit?hit.t/length:Infinity;
  if(hit&&f<=1+1e-7&&(f<fraction-1e-7||(Math.abs(f-fraction)<1e-7&&(target?p.id<target.id:wall>travel)))){fraction=clamp(f,0,1);target=p;targetPose=a;head=hit.head;}
 }
 b.x+=delta[0]*fraction;b.y+=delta[1]*fraction;b.z+=delta[2]*fraction;b.life-=duration;b.simAt=endTime;
 const at=start+duration*fraction;
 if(target)impact(s,b,target,targetPose,b.damage*(head?1.5:1),at);
 if(target||wall<=travel||b.y<0){
  b.life=0;
  if(b.weapon===4)for(const {p,a} of poses){if(!a?.alive||p===target||p.id===b.owner||(s.mode!=='dm'&&p.team===b.team))continue;
   const v=[a.x-b.x,a.y+1-b.y,a.z-b.z],d=Math.hypot(...v);
   if(d<3&&firstWall([b.x,b.y,b.z],v.map(n=>n/Math.max(.01,d)),world.solids,d)>=d-.1)impact(s,b,p,a,b.damage*(1-d/3),at);
  }
 }
}
function advanceProjectiles(s,world,dt){
 for(const b of s.projectiles){
  if(!s.players.some(p=>p.id===b.owner)){b.life=0;continue;}
  b.simAt??=s.time-dt;b.fireAt??=b.simAt;b.ownerLife??=s.players.find(p=>p.id===b.owner)?.life;
  let budget=80;
  while(b.life>0&&b.simAt<s.time-1e-7&&budget-->0)stepProjectile(s,b,world,Math.min(dt,s.time-b.simAt));
 }
 s.projectiles=s.projectiles.filter(b=>b.life>0).slice(-400);
}
export function finishArenaUpdate(s,now){if(s.status!=='playing')return;advanceProjectiles(s,arenaGeometry(s.map).world,STEP);settleImpacts(s);judgeRound(s,now);}
function advanceStep(s,world,nav,dt,now,settle=true){
 s.time+=dt;
 for(const p of s.players){
  if(!p.alive){if(s.time>=p.respawnAt)respawn(s,p);continue;}
  const c=CLASSES[p.class],i=p.bot?botInput(s,p,world,nav,dt):now-p.inputAt>350?neutral():{...p.input,...p.pendingEdges};p.pendingEdges={};
  if(!p.bot&&now-p.inputAt<=350){p.yaw=i.yaw;p.pitch=i.pitch;}
  for(const key of ['cooldown','ability','field','shield','recoil','fireBuffer'])p[key]=Math.max(0,p[key]-dt*(key==='recoil'?5:1));
  if(p.reload>0){p.reload=Math.max(0,p.reload-dt);if(p.reload===0)p.ammo[p.weapon]=WEAPONS[p.weapon].mag;}
  if(i.weapon!==null&&[0,c.weapon].includes(i.weapon)&&i.weapon!==p.weapon){p.weapon=i.weapon;p.reload=0;p.cooldown=.18;p.switchReady=s.time+.18;p.fireBuffer=0;p.ads=0;}
  if(i.reload&&p.reload===0&&p.ammo[p.weapon]<WEAPONS[p.weapon].mag){p.reload=WEAPONS[p.weapon].reload;p.fireBuffer=0;}
  if(i.timePressed&&p.energy>=50&&p.field<=0){p.field=3;p.energy-=50;}
  p.energy=Math.min(100,p.energy+dt*5);
  if(i.use&&p.class==='engineer'&&p.ability<=0){s.stations=s.stations.filter(v=>v.owner!==p.id);s.stations.push({owner:p.id,team:p.team,x:p.x,z:p.z,life:10});p.ability=22;}
  advanceMotion(p,i,c,dt,world.solids);
  p.ads=clamp(p.ads+(i.aim&&!p.reload?1:-1)*dt*8,0,1);
  if(i.firePressed&&!p.reload)p.fireBuffer=.15;
  if((p.bot||p.protocol!==2)&&(i.fire||p.fireBuffer>0))shoot(s,p,i);
  if(!p.bot)for(const key of ['firePressed','jump','dash','reload','timePressed','use'])p.input[key]=false;
 }
 recordHistory(s);
 advanceProjectiles(s,world,dt);if(settle)settleImpacts(s);
 for(const station of s.stations){station.life-=dt;for(const p of s.players)if(p.alive&&(s.mode==='dm'?p.id===station.owner:p.team===station.team)&&distance(p,station)<5){const v=[p.x-station.x,0,p.z-station.z],d=Math.hypot(...v);if(firstWall([station.x,1,station.z],v.map(n=>n/Math.max(.01,d)),world.solids,d)>=d-.05)p.health=Math.min(CLASSES[p.class].health,p.health+dt*9);}}
 s.stations=s.stations.filter(v=>v.life>0);
 if(s.mode==='dom'){
  for(const n of s.nodes){const count=[0,1].map(t=>s.players.filter(p=>p.alive&&p.team===t&&distance(p,n)<4&&p.y<2).length);n.contested=count[0]>0&&count[1]>0;
   if(n.contested)continue;const team=count[0]>0?0:count[1]>0?1:null;
   if(team===null){n.progress=Math.max(0,n.progress-dt*.2);continue;}
   if(n.owner===team){n.progress=0;n.capture=null;continue;}
   if(n.capture!==team){n.capture=team;n.progress=0;}n.progress+=dt*.25;if(n.progress>=1){n.owner=team;n.progress=0;n.capture=null;event(s,'capture',{team,node:n.label});}
  }
  s.domTick+=dt;if(s.domTick>=1){s.domTick-=1;for(const n of s.nodes)if(n.owner!==null&&!n.contested)s.scores[n.owner]++;}
 }
 if(settle)judgeRound(s,now);
}
function judgeRound(s,now){
 if(s.status!=='playing')return;
 const leader=s.players.slice().sort((a,b)=>b.kills-a.kills)[0],limitHit=s.mode==='dm'?leader.kills>=s.limit:Math.max(...s.scores)>=s.limit;
 if(limitHit||s.time>=300+(s.networked?NET.settle:0)){s.status='finished';s.finishAt=now;s.winner=s.mode==='dm'?leader.id:s.scores[0]===s.scores[1]?'draw':s.scores[0]>s.scores[1]?0:1;}
}
export function advanceArena(s,now,{settle=true}={}){
 for(const p of s.players)if(!p.bot&&now-p.lastSeen>12000)leaveArena(s,p.id);
 if(s.status!=='playing'){s.at=now;return;}
 const elapsed=clamp((now-s.at)/1000,0,.25);if(elapsed<=0)return;const {world,nav}=arenaGeometry(s.map),count=Math.floor((elapsed+1e-10)/STEP);
 for(let i=0;i<count&&s.status==='playing';i++)advanceStep(s,world,nav,STEP,now,settle);
 s.at=now-Math.max(0,elapsed-count*STEP)*1000;
}
export function restartArena(s,now){
 s.round++;s.time=0;s.at=now;s.status='playing';s.winner=null;s.scores=[0,0];s.domTick=0;s.projectiles=[];s.stations=[];s.events=[];s.history=[];s.impacts=[];s.deathTimes=[];
 for(const n of s.nodes)Object.assign(n,{owner:null,capture:null,progress:0,contested:false});
 for(const p of s.players){p.kills=0;p.deaths=0;p.brainAt=0;respawn(s,p);}recordHistory(s);event(s,'round');
}
export function arenaSnapshot(s,id,includeMap=false){
 const own=s.players.find(p=>p.id===id);return {revision:s.revision??0,networked:!!s.networked,shotResults:own?.net?.results??[],actionAck:own?.net?.commands??[],clock:own?.net?.receipts.at(-1),mode:s.mode,slots:s.slots,round:s.round,time:s.time,status:s.status,winner:s.winner,scores:s.scores,limit:s.limit,you:id,ack:own?.seq??-1,map:includeMap?s.map:undefined,nodes:s.nodes,stations:s.stations,projectiles:s.projectiles,events:s.events,
 players:s.players.map(p=>({id:p.id,life:p.life,name:p.name,bot:p.bot,team:p.team,class:p.class,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,health:p.health,alive:p.alive,kills:p.kills,deaths:p.deaths,weapon:p.weapon,ads:p.ads,recoil:p.recoil,shield:p.shield,field:p.field,moving:p.moving,respawnIn:Math.max(0,p.respawnAt-s.time),...(p.id===id?{energy:p.energy,ammo:p.ammo,reload:p.reload,cooldown:p.cooldown,ability:p.ability,dashCooldown:p.dashCooldown,dashTime:p.dashTime,vy:p.vy,grounded:p.grounded}:{} )}))};
}
