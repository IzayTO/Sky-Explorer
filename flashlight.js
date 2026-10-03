import * as THREE from './three.module.js';
// Shared optical profile: the same broad, soft two-ring light in both worlds.
// The surface shader supplies its own normals and terrain occlusion.
export const flashlightGLSL=`
float flashlightBeam(vec3 fromLamp,vec3 direction){
  float len=length(fromLamp);
  float aim=dot(fromLamp/max(len,.001),direction);
  if(aim<=0.||len>=100.)return 0.;
  float radial=sqrt(max(0.,1.-aim*aim))/max(aim,.001)/1.08;
  float central=1.-smoothstep(.49,.75,radial);
  float ring=exp(-pow((radial-.82)/.055,2.))*.16;
  float spill=(1.-smoothstep(.79,1.03,radial))*.15;
  return (central+ring+spill)*smoothstep(0.,.08,aim)
    *(1.-smoothstep(75.,100.,len))*2.8/(1.+len*len/170.);
}`;

// The headlamps are mounted on the chassis, independently of the camera.
// mode interpolates between off (0), dipped (1) and main beam (2).
export const vehicleLightGLSL=`
uniform vec3 lampLeft,lampRight,lampDirection,vehicleCenter,vehicleSize;
uniform float lampMode,vehicleHeading,reverseLight;
uniform vec3 rearLamp,rearDirection;
uniform mat4 vehicleInverse;
uniform vec4 wheelShape,wheelOffsets;
float headlightBeam(vec3 delta){
  if(lampMode<.001)return 0.;
  float len=length(delta),aim=dot(delta/max(len,.001),lampDirection);
  if(aim<=0.)return 0.;
  float high=clamp(lampMode-1.,0.,1.),range=mix(65.,125.,high);
  float radial=sqrt(max(0.,1.-aim*aim))/max(aim,.001);
  float cone=1.-smoothstep(mix(.32,.20,high),mix(.68,.40,high),radial);
  float spill=(1.-smoothstep(.55,.83,radial))*.11;
  return (cone+spill)*(1.-smoothstep(range*.72,range,len))
    *mix(3.3,5.8,high)/(1.+len*len/mix(200.,580.,high))*min(lampMode,1.);
}
float rearBeam(vec3 p){
  if(reverseLight<.001)return 0.;
  vec3 delta=p-rearLamp;float len=length(delta);
  if(len>13.)return 0.;
  float aim=dot(delta/max(len,.001),rearDirection);
  return smoothstep(.30,.83,aim)*(1.-smoothstep(8.,13.,len))*reverseLight*2.4/(1.+len*len*.28);
}
float boxHit(vec3 o,vec3 inv,vec3 center,vec3 size){
  vec3 a=(center-size-o)*inv,b=(center+size-o)*inv;
  vec3 lo=min(a,b),hi=max(a,b);
  return step(max(max(max(lo.x,lo.y),lo.z),.002),min(min(hi.x,hi.y),hi.z));
}
float wheelHit(vec3 o,vec3 d,vec3 center){
  vec3 radii=vec3(wheelShape.w,wheelShape.z,wheelShape.z);
  vec3 q=(o-center)/radii,v=d/radii;
  float a=dot(v,v),b=dot(q,v),c=dot(q,q)-1.,h=b*b-a*c;
  return h>=0.&&(-b+sqrt(max(0.,h)))/a>.002?1.:0.;
}
// Physical local-space chassis + four contact volumes. The ray starts at the
// surface, not the raised terrain-shadow sample: that bias detached long shadows.
float vehicleOcclusion(vec3 p,vec3 light){
  if(vehicleSize.x<.01||light.y<=0.)return 1.;
  vec3 relative=vehicleCenter-p;float along=max(0.,dot(relative,light));
  if(dot(relative-light*along,relative-light*along)>9.)return 1.;
  vec3 o=(vehicleInverse*vec4(p,1.)).xyz,d=mat3(vehicleInverse)*light;
  vec3 inv=sign(d+vec3(.000001))/max(abs(d),vec3(.000001));
  float hit=boxHit(o,inv,vec3(0.,.20,0.),vec3(vehicleSize.x,.19,vehicleSize.z));
  hit=max(hit,boxHit(o,inv,vec3(0.,.73,.20),vec3(vehicleSize.x*.82,.41,.38)));
  hit=max(hit,wheelHit(o,d,vec3(-wheelShape.x,wheelOffsets.x,-wheelShape.y)));
  hit=max(hit,wheelHit(o,d,vec3(-wheelShape.x,wheelOffsets.y,wheelShape.y)));
  hit=max(hit,wheelHit(o,d,vec3(wheelShape.x,wheelOffsets.z,-wheelShape.y)));
  hit=max(hit,wheelHit(o,d,vec3(wheelShape.x,wheelOffsets.w,wheelShape.y)));
  return mix(1.,.06,hit);
}`;
export function vehicleLightUniforms(){return {
  lampLeft:{value:new THREE.Vector3()},lampRight:{value:new THREE.Vector3()},lampDirection:{value:new THREE.Vector3(0,0,-1)},lampMode:{value:0},
  vehicleCenter:{value:new THREE.Vector3()},vehicleSize:{value:new THREE.Vector3()},vehicleHeading:{value:0},vehicleInverse:{value:new THREE.Matrix4()},wheelShape:{value:new THREE.Vector4()},wheelOffsets:{value:new THREE.Vector4()},
  rearLamp:{value:new THREE.Vector3()},rearDirection:{value:new THREE.Vector3(0,0,1)},reverseLight:{value:0}
};}
export function updateVehicleLightUniforms(u,lighting){
  u.lampMode.value=lighting?.level||0;u.reverseLight.value=lighting?.reverse||0;
  if(!lighting){u.vehicleSize.value.set(0,0,0);return;}
  u.lampLeft.value.copy(lighting.left);u.lampRight.value.copy(lighting.right);u.lampDirection.value.copy(lighting.direction);
  u.vehicleCenter.value.copy(lighting.center);u.vehicleSize.value.copy(lighting.size);u.vehicleHeading.value=lighting.heading;u.vehicleInverse.value.copy(lighting.inverse);u.wheelShape.value.copy(lighting.wheelShape);u.wheelOffsets.value.copy(lighting.wheelOffsets);u.rearLamp.value.copy(lighting.rear);u.rearDirection.value.copy(lighting.rearDirection);
}
