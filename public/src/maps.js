// AFTER//ZERO — original editable campaign sectors. One tile = three metres.
export const TILE=3, MAP_VERSION=1;
export const ENEMIES=['sentry','runner','heavy','architect'];
export const PALETTES=[
 {name:'Cinder',accent:[1,.29,.12],sky:[.025,.035,.06],wall:[.16,.20,.24]},
 {name:'Glacier',accent:[.10,.85,1],sky:[.025,.055,.075],wall:[.13,.21,.25]},
 {name:'Orchid',accent:[.85,.25,1],sky:[.055,.025,.08],wall:[.21,.17,.25]},
 {name:'Acid',accent:[.65,1,.20],sky:[.035,.055,.045],wall:[.17,.23,.19]}
];
export function emptyMap(name='UNTITLED SECTOR',w=24,h=24){
 const tiles=Array.from({length:h},(_,z)=>Array.from({length:w},(_,x)=>x===0||z===0||x===w-1||z===h-1?1:0));
 return {version:1,name,subtitle:'Independent signal',brief:'Break the local uplink. Clear the security units and reach extraction.',palette:0,tiles,spawn:{x:3,z:h-4,yaw:0},exit:{x:w-4,z:3},terminals:[],enemies:[],pickups:[]};
}
const rect=(m,x,z,w,h,t=1)=>{for(let j=z;j<z+h;j++)for(let i=x;i<x+w;i++)m.tiles[j][i]=t;};
const unit=(x,z,type='sentry')=>({x,z,type});
const node=(x,z)=>({x,z});
function sector(index,name,subtitle,brief,palette,build,enemies,terminals){
 const m=emptyMap(name);Object.assign(m,{index,subtitle,brief,palette});build(m);
 m.enemies=enemies;m.terminals=terminals;
 m.pickups=[{x:3,z:12,type:'health'},{x:20,z:12,type:'charge'},{x:12,z:20,type:'health'}];
 for(const p of [m.spawn,m.exit,...m.enemies,...m.terminals])m.tiles[p.z][p.x]=0;
 const occupied=new Set([m.spawn,m.exit,...m.enemies,...m.terminals].map(p=>`${p.x},${p.z}`));
 for(const p of m.pickups){
  if(occupied.has(`${p.x},${p.z}`)||m.tiles[p.z][p.x]!==0){
   const choices=[];for(let z=1;z<23;z++)for(let x=1;x<23;x++)if(m.tiles[z][x]===0&&!occupied.has(`${x},${z}`))choices.push({x,z,d:Math.abs(x-p.x)+Math.abs(z-p.z)});
   choices.sort((a,b)=>a.d-b.d);p.x=choices[0].x;p.z=choices[0].z;
  }
  occupied.add(`${p.x},${p.z}`);
 }
 return m;
}
export const CAMPAIGN=[
 sector(0,'DEAD CHANNEL','01 / THE LOW QUARTER','The city leases every second of your life. Tonight, you stole the clock. Silence the street relay and get the implant out of the low quarter.',0,m=>{
  rect(m,6,4,4,11);rect(m,14,9,4,11);rect(m,14,3,6,3);rect(m,3,17,7,1,2);rect(m,11,6,1,3,2);rect(m,19,15,2,2,2);
 },[unit(4,15),unit(12,12),unit(19,19),unit(20,8),unit(12,4),unit(20,5)],[node(11,8)]),
 sector(1,'FREIGHT GHOST','02 / CONTAINER TERMINAL','A courier route through the automated docks. Recover two routing keys. The security grid has learned your face; keep it guessing.',1,m=>{
  for(const x of [5,11,17])for(const z of [5,11,17])rect(m,x,z,3,3,z===11?2:1);
  rect(m,1,9,5,1);rect(m,19,15,4,1);m.exit={x:20,z:3};
 },[unit(4,18),unit(9,17,'runner'),unit(15,18),unit(20,17),unit(9,9),unit(15,8,'runner'),unit(20,7),unit(3,4)],[node(3,3),node(20,11)]),
 sector(2,'LAST TRAIN','03 / ABANDONED TRANSIT','The last service left sixteen years ago. Its defence system never clocked off. Cut the station relays and follow the maintenance line north.',2,m=>{
  rect(m,7,3,1,18);rect(m,16,3,1,18);for(const z of [6,12,18]){rect(m,7,z,1,2,0);rect(m,16,z,1,2,0);}
  rect(m,10,7,4,3,2);rect(m,10,15,4,3,2);rect(m,3,7,2,2,2);rect(m,19,15,2,2,2);
 },[unit(4,16,'runner'),unit(11,20),unit(19,19),unit(20,12,'heavy'),unit(12,12),unit(4,10),unit(11,4),unit(20,5,'runner')],[node(3,3),node(20,10)]),
 sector(3,'MEMORY LEAK','04 / THE ARCHIVE','Your identity is in this archive. So is everyone else’s. Sever three memory links and leave the doors open behind you.',1,m=>{
  for(const x of [5,10,15,20])for(const z of [5,10,15])rect(m,x,z,1,3,3);
  rect(m,8,19,9,1,2);rect(m,1,8,3,1);rect(m,20,19,3,1);
 },[unit(3,17),unit(7,14,'runner'),unit(12,17),unit(18,18,'heavy'),unit(22,12),unit(7,8),unit(12,7,'runner'),unit(18,7),unit(12,3)],[node(3,4),node(12,12),node(21,3)]),
 sector(4,'HOT METAL','05 / PLASMA FOUNDRY','The implant was built here. Its power cells are still hot. Stay off the orange coolant channels and cut the furnace control bus.',0,m=>{
  rect(m,5,5,4,4);rect(m,15,15,4,4);rect(m,15,5,4,4);rect(m,5,15,4,4);
  rect(m,11,3,2,18,4);for(const z of [6,11,16,20])rect(m,10,z,4,2,0);
  rect(m,3,11,3,1,2);rect(m,18,11,3,1,2);
 },[unit(4,18,'heavy'),unit(9,13),unit(3,6),unit(11,11,'runner'),unit(20,19),unit(20,12,'heavy'),unit(14,9,'runner'),unit(10,4),unit(20,4),unit(14,19)],[node(3,3),node(20,20),node(20,10)]),
 sector(5,'FALSE EDEN','06 / SKY GARDENS','A private garden above a public famine. The tower’s uplink is hidden in the irrigation network. Give the residents a little unscheduled weather.',3,m=>{
  rect(m,5,5,5,3,2);rect(m,14,5,5,3,2);rect(m,5,16,5,3,2);rect(m,14,16,5,3,2);
  rect(m,9,10,6,4);rect(m,3,11,3,1,3);rect(m,18,11,3,1,3);
 },[unit(4,15,'runner'),unit(11,19),unit(20,18,'heavy'),unit(7,13),unit(17,13,'runner'),unit(12,8,'heavy'),unit(3,4),unit(20,4),unit(12,3),unit(20,10,'runner'),unit(4,9)],[node(3,3),node(19,3),node(12,20)]),
 sector(6,'HOSTILE TAKEOVER','07 / THE EXECUTIVE RING','The board has evacuated. Its enforcement staff remain. Collapse the perimeter network; the central clock is one floor above.',2,m=>{
  rect(m,7,7,10,10);rect(m,10,7,4,10,0);rect(m,7,10,10,4,0);
  for(const [x,z] of [[3,6],[19,6],[3,17],[19,17]])rect(m,x,z,2,2,2);
  m.exit={x:12,z:3};
 },[unit(4,18,'heavy'),unit(12,19),unit(20,19,'runner'),unit(19,12,'heavy'),unit(4,12),unit(11,12,'runner'),unit(12,8),unit(4,4,'runner'),unit(19,4,'heavy'),unit(11,4),unit(19,9),unit(4,9)],[node(3,3),node(20,3),node(12,12)]),
 sector(7,'ZERO HOUR','08 / THE CHRONARCH','The Architect owns the city’s clock. Shut down its three stabilizers, destroy the machine, and put time back in everyone’s hands.',0,m=>{
  for(const [x,z] of [[5,5],[17,5],[5,17],[17,17]])rect(m,x,z,2,2,3);
  rect(m,8,10,2,1,2);rect(m,14,10,2,1,2);rect(m,8,15,2,1,2);rect(m,14,15,2,1,2);
  m.spawn={x:12,z:21,yaw:0};m.exit={x:12,z:2};
 },[unit(12,7,'architect'),unit(4,15,'heavy'),unit(20,15,'heavy'),unit(4,10,'runner'),unit(20,10,'runner'),unit(8,3),unit(16,3),unit(10,18),unit(14,18)],[node(3,3),node(20,3),node(12,13)])
];
export const cloneMap=m=>JSON.parse(JSON.stringify(m));
export function reachable(map){
 const h=map.tiles.length,w=map.tiles[0].length,seen=new Set(),queue=[map.spawn.z*w+map.spawn.x];seen.add(queue[0]);
 for(let q=0;q<queue.length;q++){const p=queue[q],x=p%w,z=Math.floor(p/w);for(const [nx,nz] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]])if(nx>=0&&nz>=0&&nx<w&&nz<h&&(map.tiles[nz][nx]===0||map.tiles[nz][nx]===4)&&!seen.has(nz*w+nx)){seen.add(nz*w+nx);queue.push(nz*w+nx);}}
 return seen;
}
export function validateMap(raw){
 const errors=[];
 if(!raw||typeof raw!=='object'||raw.version!==1)return ['Expected an AFTER//ZERO version 1 map.'];
 if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>60)errors.push('Name must contain 1–60 characters.');
 const rows=raw.tiles,w=rows?.[0]?.length,h=rows?.length;
 if(!Array.isArray(rows)||!Number.isInteger(w)||w<10||w>40||h<10||h>40||rows.some(r=>!Array.isArray(r)||r.length!==w||r.some(t=>!Number.isInteger(t)||t<0||t>4)))return [...errors,'Use a rectangular 10–40 tile grid with tile values 0–4.'];
 if(rows[0].some(t=>t!==1)||rows[h-1].some(t=>t!==1)||rows.some(r=>r[0]!==1||r[w-1]!==1))errors.push('The outer boundary must be solid wall.');
 if(!Number.isInteger(raw.palette)||raw.palette<0||raw.palette>=PALETTES.length)errors.push('Unknown colour palette.');
 const point=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.z)&&p.x>0&&p.x<w-1&&p.z>0&&p.z<h-1&&rows[p.z][p.x]===0;
 if(!point(raw.spawn)||!Number.isFinite(raw.spawn?.yaw))errors.push('Place one player start on clear floor with a finite facing angle.');
 if(!point(raw.exit))errors.push('Place extraction on clear floor.');
 for(const [key,max] of [['enemies',60],['terminals',8],['pickups',60]]){
  if(!Array.isArray(raw[key])||raw[key].length>max){errors.push(`Invalid ${key} list (maximum ${max}).`);continue;}
  if(raw[key].some(p=>!point(p)))errors.push(`${key}: all objects must be on clear floor.`);
 }
 if(raw.enemies?.some(e=>!ENEMIES.includes(e.type)))errors.push('Unknown enemy type.');
 if(raw.pickups?.some(p=>!['health','charge'].includes(p.type)))errors.push('Unknown pickup type.');
 if(errors.length)return errors;
 const occupied=new Set();for(const p of [raw.spawn,raw.exit,...raw.terminals,...raw.enemies,...raw.pickups]){const key=p.z*w+p.x;if(occupied.has(key))errors.push('Objects cannot share a tile.');occupied.add(key);}
 const flood=reachable(raw);
 for(const [kind,ps] of [['extraction',[raw.exit]],['relay',raw.terminals],['enemy',raw.enemies],['pickup',raw.pickups]])if(ps.some(p=>!flood.has(p.z*w+p.x)))errors.push(`A ${kind} is unreachable from the player start.`);
 return [...new Set(errors)];
}
// Import an allowlisted, bounded data shape. No scripts, URLs, HTML or inherited fields.
export function parseMap(text,{allowUnreachable=false}={}){
 if(text.length>120000)throw Error('Map file is too large (120 KB maximum).');
 const r=JSON.parse(text),errors=validateMap(r).filter(e=>!(allowUnreachable&&e.endsWith('is unreachable from the player start.')));if(errors.length)throw Error(errors.join(' '));
 const xy=p=>({x:p.x,z:p.z});
 return {version:1,name:r.name.trim(),subtitle:'Custom sector',brief:typeof r.brief==='string'?r.brief.slice(0,500):'Clear the security units, disable every relay, and reach extraction.',palette:r.palette,tiles:r.tiles.map(a=>a.slice()),spawn:{...xy(r.spawn),yaw:r.spawn.yaw},exit:xy(r.exit),terminals:r.terminals.map(xy),enemies:r.enemies.map(e=>({...xy(e),type:e.type})),pickups:r.pickups.map(p=>({...xy(p),type:p.type}))};
}
