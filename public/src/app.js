import {Game,STEP,WEAPONS} from './game.js';
import {CAMPAIGN} from './maps.js';
import {Renderer} from './renderer.js';
import {Sound} from './audio.js';
import {Editor,drawMap} from './editor.js';
import {readSave,writeStored,SAVE_KEY,SETTINGS_KEY,completeMission} from './storage.js';
import {setupArena,arenaScore} from './arena-ui.js?v=0.4.3';
import {MODES,CLASSES} from './arena-sim.js';
import {drawSight} from './sights.js';
import {Controls} from './controls.js';
const $=s=>document.querySelector(s),canvas=$('#world');
const memory=new Map(),fallback={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
let storage;try{storage=localStorage;}catch{storage=fallback;}
let save=readSave(storage),settings={sensitivity:1,volume:.4,music:.18,invert:false,reduced:false,low:false};
try{const r=JSON.parse(storage.getItem(SETTINGS_KEY));if(r){for(const k of ['sensitivity','volume','music'])if(Number.isFinite(r[k]))settings[k]=Math.max(k==='sensitivity'?.5:0,Math.min(k==='sensitivity'?3:1,r[k]));for(const k of ['invert','reduced','low'])if(typeof r[k]==='boolean')settings[k]=r[k];}}catch{}
let arenaUI,renderer,game=new Game(CAMPAIGN[0]),mode='menu',selected=save.unlocked,tab='campaign',time=0,last=0,accumulator=0,hitTimer=0,hurtTimer=0,toastTimer=0,noticeTimer=0,resultHandled=false;
const sound=new Sound(),controls=new Controls();let captureHeld=false;
function notice(text){$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,5000);}
function persist(){if(!writeStored(storage,SAVE_KEY,save))notice('Progress is in memory only. Browser storage is unavailable.');}
function clearInput(){controls.clear();game.cancelAttack();arenaUI?.client?.neutral();$('#arena-scoreboard').hidden=true;}
function toast(text){$('#game-toast').textContent=text;toastTimer=3;}
function configure(){sound.setVolume(settings.volume);sound.musicVolume=settings.music;document.body.classList.toggle('reduced',settings.reduced);$('#sensitivity-out').textContent=settings.sensitivity.toFixed(1)+'×';for(const k of ['sensitivity','volume','music'])$('#'+k).value=settings[k];for(const k of ['invert','reduced','low'])$('#'+k).checked=settings[k];}
configure();
for(const k of ['sensitivity','volume','music','invert','reduced','low'])$('#'+k).addEventListener('input',e=>{settings[k]=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);configure();writeStored(storage,SETTINGS_KEY,settings);});
$('#settings-open').onclick=()=>$('#settings').showModal();$('#settings-close').onclick=()=>$('#settings').close();
function updateCampaign(){
 const m=CAMPAIGN[selected],done=Object.keys(save.completed).length;
 $('#mission-number').textContent=`OPERATION ${String(selected+1).padStart(2,'0')} / 08`;
 $('#mission-subtitle').textContent=m.subtitle.split(' / ')[1];$('#mission-title').textContent=m.name;$('#mission-brief').textContent=m.brief;
 $('#mission-enemies').textContent=String(m.enemies.length).padStart(2,'0');$('#mission-relays').textContent=String(m.terminals.length).padStart(2,'0');$('#mission-record').textContent=save.completed[selected]?.score||'—';$('#progress-label').textContent=`CAMPAIGN / ${done} OF 8 COMPLETE`;
 $('#launch').firstChild.textContent=save.completed[selected]?'REPLAY SECTOR ':'JACK IN ';
 $('#mission-rail').replaceChildren();CAMPAIGN.forEach((map,i)=>{const b=document.createElement('button');b.className='mission-button'+(i===selected?' selected':'');b.disabled=i>save.unlocked;b.setAttribute('aria-label',`Mission ${i+1}: ${map.name}${b.disabled?', locked':''}`);const n=document.createElement('span');n.className='num';n.textContent=String(i+1).padStart(2,'0');const status=document.createElement('span');status.textContent=i>save.unlocked?'⌁':save.completed[i]?'✓':'↗';n.append(status);const l=document.createElement('span');l.className='label';l.textContent=map.name;b.append(n,l);b.onclick=()=>{selected=i;updateCampaign();game=new Game(CAMPAIGN[i],{level:i});};$('#mission-rail').append(b);});
 drawMap($('#mission-map'),m,{grid:false,preview:true});updateArsenal();
}
function makeUpgradeButtons(target){
 target.replaceChildren();
 for(const [key,name,description] of [['health','REINFORCED SHELL','+20 maximum health'],['chrono','DEEP RESERVE','+25 chronal capacity'],['power','OVERCLOCK','+10% weapon damage']]){
  const b=document.createElement('button');b.className='upgrade-button';b.disabled=!save.credits;const label=document.createElement('strong');label.textContent=name+' / '+save.upgrades[key];const span=document.createElement('span');span.textContent=description;b.append(label,span);b.onclick=()=>{if(!save.credits)return;save.credits--;save.upgrades[key]++;persist();updateArsenal();if(mode==='won')makeUpgradeButtons($('#result-upgrades'));notice(`${name} installed. Applies from the next sector or retry.`);};target.append(b);
 }
}
function updateArsenal(){
 $('#weapon-list').replaceChildren();const descriptions=['Fast, deliberate shots. Double damage on a clean head hit.','Automatic fire for close encounters. Short bursts keep the spread tight.','Eight pellets. Close the gap and clear a lane.','A precision beam that pierces up to three targets. Solid cover stops it.','Travelling plasma. Explodes on impact with a four-metre damage radius.'];
 WEAPONS.forEach((w,i)=>{const card=document.createElement('article');card.className='weapon-card'+(w.unlock>save.unlocked?' locked':'');const state=document.createElement('div');state.className='weapon-lock';state.textContent=w.unlock>save.unlocked?`LOCKED / SECTOR ${String(w.unlock+1).padStart(2,'0')}`:'AVAILABLE';const icon=document.createElement('div');icon.className='weapon-icon';icon.textContent=['▰═','▰╦═','▰══','▰════','◈══'][i];const sight=document.createElement('canvas');sight.width=150;sight.height=100;sight.className='optic-preview';sight.setAttribute('aria-label',w.name+' aimed sight');drawSight(sight,{weapon:i,ads:1,preview:true});const title=document.createElement('h3');title.textContent=w.name;const kind=document.createElement('p');kind.textContent=w.kind;const desc=document.createElement('p');desc.textContent=descriptions[i];card.append(state,icon,sight,title,kind,desc);for(const [k,v] of [['MAGAZINE',`${w.mag} ROUNDS`],['DAMAGE',w.pellets>1?`${w.damage} × ${w.pellets}`:w.damage],['RELOAD',`${w.reload.toFixed(1)} SEC`]]){const row=document.createElement('div');row.className='weapon-stat';const val=document.createElement('span');val.textContent=v;row.append(document.createTextNode(k),val);card.append(row);}$('#weapon-list').append(card);});
 $('#credit-label').textContent=`${save.credits} upgrade credit${save.credits===1?'':'s'}`;makeUpgradeButtons($('#upgrade-buttons'));
}
const editor=new Editor({storage,notice,onTest:map=>launch(map,true)});
function setTab(next){tab=next;for(const name of ['campaign','arsenal','arena','editor'])$('#'+name+'-panel').hidden=next!==name;for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===next);$('#fatal').hidden=['editor','arena'].includes(next)||!!renderer;if(next==='editor')requestAnimationFrame(()=>editor.refresh());}
arenaUI=setupArena({editor,canPlay:()=>!!renderer,onEnter:client=>{game=client.view;resume();toast('ROOM '+client.code+' / TAB SCOREBOARD · Q CHRONAL FIELD');},onLeave:()=>{if(game.arena)returnMenu();},onLost:message=>{if(game.arena&&mode==='playing')pause();if(message)notice(message);},onEvent:(e,you)=>{if(e.type==='shot'&&e.player===you){sound.play('shot',e.weapon);if(game.arena)game.recoil=1;}if(e.type==='damage'&&e.player===you){hurtTimer=.25;sound.play('damage');}if(e.type==='kill'){if(e.player===you){hitTimer=.2;sound.play('kill');}toast(e.name+' → '+e.victim);}if(e.type==='capture')toast((e.team===0?'CYAN':'MAGENTA')+' CAPTURED '+e.node);}});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$('#editor-menu').onclick=()=>setTab('campaign');
function presentGame(){document.body.classList.add('playing');$('#menu').hidden=true;$('#hud').hidden=false;$('#overlay').hidden=true;}
function requestCapture(){
 if(document.pointerLockElement===canvas)return;
 try{const result=canvas.requestPointerLock();if(result?.catch)result.catch(captureFallback);}catch{captureFallback();}
}
function resume(){clearInput();sound.start();accumulator=0;mode='playing';presentGame();canvas.tabIndex=0;canvas.focus();requestCapture();}
function captureFallback(){
 if(mode!=='playing')return;mode='paused';
 showOverlay('MOUSE CAPTURE REQUIRED','LOCK YOUR AIM.','Click Retry to capture the mouse. If this embedded view blocks capture, open the game in a full window. Escape releases the mouse and pauses.',[['RETRY MOUSE CAPTURE ↗',resume,true],[game.arena?'BACK TO ROOM':'BACK TO MENU',returnMenu]]);
 $('#mouse-window').hidden=false;
}
function launch(map=CAMPAIGN[selected],custom=false){
 if(!renderer){notice('WebGL is required to play. Enable hardware acceleration or use another desktop browser. The map editor is still available.');return;}
 game=new Game(map,{level:selected,arsenalLevel:save.unlocked,upgrades:custom?{}:save.upgrades,difficulty:$('#difficulty').value,custom});resultHandled=false;hitTimer=0;hurtTimer=0;toastTimer=0;$('#game-toast').textContent='';$('#hitmarker').classList.remove('show');document.body.classList.remove('hurt','slow','aim');resume();
 toast(custom?'FORGE TEST / ESC TO RETURN':selected===0?'Q / BEND TIME · DODGE THE ORANGE ROUNDS':`SECTOR ${selected+1} / ${map.name}`);
}
$('#launch').onclick=()=>launch();
function exitPointer(){if(document.pointerLockElement===canvas)document.exitPointerLock();}
function showOverlay(kicker,title,copy,buttons){
 $('#mouse-window').hidden=true;
 clearInput();sound.stop();$('#overlay-kicker').textContent=kicker;$('#overlay-title').textContent=title;$('#overlay-copy').textContent=copy;$('#result-stats').replaceChildren();$('#result-upgrades').replaceChildren();$('#overlay-buttons').replaceChildren();$('#pause-controls').hidden=mode!=='paused';
 for(const [label,handler,primary] of buttons){const b=document.createElement('button');b.textContent=label;if(primary)b.className='primary';b.onclick=handler;$('#overlay-buttons').append(b);}
 $('#overlay').hidden=false;document.body.classList.remove('slow','aim');exitPointer();setTimeout(()=>$('#overlay-buttons button')?.focus(),30);
}
function returnMenu(){const wasArena=!!game.arena;mode='menu';clearInput();sound.stop();exitPointer();document.body.classList.remove('playing','slow','hurt','aim');$('#overlay').hidden=true;$('#hud').hidden=true;$('#menu').hidden=false;updateCampaign();setTab(wasArena?'arena':game.custom?'editor':'campaign');game=new Game(CAMPAIGN[selected],{level:selected});}
function pause(){if(mode!=='playing')return;mode='paused';if(game.arena){showOverlay('ONLINE / ROUND CONTINUES','SIGNAL HELD.','The arena remains live. Your player can still take damage.',[['RESUME ↗',resume,true],['ROOM / CHANGE CLASS',returnMenu]]);return;}showOverlay('SIGNAL HELD','TAKE A BREATH.','Your time. Your rules.',[['RESUME ↗',resume,true],['RESTART SECTOR',()=>launch(game.map,game.custom)], [game.custom?'RETURN TO FORGE':'CAMPAIGN',returnMenu]]);}
function finish(){
 if(resultHandled)return;resultHandled=true;mode=game.status;
 if(game.status==='dead'){showOverlay('CONNECTION LOST','NOT YOUR TIME.','The implant has one more trick. Rebuild the moment and try again.',[['TRY AGAIN ↗',()=>launch(game.map,game.custom),true],[game.custom?'RETURN TO FORGE':'CAMPAIGN',returnMenu]]);return;}
 if(!game.custom){completeMission(save,selected,game.score,game.time);persist();}
 const final=selected===7&&!game.custom;
 showOverlay(game.custom?'FORGE TEST COMPLETE':final?'THE CITY’S CLOCK IS YOURS':'SECTOR LIBERATED',final?'TIME BELONGS\nTO EVERYONE.':'SIGNAL SEVERED.',game.custom?'Your sector is playable from start to extraction.':final?'The Architect is down. The clocks are free. There is no invoice for tomorrow. Replay any sector, refine your build, or forge a new city.':'Security is offline. Your implant has room for an upgrade.',game.custom?[['RETURN TO FORGE',returnMenu,true],['TEST AGAIN',()=>launch(game.map,true)]]:final?[['BACK TO THE CITY',returnMenu,true],['REPLAY FINALE',()=>launch(CAMPAIGN[7])]]:[['NEXT SECTOR ↗',()=>{selected++;launch();},true],['CAMPAIGN',returnMenu]]);
 for(const [label,value] of [['SCORE',game.score],['TIME',`${Math.floor(game.time/60)}:${String(Math.floor(game.time%60)).padStart(2,'0')}`],['TIME KILLS',game.slowKills],['HEADSHOTS',game.headshots]]){const d=document.createElement('div'),b=document.createElement('b');b.textContent=value;d.append(b,document.createTextNode(label));$('#result-stats').append(d);}
 if(!game.custom)makeUpgradeButtons($('#result-upgrades'));
}
document.addEventListener('keydown',e=>{
 if(mode!=='playing'){if(e.code==='Escape'&&mode==='paused')e.preventDefault();return;}
 if(e.code==='Tab'&&game.arena){e.preventDefault();$('#arena-scoreboard').hidden=false;return;}
 if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();pause();return;}
 if(['Space','Enter','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 controls.keyDown(e.code);
});
document.addEventListener('keyup',e=>{controls.keyUp(e.code);if(e.code==='Tab')$('#arena-scoreboard').hidden=true;});
document.addEventListener('mousedown',e=>{if(mode!=='playing'||e.target!==canvas)return;if(document.pointerLockElement!==canvas){e.preventDefault();clearInput();requestCapture();return;}controls.mouseDown(e.button);controls.pointerStart(e.clientX,e.clientY);e.preventDefault();});
document.addEventListener('mouseup',e=>{controls.mouseUp(e.button);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('mousemove',e=>{if(mode!=='playing'||document.pointerLockElement!==canvas)return;controls.pointerMove(e,document.pointerLockElement===canvas);});
canvas.addEventListener('wheel',e=>{if(mode!=='playing')return;e.preventDefault();controls.cycle(e.deltaY,e.deltaMode,game.unlocked,game.weapon);},{passive:false});
document.addEventListener('pointerlockchange',()=>{const held=document.pointerLockElement===canvas;if(held)clearInput();if(captureHeld&&!held&&mode==='playing')pause();captureHeld=held;});
document.addEventListener('pointerlockerror',captureFallback);
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('#fatal').textContent='The graphics context was lost. Reload this page to reconnect. Completed campaign sectors are saved.';$('#fatal').hidden=false;});
function input(){
 return {...controls.read(),sensitivity:settings.sensitivity,invert:settings.invert};
}
function updateHud(){
 drawSight($('#sight'),game);$('#sight').hidden=!!game.arena&&!arenaUI.client?.me?.alive;
 const p=game.player,w=WEAPONS[game.weapon];$('#health-value').textContent=Math.ceil(p.health);$('#health-max').textContent='/ '+game.maxHealth;$('#health-bar').style.width=p.health/game.maxHealth*100+'%';$('#chrono-value').textContent=Math.ceil(p.energy/game.maxEnergy*100)+'%';$('#chrono-bar').style.width=p.energy/game.maxEnergy*100+'%';$('#weapon-name').textContent=w.name+' / '+w.kind.split(' / ')[0];$('#ammo-value').textContent=String(game.ammo[game.weapon]).padStart(2,'0');$('#mag-value').textContent=w.mag;$('#reload-label').textContent=game.reload>0?`RELOADING / ${game.reload.toFixed(1)}s`:'R / RELOAD · 1–5 / SWITCH';$('#dash-state').textContent=game.dashCooldown>0?`${game.dashCooldown.toFixed(1)}s`:'READY';$('#hud-sector').textContent=game.custom?'FORGE / CUSTOM SECTOR':game.map.subtitle;$('#hud-objective').textContent=game.exitReady?'REACH EXTRACTION':game.relaysRemaining?'SEVER THE RELAYS':'CLEAR REMAINING SECURITY';$('#hud-counts').textContent=`${game.remaining} HOSTILES / ${game.relaysRemaining} RELAYS / ${game.score} PTS`;$('#interact-prompt').textContent=game.hint;
 document.body.classList.toggle('slow',game.slow&&mode==='playing');document.body.classList.toggle('aim',game.ads>.5&&mode==='playing');drawMap($('#radar'),game.map,{player:p,enemies:game.enemies,terminals:game.terminals,grid:false,preview:true});
}
function updateArenaHud(){
 const c=arenaUI.client;if(!c?.snapshot)return;const s=c.snapshot,me=c.me;
 $('#hud-sector').textContent=`ARENA / ${MODES[s.mode]} / ${c.code}`;
 $('#hud-objective').textContent=s.status==='finished'?'ROUND COMPLETE':!me.alive?`RESPAWN / ${me.respawnIn.toFixed(1)}s`:s.mode==='dom'?'HOLD THE SIGNAL':s.mode==='tdm'?(me.team===0?'CYAN TEAM':'MAGENTA TEAM'):'EVERY SIGNAL IS A TARGET';
 $('#hud-counts').textContent=arenaScore(s)+` · ${Math.max(0,300-Math.floor(s.time))}s · ${c.latency}ms`;
 $('#interact-prompt').textContent=s.mode==='dom'?s.nodes.map(n=>n.label+' '+(n.contested?'CONTESTED':n.owner===null?'NEUTRAL':n.owner===0?'CYAN':'MAGENTA')+(n.progress?' '+Math.round(n.progress*100)+'%':'')).join(' / '):'';
 $('#reload-label').textContent=game.reload>0?'RELOADING':'R RELOAD / 1 SIDEARM / '+(CLASSES[me.class].weapon+1)+' PRIMARY';
 $('#time-label').textContent='CHRONAL FIELD / ALL ROUNDS 0.25×';
 $('#game-help').textContent='W/S move · A/D turn · Z/C strafe · Mouse look · RMB sights · Q field · Tab scores'+(me.class==='engineer'?' · E repair station':'')+' · Esc menu';
 if(me.class==='engineer')$('#dash-state').textContent=me.ability>0?'REPAIR '+Math.ceil(me.ability)+'s':'E REPAIR READY';
}
function eventEffects(){for(const e of game.events.splice(0)){renderer.effect(e);if(e.type!=='damage'||hurtTimer<=0)sound.play(e.type,e.weapon);if(e.type==='damage')hurtTimer=.3;if(e.type==='hit')hitTimer=.13;if(e.type==='kill')toast(game.slow?'TIME FRACTURE / +150':'SECURITY REMOVED / +100');if(e.type==='relay')toast('RELAY SEVERED / CHRONAL RESERVE RESTORED');if(e.type==='pickup')toast('IMPLANT REPLENISHED');}}
function frame(ms){
 requestAnimationFrame(frame);const dt=Math.min(.08,(ms-(last||ms))/1000);last=ms;time+=dt;
 if(mode==='playing'){
  accumulator=Math.min(accumulator+dt,.10);let n=0;
  while(accumulator>=STEP&&n++<12&&mode==='playing'){
   if(game.arena)arenaUI.client.step(STEP,input());else game.step(STEP,input());accumulator-=STEP;
  }
  if(!game.arena){eventEffects();if(game.status!=='playing')finish();}if(mode==='playing')sound.music(game.slow);
 }else accumulator=0;
 hitTimer=Math.max(0,hitTimer-dt);hurtTimer=Math.max(0,hurtTimer-dt);toastTimer=Math.max(0,toastTimer-dt);$('#hitmarker').classList.toggle('show',hitTimer>0);document.body.classList.toggle('hurt',hurtTimer>0);if(toastTimer===0)$('#game-toast').textContent='';
 if(mode!=='menu'){updateHud();if(game.arena)updateArenaHud();else{$('#time-label').innerHTML='CHRONAL SHIFT <b>0.20×</b>';$('#game-help').textContent='W/S move · A/D turn · Z/C strafe · Mouse look · RMB sights · Q bullet time · E interact · Esc pause';}}
 if(tab!=='editor'||mode!=='menu')renderer.render(game,{menu:mode==='menu',time,dt:mode==='playing'?dt:0,quality:settings.low?0:1,reduced:settings.reduced});
}
updateCampaign();game=new Game(CAMPAIGN[selected],{level:selected});
try{renderer=new Renderer(canvas);requestAnimationFrame(frame);}catch(err){$('#fatal').textContent=err.message+' The map editor remains available.';$('#fatal').hidden=false;$('#launch').disabled=true;}
