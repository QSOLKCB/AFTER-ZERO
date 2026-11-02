import {clamp,mix,smooth} from './math.js';
export const HIP_FOV=83;
export const viewFov=(weapon,ads)=>mix(HIP_FOV,weapon===3?29:57,smooth(ads));
export function applyLook(player,input,dt,{sensitivity=1,invert=false,weapon=0,ads=0}={}){
 // Match angular mouse speed to the visible field of view, continuously through zoom.
 const zoom=Math.tan(viewFov(weapon,ads)*Math.PI/360)/Math.tan(HIP_FOV*Math.PI/360);
 const scale=.0022*sensitivity*zoom;
 player.yaw+=(input.mouseX||0)*scale+clamp(input.turn||0,-1,1)*2.2*zoom*dt;
 player.pitch=clamp(player.pitch-(input.mouseY||0)*scale*(invert?-1:1)+clamp(input.look||0,-1,1)*2.2*zoom*dt,-Math.PI*.48,Math.PI*.48);
 player.yaw=((player.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
}
