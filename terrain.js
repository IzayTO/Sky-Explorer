import * as THREE from './three.module.js';
import {flashlightGLSL,vehicleLightGLSL,vehicleLightUniforms,updateVehicleLightUniforms} from './flashlight.js?v=2.3';
// Continuous flat ground, with nearby instanced grass. The shader shades distant
// detail analytically: no tiling photograph, loaded model, shadow atlas or edge.
const common=`
uniform float daylight,twilight,moonlight,clockTime,torch;uniform vec3 sunDirection,eye,forward;
${flashlightGLSL}${vehicleLightGLSL}
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
vec3 torchLight(vec3 lit,vec3 base,vec3 pos,float occlusion){
  lit*=mix(1.,vehicleOcclusion(pos+vec3(0.,.004,0.),sunDirection),daylight*.82);
  float beam=0.;
  if(torch>.001)beam=flashlightBeam(pos-eye,forward)*torch*(.12+.88*max(normalize(eye-pos).y,0.));
  if(lampMode>.001){beam+=headlightBeam(pos-lampLeft)*(.13+.87*max(normalize(lampLeft-pos).y,0.));beam+=headlightBeam(pos-lampRight)*(.13+.87*max(normalize(lampRight-pos).y,0.));}
  return sqrt(lit*lit+base*(vec3(.92,.96,1.)*beam+vec3(1.,.009,.002)*rearBeam(pos))*occlusion*.48);
}
vec3 groundHaze(vec3 c,vec3 pos){float d=length(pos.xz-eye.xz);float haze=1.-exp(-d*.0019);float toward=dot(normalize(pos.xz-eye.xz),normalize(sunDirection.xz+vec2(.0001)))*.5+.5;
  vec3 fog=mix(vec3(.031,.041,.053),vec3(.57,.67,.64),daylight);
  fog=mix(fog,vec3(.76,.43,.26),twilight*pow(toward,4.)*.72);
  return mix(c,fog,haze*.92);
}`;
export class Terrain{
  constructor(scene,mobile){
    this.torchLevel=0;this.lastTime=0;
    this.u={...vehicleLightUniforms(),daylight:{value:1},twilight:{value:0},moonlight:{value:0},clockTime:{value:0},torch:{value:0},forward:{value:new THREE.Vector3()},sunDirection:{value:new THREE.Vector3()},eye:{value:new THREE.Vector3()},grassOrigin:{value:new THREE.Vector2()},grassExtent:{value:55}};
    const geometry=new THREE.PlaneGeometry(16000,16000,1,1);geometry.rotateX(-Math.PI/2);
    const mat=new THREE.ShaderMaterial({uniforms:this.u,toneMapped:false,extensions:{derivatives:true},vertexShader:`varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
    fragmentShader:`varying vec3 vWorld;${common}
    void main(){vec2 p=vWorld.xz;float broad=noise(p*.032);float mottled=noise(p*.29);float fine=noise(p*7.1);float micro=noise(p*69.);float distance=length(p-eye.xz);
      float close=1.-smoothstep(10.,90.,distance);
      vec3 low=vec3(.23,.35,.13),high=vec3(.37,.47,.22);
      vec3 base=mix(low,high,broad*.65+mottled*.35);
      base*=.79+fine*.33*close+micro*.18*close;
      float earth=noise(p*.7)*noise(p*.12);base=mix(base,vec3(.28,.24,.14),smoothstep(.51,.81,earth)*.27);
      vec3 col=illumination(base,.92);col=torchLight(col,base,vWorld,.92);col=groundHaze(col,vWorld);
      float grain=(hash(gl_FragCoord.xy)-.5)/255.;gl_FragColor=vec4(col+grain,1.);
    }`});
    this.ground=new THREE.Mesh(geometry,mat);scene.add(this.ground);
    this.createHills(scene);
    this.createGrass(scene,mobile?32000:48000);
  }
  createHills(scene){
    // Two low, static ridges well beyond the walkable area. 3,072 triangles in
    // total; no model downloads, height-map textures or per-frame mesh work.
    this.hills=[];
    for(let layer=0;layer<2;layer++){
      const vertices=[],indices=[],segments=256,rows=4;
      const radii=layer?[4350,5700,6850,7750]:[1850,2950,3900,4650];
      const profile=[0,1,.38,0];
      for(let row=0;row<rows;row++)for(let i=0;i<=segments;i++){
        const a=i/segments*Math.PI*2,offset=layer*1.73;
        const broad=.5+.5*Math.sin(a*3.+offset+.75*Math.sin(a*2.));
        const shoulder=.5+.5*Math.sin(a*7.-offset+.5*Math.sin(a*4.));
        const folds=Math.sin(a*13.+offset)*.5+Math.sin(a*19.-offset)*.24;
        const height=(layer?76:25)+Math.pow(broad,1.65)*(layer?110:86)+shoulder*22+folds*7;
        const radius=radii[row]+Math.sin(a*5.+offset)*95*(row===0?0:1);
        vertices.push(Math.sin(a)*radius,Math.max(0,height)*profile[row]-.25,Math.cos(a)*radius);
        if(row<rows-1&&i<segments){const k=row*(segments+1)+i,n=k+segments+1;indices.push(k,n,k+1,k+1,n,n+1);}
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      const material=new THREE.ShaderMaterial({uniforms:{...this.u,ridgeLayer:{value:layer}},side:THREE.DoubleSide,toneMapped:false,
        vertexShader:`varying vec3 vWorld,vNormal;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;vNormal=normal;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
        fragmentShader:`varying vec3 vWorld,vNormal;uniform float ridgeLayer;${common}
          void main(){vec3 n=normalize(vNormal);float slope=.65+.35*max(0.,dot(n,sunDirection));float patch=noise(vWorld.xz*.006);
            vec3 base=mix(vec3(.19,.27,.16),vec3(.28,.34,.22),patch);
            vec3 lit=illumination(base,slope);lit=mix(lit,vec3(.008,.012,.015)+base*moonlight*.09,1.-daylight);
            float toward=dot(normalize(vWorld.xz-eye.xz),normalize(sunDirection.xz+vec2(.0001)))*.5+.5;
            vec3 haze=mix(vec3(.045,.057,.076),vec3(.57,.67,.67),daylight);
            haze=mix(haze,vec3(.72,.44,.30),twilight*pow(toward,4.)*.68);
            float distance=length(vWorld.xz-eye.xz);float air=(.34+ridgeLayer*.15+smoothstep(1700.,7200.,distance)*.12)*(.45+.55*daylight);
            vec3 color=mix(lit,haze,air);gl_FragColor=vec4(color,1.);
          }`});
      const ridge=new THREE.Mesh(geometry,material);ridge.name='hills-'+layer;scene.add(ridge);this.hills.push(ridge);
    }
  }
  createGrass(scene,count){
    let seed=74219;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    // Preserve every blade and its 36 m periodic world position. Partition the
    // same instances into 6 m cells; 49 reusable placements cover the full 18 m
    // visibility radius even while crossing cell boundaries at boost speed.
    const cells=Array.from({length:36},()=>({offsets:[],shapes:[]}));
    for(let i=0;i<count;i++){
      const x=rand()*36-18,z=rand()*36-18,cx=Math.floor((x+18)/6),cz=Math.floor((z+18)/6),cell=cells[cz*6+cx];
      cell.offsets.push(x-(-18+cx*6),z-(-18+cz*6));cell.shapes.push(.018+rand()*.037,.16+Math.pow(rand(),1.4)*.32,rand()*Math.PI*2,rand());
    }
    this.grassCells=cells.map(cell=>{
      const geo=new THREE.InstancedBufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,-.24,.57,0,.24,.57,0,0,1,0],3));geo.setIndex([0,1,2,1,3,2,2,3,4]);
      geo.setAttribute('offset',new THREE.InstancedBufferAttribute(new Float32Array(cell.offsets),2));geo.setAttribute('shape',new THREE.InstancedBufferAttribute(new Float32Array(cell.shapes),4));geo.instanceCount=cell.shapes.length/4;
      geo.boundingBox=new THREE.Box3(new THREE.Vector3(-.15,-.03,-.15),new THREE.Vector3(6.15,.60,6.15));geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(3,.28,3),4.48);return geo;
    });
    const mat=new THREE.ShaderMaterial({uniforms:this.u,side:THREE.DoubleSide,toneMapped:false,vertexShader:`
      attribute vec2 offset;attribute vec4 shape;uniform vec2 grassOrigin;uniform vec3 eye;uniform float clockTime;varying vec3 vWorld;varying float vHeight,vSeed;
      void main(){vec2 xz=(modelMatrix*vec4(offset.x,0.,offset.y,1.)).xz;
        float distance=length(xz-eye.xz);float fade=1.-smoothstep(12.,18.,distance);
        vec3 p=position;float h=p.y;float sway=sin(clockTime*.75+xz.x*.13+xz.y*.21)*.045+sin(clockTime*1.8+xz.y*.39)*.012;
        p.x*=shape.x;p.y*=shape.y*fade;p.z=(h*h)*(.06+sway)*fade;
        float c=cos(shape.z),s=sin(shape.z);p.xz=mat2(c,-s,s,c)*p.xz;
        p.x+=xz.x;p.z+=xz.y;vWorld=p;vHeight=h;vSeed=shape.w;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
      }`,fragmentShader:`varying vec3 vWorld;varying float vHeight,vSeed;${common}
      void main(){vec3 base=mix(vec3(.23,.34,.09),vec3(.33,.46,.17),vSeed);
        base=mix(base,vec3(.44,.42,.20),pow(vSeed,10.)*.7);
        vec3 col=illumination(base,.63+.37*vHeight);
        col=torchLight(col,base,vWorld,.42+.58*vHeight);
        float backLight=max(0.,dot(normalize(vWorld-eye),sunDirection));col+=base*twilight*pow(backLight,5.)*vHeight*.17;
        gl_FragColor=vec4(groundHaze(col,vWorld),1.);
      }`});
    this.grass=new THREE.Group();this.grass.name='Césped por sectores';scene.add(this.grass);this.grassTiles=[];
    for(let i=0;i<49;i++){const mesh=new THREE.Mesh(this.grassCells[0],mat);mesh.frustumCulled=false;this.grass.add(mesh);this.grassTiles.push(mesh);}
    this.maxBlades=count;this.visibleBlades=0;this.grassFrustum=new THREE.Frustum();this.grassProjection=new THREE.Matrix4();this.grassBox=new THREE.Box3();
  }
  cullGrass(camera){
    this.grassProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.grassFrustum.setFromProjectionMatrix(this.grassProjection);
    const cx=Math.floor(camera.position.x/6),cz=Math.floor(camera.position.z/6);let i=0;this.visibleBlades=0;
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
      const tx=cx+dx,tz=cz+dz,x=tx*6,z=tz*6,mesh=this.grassTiles[i++];
      mesh.geometry=this.grassCells[((tz+3)%6+6)%6*6+((tx+3)%6+6)%6];mesh.position.set(x,0,z);
      const nx=Math.max(x,Math.min(x+6,camera.position.x))-camera.position.x,nz=Math.max(z,Math.min(z+6,camera.position.z))-camera.position.z;
      this.grassBox.min.set(x-.15,-.03,z-.15);this.grassBox.max.set(x+6.15,.60,z+6.15);
      mesh.visible=nx*nx+nz*nz<18.15*18.15&&this.grassFrustum.intersectsBox(this.grassBox);
      if(mesh.visible)this.visibleBlades+=mesh.geometry.instanceCount;
    }
  }
  update(camera,sky,t,state={}){const dt=Math.min(.05,Math.max(0,t-this.lastTime))||.016;this.lastTime=t;updateVehicleLightUniforms(this.u,state.vehicleLighting);this.torchLevel+=((state.flashlight?1:0)-this.torchLevel)*(1-Math.exp(-dt*13));this.u.torch.value=this.torchLevel;camera.getWorldDirection(this.u.forward.value);this.u.eye.value.copy(camera.position);this.u.sunDirection.value.copy(sky.sun);this.u.daylight.value=sky.day;this.u.twilight.value=sky.twilight;this.u.moonlight.value=sky.moonlight;this.u.clockTime.value=t;this.cullGrass(camera);}
}
