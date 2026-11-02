import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMap,LAYOUTS} from '../public/src/generator.js';
import {validateMap,parseMap,reachable,CAMPAIGN} from '../public/src/maps.js';
test('270 procedural maps have connected routes, valid placements and exact requested populations',()=>{
 const before=JSON.stringify(CAMPAIGN),hashes=new Set();
 for(const layout of Object.keys(LAYOUTS))for(const size of [20,24,32])for(let seed=0;seed<30;seed++){
  const m=generateMap({layout,size,seed:'CHECK-'+seed,enemies:40});assert.deepEqual(validateMap(m),[]);assert.equal(m.enemies.length,40);assert.equal(reachable(m).size,m.tiles.flat().filter(v=>v===0).length);assert.equal(parseMap(JSON.stringify(m)).enemies.length,40);hashes.add(JSON.stringify(m.tiles));
 }assert(hashes.size>200);assert.equal(JSON.stringify(CAMPAIGN),before);
});
test('seeds repeat exactly, options change output and arena geometry has rotational symmetry',()=>{
 const options={seed:'SAME-CITY',size:24,layout:'district',enemies:12};assert.deepEqual(generateMap(options),generateMap(options));assert.notDeepEqual(generateMap(options),generateMap({...options,seed:'NEXT-CITY'}));
 for(let seed=0;seed<20;seed++){const m=generateMap({seed,symmetric:true,enemies:0});const n=m.tiles.length;for(let z=0;z<n;z++)for(let x=0;x<n;x++)assert.equal(m.tiles[z][x],m.tiles[n-1-z][n-1-x]);}
});
