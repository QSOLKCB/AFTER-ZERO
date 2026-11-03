import test from 'node:test';
import assert from 'node:assert/strict';
import {drawSight} from '../public/src/sights.js';
import {drawSight as referenceSight} from './fixtures/sight-reference.mjs';
import {drawMap} from '../public/src/map-view.js';
import {emptyMap,cloneMap} from '../public/src/maps.js';
import {canvasProbe} from './fixtures/canvas-probe.mjs';

test('sights retain identical drawing commands through weapon, recoil, reload and scope transitions',()=>{
 const actual=canvasProbe(),reference=canvasProbe();
 for(let n=0;n<240;n++){
  const g={weapon:Math.floor(n/48),ads:n%48<24?0:1,recoil:n%12/12,reload:n%48>=40?.5:0};
  drawSight(actual,g);referenceSight(reference,g);assert.deepEqual(actual.ctx.operations(),reference.ctx.operations(),`frame ${n}`);
 }
});
test('settled sight repaints once; real geometry, visibility, DPR and viewport changes invalidate it',()=>{
 const c=canvasProbe();for(let n=0;n<240;n++)drawSight(c,{weapon:0});assert.equal(c.stats.clears,1);
 drawSight(c,{weapon:1});drawSight(c,{weapon:1,ads:1});drawSight(c,{weapon:1,reload:1});drawSight(c,{weapon:1,ads:1});assert.equal(c.stats.clears,5);
 c.clientWidth=180;drawSight(c,{weapon:1,ads:1});assert.equal(c.stats.clears,6);
 const before=globalThis.devicePixelRatio;try{globalThis.devicePixelRatio=2;drawSight(c,{weapon:1,ads:1});assert.equal(c.stats.clears,7);}finally{if(before===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=before;}
});
test('radar reuses terrain but redraws moving markers; mutation, dimensions and grid changes invalidate',()=>{
 const c=canvasProbe(),m=emptyMap(),opts={cacheTerrain:true,grid:false,preview:true,player:{x:9,z:9,yaw:0},enemies:[],terminals:[]};
 drawMap(c,m,opts);const tiles=c.stats.tiles,first=JSON.stringify(c.ctx.operations());
 opts.player.x=12;for(let n=0;n<239;n++)drawMap(c,m,opts);
 assert.equal(c.stats.tiles,tiles);assert.equal(c.stats.blits,240);assert.equal(c.stats.surfaces,1);assert.notEqual(JSON.stringify(c.ctx.operations()),first);
 m.tiles[3][3]=4;drawMap(c,m,opts);assert.equal(c.stats.tiles,tiles*2);
 c.width=200;drawMap(c,m,opts);assert.equal(c.stats.tiles,tiles*3);
 drawMap(c,m,{...opts,grid:true});assert.equal(c.stats.tiles,tiles*4);
 drawMap(c,cloneMap(m),{...opts,grid:true});assert.equal(c.stats.tiles,tiles*4);
 const other=emptyMap('OTHER',24,24);drawMap(c,other,opts);assert.equal(c.stats.surfaces,1);
});
test('rapid map edits reuse one surface and never show an old terrain snapshot',()=>{
 const c=canvasProbe(),m=emptyMap(),options={cacheTerrain:true};const cells=m.tiles.length*m.tiles[0].length+1;
 for(let n=0;n<120;n++){m.tiles[3][3]=n%5;drawMap(c,m,options);assert.equal(c.stats.tiles,cells*(n+1));}
 assert.equal(c.stats.surfaces,1);
});
