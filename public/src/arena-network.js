// Bounded, server-owned timing and pose history. No client positions or hits are accepted.
import {clamp} from './math.js';
export const NET={interval:50,maxInFlight:6,shotAge:.2,viewAge:.25,settle:.25,history:.65,interpolation:.05};
export const shotBudget=half=>Math.min(NET.shotAge,(half+NET.interval+25)/1000);
const pose=p=>({id:p.id,life:p.life,x:p.x,y:p.y,z:p.z,yaw:p.yaw,team:p.team,alive:p.alive,shield:p.shield,field:p.field,weapon:p.weapon,reload:p.reload});
export function recordHistory(s,force=false){
 if(!s.networked)return;
 s.history??=[];const last=s.history.at(-1);
 if(!force&&last&&s.time-last.time<1/60-1e-7)return;
 const frame={time:s.time,players:s.players.map(pose)};
 if(last&&Math.abs(last.time-s.time)<1e-7)s.history[s.history.length-1]=frame;else s.history.push(frame);
 while(s.history.length>1&&s.history[1].time<s.time-NET.history)s.history.shift();
}
export function historicalPose(s,id,time){
 const frames=s.history||[];
 if(time>s.time+1e-6||time<(frames[0]?.time??s.time)-1e-6)return null;
 let a=null,b=null;
 for(let i=frames.length-1;i>=0;i--){if(frames[i].time<=time+1e-7){a=frames[i];b=frames[i+1];break;}}
 if(!a)return null;
 b??={time:s.time,players:s.players};
 const p=a.players.find(p=>p.id===id),q=b.players.find(p=>p.id===id);
 if(!p)return null;
 if(!q||p.life!==q.life||p.alive!==q.alive||b.time<=a.time)return {...p};
 const t=clamp((time-a.time)/(b.time-a.time),0,1),r={...p};
 for(const k of ['x','y','z'])r[k]=p[k]+(q[k]-p[k])*t;
 const angle=Math.atan2(Math.sin(q.yaw-p.yaw),Math.cos(q.yaw-p.yaw));r.yaw=p.yaw+angle*t;return r;
}
export function playerNetwork(p){return p.net??={receipts:[],samples:[],seen:[],results:[],commands:[],rtt:0};}
export function issueReceipt(s,p,now,id){
 const n=playerNetwork(p),r={id,sentAt:now,time:s.time,round:s.round,life:p.life,budget:n.samples.length?shotBudget(Math.min(125,n.rtt/2)):NET.shotAge};
 n.receipts.push(r);n.receipts=n.receipts.filter(q=>now-q.sentAt<2000).slice(-32);return r;
}
export function measureTiming(p,timing,now){
 const n=playerNetwork(p),r=n.receipts.find(r=>r.id===timing?.receipt);
 if(!r||r.measured||!Number.isFinite(timing.waitMs)||timing.waitMs<0||timing.waitMs>now-r.sentAt)return;
 const rtt=now-r.sentAt-timing.waitMs;if(rtt>1000)return;
 r.measured=true;n.samples.push(rtt);n.samples=n.samples.slice(-12);
 // A recent lower envelope resists jitter; each receipt keeps one timing estimate.
 n.rtt=Math.min(...n.samples);r.half=Math.min(125,n.rtt/2);
}
export function validateShot(s,p,shot,now){
 const n=playerNetwork(p),r=n.receipts.find(r=>r.id===shot.receipt);
 if(!r||r.round!==s.round||r.life!==p.life)return {reason:'expired-clock'};
 if(!Number.isFinite(shot.elapsedMs)||shot.elapsedMs<0||shot.elapsedMs>1500||!Number.isFinite(shot.viewTime))return {reason:'invalid-clock'};
 const half=r.half??Math.min(125,n.rtt/2),serverAt=r.sentAt+half+shot.elapsedMs,age=(now-serverAt)/1000;
 // Credit follows measured RTT plus one send interval and 25 ms jitter allowance.
 // A low-ping player cannot simply request the entire global rewind window.
 const budget=Math.min(r.budget??NET.shotAge,shotBudget(half));
 if(age<-.012||age>budget+1e-6)return {reason:'late-shot'};
 // s.at is the wall-clock instant of the last fixed tick; using request time here
 // would add a changing sub-tick error and reject legitimate automatic fire.
 const at=s.time-Math.max(0,(s.at-serverAt)/1000),view=shot.viewTime;
 if(view>r.time+1e-6||view<r.time-.12||view>at+.012||at-view>NET.viewAge+1e-6)return {reason:'stale-view'};
 const origin=historicalPose(s,p.id,at);
 if(!origin||origin.life!==p.life||!origin.alive)return {reason:'expired-life'};
 if(!Number.isFinite(shot.yaw)||!Number.isFinite(shot.pitch)||!Number.isInteger(shot.weapon))return {reason:'invalid-shot'};
 return {at,viewLag:Math.max(0,at-view),origin};
}
export function rememberShot(p,id,reason){
 const n=playerNetwork(p);n.seen.push(id);n.seen=n.seen.slice(-128);n.results.push({id,reason});n.results=n.results.slice(-64);
}
export function confirmationTime(s,impactAt){
 let deadline=impactAt+.025;
 // Honor every outstanding receipt that could still authorize an earlier shot.
 // Newer receipts cannot authorize firing before their own server-issued time.
 for(const p of s.players)if(!p.bot)for(const r of p.net?.receipts||[]){
  if(r.round!==s.round||r.life!==p.life||r.time>impactAt+1e-7)continue;
  const latestFire=Math.min(impactAt,r.time+NET.viewAge);
  deadline=Math.max(deadline,latestFire+(r.budget??NET.shotAge)+.02);
 }
 return deadline;
}
// Timestamped interpolation, with no invented positions across deaths or respawns.
export function interpolatePlayers(frames,time){
 if(!frames.length)return [];
 let a=frames[0],b=a;
 for(const f of frames){if(f.time<=time)a=f;else{b=f;break;}b=f;}
 const t=b.time>a.time?clamp((time-a.time)/(b.time-a.time),0,1):0;
 return a.players.map(p=>{const q=b.players.find(q=>q.id===p.id);if(!q||p.life!==q.life||p.alive!==q.alive)return {...p};
  return {...p,x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t,yaw:p.yaw+Math.atan2(Math.sin(q.yaw-p.yaw),Math.cos(q.yaw-p.yaw))*t};});
}
