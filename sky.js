import * as THREE from './three.module.js';
import {catalog} from './star-catalog.js';

// Adapted from Paraíso's atmosphere.js and stars.js: clip-space background,
// inverse camera projection, layered directional twilight and a single star draw.
// Solar/lunar positions here are an intentionally illustrative 24-hour cycle.
export const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const TAU=Math.PI*2;
const vertex=`uniform mat4 inverseProjection;uniform mat4 cameraWorld;varying vec3 vRay;
void main(){vec4 r=inverseProjection*vec4(position.xy,1.,1.);vRay=mat3(cameraWorld)*r.xyz;gl_Position=vec4(position.xy,1.,1.);}`;
const noiseGLSL=`
float hash(vec3 p){p=fract(p*.3183099+vec3(.11,.37,.71));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .52*noise3(p)+.27*noise3(p*2.07+4.3)+.14*noise3(p*4.13+12.7)+.07*noise3(p*8.19);}
`;
function backdrop(scene,uniforms,fragment,order,transparent=false){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const mesh=new THREE.Mesh(geometry,new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,depthWrite:false,depthTest:false,toneMapped:false,transparent:false,blending:transparent?THREE.AdditiveBlending:THREE.NormalBlending,extensions:{derivatives:true}}));
  mesh.frustumCulled=false;mesh.renderOrder=order;scene.add(mesh);return mesh;
}
function equatorial(ra,dec){ra*=Math.PI/180;dec*=Math.PI/180;return new THREE.Vector3(Math.cos(dec)*Math.cos(ra),Math.sin(dec),Math.cos(dec)*Math.sin(ra));}
export function phaseName(p){if(p<.012||p>.988)return 'Luna nueva';if(Math.abs(p-.25)<.012)return 'Cuarto creciente';if(Math.abs(p-.5)<.012)return 'Luna llena';if(Math.abs(p-.75)<.012)return 'Cuarto menguante';return p<.25?'Luna creciente':p<.5?'Gibosa creciente':p<.75?'Gibosa menguante':'Luna menguante';}

export class Sky {
  constructor(scene,moonTexture){
    this.sun=new THREE.Vector3();this.moon=new THREE.Vector3();this.field=new THREE.Matrix4();this.equatorialTilt=new THREE.Matrix4().makeRotationX(-69*Math.PI/180);this.rotation=new THREE.Matrix4();
    this.u={inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},sunDirection:{value:this.sun},moonDirection:{value:this.moon},day:{value:1},twilight:{value:0},night:{value:0},moonlight:{value:0},sunset:{value:1},phase:{value:.17},time:{value:0},moonMap:{value:moonTexture},pixelRatio:{value:1},fov:{value:100},starLimit:{value:5.8},field:{value:this.field},milkyOn:{value:1},galacticNormal:{value:new THREE.Vector3()},galacticCenter:{value:new THREE.Vector3()},galacticTangent:{value:new THREE.Vector3()}};
    this.atmosphere=backdrop(scene,this.u,`
      varying vec3 vRay;uniform vec3 sunDirection;uniform vec3 moonDirection;uniform float day,twilight,night,moonlight,sunset;
      void main(){
        vec3 d=normalize(vRay);float h=max(d.y,0.);float sh=sunDirection.y;
        float height=pow(h,.43);
        vec3 dayZenith=vec3(.09,.40,.69),dayHorizon=vec3(.68,.81,.88);
        vec3 nightZenith=vec3(.035,.049,.078),nightHorizon=vec3(.07,.082,.10);
        vec3 zenith=mix(nightZenith,dayZenith,day);
        vec3 horizon=mix(nightHorizon,dayHorizon,day);
        vec3 sky=mix(horizon,zenith,height);
        vec2 az=sunDirection.xz/max(length(sunDirection.xz),.001);
        float toward=clamp(dot(d.xz,az)*.5+.5,0.,1.);
        float band=exp(-pow((d.y-.025)*4.1,2.));
        vec3 amber=mix(vec3(.90,.60,.37),vec3(.91,.45,.22),sunset);
        vec3 peach=mix(vec3(.65,.48,.52),vec3(.60,.34,.41),sunset);
        float glow=twilight*pow(toward,5.)*band;
        sky=mix(sky,amber,glow*.92);
        float rose=twilight*exp(-pow((d.y-.17)*3.5,2.))*.30;
        sky=mix(sky,peach,rose*(.3+.7*toward));
        // Earth's shadow and a soft pink counterglow opposite the Sun.
        float away=pow(1.-toward,3.);
        sky=mix(sky,vec3(.085,.095,.17),twilight*away*(1.-smoothstep(.03,.25,d.y))*.55);
        sky=mix(sky,vec3(.42,.31,.40),twilight*away*exp(-pow((d.y-.13)*11.,2.))*.22);
        float cosSun=clamp(dot(d,sunDirection),-1.,1.);
        float sunAngular=acos(cosSun);
        float disk=1.-smoothstep(.00425,.00480,sunAngular);
        float solarUp=smoothstep(-.055,.015,sh);
        vec3 sunColor=mix(vec3(1.,.38,.10),vec3(1.,.96,.78),smoothstep(-.01,.23,sh));
        float halo=exp(-sunAngular*20.)*.16+exp(-sunAngular*160.)*.19;
        sky+=sunColor*(halo+disk*1.75)*solarUp;
        float moonAngle=acos(clamp(dot(d,moonDirection),-1.,1.));
        sky+=vec3(.19,.23,.29)*moonlight*(exp(-moonAngle*12.)*.11+exp(-moonAngle*80.)*.12);
        sky+=moonlight*vec3(.008,.011,.018)*(1.-height*.6);
        if(d.y<0.)sky=mix(horizon,sky,smoothstep(-.08,0.,d.y));
        float dither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
        gl_FragColor=vec4(sky+dither/255.,1.);
      }`,-10000);

    // This is its own diffuse layer, not a cloud of extra star sprites.
    this.milkyWay=backdrop(scene,this.u,`
      varying vec3 vRay;uniform vec3 galacticNormal,galacticCenter,galacticTangent;uniform float night,moonlight,milkyOn;
      ${noiseGLSL}
      void main(){vec3 d=normalize(vRay);float lat=dot(d,galacticNormal);vec3 g=vec3(dot(d,galacticCenter),lat,dot(d,galacticTangent));
        float n=fbm(g*13.5);float warp=(n-.5)*.035;
        float band=exp(-pow((lat+warp)*9.3,2.));
        float central=pow(max(0.,dot(d,galacticCenter)),8.);
        float broad=exp(-pow(lat*5.8,2.))*central;
        float rift=exp(-pow((lat+.018+sin(g.z*11.)*.012+(n-.5)*.045)*42.,2.));
        float structure=.27+.73*smoothstep(.21,.8,n);
        float dust=band*structure*(1.-rift*.76)+broad*.18;
        float veil=night*milkyOn*(1.-moonlight*.82)*smoothstep(.0,.23,d.y);
        vec3 color=mix(vec3(.052,.062,.071),vec3(.075,.072,.063),central*.7);
        gl_FragColor=vec4(color*dust*veil,1.);
      }`,-9999,true);
    this.createStars(scene);
    this.moonMesh=backdrop(scene,this.u,`
      varying vec3 vRay;uniform vec3 moonDirection;uniform sampler2D moonMap;uniform float phase,day,night,moonlight;
      void main(){
        vec3 d=normalize(vRay);float forward=dot(d,moonDirection);if(forward<.9998)discard;
        vec3 right=normalize(cross(moonDirection,vec3(0.,1.,0.)));vec3 up=normalize(cross(right,moonDirection));
        vec2 p=vec2(dot(d,right),dot(d,up))/max(forward,.001)/.0046;
        float radius=length(p);float aa=max(fwidth(radius),.0005);if(radius>1.+aa)discard;
        float z=sqrt(max(0.,1.-dot(p,p)));vec3 normal=vec3(p.x,p.y,z);
        vec2 uv=vec2(.5+atan(normal.x,normal.z)/6.283185307,.5+asin(clamp(normal.y,-1.,1.))/3.141592654);
        vec3 tex=texture2D(moonMap,uv).rgb;float luminance=dot(tex,vec3(.299,.587,.114));
        // Rotating illumination yields a continuous terminator on a spherical disc.
        vec3 light=vec3(sin(phase*6.283185307),.025,-cos(phase*6.283185307));
        float lambert=dot(normal,normalize(light));float terminator=smoothstep(-.012,.012,lambert);
        float lightness=(.32+.68*sqrt(max(lambert,0.)))*terminator;
        vec3 lit=vec3(.94,.94,.90)*pow(luminance,.80)*(lightness*1.45);
        float earthshine=.018*(1.-moonlight);
        lit+=tex*earthshine*(1.-terminator);
        vec3 aerial=vec3(.31,.46,.60)*day;
        lit=mix(lit,aerial+lit*.48,day*.78);
        // Solid lunar disc occludes the stars even near new Moon.
        gl_FragColor=vec4(lit,1.-smoothstep(1.-aa,1.+aa,radius));
      }`,-9997);
  }
  createStars(scene){
    const p=[],mag=[],color=[],seed=[];
    for(let i=0;i<catalog.length;i+=4){let v=equatorial(catalog[i],catalog[i+1]);p.push(v.x,v.y,v.z);mag.push(catalog[i+2]);const bv=clamp(catalog[i+3],-.4,2.);const warm=clamp((bv-.25)/1.5),cool=clamp((.3-bv)/.7);color.push(1.-cool*.24,1.-warm*.18-cool*.08,1.-warm*.4);seed.push((i*.618034)%17);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('magnitude',new THREE.Float32BufferAttribute(mag,1));geo.setAttribute('starColor',new THREE.Float32BufferAttribute(color,3));geo.setAttribute('seed',new THREE.Float32BufferAttribute(seed,1));
    const mat=new THREE.ShaderMaterial({uniforms:this.u,depthWrite:false,depthTest:false,transparent:false,blending:THREE.AdditiveBlending,toneMapped:false,
      vertexShader:`attribute float magnitude,seed;attribute vec3 starColor;uniform mat4 field;uniform vec3 sunDirection;uniform float night,moonlight,starLimit,pixelRatio,time;varying vec3 vColor;varying float vAlpha;
        void main(){vec3 dir=mat3(field)*position;vec3 vd=mat3(viewMatrix)*dir;vec4 projected=projectionMatrix*vec4(vd,1.);gl_Position=projected.w>0.?vec4(projected.xy,projected.w*.99999,projected.w):vec4(2.,2.,2.,1.);
          float visible=1.-smoothstep(starLimit-.5,starLimit+.22,magnitude);
          float strength=pow(10.,-.17*(magnitude-1.));
          float twilightVis=1.-smoothstep(-.24,.04,sunDirection.y);float brightness=clamp(strength,.065,1.2);
          float duskLimit=mix(1.5,starLimit,twilightVis);
          visible*=1.-smoothstep(duskLimit-.4,duskLimit+.6,magnitude);
          gl_PointSize=(1.2+clamp(5.4-magnitude,0.,6.)*.47)*pixelRatio;
          float scintillation=1.+.035*sin(time*1.4+seed*3.)*sin(time*.51+seed);
          vAlpha=visible*brightness*smoothstep(-.008,.11,dir.y)*twilightVis*(1.-moonlight*.3)*scintillation;
          vColor=starColor;
        }`,
      fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);float core=exp(-4.5*r)*(1.-smoothstep(.52,1.,r));gl_FragColor=vec4(vColor*vAlpha*core*1.3,1.);}`});
    this.stars=new THREE.Points(geo,mat);this.stars.frustumCulled=false;this.stars.renderOrder=-9998;scene.add(this.stars);
  }
  update(camera,state,t,pixelRatio){
    const a=(state.hour-6)/24*TAU,path=state.path*Math.PI/2;
    this.sun.set(Math.cos(a),Math.sin(a)*.9205,-Math.sin(a)*.3907).applyAxisAngle(new THREE.Vector3(0,1,0),path);
    this.moon.copy(this.sun).negate();
    const sh=this.sun.y,day=smooth(-.16,.25,sh),twilight=Math.exp(-Math.pow((sh-.004)/.135,2))*smooth(-.3,-.12,sh);
    this.day=day;this.twilight=twilight;this.night=1-smooth(-.23,.015,sh);
    this.illumination=(1-Math.cos(state.phase*TAU))*.5;
    this.moonlight=Math.pow(this.illumination,1.4)*smooth(-.01,.3,this.moon.y)*(1-day);
    Object.entries({day,twilight,night:this.night,moonlight:this.moonlight,sunset:state.hour>12?1:0,phase:state.phase,time:t,pixelRatio,starLimit:5.65+2.6*state.zoomReveal,milkyOn:state.milky?1:0}).forEach(([k,v])=>this.u[k].value=v);
    camera.updateMatrixWorld();this.u.inverseProjection.value.copy(camera.projectionMatrixInverse);this.u.cameraWorld.value.copy(camera.matrixWorld);
    this.rotation.makeRotationY((state.hour-21)/24*TAU+.5);this.field.multiplyMatrices(this.equatorialTilt,this.rotation);
    this.u.galacticNormal.value.copy(equatorial(192.8595,27.1283)).applyMatrix4(this.field);
    this.u.galacticCenter.value.copy(equatorial(266.4051,-28.9362)).applyMatrix4(this.field);
    this.u.galacticTangent.value.crossVectors(this.u.galacticNormal.value,this.u.galacticCenter.value).normalize();
    this.stars.visible=sh<.04;this.milkyWay.visible=this.night>.001&&state.milky;this.moonMesh.visible=this.moon.y>-.025;
  }
}
