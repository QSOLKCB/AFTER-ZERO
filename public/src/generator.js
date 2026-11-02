import {emptyMap,reachable,validateMap} from './maps.js';
import {seededRandom} from './math.js';
export const LAYOUTS={district:'Neon district',depot:'Freight lanes',citadel:'Signal citadel'};
export function seedNumber(value){let n=2166136261;for(const c of String(value).slice(0,48)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;}
export function generateMap({seed='NIGHT-2077',size=24,layout='district',enemies=12,symmetric=false}={}){
 size=[20,24,32].includes(Number(size))?Number(size):24;layout=Object.hasOwn(LAYOUTS,layout)?layout:'district';
 seed=String(seed).trim().slice(0,48)||'NIGHT-2077';enemies=Math.max(0,Math.min(40,Math.round(Number(enemies)||0)));
 const rng=seededRandom(seedNumber(seed)),m=emptyMap(`${LAYOUTS[layout].toUpperCase()} / ${seed}`.slice(0,60),size,size);
 m.spawn={x:2,z:size-3,yaw:0};m.exit={x:size-3,z:2};m.palette=Math.floor(rng()*4);m.subtitle='FORGE / GENERATED';
 m.brief=`Seed ${seed} · ${LAYOUTS[layout]} · ${size} × ${size}. Clear security, sever the relays, reach extraction.`;
 const place=(x,z,w,h,t)=>{
  const cells=[];for(let j=z;j<z+h;j++)for(let i=x;i<x+w;i++)cells.push([i,j]);
  if(symmetric)cells.push(...cells.map(([i,j])=>[size-1-i,size-1-j]));
  if(cells.some(([i,j])=>i<2||j<2||i>=size-2||j>=size-2||Math.hypot(i-m.spawn.x,j-m.spawn.z)<3||Math.hypot(i-m.exit.x,j-m.exit.z)<3))return;
  const old=cells.map(([i,j])=>m.tiles[j][i]);cells.forEach(([i,j])=>m.tiles[j][i]=t);
  const floors=m.tiles.flat().filter(v=>v===0).length;
  if(reachable(m).size!==floors)cells.forEach(([i,j],n)=>m.tiles[j][i]=old[n]);
 };
 // Separate building lots leave broad, looped streets. Rejected blocks cannot seal a route.
 for(let z=4;z<size-4;z+=5)for(let x=4;x<size-4;x+=5){
  if(rng()<.18)continue;
  if(layout==='depot')place(x,z,2,2,rng()<.7?2:3);
  else if(layout==='citadel'){place(x,z,1,3,3);if(rng()<.5)place(x+2,z,1,1,2);}
  else place(x,z,2+Math.floor(rng()*2),2+Math.floor(rng()*2),rng()<.25?2:1);
 }
 const occupied=new Set([m.spawn,m.exit].map(p=>`${p.x},${p.z}`));
 let cells=[];for(let z=2;z<size-2;z++)for(let x=2;x<size-2;x++)if(m.tiles[z][x]===0&&!occupied.has(`${x},${z}`))cells.push({x,z});
 // Deterministic Fisher–Yates; no browser- or engine-dependent random sorting.
 for(let i=cells.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
 const take=(min=0)=>{const i=cells.findIndex(p=>Math.hypot(p.x-m.spawn.x,p.z-m.spawn.z)>=min);return i<0?null:cells.splice(i,1)[0];};
 for(let i=0;i<Math.min(3,Math.max(1,Math.ceil(enemies/10)));i++){const p=take(6);if(p)m.terminals.push(p);}
 for(let i=0;i<enemies;i++){const p=take(5);if(p)m.enemies.push({...p,type:i%7===6?'heavy':i%3===1?'runner':'sentry'});}
 for(let i=0;i<Math.max(4,Math.ceil(enemies/4));i++){const p=take(2);if(p)m.pickups.push({...p,type:i%2?'charge':'health'});}
 const errors=validateMap(m);if(errors.length)throw Error('Generation failed: '+errors[0]);return m;
}
