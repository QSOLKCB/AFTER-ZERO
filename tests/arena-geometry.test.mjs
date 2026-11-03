import test from 'node:test';
import assert from 'node:assert/strict';
import {ArenaGeometryCache} from '../public/src/arena-geometry.js';
import {worldFor} from '../public/src/game.js';
import {Navigation} from '../public/src/navigation.js';
import {generateMap} from '../public/src/generator.js';

test('arena geometry reuse agrees with fresh collision and routing after JSON restore and tile edits',()=>{
 const cache=new ArenaGeometryCache(),map=generateMap({size:24,seed:'reuse',layout:'depot',enemies:0});
 const start={x:map.spawn.x*3,z:map.spawn.z*3},end={x:map.exit.x*3,z:map.exit.z*3};
 const original=cache.get(map);assert.equal(cache.get(JSON.parse(JSON.stringify(map))),original);
 for(const tile of [1,2,3,4,0]){
  map.tiles[10][10]=tile;const {world,nav}=cache.get(map),fresh=new Navigation(map);
  assert.deepEqual(world,worldFor(map));assert.deepEqual(nav.route(start,end),fresh.route(start,end));
  assert.equal(nav.clear(start,end),fresh.clear(start,end));
 }
 assert.notEqual(original.nav.map.tiles[10][10],map.tiles[10][10],'captured tiles remain owned');
 assert(cache.entries.length<=2);cache.clear();assert.equal(cache.entries.length,0);
 assert.throws(()=>cache.get({tiles:[[NaN]]}),/Invalid/);assert.equal(cache.entries.length,0);
});
