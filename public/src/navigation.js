// Ground navigation shared by campaign enemies and authoritative arena bots.
// Visibility is deliberately separate: seeing over a crate does not make it walkable.
import {TILE} from './maps.js';
import {clamp} from './math.js';
const EPS=.025,DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function intersects(ax,az,bx,bz,minX,minZ,maxX,maxZ){
 let near=0,far=1;for(const [a,d,lo,hi]of [[ax,bx-ax,minX,maxX],[az,bz-az,minZ,maxZ]]){
  if(Math.abs(d)<1e-9){if(a<lo||a>hi)return false;}
  else{let t=(lo-a)/d,u=(hi-a)/d;if(t>u)[t,u]=[u,t];near=Math.max(near,t);far=Math.min(far,u);if(near>far)return false;}
 }return true;
}
class MinHeap{
 constructor(){this.items=[];}
 push(node,cost){const item={node,cost},a=this.items;let i=a.length;a.push(item);while(i>0){const p=(i-1)>>1;if(a[p].cost<=cost)break;a[i]=a[p];i=p;}a[i]=item;}
 pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].cost<a[child].cost)child++;if(a[child].cost>=last.cost)break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
export class Navigation{
 constructor(map){
  this.map=map;this.w=map.tiles[0].length;this.h=map.tiles.length;this.count=this.w*this.h;
  this.component=new Int16Array(this.count).fill(-1);this.walkable=new Uint8Array(this.count);this.neighbors=Array.from({length:this.count},()=>[]);
  for(let n=0;n<this.count;n++)this.walkable[n]=Number([0,4].includes(map.tiles[Math.floor(n/this.w)][n%this.w]));
  for(let n=0;n<this.count;n++)if(this.walkable[n]){
   const x=n%this.w,z=Math.floor(n/this.w);
   for(const [dx,dz]of DIRS){const nx=x+dx,nz=z+dz,m=nz*this.w+nx;
    if(nx<0||nz<0||nx>=this.w||nz>=this.h||!this.walkable[m])continue;
    // A diagonal needs both adjacent orthogonal tiles, so a body cannot cut a solid corner.
    if(dx&&dz&&(!this.walkable[z*this.w+nx]||!this.walkable[nz*this.w+x]))continue;
    this.neighbors[n].push({node:m,cost:(dx&&dz?Math.SQRT2:1)*(map.tiles[nz][nx]===4?8:1)});
   }
  }
  let component=0;for(let start=0;start<this.count;start++)if(this.walkable[start]&&this.component[start]<0){
   const queue=[start];this.component[start]=component;
   for(let i=0;i<queue.length;i++)for(const e of this.neighbors[queue[i]])if(this.component[e.node]<0){this.component[e.node]=component;queue.push(e.node);}component++;
  }
 }
 cell(p){return clamp(Math.round(p.z/TILE),0,this.h-1)*this.w+clamp(Math.round(p.x/TILE),0,this.w-1);}
 point(n){return {x:n%this.w*TILE,z:Math.floor(n/this.w)*TILE};}
 clear(a,b,radius=.44,{avoidHazards=false}={}){
  const r=radius+EPS,minX=Math.max(0,Math.ceil((Math.min(a.x,b.x)-r)/TILE-.5)),maxX=Math.min(this.w-1,Math.floor((Math.max(a.x,b.x)+r)/TILE+.5)),minZ=Math.max(0,Math.ceil((Math.min(a.z,b.z)-r)/TILE-.5)),maxZ=Math.min(this.h-1,Math.floor((Math.max(a.z,b.z)+r)/TILE+.5)),start=this.cell(a);
  if(Math.min(a.x,b.x)-r< -TILE/2||Math.max(a.x,b.x)+r>(this.w-.5)*TILE||Math.min(a.z,b.z)-r< -TILE/2||Math.max(a.z,b.z)+r>(this.h-.5)*TILE)return false;
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
   const tile=this.map.tiles[z][x],solid=tile>=1&&tile<=3&&!(tile===2&&(a.y||0)>=1.35-.03),hazard=avoidHazards&&tile===4&&z*this.w+x!==start;
   if((solid||hazard)&&intersects(a.x,a.z,b.x,b.z,x*TILE-1.5-r,z*TILE-1.5-r,x*TILE+1.5+r,z*TILE+1.5+r))return false;
  }return true;
 }
 route(from,target,{radius=.44,others=[]}={}){
  let start=this.cell(from),goal=this.cell(target);
  if(!this.walkable[start]){
   let best=Infinity;start=-1;for(let n=0;n<this.count;n++)if(this.walkable[n]){const p=this.point(n),d=distance(from,p);if(d<best&&this.clear(from,p,radius)){best=d;start=n;}}
   if(start<0)return [];
  }
  const component=this.component[start];
  if(this.walkable[goal]&&this.component[goal]!==component)return [];
  if(!this.walkable[goal]){
   // A target standing on a crate is approached from reachable floor, never from inside the crate.
   let best=Infinity,approach=Infinity;goal=-1;for(let n=0;n<this.count;n++)if(this.component[n]===component){const point=this.point(n),d=distance(point,target),travel=distance(point,from);if(d<best-1e-6||(Math.abs(d-best)<1e-6&&travel<approach)){best=d;approach=travel;goal=n;}}
  }
  if(goal<0)return [];
  const end=this.clear(this.point(goal),target,radius)?{x:target.x,z:target.z}:this.point(goal);
  const costs=new Float64Array(this.count).fill(Infinity),previous=new Int16Array(this.count).fill(-1),closed=new Uint8Array(this.count),crowd=new Float32Array(this.count),heap=new MinHeap();
  for(const p of others)if(p!==from&&p.alive!==false&&Math.abs((p.y||0)-(from.y||0))<1.2)crowd[this.cell(p)]+=.7;
  const gx=goal%this.w,gz=Math.floor(goal/this.w),heuristic=n=>{const dx=Math.abs(n%this.w-gx),dz=Math.abs(Math.floor(n/this.w)-gz);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};
  costs[start]=0;heap.push(start,heuristic(start));
  while(heap.items.length){const {node:n}=heap.pop();if(closed[n])continue;closed[n]=1;if(n===goal)break;
   for(const edge of this.neighbors[n]){const m=edge.node,cost=costs[n]+edge.cost+crowd[m];if(cost<costs[m]){costs[m]=cost;previous[m]=n;heap.push(m,cost+heuristic(m));}}
  }
  if(!closed[goal])return [];
  const cells=[];for(let n=goal;n!==start;n=previous[n])cells.push(this.point(n));cells.push(this.point(start));cells.reverse();
  if(distance(cells.at(-1),end)>.05)cells.push(end);
  // Keep only shortcuts whose swept footprint clears geometry and hazardous tiles.
  const path=[];let anchor=from,i=0;
  while(i<cells.length){let next=i;for(let j=cells.length-1;j>i;j--)if(this.clear(anchor,cells[j],radius,{avoidHazards:true})){next=j;break;}
   const point=cells[next];if(distance(anchor,point)>.05)path.push(point);anchor=point;i=next+1;
  }
  return path;
 }
}
export function steerTo(nav,body,target,{now,dt,speed,radius=.44,others=[],stop=0}={}){
 if(distance(body,target)<=stop){if(body.navigation)body.navigation.moving=false;return {x:0,z:0};}
 let state=body.navigation;
 if(!state||state.version!==1)state=body.navigation={version:1,path:[],index:0,replan:0,goal:-1,x:body.x,z:body.z,stuck:0,moving:false};
 const travelled=Math.hypot(body.x-state.x,body.z-state.z);
 state.stuck=state.moving&&travelled<speed*dt*.12?state.stuck+dt:0;state.x=body.x;state.z=body.z;
 const goal=nav.cell(target),changed=goal!==state.goal||Math.hypot(target.x-(state.targetX??Infinity),target.z-(state.targetZ??Infinity))>1;
 if(changed||now>=state.replan||state.stuck>.4){
  state.path=nav.route(body,target,{radius,others});state.index=0;state.goal=goal;state.targetX=target.x;state.targetZ=target.z;state.replan=now+.65;state.stuck=0;
 }
 while(state.index<state.path.length&&distance(body,state.path[state.index])<.14)state.index++;
 let waypoint=state.path[state.index];
 if(!waypoint){state.moving=false;return {x:0,z:0};}
 // Look ahead from the actual body position rather than switching when a rounded tile index changes.
 if(state.index+1<state.path.length&&nav.clear(body,state.path[state.index+1],radius,{avoidHazards:true}))waypoint=state.path[++state.index];
 let dx=waypoint.x-body.x,dz=waypoint.z-body.z,d=Math.hypot(dx,dz),vx=dx/Math.max(.001,d),vz=dz/Math.max(.001,d),sx=0,sz=0;
 for(const other of others){
  if(other===body||other===target||other.alive===false||Math.abs((body.y||0)-(other.y||0))>1.2)continue;
  const ox=body.x-other.x,oz=body.z-other.z,range=Math.hypot(ox,oz);if(range>=1.35)continue;
  const force=(1.35-range)/1.35;
  if(range>.02){sx+=ox/range*force;sz+=oz/range*force;}
  else{sx+=(String(body.id)<String(other.id)?-1:1)*force;}
  // Choose the right-hand passing lane for a head-on encounter instead of braking into a clump.
  if(ox*vx+oz*vz<.2){sx-=vz*force*.65;sz+=vx*force*.65;}
 }
 let x=vx+clamp(sx,-.8,.8),z=vz+clamp(sz,-.8,.8),n=Math.hypot(x,z);x/=Math.max(1,n);z/=Math.max(1,n);
 const step=Math.min(d,speed*dt),probe=Math.max(step,.15);
 if(!nav.clear(body,{x:body.x+x*probe,z:body.z+z*probe},radius)){
  x=vx;z=vz;
  if(!nav.clear(body,{x:body.x+x*step,z:body.z+z*step},Math.max(0,radius-EPS))){
   // Re-centre away from a clipped corner. This is an ordinary swept move, never a teleport.
   const centre=nav.point(nav.cell(body));dx=centre.x-body.x;dz=centre.z-body.z;d=Math.hypot(dx,dz);x=dx/Math.max(.001,d);z=dz/Math.max(.001,d);
   if(!nav.clear(body,{x:body.x+x*Math.min(d,step),z:body.z+z*Math.min(d,step)},Math.max(0,radius-EPS)))x=z=0;
  }
 }
 const arrival=Math.min(1,d/Math.max(.001,speed*dt));state.moving=Math.hypot(x,z)>.01;return {x:x*arrival,z:z*arrival};
}
