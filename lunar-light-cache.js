import * as THREE from './three.module.js';

// Directional terrain visibility is a function of world position and the two
// celestial directions, not of the camera. Keep the original 21-step ray test
// in a small, world-anchored cache. Outside it the original shader still runs.
export const heightGLSL=`
uniform sampler2D heightMap;
float cornerHeight(vec2 grid){vec2 c=texture2D(heightMap,(grid+.5)/1025.).rg;return dot(c,vec2(65280.,255.))/65535.*256.-128.;}
float triangleHeight(vec2 p){vec2 g=(p+2048.)/4.,i=floor(g),f=fract(g);float b=cornerHeight(i+vec2(1.,0.)),c=cornerHeight(i+vec2(0.,1.));if(f.x+f.y<=1.){float a=cornerHeight(i);return a+(b-a)*f.x+(c-a)*f.y;}float d=cornerHeight(i+vec2(1.));return d+(c-d)*(1.-f.x)+(b-d)*(1.-f.y);}
float terrainShadow(vec3 p,vec3 light){if(light.y<-.02)return 0.;float visible=1.,dist=2.;for(int i=0;i<21;i++){vec3 q=p+light*dist;if(max(abs(q.x),abs(q.z))>2046.)break;float gap=q.y-triangleHeight(q.xz);visible=min(visible,smoothstep(-.28,.32+dist*.003,gap));if(visible<.015)break;dist=dist*1.37+1.8;}return visible;}
`;
export const cacheGLSL=`uniform sampler2D terrainLightCache;uniform vec2 lightCacheOrigin;uniform float lightCacheReady;
float cachedTerrainShadow(vec3 p,vec3 light,float channel){
 vec2 uv=(p.xz-lightCacheOrigin)/256.;
 if(lightCacheReady>.5&&min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y))>.015){vec2 s=texture2D(terrainLightCache,uv).rg;return mix(s.r,s.g,channel);}
 return terrainShadow(p,light);
}`;
export class LunarLightCache{
 constructor(height){
  this.target=new THREE.WebGLRenderTarget(512,512,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
  this.target.texture.generateMipmaps=false;this.origin=new THREE.Vector2();this.lastSun=new THREE.Vector3(99,99,99);this.lastEarth=new THREE.Vector3();this.lastCenter=new THREE.Vector2(9999,9999);this.bakes=0;
  this.u={heightMap:{value:height},origin:{value:this.origin},sun:{value:new THREE.Vector3()},earth:{value:new THREE.Vector3()}};
  const mat=new THREE.ShaderMaterial({uniforms:this.u,depthTest:false,depthWrite:false,toneMapped:false,vertexShader:'varying vec2 uvCache;void main(){uvCache=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`precision highp float;varying vec2 uvCache;uniform vec2 origin;uniform vec3 sun,earth;${heightGLSL}
   void main(){vec2 xz=origin+uvCache*256.;vec3 n=normalize(vec3(triangleHeight(xz-vec2(2.,0.))-triangleHeight(xz+vec2(2.,0.)),4.,triangleHeight(xz-vec2(0.,2.))-triangleHeight(xz+vec2(0.,2.))));vec3 p=vec3(xz.x,triangleHeight(xz),xz.y)+n*.24;gl_FragColor=vec4(terrainShadow(p,sun),terrainShadow(p,earth),0.,1.);}`});
  this.scene=new THREE.Scene();this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat));this.camera=new THREE.Camera();this.viewport=new THREE.Vector4();this.scissor=new THREE.Vector4();
  this.uniforms={terrainLightCache:{value:this.target.texture},lightCacheOrigin:{value:this.origin},lightCacheReady:{value:0}};
 }
 update(renderer,position,sun,earth){
  const x=Math.floor(position.x/16)*16,z=Math.floor(position.z/16)*16;
  if(x===this.lastCenter.x&&z===this.lastCenter.y&&sun.distanceToSquared(this.lastSun)<.000008&&earth.distanceToSquared(this.lastEarth)<.000008)return;
  const target=renderer.getRenderTarget(),scissorTest=renderer.getScissorTest(),auto=renderer.autoClear;
  renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);
  this.origin.set(x-128,z-128);this.u.sun.value.copy(sun);this.u.earth.value.copy(earth);
  try{renderer.setRenderTarget(this.target);renderer.setScissorTest(false);renderer.autoClear=true;renderer.render(this.scene,this.camera);this.uniforms.lightCacheReady.value=1;this.lastCenter.set(x,z);this.lastSun.copy(sun);this.lastEarth.copy(earth);this.bakes++;}
  finally{renderer.setRenderTarget(target);renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);renderer.autoClear=auto;}
 }
 invalidate(){this.lastCenter.set(9999,9999);this.uniforms.lightCacheReady.value=0;}
}
