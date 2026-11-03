// OPT invariant reuse, reviewed in VANILLAJS v1.0.0. See NOTICE.
import {worldFor} from './game.js';
import {Navigation} from './navigation.js';

// Room JSON is reconstructed each request. Object identity is not a cache key.
// Both builders depend only on the complete tile grid, including hazards.
export class ArenaGeometryCache{
 constructor(){this.entries=[];}
 get(map){
  const tiles=map.tiles;
  if(!Array.isArray(tiles)||!tiles.length||!tiles.every(row=>Array.isArray(row)&&row.length===tiles[0].length&&row.every(t=>Number.isInteger(t)&&t>=0&&t<=4)))throw TypeError('Invalid arena tiles');
  const signature=JSON.stringify(tiles),index=this.entries.findIndex(e=>e.signature===signature);
  if(index>=0){const [entry]=this.entries.splice(index,1);this.entries.push(entry);return entry.geometry;}
  // Own the captured inputs: editor/room mutation cannot corrupt a cached map.
  const owned={tiles:tiles.map(row=>row.slice())};
  const world=worldFor(owned),nav=new Navigation(owned);
  // These module-owned values are read-only to consumers. Freezing numeric
  // arrays deoptimizes the collision/navigation loops in V8; retain packed arrays.
  const geometry={world,nav};this.entries.push({signature,geometry});if(this.entries.length>2)this.entries.shift();return geometry;
 }
 clear(){this.entries=[];}
}
const cache=new ArenaGeometryCache();
export const arenaGeometry=map=>cache.get(map);
