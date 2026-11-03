// Canvas command recorder for repaint and invalidation tests; not a GPU or raster benchmark.
export function canvasProbe(width=150,height=150,stats={clears:0,tiles:0,blits:0,surfaces:0}){
 const state={},stack=[];let operations=[];
 const ctx=new Proxy({
  save(){stack.push({...state});operations.push(['save']);},
  restore(){Object.assign(state,stack.pop());operations.push(['restore']);},
  clearRect(...args){stats.clears++;operations=[['clearRect',...args]];},
  fillRect(...args){stats.tiles++;operations.push(['fillRect',...args,state.fillStyle]);},
  drawImage(surface,...args){stats.blits++;operations=[['drawImage',...args, surface.ctx.operations()]];},
  operations:()=>operations,
 },{get(target,key){if(key in target)return target[key];if(key in state)return state[key];return (...args)=>operations.push([key,...args]);},set(_target,key,value){state[key]=value;operations.push(['set',key,value]);return true;}});
 const canvas={width,height,clientWidth:width,clientHeight:height,ctx,stats,getContext:()=>ctx,ownerDocument:{createElement:()=>{stats.surfaces++;return canvasProbe(width,height,stats);}}};return canvas;
}
