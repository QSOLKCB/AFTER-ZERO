import {moveBody} from './game.js';
// Shared movement prediction and authoritative movement use the same collision/jump rules.
export function advanceMotion(p,input,c,dt,solids){
 p.dashCooldown=Math.max(0,(p.dashCooldown||0)-dt);p.dashTime=Math.max(0,(p.dashTime||0)-dt);
 let mx=input.x||0,mz=input.z||0,n=Math.hypot(mx,mz);if(n>1){mx/=n;mz/=n;}p.moving=n>.01;
 if(input.dash&&p.dashCooldown<=0&&p.moving){p.dashTime=.15;p.dashCooldown=2.4;}
 const speed=(p.dashTime>0?23:c.speed*(input.sprint?1.3:1))*(input.aim?.65:1),sin=Math.sin(input.yaw??p.yaw),cos=Math.cos(input.yaw??p.yaw);
 moveBody(p,(mx*cos+mz*sin)*speed*dt,(mx*sin-mz*cos)*speed*dt,solids);
 if(input.jump&&p.grounded){p.vy=7.5;p.grounded=false;}
 const previous=p.y;p.vy-=19*dt;p.y+=p.vy*dt;let ground=0;
 for(const b of solids)if(p.x+.3>b.min[0]&&p.x-.3<b.max[0]&&p.z+.3>b.min[2]&&p.z-.3<b.max[2]&&previous>=b.max[1]-.05&&p.y<=b.max[1])ground=Math.max(ground,b.max[1]);
 if(p.y<=ground){p.y=ground;p.vy=0;p.grounded=true;}
}
export function replayMotion(authoritative,history,seconds,c,solids){
 const p={...authoritative};let remaining=Math.max(0,Math.min(.35,seconds)),steps=[];
 for(let i=history.length-1;i>=0&&remaining>1e-7;i--){const h=history[i],dt=Math.min(h.dt,remaining);steps.push({...h,dt});remaining-=dt;}
 for(const h of steps.reverse())advanceMotion(p,h.input,c,h.dt,solids);
 return p;
}
