import * as THREE from './three.module.js';
// Continuous flat ground, with nearby instanced grass. The shader shades distant
// detail analytically: no tiling photograph, loaded model, shadow atlas or edge.
const common=`
uniform float daylight,twilight,moonlight,clockTime;uniform vec3 sunDirection,eye;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec3 illumination(vec3 base,float occlusion){
  float sunUp=smoothstep(-.08,.3,sunDirection.y);
  vec3 warmth=mix(vec3(1.),vec3(1.14,.76,.53),twilight*.7);
  vec3 lit=base*warmth*(.18+.82*daylight)*occlusion;
  vec3 nightTint=vec3(.019,.027,.027)*(0.62+base.g*2.);
  lit=mix(nightTint,lit,daylight);
  lit+=base*vec3(.19,.23,.31)*moonlight*.47;
  return lit;
}
vec3 groundHaze(vec3 c,vec3 pos){float d=length(pos.xz-eye.xz);float haze=1.-exp(-d*.0019);float toward=dot(normalize(pos.xz-eye.xz),normalize(sunDirection.xz+vec2(.0001)))*.5+.5;
  vec3 fog=mix(vec3(.031,.041,.053),vec3(.57,.67,.64),daylight);
  fog=mix(fog,vec3(.76,.43,.26),twilight*pow(toward,4.)*.72);
  return mix(c,fog,haze*.92);
}`;
export class Terrain{
  constructor(scene,mobile){
    this.u={daylight:{value:1},twilight:{value:0},moonlight:{value:0},clockTime:{value:0},sunDirection:{value:new THREE.Vector3()},eye:{value:new THREE.Vector3()},grassOrigin:{value:new THREE.Vector2()},grassExtent:{value:55}};
    const geometry=new THREE.PlaneGeometry(16000,16000,1,1);geometry.rotateX(-Math.PI/2);
    const mat=new THREE.ShaderMaterial({uniforms:this.u,toneMapped:false,extensions:{derivatives:true},vertexShader:`varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
    fragmentShader:`varying vec3 vWorld;${common}
    void main(){vec2 p=vWorld.xz;float broad=noise(p*.032);float mottled=noise(p*.29);float fine=noise(p*7.1);float micro=noise(p*69.);float distance=length(p-eye.xz);
      float close=1.-smoothstep(10.,90.,distance);
      vec3 low=vec3(.23,.35,.13),high=vec3(.37,.47,.22);
      vec3 base=mix(low,high,broad*.65+mottled*.35);
      base*=.79+fine*.33*close+micro*.18*close;
      float earth=noise(p*.7)*noise(p*.12);base=mix(base,vec3(.28,.24,.14),smoothstep(.51,.81,earth)*.27);
      vec3 col=illumination(base,.92);col=groundHaze(col,vWorld);
      float grain=(hash(gl_FragCoord.xy)-.5)/255.;gl_FragColor=vec4(col+grain,1.);
    }`});
    this.ground=new THREE.Mesh(geometry,mat);scene.add(this.ground);
    this.createGrass(scene,mobile?32000:48000);
  }
  createGrass(scene,count){
    let seed=74219;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const geo=new THREE.InstancedBufferGeometry();
    // Each blade has a broad base and a tapered, bending tip (three triangles).
    geo.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,-.24,.57,0,.24,.57,0,0,1,0],3));geo.setIndex([0,1,2,1,3,2,2,3,4]);
    const offsets=[],shapes=[];
    for(let i=0;i<count;i++){offsets.push(rand()*36-18,rand()*36-18);shapes.push(.018+rand()*.037,.16+Math.pow(rand(),1.4)*.32,rand()*Math.PI*2,rand());}
    geo.setAttribute('offset',new THREE.InstancedBufferAttribute(new Float32Array(offsets),2));geo.setAttribute('shape',new THREE.InstancedBufferAttribute(new Float32Array(shapes),4));geo.instanceCount=count;
    const mat=new THREE.ShaderMaterial({uniforms:this.u,side:THREE.DoubleSide,toneMapped:false,vertexShader:`
      attribute vec2 offset;attribute vec4 shape;uniform vec2 grassOrigin;uniform vec3 eye;uniform float clockTime;varying vec3 vWorld;varying float vHeight,vSeed;
      void main(){vec2 origin=floor(eye.xz/4.)*4.;vec2 xz=mod(offset-origin+18.,36.)-18.+origin;
        float distance=length(xz-eye.xz);float fade=1.-smoothstep(12.,18.,distance);
        vec3 p=position;float h=p.y;float sway=sin(clockTime*.75+xz.x*.13+xz.y*.21)*.045+sin(clockTime*1.8+xz.y*.39)*.012;
        p.x*=shape.x;p.y*=shape.y*fade;p.z=(h*h)*(.06+sway)*fade;
        float c=cos(shape.z),s=sin(shape.z);p.xz=mat2(c,-s,s,c)*p.xz;
        p.x+=xz.x;p.z+=xz.y;vWorld=p;vHeight=h;vSeed=shape.w;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
      }`,fragmentShader:`varying vec3 vWorld;varying float vHeight,vSeed;${common}
      void main(){vec3 base=mix(vec3(.23,.34,.09),vec3(.33,.46,.17),vSeed);
        base=mix(base,vec3(.44,.42,.20),pow(vSeed,10.)*.7);
        vec3 col=illumination(base,.63+.37*vHeight);
        float backLight=max(0.,dot(normalize(vWorld-eye),sunDirection));col+=base*twilight*pow(backLight,5.)*vHeight*.17;
        gl_FragColor=vec4(groundHaze(col,vWorld),1.);
      }`});
    this.grass=new THREE.Mesh(geo,mat);this.grass.frustumCulled=false;scene.add(this.grass);this.maxBlades=count;
  }
  update(camera,sky,t){this.u.eye.value.copy(camera.position);this.u.sunDirection.value.copy(sky.sun);this.u.daylight.value=sky.day;this.u.twilight.value=sky.twilight;this.u.moonlight.value=sky.moonlight;this.u.clockTime.value=t;}
}
