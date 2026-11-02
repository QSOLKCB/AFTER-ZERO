// Cube batching adapted from QSOLKCB/QUICKSCOPER at 7c406e2545d82ee6bdc5fda5f198eb22fa183a84. Apache-2.0.
const CUBE=[];
for(const [normal,corners] of [
 [[0,1,0],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],
 [[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],
 [[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],
 [[0,0,-1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]],
 [[1,0,0],[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]],
 [[-1,0,0],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]]
])for(const i of [0,1,2,0,2,3])CUBE.push(...corners[i],...normal);
export class Mesh {
  constructor(capacity=32768){this.data=new Float32Array(capacity);this.length=0;}
  clear(){this.length=0;return this;}
  reserve(count){if(this.length+count<=this.data.length)return;let size=this.data.length;while(size<this.length+count)size*=2;const next=new Float32Array(size);next.set(this.data);this.data=next;}
  vertex(p,n,c){this.reserve(9);const d=this.data;let i=this.length;d[i++]=p[0];d[i++]=p[1];d[i++]=p[2];d[i++]=n[0];d[i++]=n[1];d[i++]=n[2];d[i++]=c[0];d[i++]=c[1];d[i++]=c[2];this.length=i;}
  quad(a,b,c,d,n,color){this.vertex(a,n,color);this.vertex(b,n,color);this.vertex(c,n,color);this.vertex(a,n,color);this.vertex(c,n,color);this.vertex(d,n,color);}
  box(x,y,z,w,h,depth,color,angle=0){
    this.reserve(324);const sn=Math.sin(angle),cs=Math.cos(angle),data=this.data;let j=this.length;
    for(let i=0;i<CUBE.length;i+=6){
      const a=CUBE[i]*w/2,b=CUBE[i+1]*h/2,c=CUBE[i+2]*depth/2,nx=CUBE[i+3],ny=CUBE[i+4],nz=CUBE[i+5];
      data[j++]=x+a*cs+c*sn;data[j++]=y+b;data[j++]=z-a*sn+c*cs;
      data[j++]=nx*cs+nz*sn;data[j++]=ny;data[j++]=-nx*sn+nz*cs;
      data[j++]=color[0];data[j++]=color[1];data[j++]=color[2];
    }
    this.length=j;
  }
  cylinder(x,y,z,r,length,color,segments=12){
    // Along Z; used for the barrel, optic housing and muzzle.
    for(let i=0;i<segments;i++) {
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      const pa=[x+Math.cos(a)*r,y+Math.sin(a)*r],pb=[x+Math.cos(b)*r,y+Math.sin(b)*r];
      this.quad([...pa,z-length/2],[...pb,z-length/2],[...pb,z+length/2],[...pa,z+length/2],[Math.cos((a+b)/2),Math.sin((a+b)/2),0],color);
      for(const [end,n] of [[z-length/2,-1],[z+length/2,1]]) {
        for(const p of [[x,y,end],[...pa,end],[...pb,end]])this.vertex(p,[0,0,n],color);
      }
    }
  }
  line(a,b,width,color){
    // Camera-independent crossed ribbons for short-lived bullet tracers.
    for(const offset of [[width,0,0],[0,width,0]]) {
      const p=(v,s)=>v.map((n,i)=>n+offset[i]*s);
      this.quad(p(a,-1),p(b,-1),p(b,1),p(a,1),[0,1,0],color);
    }
  }
}
