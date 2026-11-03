// Original screen-space optics. The centre is the same ray used by combat.
export function drawSight(canvas,{weapon=0,ads=0,reload=0,recoil=0,preview=false}={}){
 const ctx=canvas.getContext('2d');
 if(!preview){const dpr=Math.min(globalThis.devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}}
 const w=canvas.width,h=canvas.height,dpr=preview?1:Math.min(globalThis.devicePixelRatio||1,2),x=w/2,y=h/2;
 ctx.clearRect(0,0,w,h);if(reload>0&&!preview)return;
 ctx.save();ctx.translate(x,y);ctx.scale(dpr,dpr);ctx.lineWidth=1.3;ctx.strokeStyle='#bfffea';ctx.fillStyle='#bfffea';ctx.shadowColor='#07171e';ctx.shadowBlur=3;
 const line=(a,b,c,d)=>{ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.stroke();};
 const circle=r=>{ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();};
 if(ads>.8&&weapon===3){
  const r=preview?42:Math.min(w,h)/dpr*.38;
  if(!preview){ctx.fillStyle='#04090de8';ctx.beginPath();ctx.rect(-x/dpr,-y/dpr,w/dpr,h/dpr);ctx.arc(0,0,r,0,Math.PI*2,true);ctx.fill('evenodd');ctx.fillStyle='#bfffea';}
  ctx.strokeStyle='#78c9c9';circle(r);circle(r-4);ctx.lineWidth=.85;
  line(-r+10,0,-5,0);line(5,0,r-10,0);line(0,-r+10,0,-5);line(0,5,0,r-10);
  for(let n=1;n<=3;n++){const o=r*n/5;line(-3,o,3,o);line(-3,-o,3,-o);line(o,-3,o,3);line(-o,-3,-o,3);}
  if(!preview){ctx.font='10px monospace';ctx.fillText('NULL / 3×',-r*.64,-r*.65);ctx.fillText('PRECISION LINK',r*.16,r*.65);}
 }else if(ads>.8){
  if(weapon===2){circle(15);line(-22,0,-17,0);line(17,0,22,0);line(0,17,0,22);}
  else if(weapon===4){ctx.beginPath();ctx.moveTo(0,-16);ctx.lineTo(12,7);ctx.lineTo(-12,7);ctx.closePath();ctx.stroke();}
  else if(weapon===1){circle(10);line(-17,0,-13,0);line(13,0,17,0);}
  else{line(-13,5,-5,5);line(5,5,13,5);line(-13,5,-13,-3);line(13,5,13,-3);}
 }else{
  const gap=(weapon===2?13:7)+recoil*8;
  line(-gap-6,0,-gap,0);line(gap,0,gap+6,0);line(0,-gap-6,0,-gap);line(0,gap,0,gap+6);
 }
 ctx.shadowBlur=2;ctx.fillStyle='#ff674b';ctx.beginPath();ctx.arc(0,0,1.6,0,Math.PI*2);ctx.fill();ctx.restore();
}
