import {Mesh} from './mesh.js';
import {perspective,view,multiply,seededRandom,mix,smooth} from './math.js';
import {PALETTES,TILE} from './maps.js';
import {viewFov} from './aim.js';
import {WEAPONS} from './game.js';
const VS=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;
uniform mat4 uVP;varying vec3 vWorld;varying vec3 vNormal;varying vec3 vColor;
void main(){vWorld=aPosition;vNormal=aNormal;vColor=aColor;gl_Position=uVP*vec4(aPosition,1.0);}`;
const FS=`precision mediump float;
varying vec3 vWorld;varying vec3 vNormal;varying vec3 vColor;
uniform vec3 uEye;uniform vec3 uSky;uniform vec3 uAccent;uniform float uTime;uniform float uFog;uniform float uSlow;
void main(){
 vec3 n=normalize(vNormal);float lit=.48+max(0.,dot(n,normalize(vec3(-.35,.8,.3))))*.62;
 float emissive=step(1.01,max(vColor.r,max(vColor.g,vColor.b)));
 vec3 color=vColor*mix(lit,1.,emissive);
 if(n.y>.9&&vWorld.y<.12&&uFog>0.){
  vec2 tile=abs(fract((vWorld.xz+1.5)/3.)-.5);float seam=step(.49,max(tile.x,tile.y));
  color*=1.-seam*.55;
  float wet=.5+.5*sin(vWorld.x*.63+sin(vWorld.z*.8))*sin(vWorld.z*.37);
  vec3 ray=normalize(uEye-vWorld);float sheen=pow(1.-abs(ray.y),4.);
  float stripe=pow(.5+.5*sin(vWorld.x*.43),14.);
  color+=uAccent*sheen*stripe*.32*wet;
  color+=vec3(.02,.08,.10)*sheen;
 }
 float depth=length(vWorld-uEye);float fog=1.-exp(-depth*depth*.000085*uFog);
 color=mix(color,uSky,min(.97,fog));
 color=mix(color,color*vec3(.72,1.04,1.18)+vec3(0.,.013,.02),uSlow*.6);
 gl_FragColor=vec4(color,1.);
}`;
const GLYPHS={A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01110'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],'0':['01110','10001','10011','10101','11001','10001','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110']};
function lettering(mesh,text,x,y,z,size,color){
 for(let k=0;k<text.length;k++){const g=GLYPHS[text[k]];if(!g)continue;for(let j=0;j<7;j++)for(let i=0;i<5;i++)if(g[j][i]==='1')mesh.box(x+(k*6+i)*size,y-j*size,z,size*.88,size*.88,.06,color);}
}
function compile(gl,type,text){const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
export class Renderer{
 constructor(canvas){
  this.canvas=canvas;const gl=canvas.getContext('webgl2',{alpha:false,antialias:true})||canvas.getContext('webgl',{alpha:false,antialias:true});if(!gl)throw Error('WebGL is unavailable. Enable hardware acceleration in your browser and reload.');this.gl=gl;
  const p=gl.createProgram(),vs=compile(gl,gl.VERTEX_SHADER,VS),fs=compile(gl,gl.FRAGMENT_SHADER,FS);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.deleteShader(vs);gl.deleteShader(fs);this.program=p;gl.useProgram(p);
  this.attrs=['aPosition','aNormal','aColor'].map(n=>gl.getAttribLocation(p,n));this.u=Object.fromEntries(['VP','Eye','Sky','Accent','Time','Fog','Slow'].map(n=>[n,gl.getUniformLocation(p,'u'+n)]));
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);this.staticMesh=new Mesh();this.dynamic=new Mesh();this.gun=new Mesh();this.particles=[];this.map=null;
 }
 draw(mesh,staticUsage=false){const gl=this.gl;if(!mesh.length)return;mesh.buffer??=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);if(!staticUsage||!mesh.uploaded){gl.bufferData(gl.ARRAY_BUFFER,mesh.data.subarray(0,mesh.length),staticUsage?gl.STATIC_DRAW:gl.DYNAMIC_DRAW);mesh.uploaded=true;}for(let i=0;i<3;i++){gl.enableVertexAttribArray(this.attrs[i]);gl.vertexAttribPointer(this.attrs[i],3,gl.FLOAT,false,36,i*12);}gl.drawArrays(gl.TRIANGLES,0,mesh.length/9);}
 setMap(game){
  this.map=game.map;this.palette=PALETTES[this.map.palette];this.particles=[];const m=this.staticMesh.clear();m.uploaded=false;
  const accent=this.palette.accent,glow=accent.map(c=>c*1.7),wall=this.palette.wall,w=game.world.width,h=game.world.height,rng=seededRandom(48+game.level);
  m.box(w/2,-.15,h/2,w+180,.3,h+180,[.065,.084,.10]);
  for(const b of game.world.solids){
   const boundary=b.x===0||b.z===0||b.x===(this.map.tiles[0].length-1)*3||b.z===(this.map.tiles.length-1)*3;
   const c=b.t===2?[.16,.20,.23]:b.t===3?[.075,.12,.18]:wall;
   m.box(b.x,b.h/2,b.z,3,b.h,3,c);
   if(b.t===2){m.box(b.x,1.35,b.z,2.85,.045,2.85,[.35,.42,.42]);m.box(b.x,.8,b.z+1.51,2,.12,.025,glow);m.box(b.x,.3,b.z+1.52,2.5,.04,.02,[.055,.06,.065]);}
   else{
    m.box(b.x,b.h-.1,b.z,3.02,.07,3.02,glow);
    if(!boundary){m.box(b.x,.4,b.z,3.015,.09,3.015,[.06,.08,.10]);m.box(b.x,2.6,b.z,3.01,.05,3.01,[.30,.34,.36]);}
    if(b.t===3){for(let j=0;j<5;j++)m.box(b.x,1+j*.6,b.z+1.51,2.5,.12,.025,[.25,1.3,1.6]);}
   }
  }
  this.map.tiles.forEach((r,z)=>r.forEach((t,x)=>{if(t===4){m.box(x*3,.04,z*3,2.9,.05,2.9,[1.5,.22,.04]);for(let i=0;i<3;i++)m.box(x*3-1+i,.08,z*3,.08,.04,2.9,[.12,.09,.07]);}}));
  // Distant original city silhouettes, generated once; all remain outside the boundary.
  for(let side=0;side<4;side++)for(let i=0;i<13;i++){
   let x,z;if(side===0){x=-35+i*12;z=-18-rng()*25;}else if(side===1){x=-26-rng()*20;z=-20+i*10;}else if(side===2){x=w+12+rng()*22;z=-20+i*10;}else{x=-35+i*12;z=h+24+rng()*18;}
   const height=15+rng()*62,bw=6+rng()*9,bd=6+rng()*8;
   m.box(x,height/2,z,bw,height,bd,[.06+rng()*.04,.085+rng()*.03,.13+rng()*.04]);
   m.box(x,height+.12,z,bw+.2,.12,bd+.2,i%3===0?glow:[.13,.3,.4]);
   for(let j=3;j<height-2;j+=2.4)for(let k=-bw/2+1;k<bw/2-1;k+=1.5)if(rng()>.25){const col=rng()>.65?[.55,.34,.17]:[.09,.30,.39];m.box(x+k,j,z+bd/2+.03,.48,.70,.05,col);m.box(x+bw/2+.03,j,z+k,.05,.70,.48,col);}
   if(side===0&&i%3===0){m.box(x,height*.7,z+bd/2+.2,bw*.9,4,.25,[.035,.04,.06]);lettering(m,['ZERO','KAIRO','NEON','2089'][i%4],x-bw*.4,height*.7+1.3,z+bd/2+.37,.26,i%2?glow:[.1,1.4,1.8]);}
  }
  // Rail lights and suspended infrastructure establish the scale of each sector.
  for(let z=6;z<h-4;z+=12){m.box(1.7,2.4,z,.09,4.8,.09,[.23,.27,.3]);m.box(2.4,4.8,z,1.5,.1,.15,glow);m.box(w-4.7,2.4,z,.09,4.8,.09,[.23,.27,.3]);m.box(w-5.4,4.8,z,1.5,.1,.15,glow);}
  for(let i=0;i<5;i++){const z=5+i*12;m.line([-4,9+i%2,z],[w+2,11,z+4],.025,[.10,.14,.17]);}
  m.box(w/2,15,-4,w*.7,.6,1.1,[.08,.12,.15]);
  lettering(m,['DEAD CHANNEL','FREIGHT GHOST','LAST TRAIN','MEMORY LEAK','HOT METAL','FALSE EDEN','HOSTILE','ZERO HOUR'][game.level]||'CUSTOM',9,14,-3.4,.42,glow);
 }
 effect(e){
  if(!['kill','hit','explosion'].includes(e.type))return;
  const count=e.type==='kill'?24:e.type==='explosion'?32:7,color=e.type==='hit'?[1.5,.8,.2]:e.type==='explosion'?[.6,1.6,.2]:[.13,1.4,1.6];
  for(let i=0;i<count;i++){if(this.particles.length>350)break;this.particles.push({x:e.x,y:e.y,z:e.z,vx:(Math.random()-.5)*8,vy:Math.random()*6,vz:(Math.random()-.5)*8,life:.45+Math.random()*.65,color});}
 }
 robot(mesh,b){
  const scale=b.type==='architect'?2.1:b.type==='heavy'?1.18:1,s=Math.sin(b.yaw),c=Math.cos(b.yaw),orange=b.color|| (b.type==='runner'?[.8,.27,1.5]:b.type==='architect'?[1.7,.18,.07]:[1.6,.38,.10]),body=b.flash>0?[1.7,1.7,1.7]:b.type==='heavy'?[.31,.27,.25]:[.17,.22,.28],metal=[.06,.085,.12];
  const box=(x,y,z,w,h,d,color)=>mesh.box(b.x+(x*c+z*s)*scale,(b.y||0)+y*scale,b.z+(-x*s+z*c)*scale,w*scale,h*scale,d*scale,color,b.yaw);
  const gait=Math.sin(b.phase*10)*.12;
  box(-.23,.42,gait,.28,.84,.34,metal);box(.23,.42,-gait,.28,.84,.34,metal);
  box(0,1.15,0,.86,.78,.6,body);box(0,1.42,-.32,.65,.15,.04,orange);
  box(-.58,1.2,0,.26,.74,.36,body);box(.58,1.2,-.15,.26,.74,.36,body);
  box(0,1.66,0,.36,.36,.36,metal);box(0,1.97,0,.56,.48,.56,body);box(0,2.01,-.29,.48,.11,.04,orange);box(0,2.23,0,.64,.08,.62,metal);
  box(.58,1.1,-.60,.17,.19,.75,metal);box(.58,1.1,-.96,.13,.12,.02,orange);
  box(0,1.1,-.32,.22,.24,.04,[.3,.5,.6]);
  if(b.type==='architect'){box(-.75,1.9,0,.5,.5,.75,metal);box(.75,1.9,0,.5,.5,.75,metal);box(0,2.45,0,.2,.4,.2,orange);}
  if(b.charge>0){mesh.box(b.x,2.65*scale,b.z,b.charge/.65*1.3,.055,.08,orange);}
 }
 weapon(game,reduced){
  const mesh=this.gun.clear(),id=game.weapon,w=WEAPONS[id],ads=smooth(game.ads),walk=game.moving&&!reduced?Math.sin(game.time*12)*.012:0,reload=game.reload>0?Math.sin(game.reload/w.reload*Math.PI):0;
  const x=mix(.24,0,ads),y=mix(-.28,-.24,ads)-walk*(1-ads)-reload*.35,z=-.58+game.recoil*.09,metal=[.14,.18,.23],edge=[.32,.37,.4],dark=[.045,.065,.09],glow=w.color.map(n=>n*1.7);
  const box=(a,b,c,d,e,f,col)=>mesh.box(x+a,y+b,z+c,d,e,f,col),tube=(a,b,c,r,l,col)=>mesh.cylinder(x+a,y+b,z+c,r,l,col);
  const length=id===0?.36:id===3?.85:.58;
  box(0,0,0,.16,.13,length,metal);box(0,.075,.04,.145,.045,length*.9,edge);box(0,-.13,.10,.1,.24,.15,dark);box(0,-.14,-.12,.09,id===1?.28:.18,.12,metal);
  box(0,-.02,.32,.13,.14,id===0?.1:.42,dark);tube(0,.015,-length/2-.13,id===2?.052:.03,.29,dark);
  if(id===2)tube(.09,.015,-length/2-.13,.038,.29,metal);
  if(id===3){tube(0,.16,-.02,.055,.31,dark);tube(0,.16,.14,.06,.012,[.1,1.3,1.5]);box(0,.12,-.02,.06,.08,.16,metal);}
  else {box(0,.13,.12,.10,.11,.025,dark);box(0,.17,.10,.065,.022,.02,glow);box(-.05,.16,.12,.015,.09,.04,edge);box(.05,.16,.12,.015,.09,.04,edge);}
  for(let i=0;i<4;i++)box(.084,0,-length*.4+i*.07,.012,.06,.028,glow);
  if(id===4){for(let i=0;i<3;i++)tube(0,.015,-.23-i*.10,.065,.04,glow);}
  box(.06,-.16,.14,.13,.12,.14,[.08,.12,.15]);box(.14,-.28,.32,.18,.2,.36,[.13,.19,.22]);
  if(id!==0){box(-.07,-.10,-.19,.12,.11,.15,[.08,.12,.15]);box(-.16,-.25,-.07,.14,.17,.29,[.13,.19,.22]);}
  if(game.recoil>.77&&!reduced){box(0,.015,-length/2-.38,.12,.12,.2,[2,1.3,.4]);}
  return mesh;
 }
 render(game,{menu=false,time=0,dt=0,quality=1,reduced=false}={}){
  const gl=this.gl,c=this.canvas,dpr=Math.min(devicePixelRatio||1,quality?1.6:1),width=Math.max(1,Math.round(c.clientWidth*dpr)),height=Math.max(1,Math.round(c.clientHeight*dpr));
  if(c.width!==width||c.height!==height){c.width=width;c.height=height;gl.viewport(0,0,width,height);}
  if(this.map!==game.map)this.setMap(game);
  const p=game.player,bob=0,eye=menu?[36+Math.sin(time*.08)*3,9,68]:[p.x,p.y+1.67+bob,p.z],yaw=menu?-.12+Math.sin(time*.04)*.1:p.yaw,pitch=menu?-.03:p.pitch,fov=menu?67:viewFov(game.weapon,game.ads);
  const sky=this.palette.sky;gl.useProgram(this.program);gl.clearColor(...sky,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(this.u.VP,false,multiply(perspective(fov*Math.PI/180,width/height,.05,260),view(eye,yaw,pitch)));gl.uniform3fv(this.u.Eye,eye);gl.uniform3fv(this.u.Sky,sky);gl.uniform3fv(this.u.Accent,this.palette.accent);gl.uniform1f(this.u.Time,time);gl.uniform1f(this.u.Fog,1);gl.uniform1f(this.u.Slow,game.slow?1:0);this.draw(this.staticMesh,true);
  const mesh=this.dynamic.clear();for(const b of game.enemies)if(b.alive)this.robot(mesh,b);
  for(const t of game.terminals){const col=t.active?[.12,.3,.3]:[.10,1.4,1.7];mesh.box(t.x,.65,t.z,.8,1.3,.8,[.10,.15,.19]);mesh.box(t.x,1.4,t.z,.85,.45,.12,col);mesh.box(t.x,2.1+Math.sin(time*3)*.12,t.z,.16,.16,.16,col,time);}
  if(!game.arena){const ex=game.exit,col=game.exitReady?[.7,1.7,.2]:[.20,.32,.38];mesh.box(ex.x,1.8,ex.z-1,.16,3.6,.16,col);mesh.box(ex.x-1.2,1.8,ex.z-1,.16,3.6,.16,col);mesh.box(ex.x-.6,3.6,ex.z-1,1.4,.16,.16,col);mesh.box(ex.x,.025,ex.z,2.5,.035,2.5,col);}
  for(const item of game.pickups)if(!item.taken){const col=item.type==='health'?[.2,1.4,.5]:[.25,.8,1.7];mesh.box(item.x,.55+Math.sin(time*2)*.08,item.z,.45,.45,.45,col,time*.7);mesh.box(item.x,.015,item.z,1.1,.02,1.1,[.05,.15,.18]);}
  if(game.arena){
   for(const n of game.nodes||[]){const c=n.owner===0?[.1,1.5,1.8]:n.owner===1?[1.8,.35,.55]:[1.6,1.6,1.2];mesh.box(n.x,.03,n.z,7.6,.06,7.6,[.12,.16,.2]);for(const d of [-3.8,3.8]){mesh.box(n.x+d,.08,n.z,.06,.08,7.6,c);mesh.box(n.x,.08,n.z+d,7.6,.08,.06,c);}mesh.box(n.x,1.6,n.z,.13,3.2,.13,c);mesh.box(n.x,3.3,n.z,.6,.6,.6,c,time);}
   for(const station of game.stations||[]){mesh.box(station.x,.35,station.z,.8,.7,.8,[.1,1.6,.7]);mesh.box(station.x,.8,station.z,.15,.35,.15,[1.4,1.8,1.6]);}
   for(const p of game.arenaPlayers||[])if(p.alive&&p.field>0){for(let k=0;k<24;k++){const a=k*Math.PI/12,b=(k+1)*Math.PI/12;mesh.line([p.x+Math.sin(a)*9,.12,p.z+Math.cos(a)*9],[p.x+Math.sin(b)*9,.12,p.z+Math.cos(b)*9],.05,[.2,1.4,1.7]);}}
  }
  for(const b of game.projectiles){const col=b.enemy?[1.8,.3,.09]:[.4,1.8,.15];mesh.box(b.x,b.y,b.z,b.enemy?.12:.22,b.enemy?.12:.22,b.enemy?.12:.22,col);mesh.line([b.x,b.y,b.z],[b.x-b.d[0]*1.1,b.y-b.d[1]*1.1,b.z-b.d[2]*1.1],.025,col);}
  for(const t of game.tracers)mesh.line(t.a,t.b,.009,t.color.map(n=>n*1.8));
  for(const v of this.particles){const delta=dt*game.timeScale;v.life-=delta;v.x+=v.vx*delta;v.y+=v.vy*delta;v.z+=v.vz*delta;v.vy-=12*delta;const s=.035+v.life*.05;mesh.box(v.x,Math.max(.04,v.y),v.z,s,s,s,v.color);}
  this.particles=this.particles.filter(p=>p.life>0);this.draw(mesh);
  if(!menu&&!(game.weapon===3&&game.ads>.8)){gl.clear(gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(this.u.VP,false,perspective(65*Math.PI/180,width/height));gl.uniform3fv(this.u.Eye,[0,0,0]);gl.uniform1f(this.u.Fog,0);this.draw(this.weapon(game,reduced));}
 }
}
