// DOM-independent input state, shared by the browser adapter and regression tests.
export class Controls {
 constructor(){this.keys=new Set();this.edges=new Set();this.clear();}
 clear(){this.keys.clear();this.edges.clear();this.fire=false;this.aim=false;this.fireEdge=false;this.weapon=null;this.wheel=0;this.mouseX=0;this.mouseY=0;this.dragPoint=null;}
 pointerStart(x,y){this.dragPoint={x,y};}
 pointerMove({movementX=0,movementY=0,clientX,clientY},locked){
  let x=movementX,y=movementY;if(!locked){if(!this.dragPoint){this.pointerStart(clientX,clientY);return;}x=clientX-this.dragPoint.x;y=clientY-this.dragPoint.y;this.pointerStart(clientX,clientY);}
  // Locked deltas are relative, including coalesced/high-DPI swipes. A magnitude
  // cutoff drops legitimate turns. Capture transitions clear pending input.
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  this.mouseX+=x;this.mouseY+=y;
 }
 keyDown(code){if(this.keys.has(code))return;this.keys.add(code);this.edges.add(code);if(/^Digit[1-5]$/.test(code))this.weapon=Number(code.slice(-1))-1;}
 keyUp(code){this.keys.delete(code);}
 mouseDown(button){if(button===0){if(!this.fire)this.fireEdge=true;this.fire=true;}if(button===2)this.aim=true;}
 mouseUp(button){if(button===0)this.fire=false;if(button===2)this.aim=false;}
 cycle(delta,deltaMode,unlocked,current){
  if(!Number.isFinite(delta)||delta===0||!unlocked.length)return;
  const pixels=delta*(deltaMode===1?16:deltaMode===2?800:1);
  if(Math.sign(pixels)!==Math.sign(this.wheel))this.wheel=0;
  this.wheel+=pixels;if(Math.abs(this.wheel)<30)return;
  const from=unlocked.includes(this.weapon)?this.weapon:current,i=unlocked.indexOf(from);
  this.weapon=unlocked[(i+(this.wheel>0?1:-1)+unlocked.length)%unlocked.length];this.wheel=0;
 }
 readLook(){const look={mouseX:this.mouseX,mouseY:this.mouseY};this.mouseX=0;this.mouseY=0;return look;}
 read({strafe=false}={}){
  const k=this.keys,e=this.edges,axis=(positive,negative)=>Number(positive.some(c=>k.has(c)))-Number(negative.some(c=>k.has(c)));
  const input={...this.readLook(),x:axis(strafe?['KeyC','KeyD']:['KeyC'],strafe?['KeyZ','KeyA']:['KeyZ']),z:axis(['KeyW'],['KeyS']),turn:axis(strafe?['ArrowRight']:['KeyD','ArrowRight'],strafe?['ArrowLeft']:['KeyA','ArrowLeft']),look:axis(['ArrowUp'],['ArrowDown']),fire:this.fire||k.has('Enter'),firePressed:this.fireEdge||e.has('Enter'),aim:this.aim,timePressed:e.has('KeyQ'),use:e.has('KeyE'),jump:e.has('Space'),dash:e.has('KeyF'),reload:e.has('KeyR'),sprint:k.has('ShiftLeft')||k.has('ShiftRight'),weapon:this.weapon};
  e.clear();this.mouseX=0;this.mouseY=0;this.fireEdge=false;this.weapon=null;return input;
 }
}
