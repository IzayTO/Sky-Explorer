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
uniform float lampMode,vehicleHeading;
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
// A compact chassis volume casts a stable ground shadow. Terrain occlusion
// remains the existing height-field ray query; no large shadow-map pass.
float vehicleOcclusion(vec3 p,vec3 light){
  if(vehicleSize.x<.01||light.y<=0.)return 1.;
  float c=cos(vehicleHeading),s=sin(vehicleHeading);
  vec3 o=p-vehicleCenter; o.xz=mat2(c,-s,s,c)*o.xz;
  vec3 d=light;d.xz=mat2(c,-s,s,c)*d.xz;
  vec3 inv=sign(d+vec3(.000001))/max(abs(d),vec3(.00001));
  vec3 a=(-vehicleSize-o)*inv,b=(vehicleSize-o)*inv;
  vec3 lo=min(a,b),hi=max(a,b);
  float enter=max(max(lo.x,lo.y),lo.z),leave=min(min(hi.x,hi.y),hi.z);
  return leave>max(enter,.06)?.06:1.;
}`;
export function vehicleLightUniforms(){return {
  lampLeft:{value:new THREE.Vector3()},lampRight:{value:new THREE.Vector3()},lampDirection:{value:new THREE.Vector3(0,0,-1)},lampMode:{value:0},
  vehicleCenter:{value:new THREE.Vector3()},vehicleSize:{value:new THREE.Vector3()},vehicleHeading:{value:0}
};}
export function updateVehicleLightUniforms(u,lighting){
  u.lampMode.value=lighting?.level||0;
  if(!lighting){u.vehicleSize.value.set(0,0,0);return;}
  u.lampLeft.value.copy(lighting.left);u.lampRight.value.copy(lighting.right);u.lampDirection.value.copy(lighting.direction);
  u.vehicleCenter.value.copy(lighting.center);u.vehicleSize.value.copy(lighting.size);u.vehicleHeading.value=lighting.heading;
}
