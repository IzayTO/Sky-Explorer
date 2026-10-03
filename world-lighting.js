import * as THREE from './three.module.js';
export const worldLightGLSL=`
uniform vec4 baseLights[4],baseColors[4];uniform int baseLightCount,baseBlockCount;uniform vec3 baseBlockMin[16],baseBlockMax[16];
float baseVisibility(vec3 p,vec3 dir,float limit){
 for(int i=0;i<16;i++){if(i>=baseBlockCount)break;vec3 safe=sign(dir)*max(abs(dir),vec3(.00001));safe+=vec3(lessThan(abs(safe),vec3(.000001)))*.00001;vec3 a=(baseBlockMin[i]-p)/safe,b=(baseBlockMax[i]-p)/safe;vec3 lo=min(a,b),hi=max(a,b);float enter=max(max(lo.x,lo.y),lo.z),leave=min(min(hi.x,hi.y),hi.z);if(leave>max(enter,.025)&&enter<limit&&enter>.018)return .035;}
 return 1.;
}
vec3 baseLighting(vec3 p,vec3 n){vec3 light=vec3(0.);for(int i=0;i<4;i++){if(i>=baseLightCount)break;vec3 d=baseLights[i].xyz-p;float len=length(d),fall=max(0.,1.-len/baseLights[i].w);if(fall>.001)light+=baseColors[i].rgb*baseColors[i].a*fall*fall*(.18+.82*max(dot(n,d/max(len,.001)),0.))*baseVisibility(p+n*.03,d/max(len,.001),len-.08);}return light;}
`;
export function worldUniforms(){return {baseLights:{value:Array.from({length:4},()=>new THREE.Vector4())},baseColors:{value:Array.from({length:4},()=>new THREE.Vector4())},baseLightCount:{value:0},baseBlockCount:{value:0},baseBlockMin:{value:Array.from({length:16},()=>new THREE.Vector3())},baseBlockMax:{value:Array.from({length:16},()=>new THREE.Vector3())}};}
export const LAMP_TEMPERATURES=[{label:'Cálida · 2700 K',color:0xffc38c},{label:'Neutra · 4000 K',color:0xffe6cc},{label:'Fría · 6500 K',color:0xd4e6ff}];
export class WorldLighting{
 constructor(){this.u=worldUniforms();this.last=-99;this.c=new THREE.Color();}
 attach(uniforms){Object.assign(uniforms,this.u);}
 update(world,eye,time){if(time-this.last<.12&&!world.lightingDirty)return;this.last=time;world.lightingDirty=false;
  const nearest=world.entities.filter(e=>e.item.category==='Iluminación'&&e.params.on!==false&&e.anchor.distanceToSquared(eye)<256).sort((a,b)=>a.anchor.distanceToSquared(eye)-b.anchor.distanceToSquared(eye)).slice(0,4);
  this.u.baseLightCount.value=nearest.length;nearest.forEach((e,i)=>{this.c.set(LAMP_TEMPERATURES[e.params.temperature||0].color);this.u.baseLights.value[i].set(e.anchor.x,e.anchor.y,e.anchor.z,12);this.u.baseColors.value[i].set(this.c.r,this.c.g,this.c.b,2.8);});
  const solids=world.entities.filter(e=>e.item.structural&&e.position.distanceToSquared(eye)<32*32).sort((a,b)=>a.position.distanceToSquared(eye)-b.position.distanceToSquared(eye));let count=0;
  for(const e of solids){for(const b of e.boxes){if(count===16)break;this.u.baseBlockMin.value[count].copy(b.min);this.u.baseBlockMax.value[count].copy(b.max);count++;}if(count===16)break;}this.u.baseBlockCount.value=count;
 }
 exposure(camera){if(!this.u.baseLightCount.value)return 0;camera.getWorldDirection(WorldLighting.dir);let result=0;for(let i=0;i<this.u.baseLightCount.value;i++){const p=this.u.baseLights.value[i];WorldLighting.delta.set(p.x,p.y,p.z).sub(camera.position);const d=WorldLighting.delta.length();result=Math.max(result,Math.max(0,1-d/14)*Math.max(.1,WorldLighting.dir.dot(WorldLighting.delta.normalize()))*.45);}return result;}
}
WorldLighting.dir=new THREE.Vector3();WorldLighting.delta=new THREE.Vector3();
