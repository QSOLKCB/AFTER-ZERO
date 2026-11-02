import {clamp,forward,rayBox,boxAt,seededRandom} from './math.js';
import {applyLook} from './aim.js';
import {Navigation,steerTo} from './navigation.js';
import {TILE,cloneMap} from './maps.js';
export const STEP=1/120;
export const WEAPONS=[
 {name:'KESTREL',kind:'V9 / SERVICE PISTOL',unlock:0,mag:12,delay:.24,reload:1.1,damage:30,pellets:1,spread:.009,color:[1,.40,.15]},
 {name:'RAZOR',kind:'R3 / MACHINE PISTOL',unlock:1,mag:30,delay:.085,reload:1.5,damage:17,pellets:1,spread:.024,color:[.18,.85,1]},
 {name:'BREACH',kind:'B8 / SCATTERGUN',unlock:2,mag:6,delay:.72,reload:1.9,damage:17,pellets:8,spread:.085,color:[1,.72,.13]},
 {name:'NULL',kind:'N1 / RAIL RIFLE',unlock:2,mag:4,delay:1.05,reload:2,damage:150,pellets:1,spread:.003,color:[.72,.36,1]},
 {name:'HELIX',kind:'H6 / PLASMA DRIVER',unlock:2,mag:16,delay:.28,reload:1.7,damage:75,pellets:1,spread:.008,color:[.55,1,.23]}
];
export const DIFFICULTY={story:{damage:.55,speed:.8},operative:{damage:1,speed:1},zero:{damage:1.4,speed:1.18}};
export function worldFor(map){
 const solids=[];
 map.tiles.forEach((row,z)=>row.forEach((t,x)=>{if(t>=1&&t<=3){const h=t===2?1.35:4.5;solids.push({...boxAt(x*TILE,h/2,z*TILE,TILE,h,TILE),x:x*TILE,z:z*TILE,h,t});}}));
 return {solids,width:map.tiles[0].length*TILE,height:map.tiles.length*TILE};
}
export function firstWall(origin,dir,solids,max=180){
 let best=max;for(const b of solids){const t=rayBox(origin,dir,b,best);if(t!==null)best=t;}return best;
}
export function moveBody(body,dx,dz,solids,radius=.36){
 // Subdivide all displacements, including dash, so a frame cannot tunnel through a wall.
 const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.18));
 const blocked=(x,z)=>solids.some(b=>(body.y||0)<b.max[1]-.03&&(body.y||0)+1.65>b.min[1]&&x+radius>b.min[0]&&x-radius<b.max[0]&&z+radius>b.min[2]&&z-radius<b.max[2]);
 for(let i=0;i<n;i++){if(!blocked(body.x+dx/n,body.z))body.x+=dx/n;if(!blocked(body.x,body.z+dz/n))body.z+=dz/n;}
}
export function enemyRay(origin,dir,b,max){
 const s=Math.sin(b.yaw),c=Math.cos(b.yaw),x=origin[0]-b.x,z=origin[2]-b.z;
 const o=[x*c-z*s,origin[1],x*s+z*c],d=[dir[0]*c-dir[2]*s,dir[1],dir[0]*s+dir[2]*c],scale=b.type==='architect'?2.1:b.type==='heavy'?1.18:1;
 const torso=rayBox(o,d,boxAt(0,1.15*scale,0,.9*scale,.85*scale,.65*scale),max);
 const parts=[torso,rayBox(o,d,boxAt(0,1.66*scale,0,.36*scale,.36*scale,.36*scale),max)];
 for(const x of [-.23,.23])parts.push(rayBox(o,d,boxAt(x*scale,.42*scale,0,.3*scale,.84*scale,.6*scale),max));
 for(const x of [-.58,.58])parts.push(rayBox(o,d,boxAt(x*scale,1.2*scale,-.08*scale,.28*scale,.76*scale,.55*scale),max));
 const valid=parts.filter(t=>t!==null),body=valid.length?Math.min(...valid):null;
 const head=rayBox(o,d,boxAt(0,1.98*scale,0,.56*scale,.48*scale,.56*scale),max);
 if(head!==null&&(body===null||head<body))return {t:head,head:true};if(body!==null)return {t:body,head:false};return null;
}
export class Game{
 constructor(map,{level=0,arsenalLevel=level,upgrades={},difficulty='operative',custom=false,seed=21}={}){
  this.map=cloneMap(map);this.world=worldFor(map);this.rng=seededRandom(seed);this.level=level;this.custom=custom;this.difficulty=DIFFICULTY[difficulty]||DIFFICULTY.operative;
  this.maxHealth=100+(upgrades.health||0)*20;this.maxEnergy=100+(upgrades.chrono||0)*25;this.power=1+(upgrades.power||0)*.1;
  this.player={x:map.spawn.x*TILE,z:map.spawn.z*TILE,y:0,yaw:map.spawn.yaw,pitch:0,vy:0,grounded:true,health:this.maxHealth,energy:this.maxEnergy};
  this.enemies=map.enemies.map((e,i)=>({...e,id:i,x:e.x*TILE,z:e.z*TILE,y:0,yaw:0,hp:({sentry:85,runner:60,heavy:230,architect:1050})[e.type],alive:true,phase:i,flash:0,cooldown:.8+i*.17,charge:0,alert:false}));
  this.terminals=map.terminals.map(p=>({x:p.x*TILE,z:p.z*TILE,active:false}));
  this.pickups=map.pickups.map(p=>({...p,x:p.x*TILE,z:p.z*TILE,taken:false}));
  this.exit={x:map.exit.x*TILE,z:map.exit.z*TILE};
  this.unlocked=WEAPONS.map((w,i)=>custom||w.unlock<=arsenalLevel?i:-1).filter(i=>i>=0);
  this.weapon=this.unlocked.at(-1);this.ammo=WEAPONS.map(w=>w.mag);this.reload=0;this.cooldown=0;this.readyAt=WEAPONS.map(()=>0);this.fireBuffer=0;this.recoil=0;this.ads=0;
  this.projectiles=[];this.tracers=[];this.events=[];this.status='playing';this.time=0;this.worldTime=0;this.timeScale=1;this.slow=false;this.slowExhausted=false;this.dashCooldown=0;this.dashTime=0;this.lastDamage=-10;this.kills=0;this.shots=0;this.hits=0;this.score=0;this.slowKills=0;this.headshots=0;this.hint='';this.moving=false;
  this.navigation=new Navigation(this.map);
 }
 emit(type,data={}){this.events.push({type,...data});}
 get remaining(){return this.enemies.filter(b=>b.alive).length;}
 get relaysRemaining(){return this.terminals.filter(t=>!t.active).length;}
 get exitReady(){return this.remaining===0&&this.relaysRemaining===0;}
 get eye(){const p=this.player;return [p.x,p.y+1.67,p.z];}
 cancelAttack(){this.fireBuffer=0;}
 switchWeapon(index){if(!this.unlocked.includes(index)||index===this.weapon)return;this.weapon=index;this.reload=0;this.fireBuffer=0;this.ads=0;this.recoil=0;this.cooldown=Math.max(.18,this.readyAt[index]-this.time);this.emit('switch');}
 startReload(){const w=WEAPONS[this.weapon];if(!this.reload&&this.ammo[this.weapon]<w.mag){this.reload=w.reload;this.fireBuffer=0;this.emit('reload');}}
 toggleTime(){if(this.slow){this.slow=false;this.emit('timeOff');}else if(this.player.energy>=12&&!this.slowExhausted){this.slow=true;this.emit('timeOn');}}
 harm(amount){if(this.status!=='playing')return;this.player.health=Math.max(0,this.player.health-amount*this.difficulty.damage);this.lastDamage=this.time;this.emit('damage');if(this.player.health<=0){this.status='dead';this.slow=false;this.emit('dead');}}
 hitEnemy(b,damage,head=false){
  if(!b.alive)return;b.hp-=damage*this.power;b.flash=.15;b.alert=true;this.emit('hit',{x:b.x,y:head?1.98:1.2,z:b.z,head});
  if(b.hp<=0){b.alive=false;this.kills++;this.headshots+=Number(head);this.slowKills+=Number(this.slow);this.score+=100+(head?50:0)+(this.slow?50:0)+(b.type==='architect'?1000:0);this.player.energy=Math.min(this.maxEnergy,this.player.energy+12);this.player.health=Math.min(this.maxHealth,this.player.health+2);this.emit('kill',{x:b.x,y:1.2,z:b.z,typeName:b.type});}
 }
 shoot(){
  const w=WEAPONS[this.weapon];if(this.reload||this.cooldown>0)return;
  if(this.ammo[this.weapon]<=0){this.startReload();return;}
  this.ammo[this.weapon]--;this.cooldown=w.delay;this.readyAt[this.weapon]=this.time+w.delay;this.fireBuffer=0;this.recoil=1;this.shots++;this.emit('shot',{weapon:this.weapon});
  const origin=this.eye;let hit=false;
  for(const b of this.enemies)if(Math.hypot(b.x-this.player.x,b.z-this.player.z)<30)b.alert=true;
  if(this.weapon===4){const d=forward(this.player.yaw,this.player.pitch);this.projectiles.push({x:origin[0],y:origin[1],z:origin[2],d,speed:65,life:4,enemy:false,damage:w.damage});return;}
  for(let pellet=0;pellet<w.pellets;pellet++){
   const spread=w.spread*(this.ads>.8?.3:1),dir=forward(this.player.yaw+(this.rng()-.5)*spread,this.player.pitch+(this.rng()-.5)*spread),wall=firstWall(origin,dir,this.world.solids);
   const hits=[];for(const b of this.enemies)if(b.alive){const h=enemyRay(origin,dir,b,wall);if(h&&h.t<wall)hits.push({...h,b});}hits.sort((a,b)=>a.t-b.t);
   const selected=this.weapon===3?hits.slice(0,3):hits.slice(0,1);let end=wall;
   for(const h of selected){this.hitEnemy(h.b,w.damage*(h.head?2:1),h.head);hit=true;if(this.weapon!==3)end=h.t;}
   this.tracers.push({a:origin.slice(),b:origin.map((v,i)=>v+dir[i]*Math.min(end,100)),life:this.slow?.6:.12,color:w.color});
  }
  if(hit)this.hits++;
 }
 updateEnemy(b,dt){
  b.flash=Math.max(0,b.flash-dt);if(!b.alive)return;
  const p=this.player,dx=p.x-b.x,dz=p.z-b.z,dist=Math.hypot(dx,dz);b.yaw=Math.atan2(dx,-dz);b.phase+=dt;
  const scale=b.type==='architect'?2.1:b.type==='heavy'?1.18:1,origin=[b.x,1.5*scale,b.z],end=this.eye,delta=end.map((n,i)=>n-origin[i]),len=Math.hypot(...delta),dir=delta.map(n=>n/Math.max(.001,len));
  const visible=firstWall(origin,dir,this.world.solids,len)>=len-.05;
  if(visible&&dist<32)b.alert=true;if(!b.alert)return;
  b.cooldown-=dt;
  if(b.type==='runner'&&visible&&dist<2.15&&Math.abs(p.y)<1.6){if(b.cooldown<=0){this.harm(15);b.cooldown=.8;}return;}
  const desired=b.type==='runner'?1.2:b.type==='architect'?15:b.type==='heavy'?10:13;
  if((dist>desired||!visible)&&b.type!=='architect'){
   const speed=(b.type==='runner'?6:b.type==='heavy'?2.5:3.4)*this.difficulty.speed;
   const direction=steerTo(this.navigation,b,p,{now:this.worldTime,dt,speed,radius:.44,others:this.enemies});
   moveBody(b,direction.x*speed*dt,direction.z*speed*dt,this.world.solids,.44);
  }
  if(b.type==='runner')return;
  if(visible&&dist<42&&b.cooldown<=0){
   b.charge+=dt;
   if(b.charge>=.65){
    const count=b.type==='architect'?7:b.type==='heavy'?3:1;
    for(let j=0;j<count;j++){
     const spread=(j-(count-1)/2)*.10,cs=Math.cos(spread),sn=Math.sin(spread),d=[dir[0]*cs-dir[2]*sn,dir[1],dir[0]*sn+dir[2]*cs];
     this.projectiles.push({x:origin[0],y:origin[1],z:origin[2],d,speed:b.type==='architect'?16:20,life:5,enemy:true,damage:b.type==='architect'?15:12});
    }
    b.cooldown=b.type==='architect'?1.3:b.type==='heavy'?1.7:1.9; b.charge=0;this.emit('enemyShot');
   }
  }else b.charge=Math.max(0,b.charge-dt*2);
 }
 explode(bolt){
  this.emit('explosion',{x:bolt.x,y:bolt.y,z:bolt.z});let hit=false;
  for(const b of this.enemies)if(b.alive){const v=[b.x-bolt.x,1.2-bolt.y,b.z-bolt.z],d=Math.hypot(...v);if(d<4&&firstWall([bolt.x,bolt.y,bolt.z],v.map(n=>n/Math.max(.001,d)),this.world.solids,d)>=d-.1){this.hitEnemy(b,bolt.damage*(1-d/5));hit=true;}}
  if(hit)this.hits++;
 }
 updateProjectiles(dt){
  const p=this.player,box=boxAt(p.x,p.y+.9,p.z,.72,1.8,.72);
  for(const b of this.projectiles){
   const origin=[b.x,b.y,b.z],dist=b.speed*dt,wall=firstWall(origin,b.d,this.world.solids,dist);let travel=dist,impact=wall<dist;
   if(impact)travel=Math.max(0,wall-.03);
   if(b.enemy){const hit=rayBox(origin,b.d,box,travel);if(hit!==null){this.harm(b.damage);b.life=0;travel=hit;}}
   else {for(const e of this.enemies)if(e.alive){const hit=enemyRay(origin,b.d,e,travel);if(hit){travel=hit.t;impact=true;}}}
   b.x+=b.d[0]*travel;b.y+=b.d[1]*travel;b.z+=b.d[2]*travel;b.life-=dt;
   if(impact||b.y<0){b.life=0;if(!b.enemy)this.explode(b);}
  }
  this.projectiles=this.projectiles.filter(b=>b.life>0);
 }
 interact(){
  const p=this.player;
  for(const t of this.terminals)if(!t.active&&Math.hypot(p.x-t.x,p.z-t.z)<4){t.active=true;this.score+=250;this.player.energy=this.maxEnergy;this.emit('relay');return;}
  if(Math.hypot(p.x-this.exit.x,p.z-this.exit.z)<4&&this.exitReady){this.status='won';this.slow=false;this.emit('win');}
 }
 step(dt,input={}){
  if(this.status!=='playing')return;
  dt=clamp(dt,0,.05);this.time+=dt;const p=this.player;
  // Turning uses real player time, including during chronal shift.
  applyLook(p,input,dt,{sensitivity:input.sensitivity??1,invert:input.invert,weapon:this.weapon,ads:this.ads});
  if(input.timePressed)this.toggleTime();if(input.reload)this.startReload();if(Number.isInteger(input.weapon))this.switchWeapon(input.weapon);
  if(this.slow){p.energy=Math.max(0,p.energy-dt*23);if(p.energy===0){this.slow=false;this.slowExhausted=true;this.emit('timeOff');}}
  else {p.energy=Math.min(this.maxEnergy,p.energy+dt*9);if(p.energy>=20)this.slowExhausted=false;}
  this.timeScale=this.slow?.2:1;const wd=dt*this.timeScale;this.worldTime+=wd;
  this.cooldown=Math.max(0,this.cooldown-dt);this.fireBuffer=Math.max(0,this.fireBuffer-dt);this.recoil=Math.max(0,this.recoil-dt*5);this.ads=clamp(this.ads+(input.aim&&!this.reload?1:-1)*dt*8,0,1);
  if(input.firePressed&&!this.reload)this.fireBuffer=.15;
  if(this.reload>0){this.reload-=dt;if(this.reload<=0){this.reload=0;this.ammo[this.weapon]=WEAPONS[this.weapon].mag;this.emit('loaded');}}
  this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.dashTime=Math.max(0,this.dashTime-dt);
  let mx=clamp(input.x||0,-1,1),mz=clamp(input.z||0,-1,1),norm=Math.hypot(mx,mz);if(norm>1){mx/=norm;mz/=norm;}this.moving=norm>.01;
  if(input.dash&&this.dashCooldown<=0&&this.moving){this.dashTime=.17;this.dashCooldown=1.8;this.emit('dash');}
  const speed=(this.dashTime>0?26:input.sprint?8.2:5.6)*(this.slow?.82:1)*(input.aim?.62:1),s=Math.sin(p.yaw),c=Math.cos(p.yaw);
  moveBody(p,(mx*c+mz*s)*speed*dt,(mx*s-mz*c)*speed*dt,this.world.solids);
  if(input.jump&&p.grounded){p.vy=7.5;p.grounded=false;}
  const previousY=p.y;p.vy-=19*dt;p.y+=p.vy*dt;let ground=0;
  for(const b of this.world.solids)if(p.x+.3>b.min[0]&&p.x-.3<b.max[0]&&p.z+.3>b.min[2]&&p.z-.3<b.max[2]&&previousY>=b.max[1]-.05&&p.y<=b.max[1])ground=Math.max(ground,b.max[1]);
  if(p.y<=ground){p.y=ground;p.vy=0;p.grounded=true;}else p.grounded=false;
  if(input.fire||this.fireBuffer>0)this.shoot();
  for(const b of this.enemies)this.updateEnemy(b,wd);this.updateProjectiles(wd);
  for(const t of this.tracers)t.life-=dt;this.tracers=this.tracers.filter(t=>t.life>0);
  for(const item of this.pickups)if(!item.taken&&Math.hypot(p.x-item.x,p.z-item.z)<1.6){
   if(item.type==='health'&&p.health<this.maxHealth){p.health=Math.min(this.maxHealth,p.health+45);item.taken=true;this.emit('pickup');}
   if(item.type==='charge'&&p.energy<this.maxEnergy){p.energy=this.maxEnergy;item.taken=true;this.emit('pickup');}
  }
  const tx=Math.round(p.x/TILE),tz=Math.round(p.z/TILE);if(this.map.tiles[tz]?.[tx]===4&&p.y<.3)this.harm(dt*13);
  if(this.time-this.lastDamage>6&&p.health<this.maxHealth*.6)p.health=Math.min(this.maxHealth*.6,p.health+dt*4);
  this.hint='';for(const t of this.terminals)if(!t.active&&Math.hypot(p.x-t.x,p.z-t.z)<4)this.hint='E  /  SEVER RELAY';
  if(Math.hypot(p.x-this.exit.x,p.z-this.exit.z)<4)this.hint=this.exitReady?'E  /  EXTRACT':'EXTRACTION LOCKED · CLEAR SECURITY + RELAYS';
  if(input.use&&this.status==='playing')this.interact();
 }
}
