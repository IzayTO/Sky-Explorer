import * as THREE from './three.module.js';
import {orientedBox,rayBox} from './spatial.js?v=3.2';
// One persistent, spatially indexed occluder set for the whole base. Camera
// distance never removes a wall. A ray skips complete BVH branches on a miss.
export const worldLightGLSL=`
uniform vec4 baseLights[4],baseColors[4];uniform int baseLightCount,baseNodeCount;
uniform sampler2D baseTree;uniform vec2 baseTreeSize;
vec4 baseNode(float index,float component){float pixel=index*6.+component;return texture2D(baseTree,(vec2(mod(pixel,baseTreeSize.x),floor(pixel/baseTreeSize.x))+.5)/baseTreeSize);}
bool baseSlab(vec3 p,vec3 inverseDir,vec3 lo,vec3 hi,float limit){vec3 a=(lo-p)*inverseDir,b=(hi-p)*inverseDir;vec3 n=min(a,b),f=max(a,b);float enter=max(max(n.x,n.y),n.z),leave=min(min(f.x,f.y),f.z);return leave>max(enter,.004)&&enter<limit;}
vec3 baseInverse(vec3 d){return 1./(mix(vec3(-1.),vec3(1.),step(vec3(0.),d))*max(abs(d),vec3(.000001)));}
float baseVisibility(vec3 p,vec3 dir,float limit){
 if(baseNodeCount==0||limit<=.008)return 1.;vec3 inv=baseInverse(dir);float index=0.;
 for(int visit=0;visit<1024;visit++){
  if(index>=float(baseNodeCount))return 1.;vec4 lo=baseNode(index,0.),hi=baseNode(index,1.);
  if(!baseSlab(p,inv,lo.xyz,hi.xyz,limit)){index=lo.w;continue;}
  if(hi.w<.5){index+=1.;continue;}
  vec4 center=baseNode(index,2.),x=baseNode(index,3.),y=baseNode(index,4.);vec3 z=baseNode(index,5.).xyz,delta=p-center.xyz;
  vec3 localP=vec3(dot(delta,x.xyz),dot(delta,y.xyz),dot(delta,z)),localD=vec3(dot(dir,x.xyz),dot(dir,y.xyz),dot(dir,z)),halfSize=vec3(center.w,x.w,y.w);
  if(baseSlab(localP,baseInverse(localD),-halfSize,halfSize,limit))return 0.;index=lo.w;
 }
 // Conservative termination for unusually dense bases: never let light leak
 // through omitted casters. Normal rays visit only a few spatial branches.
 return 0.;
}
float basePointVisibility(vec3 p,vec3 normal,vec3 emitter){vec3 delta=emitter-p;float len=length(delta);return baseVisibility(p+normal*.012,delta/max(len,.001),len-.055);}
vec3 baseLighting(vec3 p,vec3 n){vec3 light=vec3(0.);for(int i=0;i<4;i++){if(i>=baseLightCount)break;vec3 d=baseLights[i].xyz-p;float len=length(d),fall=max(0.,1.-len/baseLights[i].w);if(fall>.001)light+=baseColors[i].rgb*baseColors[i].a*fall*fall*(.18+.82*max(dot(n,d/max(len,.001)),0.))*baseVisibility(p+n*.012,d/max(len,.001),len-.10);}return light;}
`;
let emptyTree;
export function worldUniforms(){if(!emptyTree){emptyTree=new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType);emptyTree.needsUpdate=true;}return {baseLights:{value:Array.from({length:4},()=>new THREE.Vector4())},baseColors:{value:Array.from({length:4},()=>new THREE.Vector4())},baseLightCount:{value:0},baseNodeCount:{value:0},baseTree:{value:emptyTree},baseTreeSize:{value:new THREE.Vector2(1,1)}};}
export const LAMP_TEMPERATURES=[{label:'Cálida · 2700 K',color:0xffc38c},{label:'Neutra · 4000 K',color:0xffe6cc},{label:'Fría · 6500 K',color:0xd4e6ff}];
function boundsHit(origin,dir,b,limit){let near=0,far=limit;for(const axis of ['x','y','z']){if(Math.abs(dir[axis])<1e-8){if(origin[axis]<b.min[axis]||origin[axis]>b.max[axis])return false;continue;}const a=(b.min[axis]-origin[axis])/dir[axis],c=(b.max[axis]-origin[axis])/dir[axis];near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));if(near>far)return false;}return far>.004;}
export class WorldLighting{
 constructor(){this.u=worldUniforms();this.last=-99;this.revision=-1;this.nodes=[];this.c=new THREE.Color();this.dir=new THREE.Vector3();this.delta=new THREE.Vector3();this.selected=new Set();}
 attach(uniforms){Object.assign(uniforms,this.u);}
 rebuild(world){
  const boxes=[];for(const e of world.entities){for(const part of e.mesh.geometry.userData.shadowParts||[]){const matrix=new THREE.Matrix4().multiplyMatrices(e.mesh.matrixWorld,part.matrix),box=orientedBox(part.box,matrix);const emitterInside=e.item.category==='Iluminación'&&box.axes.every((a,i)=>Math.abs(e.anchor.clone().sub(box.center).dot(a))<=box.half.getComponent(i)+.005);if(box.half.lengthSq()>.0001&&!emitterInside)boxes.push(box);}}
  this.nodes=[];const build=list=>{const index=this.nodes.length,bounds=new THREE.Box3();for(const b of list)bounds.union(b.bounds);const node={bounds,skip:0,box:list.length===1?list[0]:null};this.nodes.push(node);if(list.length>1){const span=bounds.getSize(new THREE.Vector3()),axis=span.x>span.y?(span.x>span.z?'x':'z'):(span.y>span.z?'y':'z');list.sort((a,b)=>a.center[axis]-b.center[axis]);const half=Math.floor(list.length/2);build(list.slice(0,half));build(list.slice(half));}node.skip=this.nodes.length;return index;};if(boxes.length)build(boxes);
  const width=256,height=Math.max(1,Math.ceil(this.nodes.length*6/width)),data=new Float32Array(width*height*4);
  const write=(index,slot,vector,w)=>{const offset=(index*6+slot)*4;data.set([vector.x,vector.y,vector.z,w],offset);};
  this.nodes.forEach((node,index)=>{write(index,0,node.bounds.min,node.skip);write(index,1,node.bounds.max,node.box?1:0);if(node.box){const b=node.box;write(index,2,b.center,b.half.x);write(index,3,b.axes[0],b.half.y);write(index,4,b.axes[1],b.half.z);write(index,5,b.axes[2],0);}});
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;this.texture?.dispose();this.texture=texture;this.u.baseTree.value=texture;this.u.baseTreeSize.value.set(width,height);this.u.baseNodeCount.value=this.nodes.length;this.revision=world.revision;
 }
 blocked(origin,dir,limit=2000){let index=0;while(index<this.nodes.length){const n=this.nodes[index];if(!boundsHit(origin,dir,n.bounds,limit)){index=n.skip;continue;}if(n.box&&rayBox(origin,dir,n.box,limit)!==null)return true;index++;}return false;}
 update(world,eye,time){if(this.revision!==world.revision)this.rebuild(world);if(time-this.last<.12&&!world.lightingDirty)return;this.last=time;world.lightingDirty=false;
  const nearest=world.entities.filter(e=>e.item.category==='Iluminación'&&e.params.on!==false).sort((a,b)=>a.anchor.distanceToSquared(eye)*(this.selected.has(a.uid)?.8:1)-b.anchor.distanceToSquared(eye)*(this.selected.has(b.uid)?.8:1)).slice(0,4);this.selected=new Set(nearest.map(e=>e.uid));
  this.u.baseLightCount.value=nearest.length;nearest.forEach((e,i)=>{this.c.set(LAMP_TEMPERATURES[e.params.temperature||0].color);this.u.baseLights.value[i].set(e.anchor.x,e.anchor.y,e.anchor.z,12);this.u.baseColors.value[i].set(this.c.r,this.c.g,this.c.b,2.8);});
 }
 exposure(camera){if(!this.u.baseLightCount.value)return 0;camera.getWorldDirection(this.dir);let result=0;for(let i=0;i<this.u.baseLightCount.value;i++){const p=this.u.baseLights.value[i];this.delta.set(p.x,p.y,p.z).sub(camera.position);const d=this.delta.length();this.delta.normalize();if(d<14&&!this.blocked(camera.position,this.delta,d-.10))result=Math.max(result,Math.max(0,1-d/14)*Math.max(.1,this.dir.dot(this.delta))*.45);}return result;}
}
