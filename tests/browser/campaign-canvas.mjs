import {drawMap} from '../../public/src/map-view.js?v=0.4.6';
import {drawMap as originalMap} from '../fixtures/map-reference.mjs';
import {drawSight} from '../../public/src/sights.js?v=0.4.6';
import {drawSight as originalSight} from '../fixtures/sight-reference.mjs';
import {CAMPAIGN,cloneMap} from '../../public/src/maps.js';
const a=document.querySelector('#before'),b=document.querySelector('#after'),out=document.querySelector('#results');
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
let cases=0;
function equal(label){const x=pixels(a),y=pixels(b);if(x.length!==y.length||x.some((v,i)=>v!==y[i]))throw Error('Pixel mismatch: '+label);cases++;}
try{
 for(const source of CAMPAIGN){const map=cloneMap(source);for(let i=0;i<12;i++){
  if(i===4)map.tiles[3][3]=(map.tiles[3][3]+1)%5;if(i===8){a.width=b.width=210;a.height=b.height=160;}
  const options={grid:i%2===0,preview:true,player:{x:15+i*.7,z:18,yaw:i*.2},enemies:[{x:12+i,z:12,alive:i%3!==0,type:'heavy'}],terminals:[{x:18,z:9,active:i>6}]};
  originalMap(a,map,options);drawMap(b,map,{...options,cacheTerrain:true});equal(source.name+' radar '+i);
 }}
 for(let i=0;i<240;i++){const state={weapon:Math.floor(i/48),ads:i%48<24?0:1,recoil:i%12/12,reload:i%48>=40?.5:0};originalSight(a,state);drawSight(b,state);equal('sight '+i);}
 const frames=240,runs=7;const median=x=>x.sort((a,b)=>a-b)[Math.floor(x.length/2)];
 function time(draw,canvas){const t=performance.now();for(let i=0;i<frames;i++)draw(canvas,i);return performance.now()-t;}
 function measure(name,old,next){const oldTimes=[],newTimes=[];const oldC=document.createElement('canvas'),newC=document.createElement('canvas');oldC.width=newC.width=150;oldC.height=newC.height=150;time(old,oldC);time(next,newC);for(let i=0;i<runs;i++){if(i%2){newTimes.push(time(next,newC));oldTimes.push(time(old,oldC));}else{oldTimes.push(time(old,oldC));newTimes.push(time(next,newC));}}return {name,frames,beforeMs:median(oldTimes),afterMs:median(newTimes)};}
 const map=cloneMap(CAMPAIGN[7]),options={grid:false,preview:true,player:{x:15,z:18,yaw:0},enemies:[],terminals:[]};
 const reports=[measure('unchanged radar terrain / moving pointer', (c,i)=>originalMap(c,map,{...options,player:{x:15+i*.01,z:18,yaw:i*.01}}),(c,i)=>drawMap(c,map,{...options,player:{x:15+i*.01,z:18,yaw:i*.01},cacheTerrain:true})),measure('settled sight',(c)=>originalSight(c,{preview:true}),(c)=>drawSight(c,{preview:true})),measure('rapid sight changes',(c,i)=>originalSight(c,{preview:true,recoil:i%12/12}),(c,i)=>drawSight(c,{preview:true,recoil:i%12/12}))];
 out.textContent=JSON.stringify({status:'PASS',pixelComparisons:cases,reports,note:'Native Canvas 2D CPU submission timings; no GPU/frame-rate claim.'},null,2);
}catch(error){out.textContent='FAIL: '+error.message;throw error;}

import {PointerCapture} from '../../public/src/pointer-capture.js?v=0.4.6';
const captureStatus=document.querySelector('#capture-status');
const capture=new PointerCapture(b,{onAcquire:()=>captureStatus.textContent='LOCKED — Escape releases the mouse',onRelease:()=>captureStatus.textContent='RELEASED — gameplay paused',onError:()=>captureStatus.textContent='CAPTURE BLOCKED'});
document.querySelector('#capture').onclick=()=>{captureStatus.textContent='Waiting for capture';capture.request();};
