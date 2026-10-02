import * as THREE from './three.module.js';
import {clamp} from './sky.js';

// One continuous height field drives both the drawn surface and foot collision.
// Directional and torch occlusion sample that same field: no fake shadow decals.
const SIZE=4096,HALF=SIZE/2;
export class LunarTerrain{
  constructor(scene,heightTexture,regolith,mobile){
    this.texture=heightTexture;this.mobile=mobile;this.heightTexture=heightTexture;
    const image=heightTexture.image,c=document.createElement('canvas');c.width=image.width;c.height=image.height;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
    this.n=c.width;this.heights=new Float32Array(this.n*this.n);
    for(let i=0;i<this.heights.length;i++)this.heights[i]=(pixels[i*4]*256+pixels[i*4+1])/65535*256-128;
    heightTexture.flipY=false;heightTexture.colorSpace=THREE.NoColorSpace;heightTexture.generateMipmaps=false;heightTexture.minFilter=heightTexture.magFilter=THREE.LinearFilter;heightTexture.needsUpdate=true;
    regolith.colorSpace=THREE.NoColorSpace;regolith.wrapS=regolith.wrapT=THREE.RepeatWrapping;regolith.anisotropy=4;
    this.u={heightMap:{value:heightTexture},grain:{value:regolith},sun:{value:new THREE.Vector3()},earth:{value:new THREE.Vector3()},earthPower:{value:.04},torch:{value:0},eye:{value:new THREE.Vector3()},forward:{value:new THREE.Vector3()},quality:{value:1}};
    this.material=new THREE.ShaderMaterial({uniforms:this.u,extensions:{derivatives:true},vertexShader:`varying vec3 vWorld,vNormal;
      void main(){vWorld=position;vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`precision highp float;varying vec3 vWorld,vNormal;uniform sampler2D heightMap,grain;uniform vec3 sun,earth,eye,forward;uniform float earthPower,torch,quality;
      float elevation(vec2 p){vec2 uv=(p+2048.)/4096.*(1024./1025.)+.5/1025.;vec2 c=texture2D(heightMap,uv).rg;return dot(c,vec2(65280.,255.))/65535.*256.-128.;}
      float triangleHeight(vec2 p);
      float shadow(vec3 p,vec3 light){if(light.y<-.02)return 0.;float visible=1.,dist=2.;
        for(int i=0;i<21;i++){vec3 q=p+light*dist;if(max(abs(q.x),abs(q.z))>2046.)break;float gap=q.y-triangleHeight(q.xz);visible=min(visible,smoothstep(-.28,.32+dist*.003,gap));if(visible<.015)break;dist=dist*1.37+1.8;}
        return visible;}
      float cornerHeight(vec2 grid){vec2 c=texture2D(heightMap,(grid+.5)/1025.).rg;return dot(c,vec2(65280.,255.))/65535.*256.-128.;}
      float triangleHeight(vec2 p){vec2 g=(p+2048.)/4.,i=floor(g),f=fract(g);float b=cornerHeight(i+vec2(1.,0.)),c=cornerHeight(i+vec2(0.,1.));if(f.x+f.y<=1.){float a=cornerHeight(i);return a+(b-a)*f.x+(c-a)*f.y;}float d=cornerHeight(i+vec2(1.));return d+(c-d)*(1.-f.x)+(b-d)*(1.-f.y);}
      float torchShadow(vec3 p,vec3 l,float len){float v=1.;for(int i=1;i<13;i++){float f=float(i)/13.;vec3 q=p+l*len*f;v=min(v,smoothstep(-.08,.12,q.y-triangleHeight(q.xz)));}return v;}
      void main(){vec3 p=vWorld,n=normalize(vNormal);float distanceToEye=distance(p,eye);
        float grains=texture2D(grain,p.xz*.19).r;float mottling=texture2D(grain,p.xz*.0071+vec2(.34,.57)).r;
        // Screen-space differential micro-normal. It fades before it aliases.
        vec3 dx=dFdx(p),dy=dFdy(p);float dhx=dFdx(grains),dhy=dFdy(grains);
        vec3 r1=cross(dy,n),r2=cross(n,dx);float det=dot(dx,r1);
        vec3 bump=sign(det)*(dhx*r1+dhy*r2)/max(abs(det),.00001);
        n=normalize(n-bump*.037*(1.-smoothstep(25.,110.,distanceToEye)));
        vec3 safePoint=p+normalize(vNormal)*.24;
        float solar=max(0.,dot(n,sun)),earthLit=max(0.,dot(n,earth));
        float s=0.,e=0.;if(solar>.001&&sun.y>-.01)s=solar*shadow(safePoint,sun);
        if(earthPower>.0001&&earthLit>.001)e=earthLit*shadow(safePoint,earth)*earthPower;
        vec3 illumination=vec3(.000025)+vec3(1.,.98,.93)*s*1.38+vec3(.46,.63,1.)*e;
        if(torch>.001){vec3 delta=eye-p;float len=length(delta);vec3 toLamp=delta/max(len,.001);float aim=dot(-toLamp,forward);float radial=sqrt(max(0.,1.-aim*aim))/max(aim,.001)/.55;
          float central=1.-smoothstep(.49,.75,radial);float ring=exp(-pow((radial-.82)/.055,2.))*.16;
          float spill=(1.-smoothstep(.79,1.03,radial))*.15;
          float beam=(central+ring+spill)*smoothstep(0.,.08,aim)*(1.-smoothstep(75.,100.,len));
          if(beam>.001){float occlusion=torchShadow(safePoint,toLamp,len);float intensity=beam*torch*2.8/(1.+len*len/170.);illumination+=vec3(.92,.96,1.)*(.12+.88*max(dot(n,toLamp),0.))*occlusion*intensity;}}
        float albedo=.28+(mottling-.5)*.16+(grains-.5)*.12;
        vec3 linear=vec3(albedo*.99,albedo,albedo*1.015)*illumination;
        vec3 color=pow(max(linear,vec3(0.)),vec3(1./2.2));
        float dither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
        gl_FragColor=vec4(color+dither/510.,1.);
      }`,toneMapped:false});
    this.group=new THREE.Group();scene.add(this.group);this.meshes=[];
    // A detailed walkable 1.5 km area plus a broad horizon. Ring boundaries
    // share exact height samples. Skirts close LOD transitions from low views.
    const rings=[{inner:0,outer:768,step:4},{inner:768,outer:1536,step:16},{inner:1536,outer:2048,step:32}];
    for(const ring of rings)this.buildRing(ring);
    this.torchLevel=0;this.lastTime=0;
  }
  heightAt(x,z){const fx=clamp((x+HALF)/SIZE,0,.999999)*(this.n-1),fz=clamp((z+HALF)/SIZE,0,.999999)*(this.n-1),ix=Math.floor(fx),iz=Math.floor(fz),a=fx-ix,b=fz-iz,i=iz*this.n+ix,h=this.heights;
    // Same triangle split as the mesh, for exact standing/collision heights.
    return a+b<=1?h[i]+(h[i+1]-h[i])*a+(h[i+this.n]-h[i])*b:h[i+this.n+1]+(h[i+this.n]-h[i+this.n+1])*(1-a)+(h[i+1]-h[i+this.n+1])*(1-b);}
  buildRing({inner,outer,step}){
    const tile=256;
    for(let z=-outer;z<outer;z+=tile)for(let x=-outer;x<outer;x+=tile){if(x>=-inner&&x<inner&&z>=-inner&&z<inner)continue;
      const seg=tile/step,p=[],normal=[],idx=[];
      for(let j=0;j<=seg;j++)for(let i=0;i<=seg;i++){const px=x+i*step,pz=z+j*step;p.push(px,this.heightAt(px,pz),pz);const n=new THREE.Vector3(this.heightAt(px-2,pz)-this.heightAt(px+2,pz),4,this.heightAt(px,pz-2)-this.heightAt(px,pz+2)).normalize();normal.push(n.x,n.y,n.z);}
      for(let j=0;j<seg;j++)for(let i=0;i<seg;i++){const a=j*(seg+1)+i,b=a+1,c=a+seg+1,d=c+1;idx.push(a,c,b,b,c,d);}
      const edge=[];for(let i=0;i<=seg;i++)edge.push(i);for(let i=1;i<=seg;i++)edge.push(i*(seg+1)+seg);for(let i=seg-1;i>=0;i--)edge.push(seg*(seg+1)+i);for(let i=seg-1;i>0;i--)edge.push(i*(seg+1));
      const start=p.length/3;for(const i of edge){p.push(p[i*3],p[i*3+1]-6,p[i*3+2]);normal.push(normal[i*3],normal[i*3+1],normal[i*3+2]);}
      for(let i=0;i<edge.length;i++){const j=(i+1)%edge.length;idx.push(edge[i],start+i,edge[j],edge[j],start+i,start+j);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));geo.setIndex(idx);geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,this.material);this.group.add(mesh);this.meshes.push(mesh);
    }
  }
  visibleFrom(point,direction){if(direction.y<-.08)return 0;for(let d=8;d<1400;d=d*1.35+5){const x=point.x+direction.x*d,z=point.z+direction.z*d;if(this.heightAt(x,z)>point.y+direction.y*d+.35)return 0;}return 1;}
  update(camera,sky,t,state={}){const dt=clamp(t-this.lastTime,0,.05)||.016;this.lastTime=t;this.torchLevel+=((state.flashlight?1:0)-this.torchLevel)*(1-Math.exp(-dt*13));this.u.torch.value=this.torchLevel;this.u.eye.value.copy(camera.position);camera.getWorldDirection(this.u.forward.value);this.u.sun.value.copy(sky.sun);this.u.earth.value.copy(sky.moon);this.u.earthPower.value=sky.earthshine;}
}
