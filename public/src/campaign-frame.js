import {STEP} from './game.js';
import {applyLook} from './aim.js';

// Mouse-look belongs to the display frame; movement and combat stay at 120 Hz.
// Do not consume action edges on frames with no simulation tick.
export class CampaignFrame {
 constructor(){this.reset();}
 reset(){this.accumulator=0;}
 advance(game,controls,dt,settings={}){
  if(game.status!=='playing'){this.reset();return 0;}
  applyLook(game.player,controls.readLook(),0,{...settings,weapon:game.weapon,ads:game.ads});
  this.accumulator=Math.min(this.accumulator+Math.max(0,Math.min(.08,dt)),.10);
  let steps=0;
  while(this.accumulator+1e-12>=STEP&&steps<12&&game.status==='playing'){
   game.step(STEP,{...controls.read(settings),sensitivity:settings.sensitivity,invert:settings.invert});
   this.accumulator=Math.max(0,this.accumulator-STEP);steps++;
  }
  return steps;
 }
}
