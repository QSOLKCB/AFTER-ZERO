import {Renderer} from "../../public/src/renderer.js";
import {Mesh} from "../../public/src/mesh.js";
export function instrumentRenderer(Type=Renderer){
 const r=Object.create(Type.prototype),calls={allocations:0,uploads:0,values:0,draws:0},buffers=new Map();let bound=null;
 const gl={ARRAY_BUFFER:1,STATIC_DRAW:2,DYNAMIC_DRAW:3,FLOAT:4,TRIANGLES:5,
  createBuffer:()=>({}),bindBuffer:(_target,buffer)=>{bound=buffer;},
  bufferData:(_target,data)=>{if(gl.fail)throw Error('upload failed');buffers.set(bound,data.slice());calls.allocations++;calls.uploads++;calls.values+=data.length;},
  bufferSubData:(_target,_offset,data)=>{if(gl.fail)throw Error('upload failed');buffers.get(bound).set(data);calls.uploads++;calls.values+=data.length;},
  enableVertexAttribArray(){},vertexAttribPointer(){},deleteBuffer:b=>buffers.delete(b),deleteProgram(){},
  drawArrays:(_mode,_first,count)=>{calls.draws++;r.drawn=buffers.get(bound).subarray(0,count*9);}
 };
 Object.assign(r,{gl,attrs:[0,1,2],gun:new Mesh(),staticMesh:new Mesh(),dynamic:new Mesh(),calls,buffers});return r;
}
