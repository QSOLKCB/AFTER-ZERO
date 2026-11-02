export const SAVE_KEY='afterzero.campaign.v1',SETTINGS_KEY='afterzero.settings.v1',EDITOR_KEY='afterzero.editor.v1';
export const freshSave=()=>({version:1,unlocked:0,completed:{},upgrades:{health:0,chrono:0,power:0},credits:0});
const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
export function readSave(storage){
 try{const s=JSON.parse(storage.getItem(SAVE_KEY));if(s?.version!==1||!integer(s.unlocked,0,7)||!integer(s.credits,0,8))return freshSave();
  const out=freshSave();out.unlocked=s.unlocked;out.credits=s.credits;
  for(const k of ['health','chrono','power'])out.upgrades[k]=integer(s.upgrades?.[k],0,8)?s.upgrades[k]:0;
  for(let i=0;i<8;i++){const r=s.completed?.[i];if(r&&Number.isFinite(r.score)&&r.score>=0&&Number.isFinite(r.time)&&r.time>=0)out.completed[i]={score:r.score,time:r.time};}
  return out;
 }catch{return freshSave();}
}
export function completeMission(save,index,score,time){
 const first=!Object.hasOwn(save.completed,index),old=save.completed[index];save.completed[index]={score:Math.max(old?.score||0,score),time:Math.min(old?.time||Infinity,time)};
 save.unlocked=Math.max(save.unlocked,Math.min(7,index+1));if(first)save.credits++;return first;
}
export function writeStored(storage,key,value){try{storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
