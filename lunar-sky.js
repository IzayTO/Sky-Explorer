import * as THREE from './three.module.js';
import {clamp,smooth} from './sky.js?v=2.1';
const TAU=Math.PI*2,UP=new THREE.Vector3(0,1,0);
export const LUNAR_DAY=29.53059,MOON_GRAVITY=1.62;
const eq=(ra,de)=>new THREE.Vector3(Math.cos(de*Math.PI/180)*Math.cos(ra*Math.PI/180),Math.sin(de*Math.PI/180),Math.cos(de*Math.PI/180)*Math.sin(ra*Math.PI/180));
const GALACTIC_NORMAL=eq(192.8595,27.1283),GALACTIC_CENTER=eq(266.4051,-28.9362);
function linkedPhase(sun,earth){
  const a=Math.acos(clamp(sun.dot(earth),-1,1))/TAU;
  // Waxing/waning follows orbital motion, not screen-left/screen-right: the
  // lit crescent may tilt upwards as the Sun passes above the planet.
  const along=-(earth.z*sun.x-earth.x*sun.z)*.4226182617+(earth.x*sun.y-earth.y*sun.x)*.906307787;
  return along<0?1-a:a;
}
export class LunarSky{
  constructor(scene,base,earthTexture){
    this.sun=new THREE.Vector3();this.moon=new THREE.Vector3();this.field=new THREE.Matrix4();this.rotation=new THREE.Matrix4();this.tilt=new THREE.Matrix4().makeRotationX(-.9);
    this.forward=new THREE.Vector3();this.right=new THREE.Vector3();this.up=new THREE.Vector3();this.viewDirection=new THREE.Vector3();this.adaptation=0;this.solarGlare=0;this.lastTime=0;this.terrain=null;
    this.u=THREE.UniformsUtils.clone(base.u);this.u.sunDirection.value=this.sun;this.u.moonDirection.value=this.moon;this.u.field.value=this.field;this.u.moonMap.value=earthTexture;
    Object.assign(this.u,{earthLight:{value:new THREE.Vector3()},earthSpin:{value:0},solarVisible:{value:1},solarGlare:{value:0},adaptation:{value:0},earthIllumination:{value:.5}});
    const copy=(original,fragment,additive=false)=>{const material=original.material.clone();material.uniforms=this.u;if(fragment)material.fragmentShader=fragment;material.blending=additive?THREE.AdditiveBlending:THREE.NormalBlending;const m=new THREE.Mesh(original.geometry,material);m.frustumCulled=false;m.renderOrder=original.renderOrder;scene.add(m);return m;};
    this.atmosphere=copy(base.atmosphere,`varying vec3 vRay;uniform vec3 sunDirection;uniform float solarVisible,solarGlare;
      void main(){vec3 d=normalize(vRay);float a=atan(length(cross(d,sunDirection)),dot(d,sunDirection));float aa=max(fwidth(a),.000018);
        float disk=1.-smoothstep(.0285-aa,.035+aa,a);
        float glow=exp(-pow(a/.19,1.65))*.20+exp(-a*20.)*.55+exp(-a*65.)*.45;
        vec3 color=vec3(1.,.985,.95)*(disk*2.2+glow*solarGlare);
        gl_FragColor=vec4(color,1.);}`);
    let mw=base.milkyWay.material.fragmentShader.replace('*(1.-moonlight*.82)*smoothstep(.0,.23,d.y)','').replace('color*dust*veil','color*dust*veil*3.35');
    this.milkyWay=copy(base.milkyWay,mw,true);
    const mat=base.stars.material.clone();mat.uniforms=this.u;
    mat.vertexShader=`attribute float magnitude,seed;attribute vec3 starColor;uniform mat4 field;uniform vec3 moonDirection;uniform float night,starLimit,pixelRatio,zoomReveal,earthIllumination;varying vec3 vColor;varying float vAlpha;
      void main(){vec3 dir=mat3(field)*position;vec3 vd=mat3(viewMatrix)*dir;vec4 p=projectionMatrix*vec4(vd,1.);gl_Position=p.w>0.?vec4(p.xy,p.w*.99999,p.w):vec4(2.,2.,2.,1.);
        float visible=1.-smoothstep(starLimit-.5,starLimit+.22,magnitude);
        if(visible*night<.0001||p.w<=0.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;vAlpha=0.;vColor=vec3(0.);return;}
        float faint=smoothstep(4.8,8.,magnitude);
        float strength=clamp(pow(10.,-.145*(magnitude-1.)),.14,1.55)*1.22+faint*zoomReveal*.62;
        float angle=length(dir-moonDirection);float localGlare=1.-exp(-angle*6.)*earthIllumination*.9;
        gl_PointSize=(1.95+clamp(5.4-magnitude,0.,6.)*.47+zoomReveal*(.8+faint*.4))*pixelRatio;
        vAlpha=visible*strength*night*localGlare;vColor=starColor;}`;
    // Reuse the immutable GPU buffers; each world retains its own draw range.
    const starGeometry=new THREE.BufferGeometry();for(const [name,attribute] of Object.entries(base.stars.geometry.attributes))starGeometry.setAttribute(name,attribute);
    this.stars=new THREE.Points(starGeometry,mat);this.stars.frustumCulled=false;this.stars.renderOrder=-9998;scene.add(this.stars);this.catalogCount=base.catalogCount;this.starCount=base.starCount;
    this.moonMesh=copy(base.moonMesh,`varying vec3 vRay;uniform vec3 moonDirection,earthLight;uniform sampler2D moonMap;uniform float earthSpin;
      void main(){vec3 d=normalize(vRay);float forward=dot(d,moonDirection);if(forward<.994)discard;
        vec3 right=normalize(cross(moonDirection,vec3(0.,1.,0.))),up=normalize(cross(right,moonDirection));
        vec2 p=vec2(dot(d,right),dot(d,up))/max(forward,.001)/.078;
        float r=length(p),aa=max(fwidth(r),.00025);if(r>1.+aa)discard;float z=sqrt(max(0.,1.-dot(p,p)));vec3 n=vec3(p,z);
        // An axial tilt, a rotating world, and continuous lighting on a sphere.
        float tilt=.4091;vec3 mapped=vec3(n.x*cos(tilt)-n.y*sin(tilt),n.x*sin(tilt)+n.y*cos(tilt),n.z);
        vec2 uv=vec2(fract(.51+earthSpin+atan(mapped.x,mapped.z)/6.2831853),.5+asin(clamp(mapped.y,-1.,1.))/3.14159265);
        vec3 tex=texture2D(moonMap,uv).rgb;float lambert=dot(n,earthLight),terminator=smoothstep(-.07,.09,lambert);
        vec3 lit=tex*(.18+.82*sqrt(max(lambert,0.)))*terminator*1.45;
        // The atmosphere belongs to the distant Earth; the lunar sky stays black.
        float limb=pow(1.-z,3.5)*smoothstep(-.12,.3,lambert);
        lit+=vec3(.055,.17,.37)*limb;gl_FragColor=vec4(lit,1.-smoothstep(1.-aa,1.+aa,r));}`);
    // Inverse of the same orbit, computed once. A phase selection moves time;
    // it never substitutes an unrelated lamp direction for the actual Sun.
    this.phaseTimes=[];
    for(let i=0;i<2048;i++){const hour=i/2048*24;this.orbit(hour);this.phaseTimes.push({hour,phase:linkedPhase(this.sun,this.moon)});}
    this.phaseTimes.sort((a,b)=>a.phase-b.phase);
  }
  hourForPhase(phase){
    const points=this.phaseTimes,p=clamp(phase);let lo=0,hi=points.length-1;
    if(p<=points[lo].phase)return points[lo].hour;if(p>=points[hi].phase)return points[hi].hour;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid].phase<p)lo=mid;else hi=mid;}
    const a=points[lo],b=points[hi],f=(p-a.phase)/Math.max(.000001,b.phase-a.phase),delta=((b.hour-a.hour+36)%24)-12;
    return (a.hour+delta*f+24)%24;
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
    state.phase=linkedPhase(this.sun,this.moon);state.targetPhase=state.phase;
    this.illumination=(1+light.z)/2;this.earthshine=Math.pow(this.illumination,1.45)*.036;
    camera.updateMatrixWorld();camera.getWorldDirection(this.forward);this.u.inverseProjection.value.copy(camera.projectionMatrixInverse);this.u.cameraWorld.value.copy(camera.matrixWorld);
    const vertical=Math.tan(camera.fov*Math.PI/360);
    const visibility=(dir,radius)=>{const v=this.viewDirection.copy(dir).transformDirection(camera.matrixWorldInverse);if(v.z>=0)return 0;const scale=-v.z*vertical,x=Math.max(0,Math.abs(v.x)-radius)/(scale*camera.aspect),y=Math.max(0,Math.abs(v.y)-radius)/scale;return 1-smooth(.7,1.22,Math.max(x,y));};
    const sunSight=this.terrain?.visibleFrom(camera.position,this.sun)??1;const solar=visibility(this.sun,.033)*sunSight;
    const earthSight=this.terrain?.visibleFrom(camera.position,this.moon)??1;const planet=visibility(this.moon,.078)*this.illumination*earthSight;
    this.solarGlare+=(solar-this.solarGlare)*(1-Math.exp(-dt*14));this.u.solarGlare.value=this.solarGlare;
    const groundFraction=clamp(.5-Math.asin(clamp(this.forward.y,-1,1))/(camera.fov*Math.PI/180));
    const skyFraction=1-groundFraction,litGround=smooth(-.025,.08,this.sun.y)*smooth(.015,.29,groundFraction);
    // About 99% of dark recovery in one second; faster glare suppression.
    // This is an intentionally accelerated viewing effect, not biological time.
    const darkness=clamp(1-Math.max(solar,litGround*.985,planet*.68,state.flashlight?(1-skyFraction)*.6:0));
    const tau=darkness < this.adaptation ? .13 : .217;this.adaptation+=(darkness-this.adaptation)*(1-Math.exp(-dt/tau));
    this.night=this.adaptation;this.day=1-smooth(-.02,.02,-this.sun.y);this.moonlight=this.earthshine;this.twilight=0;
    const u=this.u;u.night.value=Math.pow(this.adaptation,1.2);u.moonlight.value=0;u.milkyOn.value=state.milky?1:0;u.time.value=t;u.pixelRatio.value=pixelRatio;u.zoomReveal.value=state.zoomReveal;u.starLimit.value=1.1+7.8*this.adaptation+1.75*Math.pow(state.zoomReveal,.78);u.solarVisible.value=sunSight;u.earthIllumination.value=this.illumination;u.earthSpin.value=(state.hour/24*29)%1;
    this.rotation.makeRotationY(state.hour/24*TAU+.6);this.field.multiplyMatrices(this.tilt,this.rotation);
    this.u.galacticNormal.value.copy(GALACTIC_NORMAL).applyMatrix4(this.field);this.u.galacticCenter.value.copy(GALACTIC_CENTER).applyMatrix4(this.field);this.u.galacticTangent.value.crossVectors(this.u.galacticNormal.value,this.u.galacticCenter.value).normalize();
    this.stars.visible=this.adaptation>.001;this.milkyWay.visible=state.milky&&this.adaptation>.001;this.moonMesh.visible=true;
    this.stars.geometry.setDrawRange(0,this.u.starLimit.value>7.83?this.starCount:this.catalogCount);
  }
}
