import {ArenaClient} from './arena-client.js?v=0.4.4';
import {CLASSES,MODES} from './arena-sim.js?v=0.4.4';
import {validateMap,cloneMap} from './maps.js';
import {textValue} from './hud-values.js?v=0.4.4';
const $=s=>document.querySelector(s);
export function roster(target,s){
 let index=0;const row=(values,classes='')=>{let r=target.children[index++];if(!r){r=document.createElement('div');target.append(r);}const name='roster-row '+classes;if(r.className!==name)r.className=name;
  values.forEach((value,i)=>{let e=r.children[i];if(!e){e=document.createElement('span');r.append(e);}textValue(e,value);});};
 row(['CALLSIGN','CLASS','SIGNAL','K','D'],'roster-head');
 for(const p of s.players.slice().sort((a,b)=>s.mode==='dm'?b.kills-a.kills:a.team-b.team||b.kills-a.kills))row([p.name+(p.id===s.you?' / YOU':''),CLASSES[p.class].name,p.bot?'AI':'HUMAN',p.kills,p.deaths],(s.mode==='dm'?'':`team-${p.team} `)+(p.id===s.you?'mine':''));
 while(target.children.length>index)target.lastElementChild.remove();
}
export function arenaScore(s){return s.mode==='dm'?`LEADER ${Math.max(...s.players.map(p=>p.kills))} / ${s.limit}`:`CYAN ${s.scores[0]} : ${s.scores[1]} MAGENTA / ${s.limit}`;}
export function setupArena({editor,canPlay,onEnter,onLeave,onEvent,onLost}){
 let selected='assault',client=null,busy=false,lastError='',lastPaint=-Infinity;
 for(const [key,c] of Object.entries(CLASSES)){const b=document.createElement('button');b.className='class-card';b.dataset.class=key;const small=document.createElement('small');small.textContent=`0${Object.keys(CLASSES).indexOf(key)+1} / CLASS`;const strong=document.createElement('strong');strong.textContent=c.name;const role=document.createElement('p');role.textContent=c.role;const stats=document.createElement('b');stats.textContent=`${c.health} HP / ${c.speed.toFixed(1)} M/S`;b.append(small,strong,role,stats);b.onclick=()=>{selected=key;syncClasses();};$('#class-grid').append(b);}
 function syncClasses(){for(const b of document.querySelectorAll('[data-class]')){b.classList.toggle('selected',b.dataset.class===selected);b.setAttribute('aria-pressed',String(b.dataset.class===selected));}$('#class-description').textContent=CLASSES[selected].role;}
 syncClasses();
 function update(c){
  const now=performance.now();if(c.active&&now-lastPaint<250)return;lastPaint=now;
  const s=c.snapshot;$('#arena-setup').hidden=true;$('#arena-room').hidden=false;$('#room-code').textContent=c.code;$('#room-mode').textContent=MODES[s.mode];$('#room-summary').textContent=`${s.players.filter(p=>!p.bot).length} HUMANS / ${s.players.filter(p=>p.bot).length} AI · ROUND ${s.round}`;$('#room-score').textContent=arenaScore(s);roster($('#room-roster'),s);roster($('#arena-board-rows'),s);
  $('#arena-status').textContent=c.error||c.shotWarning||`${s.status==='finished'?'ROUND COMPLETE / next round begins shortly':'CONNECTED'} · ${c.latency} ms round trip · ${Math.max(0,300-Math.floor(s.time))}s remaining`;
  $('#arena-enter').disabled=!canPlay()||!c.active;$('#arena-gpu').hidden=canPlay();
  $('#room-rules').textContent=s.mode==='dom'?'Hold A, B and C. Four seconds captures a point. Contested points stop scoring. Friendly fire is disabled.':s.mode==='tdm'?'Every kill adds one team point. Friendly fire is disabled. Humans are distributed evenly and bots fill every empty slot.':'Every combatant is a rival. First to 25 kills wins. Bots and humans use the same weapons and damage rules.';
  if(!c.active)onLost();
 }
 async function connect(action){
  if(busy)return;busy=true;$('#arena-create').disabled=true;$('#arena-join').disabled=true;$('#arena-status').textContent='CONNECTING / reserving your signal…';
  try{
   let map=null;if(action==='create'&&$('#arena-forge').checked){const errors=validateMap(editor.map);if(errors.length)throw Error(errors[0]);map=cloneMap(editor.map);}
   client=new ArenaClient({onUpdate:update,onEvent,onError:message=>{$('#arena-status').textContent=message;if(lastError!==message){lastError=message;onLost(message);}}});
   await client.connect(action,{code:$('#arena-code').value.trim().toUpperCase(),name:$('#arena-name').value,kind:selected,options:{mode:$('#arena-mode').value,slots:Number($('#arena-slots').value),seed:$('#arena-seed').value,map}});
   $('#room-class').value=selected;lastError='';
  }catch(e){$('#arena-status').textContent=e.message;client=null;}finally{busy=false;$('#arena-create').disabled=false;$('#arena-join').disabled=false;}
 }
 $('#arena-create').onclick=()=>connect('create');$('#arena-join').onclick=()=>connect('join');
 $('#arena-enter').onclick=()=>{if(client?.active)onEnter(client);};
 $('#arena-leave').onclick=async()=>{const old=client;client=null;onLeave();$('#arena-room').hidden=true;$('#arena-setup').hidden=false;$('#arena-status').textContent='DISCONNECTED / Your slot is now filled by an agent.';if(old)await old.leave();};
 $('#room-copy').onclick=async()=>{try{await navigator.clipboard.writeText(client.code);$('#arena-status').textContent='ROOM CODE COPIED / Share it with players who have Site access.';}catch{$('#arena-status').textContent='Room code: '+client.code;}};
 $('#class-change').onclick=async()=>{if(!client)return;try{await client.changeClass($('#room-class').value);}catch(e){$('#arena-status').textContent=e.message;}};
 return {get client(){return client;},update};
}
