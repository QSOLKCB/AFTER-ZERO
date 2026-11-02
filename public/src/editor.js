import {CAMPAIGN,cloneMap,emptyMap,validateMap,parseMap} from './maps.js';
import {generateMap} from './generator.js';
import {EDITOR_KEY,writeStored} from './storage.js';
const TOOLS=[['floor','Floor','#172d39'],['wall','Wall','#637581'],['cover','Crate','#b48c50'],['glass','Server','#46bfcf'],['hazard','Plasma','#f76130'],['erase','Erase','#506070'],['spawn','Start','#f2f6ec'],['exit','Exit','#9dd96a'],['sentry','Sentry','#ee7153'],['runner','Runner','#c868ef'],['heavy','Heavy','#e7b65f'],['architect','Boss','#ff3a32'],['terminal','Relay','#69e7e0'],['health','Medkit','#56c77c'],['charge','Charge','#65a8e8']];
const COLOURS=['#132530','#667680','#927848','#258c9c','#dd5a2c'];
export function drawMap(canvas,map,{player=null,enemies=null,terminals=null,grid=true,preview=false}={}){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cols=map.tiles[0].length,rows=map.tiles.length,scale=Math.min(w/cols,h/rows),ox=(w-cols*scale)/2,oy=(h-rows*scale)/2;
 ctx.fillStyle='#0b1720';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(ox,oy);
 map.tiles.forEach((r,z)=>r.forEach((t,x)=>{ctx.fillStyle=COLOURS[t];ctx.fillRect(x*scale+.5,z*scale+.5,scale-(grid?1:.3),scale-(grid?1:.3));}));
 const dot=(x,z,c,r=.22,label='')=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc((x+.5)*scale,(z+.5)*scale,Math.max(1.5,scale*r),0,Math.PI*2);ctx.fill();if(label&&scale>12){ctx.fillStyle='#08141b';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${scale*.45}px monospace`;ctx.fillText(label,(x+.5)*scale,(z+.51)*scale);}};
 for(const p of (enemies||map.enemies)){if(p.alive===false)continue;dot(enemies?p.x/3:p.x,enemies?p.z/3:p.z,Number.isInteger(p.team)?(p.team===0?'#38d6ee':'#ff5b7a'):p.type==='runner'?'#ce78f1':p.type==='architect'?'#ff4339':'#ff886b',.3,preview?'':p.type[0].toUpperCase());}
 for(const p of (terminals||map.terminals))dot(terminals?p.x/3:p.x,terminals?p.z/3:p.z,p.active?'#395d66':'#73e5e1',.3,preview?'':'T');
 if(!player)for(const p of map.pickups)dot(p.x,p.z,p.type==='health'?'#73d498':'#81bdf3',.23,preview?'':p.type==='health'?'+':'C');
 const exit=map.exit;ctx.strokeStyle='#b9f576';ctx.lineWidth=2;ctx.strokeRect((exit.x+.15)*scale,(exit.z+.15)*scale,scale*.7,scale*.7);
 const p=player||map.spawn,x=player?p.x/3:p.x,z=player?p.z/3:p.z;ctx.save();ctx.translate((x+.5)*scale,(z+.5)*scale);ctx.rotate(p.yaw);ctx.fillStyle='#f0faf6';ctx.beginPath();ctx.moveTo(0,-scale*.42);ctx.lineTo(scale*.28,scale*.3);ctx.lineTo(0,scale*.16);ctx.lineTo(-scale*.28,scale*.3);ctx.closePath();ctx.fill();ctx.restore();ctx.restore();
}
export class Editor{
 constructor({onTest,notice,storage}){
  this.onTest=onTest;this.notice=notice;this.storage=storage;this.map=cloneMap(CAMPAIGN[0]);this.undo=[];this.redo=[];this.tool='wall';this.drag=false;this.dirtyStroke=false;
  const $=s=>document.querySelector(s);this.canvas=$('#editor-grid');this.name=$('#map-name');this.palette=$('#map-palette');this.validation=$('#map-validation');this.summary=$('#editor-summary');this.coords=$('#map-coords');
  try{const raw=storage.getItem(EDITOR_KEY);if(raw)this.map=parseMap(raw,{allowUnreachable:true});}catch{}
  for(const [id,name,color] of TOOLS){const b=document.createElement('button');b.className='tool';b.dataset.tool=id;b.setAttribute('aria-pressed','false');const square=document.createElement('i');square.style.background=color;b.append(square,document.createTextNode(name));b.onclick=()=>{this.tool=id;this.syncTools();};$('#editor-tools').append(b);}
  CAMPAIGN.forEach((m,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${String(i+1).padStart(2,'0')} / ${m.name}`;$('#map-template').append(o);});
  $('#load-template').onclick=()=>{this.snapshot();this.map=cloneMap(CAMPAIGN[Number($('#map-template').value)]);this.refresh();this.notice('Campaign copy loaded. The original mission is unchanged.');};
  const generate=()=>{try{const map=generateMap({seed:$('#gen-seed').value,size:$('#gen-size').value,layout:$('#gen-layout').value,enemies:$('#gen-enemies').value});this.snapshot();this.map=map;this.refresh();this.persist();this.notice('Sector generated. All routes validated. Paint to refine it; Undo restores your previous map.');}catch(err){this.notice(err.message);}};
  $('#generate-map').onclick=generate;$('#shuffle-map').onclick=()=>{$('#gen-seed').value='SIGNAL-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();generate();};
  $('#new-map').onclick=()=>{this.snapshot();this.map=emptyMap();this.refresh();};
  $('#undo').onclick=()=>this.history(-1);$('#redo').onclick=()=>this.history(1);
  $('#rotate-spawn').onclick=()=>{this.snapshot();this.map.spawn.yaw=(this.map.spawn.yaw+Math.PI/2)%(Math.PI*2);this.refresh();};
  this.name.addEventListener('change',()=>{this.snapshot();this.map.name=this.name.value.trim()||'UNTITLED SECTOR';this.refresh();});
  this.palette.addEventListener('change',()=>{this.snapshot();this.map.palette=Number(this.palette.value);this.refresh();});
  $('#save-map').onclick=()=>{this.notice(writeStored(this.storage,EDITOR_KEY,this.map)?'Sector saved on this device.':'Device storage is unavailable. Export a JSON copy instead.');};
  $('#export-map').onclick=()=>this.export();$('#import-map').onclick=()=>$('#map-file').click();$('#map-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>120000)throw Error('Map file is too large (120 KB maximum).');const m=parseMap(await file.text());this.snapshot();this.map=m;this.refresh();this.notice('Sector imported. Ready for a test run.');}catch(err){this.notice(err.message);}e.target.value='';};
  $('#editor-test').onclick=()=>{const errors=validateMap(this.map);if(errors.length){this.notice(errors[0]);return;}this.persist();this.onTest(cloneMap(this.map));};
  this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;e.preventDefault();this.snapshot();this.drag=true;this.placedEntity=false;this.strokeTool=e.button===2?'erase':this.tool;this.lastCell='';this.canvas.setPointerCapture(e.pointerId);this.paint(e);});
  this.canvas.addEventListener('pointermove',e=>{const p=this.cell(e);this.coords.textContent=p?`X ${String(p.x).padStart(2,'0')} / Z ${String(p.z).padStart(2,'0')} · 3 METRES PER TILE`:'OUTSIDE GRID';if(this.drag)this.paint(e);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(name,()=>{if(this.drag){this.drag=false;this.persist();}});
  document.addEventListener('keydown',e=>{if($('#editor-panel').hidden||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();this.history(e.shiftKey?1:-1);}});
  this.resizeObserver=new ResizeObserver(()=>this.refresh(false));this.resizeObserver.observe(this.canvas);this.refresh();
 }
 syncTools(){for(const b of document.querySelectorAll('.tool')){b.classList.toggle('selected',b.dataset.tool===this.tool);b.setAttribute('aria-pressed',String(b.dataset.tool===this.tool));}}
 snapshot(){this.undo.push(cloneMap(this.map));if(this.undo.length>60)this.undo.shift();this.redo=[];}
 history(direction){const from=direction<0?this.undo:this.redo,to=direction<0?this.redo:this.undo;if(!from.length)return;to.push(cloneMap(this.map));this.map=from.pop();this.refresh();this.persist();}
 cell(e){const r=this.canvas.getBoundingClientRect(),cols=this.map.tiles[0].length,rows=this.map.tiles.length,scale=Math.min(r.width/cols,r.height/rows),ox=(r.width-cols*scale)/2,oy=(r.height-rows*scale)/2,x=Math.floor((e.clientX-r.left-ox)/scale),z=Math.floor((e.clientY-r.top-oy)/scale);return x>=0&&z>=0&&x<cols&&z<rows?{x,z}:null;}
 paint(e){
  const p=this.cell(e);if(!p)return;const {x,z}=p,key=`${x},${z}`;if(key===this.lastCell)return;this.lastCell=key;
  const m=this.map,cols=m.tiles[0].length,rows=m.tiles.length;if(x===0||z===0||x===cols-1||z===rows-1)return;
  const tool=this.strokeTool,terrain=['floor','wall','cover','glass','hazard','erase'].includes(tool);
  if(!terrain&&this.placedEntity)return;
  if(!terrain)this.placedEntity=true;
  if(terrain||!['spawn','exit'].includes(tool)){
   if((m.spawn.x===x&&m.spawn.z===z)||(m.exit.x===x&&m.exit.z===z)){if(tool!=='floor'&&tool!=='erase')return;}
  }
  const bucket=tool==='terminal'?'terminals':['health','charge'].includes(tool)?'pickups':['sentry','runner','heavy','architect'].includes(tool)?'enemies':null;
  if(bucket&&m[bucket].filter(v=>v.x!==x||v.z!==z).length>=(bucket==='terminals'?8:60)){this.notice(`Maximum ${bucket==='terminals'?8:60} ${bucket} per sector.`);return;}
  for(const k of ['enemies','terminals','pickups'])m[k]=m[k].filter(v=>v.x!==x||v.z!==z);
  if(terrain){m.tiles[z][x]=({floor:0,wall:1,cover:2,glass:3,hazard:4,erase:0})[tool];}
  else{
   if((tool!=='spawn'&&m.spawn.x===x&&m.spawn.z===z)||(tool!=='exit'&&m.exit.x===x&&m.exit.z===z))return;
   m.tiles[z][x]=0;
   if(tool==='spawn')m.spawn={x,z,yaw:m.spawn.yaw};else if(tool==='exit')m.exit={x,z};else if(tool==='terminal')m.terminals.push({x,z});else if(['health','charge'].includes(tool))m.pickups.push({x,z,type:tool});else m.enemies.push({x,z,type:tool});
  }
  this.refresh(false);
 }
 refresh(sync=true){if(sync){this.name.value=this.map.name;this.palette.value=this.map.palette;}const r=this.canvas.getBoundingClientRect();if(r.width&&r.height){const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);}drawMap(this.canvas,this.map);this.syncTools();const errors=validateMap(this.map);this.validation.textContent=errors.length?errors.join(' '):'✓ Valid sector. All objectives and hostiles are reachable.';this.validation.classList.toggle('invalid',!!errors.length);this.summary.textContent=`${this.map.enemies.length} HOSTILES / ${this.map.terminals.length} RELAYS`;document.querySelector('#undo').disabled=!this.undo.length;document.querySelector('#redo').disabled=!this.redo.length;}
 persist(){writeStored(this.storage,EDITOR_KEY,this.map);}
 export(){const errors=validateMap(this.map);if(errors.length){this.notice('Fix validation before export: '+errors[0]);return;}const blob=new Blob([JSON.stringify(this.map,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(this.map.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,50)||'sector')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.notice('Map exported as portable JSON.');}
}
