import * as THREE from './three.module.js';
import {clamp,smooth} from './sky.js';
const TAU=Math.PI*2,UP=new THREE.Vector3(0,1,0);
export const LUNAR_DAY=29.53059,MOON_GRAVITY=1.62;
const eq=(ra,de)=>new THREE.Vector3(Math.cos(de*Math.PI/180)*Math.cos(ra*Math.PI/180),Math.sin(de*Math.PI/180),Math.cos(de*Math.PI/180)*Math.sin(ra*Math.PI/180));
export class LunarSky{
  constructor(scene,base,earthTexture){
    this.sun=new THREE.Vector3();this.moon=new THREE.Vector3();this.field=new THREE.Matrix4();this.rotation=new THREE.Matrix4();this.tilt=new THREE.Matrix4().makeRotationX(-.9);
    this.forward=new THREE.Vector3();this.right=new THREE.Vector3();this.up=new THREE.Vector3();this.adaptation=0;this.lastTime=0;this.terrain=null;
    this.u=THREE.UniformsUtils.clone(base.u);this.u.sunDirection.value=this.sun;this.u.moonDirection.value=this.moon;this.u.field.value=this.field;this.u.moonMap.value=earthTexture;
    Object.assign(this.u,{earthLight:{value:new THREE.Vector3()},earthSpin:{value:0},solarVisible:{value:1},adaptation:{value:0},earthIllumination:{value:.5}});
    const copy=(original,fragment,additive=false)=>{const material=original.material.clone();material.uniforms=this.u;if(fragment)material.fragmentShader=fragment;material.blending=additive?THREE.AdditiveBlending:THREE.NormalBlending;const m=new THREE.Mesh(original.geometry,material);m.frustumCulled=false;m.renderOrder=original.renderOrder;scene.add(m);return m;};
    this.atmosphere=copy(base.atmosphere,`varying vec3 vRay;uniform vec3 sunDirection;uniform float solarVisible;
      void main(){vec3 d=normalize(vRay);float a=atan(length(cross(d,sunDirection)),dot(d,sunDirection));float aa=max(fwidth(a),.000018);
        float disk=1.-smoothstep(.0084-aa,.0103+aa,a);float glow=exp(-a*28.)*.10+exp(-a*70.)*.26+exp(-a*190.)*.82;
        vec3 color=vec3(1.,.985,.95)*(disk*2.2+glow*solarVisible);
        gl_FragColor=vec4(color,1.);}`);
    let mw=base.milkyWay.material.fragmentShader.replace('*(1.-moonlight*.82)*smoothstep(.0,.23,d.y)','').replace('color*dust*veil','color*dust*veil*3.35');
    this.milkyWay=copy(base.milkyWay,mw,true);
    const mat=base.stars.material.clone();mat.uniforms=this.u;
    mat.vertexShader=`attribute float magnitude,seed;attribute vec3 starColor;uniform mat4 field;uniform vec3 moonDirection;uniform float night,starLimit,pixelRatio,zoomReveal,earthIllumination;varying vec3 vColor;varying float vAlpha;
      void main(){vec3 dir=mat3(field)*position;vec3 vd=mat3(viewMatrix)*dir;vec4 p=projectionMatrix*vec4(vd,1.);gl_Position=p.w>0.?vec4(p.xy,p.w*.99999,p.w):vec4(2.,2.,2.,1.);
        float visible=1.-smoothstep(starLimit-.5,starLimit+.22,magnitude);float faint=smoothstep(4.8,8.,magnitude);
        float strength=clamp(pow(10.,-.16*(magnitude-1.)),.09,1.4)+faint*zoomReveal*.60;
        float angle=acos(clamp(dot(dir,moonDirection),-1.,1.));float localGlare=1.-exp(-angle*9.)*earthIllumination*.9;
        gl_PointSize=(1.7+clamp(5.4-magnitude,0.,6.)*.47+zoomReveal*(.8+faint*.4))*pixelRatio;
        vAlpha=visible*strength*night*localGlare;vColor=starColor;}`;
    this.stars=new THREE.Points(base.stars.geometry.clone(),mat);this.stars.frustumCulled=false;this.stars.renderOrder=-9998;scene.add(this.stars);this.catalogCount=base.catalogCount;this.starCount=base.starCount;
    this.moonMesh=copy(base.moonMesh,`varying vec3 vRay;uniform vec3 moonDirection,earthLight;uniform sampler2D moonMap;uniform float earthSpin;
      void main(){vec3 d=normalize(vRay);float forward=dot(d,moonDirection);if(forward<.997)discard;
        vec3 right=normalize(cross(moonDirection,vec3(0.,1.,0.))),up=normalize(cross(right,moonDirection));
        vec2 p=vec2(dot(d,right),dot(d,up))/max(forward,.001)/.022;
        float r=length(p),aa=max(fwidth(r),.00025);if(r>1.+aa)discard;float z=sqrt(max(0.,1.-dot(p,p)));vec3 n=vec3(p,z);
        // An axial tilt, a rotating world, and continuous lighting on a sphere.
        float tilt=.4091;vec3 mapped=vec3(n.x*cos(tilt)-n.y*sin(tilt),n.x*sin(tilt)+n.y*cos(tilt),n.z);
        vec2 uv=vec2(fract(.51+earthSpin+atan(mapped.x,mapped.z)/6.2831853),.5+asin(clamp(mapped.y,-1.,1.))/3.14159265);
        vec3 tex=texture2D(moonMap,uv).rgb;float lambert=dot(n,earthLight),terminator=smoothstep(-.07,.09,lambert);
        vec3 lit=tex*(.18+.82*sqrt(max(lambert,0.)))*terminator*1.45;
        // The atmosphere belongs to the distant Earth; the lunar sky stays black.
        float limb=pow(1.-z,3.5)*smoothstep(-.12,.3,lambert);
        lit+=vec3(.055,.17,.37)*limb;gl_FragColor=vec4(lit,1.-smoothstep(1.-aa,1.+aa,r));}`);
  }
  orbit(hour){const h=(hour-12)/24*TAU,lat=25*Math.PI/180,dec=.0269*Math.sin(h);
    this.sun.set(-Math.sin(h)*Math.cos(dec),Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(h),Math.sin(lat)*Math.cos(dec)*Math.cos(h)-Math.cos(lat)*Math.sin(dec)).normalize();
    // Representative near-side site, 25° N, 40° E. Earth remains nearly fixed.
    const lon=(40+5.1*Math.sin(h)) *Math.PI/180,latitude=lat+3.3*Math.sin(h+.8)*Math.PI/180;
    this.moon.set(-Math.sin(lon),Math.cos(latitude)*Math.cos(lon),Math.sin(latitude)*Math.cos(lon)).normalize();
  }
  update(camera,state,t,pixelRatio){
    this.orbit(state.hour);const dt=clamp(t-this.lastTime,0,.05)||.016;this.lastTime=t;
    this.right.crossVectors(this.moon,UP).normalize();this.up.crossVectors(this.right,this.moon).normalize();
    const light=this.u.earthLight.value;light.set(this.sun.dot(this.right),this.sun.dot(this.up),-this.sun.dot(this.moon));
    const phaseAngle=Math.acos(clamp(-light.z,-1,1))/TAU;const orbitalPhase=light.x<0?1-phaseAngle:phaseAngle;
    if(state.phaseLinked){state.phase=orbitalPhase;state.targetPhase=orbitalPhase;}else{light.set(Math.sin(state.phase*TAU),.025,-Math.cos(state.phase*TAU)).normalize();}
    this.illumination=(1+light.z)/2;this.earthshine=Math.pow(this.illumination,1.45)*.036;
    camera.updateMatrixWorld();camera.getWorldDirection(this.forward);this.u.inverseProjection.value.copy(camera.projectionMatrixInverse);this.u.cameraWorld.value.copy(camera.matrixWorld);
    const visibility=dir=>{const v=dir.clone().transformDirection(camera.matrixWorldInverse);if(v.z>=0)return 0;const vertical=Math.tan(camera.fov*Math.PI/360),x=Math.abs(v.x/(-v.z*vertical*camera.aspect)),y=Math.abs(v.y/(-v.z*vertical));return 1-smooth(.7,1.22,Math.max(x,y));};
    const sunSight=this.terrain?.visibleFrom(camera.position,this.sun)??1;const solar=visibility(this.sun)*sunSight;
    const earthSight=this.terrain?.visibleFrom(camera.position,this.moon)??1;const planet=visibility(this.moon)*this.illumination*earthSight;
    const groundFraction=clamp(.5-Math.asin(clamp(this.forward.y,-1,1))/(camera.fov*Math.PI/180));
    const skyFraction=1-groundFraction,litGround=smooth(-.025,.08,this.sun.y)*smooth(.015,.29,groundFraction);
    // Fast glare response, two-stage-style slow dark recovery. Deliberately
    // time-compressed (seconds), not a claim of full biological dark adaptation.
    const darkness=clamp(1-Math.max(solar,litGround*.985,planet*.68,state.flashlight?(1-skyFraction)*.6:0));
    const tau=darkness < this.adaptation ? .22 : 8.5;this.adaptation+=(darkness-this.adaptation)*(1-Math.exp(-dt/tau));
    this.night=this.adaptation;this.day=1-smooth(-.02,.02,-this.sun.y);this.moonlight=this.earthshine;this.twilight=0;
    Object.entries({night:Math.pow(this.adaptation,1.35),moonlight:0,milkyOn:state.milky?1:0,time:t,pixelRatio,zoomReveal:state.zoomReveal,starLimit:1.1+6.2*this.adaptation+3.05*Math.pow(state.zoomReveal,.78),solarVisible:sunSight,earthIllumination:this.illumination,earthSpin:(state.hour/24*29)%1}).forEach(([k,v])=>this.u[k].value=v);
    this.rotation.makeRotationY(state.hour/24*TAU+.6);this.field.multiplyMatrices(this.tilt,this.rotation);
    this.u.galacticNormal.value.copy(eq(192.8595,27.1283)).applyMatrix4(this.field);this.u.galacticCenter.value.copy(eq(266.4051,-28.9362)).applyMatrix4(this.field);this.u.galacticTangent.value.crossVectors(this.u.galacticNormal.value,this.u.galacticCenter.value).normalize();
    this.stars.visible=this.adaptation>.001;this.milkyWay.visible=state.milky&&this.adaptation>.001;this.moonMesh.visible=true;
    this.stars.geometry.setDrawRange(0,this.u.starLimit.value>7.83?this.starCount:this.catalogCount);
  }
}
