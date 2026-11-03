const COLOURS=['#132530','#667680','#927848','#258c9c','#dd5a2c'];
const terrainCache=new WeakMap();
function paintTerrain(ctx,map,w,h,grid){
 const cols=map.tiles[0].length,rows=map.tiles.length,scale=Math.min(w/cols,h/rows),ox=(w-cols*scale)/2,oy=(h-rows*scale)/2;
 ctx.fillStyle='#0b1720';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(ox,oy);
 map.tiles.forEach((r,z)=>r.forEach((t,x)=>{ctx.fillStyle=COLOURS[t];ctx.fillRect(x*scale+.5,z*scale+.5,scale-(grid?1:.3),scale-(grid?1:.3));}));
 ctx.restore();
}
function terrainFor(canvas,map,grid){
 const w=canvas.width,h=canvas.height,cols=map.tiles[0].length,rows=map.tiles.length;
 let cached=terrainCache.get(canvas);
 if(!cached){cached={surface:canvas.ownerDocument.createElement('canvas'),valid:false};terrainCache.set(canvas,cached);}
 let changed=!cached.valid||cached.w!==w||cached.h!==h||cached.cols!==cols||cached.rows!==rows||cached.grid!==grid;
 // Exact bounded comparison, no hash collisions and no JSON snapshot per frame.
 if(!changed)for(let z=0;z<rows&&!changed;z++)for(let x=0;x<cols;x++)if(cached.tiles[z*cols+x]!==map.tiles[z][x]){changed=true;break;}
 if(changed){
  cached.valid=false;cached.surface.width=w;cached.surface.height=h;
  paintTerrain(cached.surface.getContext('2d'),map,w,h,grid);
  if(cached.tiles?.length!==cols*rows)cached.tiles=new Uint8Array(cols*rows);
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++)cached.tiles[z*cols+x]=map.tiles[z][x];
  Object.assign(cached,{w,h,cols,rows,grid,valid:true});
 }
 return cached.surface;
}
export function drawMap(canvas,map,{player=null,enemies=null,terminals=null,grid=true,preview=false,cacheTerrain=false}={}){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cols=map.tiles[0].length,rows=map.tiles.length,scale=Math.min(w/cols,h/rows),ox=(w-cols*scale)/2,oy=(h-rows*scale)/2;
 if(cacheTerrain)ctx.drawImage(terrainFor(canvas,map,grid),0,0);else paintTerrain(ctx,map,w,h,grid);
 ctx.save();ctx.translate(ox,oy);
 const dot=(x,z,c,r=.22,label='')=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc((x+.5)*scale,(z+.5)*scale,Math.max(1.5,scale*r),0,Math.PI*2);ctx.fill();if(label&&scale>12){ctx.fillStyle='#08141b';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${scale*.45}px monospace`;ctx.fillText(label,(x+.5)*scale,(z+.51)*scale);}};
 for(const p of (enemies||map.enemies)){if(p.alive===false)continue;dot(enemies?p.x/3:p.x,enemies?p.z/3:p.z,Number.isInteger(p.team)?(p.team===0?'#38d6ee':'#ff5b7a'):p.type==='runner'?'#ce78f1':p.type==='architect'?'#ff4339':'#ff886b',.3,preview?'':p.type[0].toUpperCase());}
 for(const p of (terminals||map.terminals))dot(terminals?p.x/3:p.x,terminals?p.z/3:p.z,p.active?'#395d66':'#73e5e1',.3,preview?'':'T');
 if(!player)for(const p of map.pickups)dot(p.x,p.z,p.type==='health'?'#73d498':'#81bdf3',.23,preview?'':p.type==='health'?'+':'C');
 const exit=map.exit;ctx.strokeStyle='#b9f576';ctx.lineWidth=2;ctx.strokeRect((exit.x+.15)*scale,(exit.z+.15)*scale,scale*.7,scale*.7);
 const p=player||map.spawn,x=player?p.x/3:p.x,z=player?p.z/3:p.z;ctx.save();ctx.translate((x+.5)*scale,(z+.5)*scale);ctx.rotate(p.yaw);ctx.fillStyle='#f0faf6';ctx.beginPath();ctx.moveTo(0,-scale*.42);ctx.lineTo(scale*.28,scale*.3);ctx.lineTo(0,scale*.16);ctx.lineTo(-scale*.28,scale*.3);ctx.closePath();ctx.fill();ctx.restore();ctx.restore();
}
