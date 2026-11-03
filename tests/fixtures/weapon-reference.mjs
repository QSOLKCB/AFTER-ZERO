// Frozen v0.4.3 weapon builder: independent geometry parity reference.
import {Mesh} from "../../public/src/mesh.js";
import {WEAPONS} from "../../public/src/game.js";
import {mix,smooth} from "../../public/src/math.js";
export function referenceWeapon(game,reduced){
  const mesh=new Mesh(),id=game.weapon,w=WEAPONS[id],ads=smooth(game.ads),walk=game.moving&&!reduced?Math.sin(game.time*12)*.012:0,reload=game.reload>0?Math.sin(game.reload/w.reload*Math.PI):0;
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
