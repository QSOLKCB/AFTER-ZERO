// Acquisition is asynchronous: success means the document actually owns the
// lock, never merely that the request promise resolved. A cancelled late grant
// must not restart gameplay or trap the cursor over a menu.
export class PointerCapture {
 constructor(canvas,{document=globalThis.document,onAcquire=()=>{},onRelease=()=>{},onError=()=>{}}={}){
  Object.assign(this,{canvas,document,onAcquire,onRelease,onError,pending:false,held:false,serial:0,promised:false});
  document.addEventListener('pointerlockchange',()=>{
   const held=document.pointerLockElement===canvas,wasHeld=this.held;this.held=held;
   if(held&&this.pending){this.pending=false;this.onAcquire();}
   else if(held&&!wasHeld)this.document.exitPointerLock();
   else if(!held&&wasHeld)this.onRelease();
  });
  document.addEventListener('pointerlockerror',()=>{if(this.pending&&!this.promised)this.fail(this.serial);});
 }
 fail(serial){if(serial!==this.serial||!this.pending)return;this.pending=false;this.onError();}
 request(){
  const serial=++this.serial;this.pending=true;this.promised=false;
  if(this.document.pointerLockElement===this.canvas){this.held=true;this.pending=false;this.onAcquire();return;}
  const request=raw=>{
   if(serial!==this.serial||!this.pending)return;
   try{
    const result=raw?this.canvas.requestPointerLock({unadjustedMovement:true}):this.canvas.requestPointerLock();
    this.promised=!!result?.then;
    if(this.promised)result.catch(error=>{
     if(serial!==this.serial||!this.pending)return;
     if(raw&&error?.name==='NotSupportedError')request(false);else this.fail(serial);
    });
   }catch(error){if(raw&&error?.name==='NotSupportedError')request(false);else this.fail(serial);}
  };
  request(true);
 }
 release(){this.pending=false;this.promised=false;this.serial++;if(this.document.pointerLockElement===this.canvas)this.document.exitPointerLock();}
}
