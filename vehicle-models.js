import * as THREE from './three.module.js';
import {flashlightGLSL,vehicleLightGLSL,vehicleLightUniforms,updateVehicleLightUniforms} from './flashlight.js?v=2.3';

// Original, locally authored geometry. Static details are merged into one draw;
// only the four wheels and the steering assembly need separate transforms.
const V=(x,y,z)=>new THREE.Vector3(x,y,z),TAU=Math.PI*2;
const paint={ivory:0xd6d4c8,frame:0x626b70,dark:0x20282c,rubber:0x272a2b,gold:0xc49649,seat:0xb7b9b2,red:0xb95540,green:0x546957,metal:0xa1abb0,black:0x101719};
function panelGeometry(size){
  const [w,h,d]=size,r=Math.min(.045,w*.14,h*.23,d*.14);
  if(Math.min(w,h,d)<.08||Math.max(w,h,d)<.28)return new THREE.BoxGeometry(w,h,d);
  // Bevelled panels and seat pads retain their silhouette at close range.
  const shape=new THREE.Shape(),x=w/2-r,z=d/2-r;
  shape.moveTo(-x,-z);shape.lineTo(x,-z);shape.lineTo(x,z);shape.lineTo(-x,z);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:h-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:2,steps:1,curveSegments:2});
  g.rotateX(-Math.PI/2);g.translate(0,-h/2+r,0);return g;
}
class Parts{
  constructor(){this.p=[];this.n=[];this.c=[];this.e=[];}
  add(geometry,color,position=V(0,0,0),rotation=new THREE.Euler(),emission=0){
    let g=geometry.index?geometry.toNonIndexed():geometry;
    g.applyMatrix4(new THREE.Matrix4().compose(position,new THREE.Quaternion().setFromEuler(rotation),V(1,1,1)));
    const p=g.attributes.position,n=g.attributes.normal,c=new THREE.Color(color);
    for(let i=0;i<p.count;i++){this.p.push(p.getX(i),p.getY(i),p.getZ(i));this.n.push(n.getX(i),n.getY(i),n.getZ(i));this.c.push(c.r,c.g,c.b);this.e.push(emission);}
    if(g!==geometry)g.dispose();geometry.dispose();return this;
  }
  box(size,pos,color,rot=[0,0,0],emission=0){return this.add(panelGeometry(size),color,V(...pos),new THREE.Euler(...rot),emission);}
  cylinder(r1,r2,length,pos,color,rot=[0,0,0],segments=12){return this.add(new THREE.CylinderGeometry(r1,r2,length,segments),color,V(...pos),new THREE.Euler(...rot));}
  tube(a,b,r,color){a=V(...a);b=V(...b);const g=new THREE.CylinderGeometry(r,r,a.distanceTo(b),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize()));return this.add(g,color,a.add(b).multiplyScalar(.5));}
  torus(radius,tube,pos,color,rot=[0,0,0],segments=28){return this.add(new THREE.TorusGeometry(radius,tube,6,segments),color,V(...pos),new THREE.Euler(...rot));}
  mesh(material){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('paintColor',new THREE.Float32BufferAttribute(this.c,3));g.setAttribute('emission',new THREE.Float32BufferAttribute(this.e,1));g.computeBoundingSphere();return new THREE.Mesh(g,material);}
}
function vehicleMaterial(){
  const uniforms={...vehicleLightUniforms(),sun:{value:V(0,1,0)},earth:{value:V(0,1,0)},earthPower:{value:0},day:{value:1},lunar:{value:0},eye:{value:V(0,0,0)},forward:{value:V(0,0,-1)},torch:{value:0},sunVisibility:{value:1}};
  return new THREE.ShaderMaterial({uniforms,toneMapped:false,vertexShader:`
    attribute vec3 paintColor;attribute float emission;varying vec3 vWorld,vNormal,vPaint;varying float vEmission;
    void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;vNormal=normalize(mat3(modelMatrix)*normal);vPaint=paintColor;vEmission=emission;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
    fragmentShader:`varying vec3 vWorld,vNormal,vPaint;varying float vEmission;
    uniform vec3 sun,earth,eye,forward;uniform float earthPower,day,lunar,torch,sunVisibility;
    ${flashlightGLSL}${vehicleLightGLSL}
    void main(){vec3 n=normalize(vNormal),view=normalize(eye-vWorld);float ndl=max(0.,dot(n,sun));
      vec3 ambient=mix(vec3(.009,.014,.021)+vec3(.17)*day,vec3(.00004),lunar);
      vec3 light=ambient+vec3(1.,.96,.86)*ndl*sunVisibility*mix(day*.8,1.35,lunar)
        +vec3(.46,.63,1.)*max(0.,dot(n,earth))*earthPower;
      if(torch>.001){vec3 d=eye-vWorld;light+=vec3(.92,.96,1.)*flashlightBeam(-d,forward)*torch*(.10+.90*max(0.,dot(n,normalize(d))));}
      if(lampMode>.001){light+=vec3(.92,.96,1.)*(headlightBeam(vWorld-lampLeft)+headlightBeam(vWorld-lampRight))*.15;}
      float spec=pow(max(0.,dot(n,normalize(sun+view))),40.)*ndl*sunVisibility*mix(day,1.,lunar);
      vec3 color=vPaint*light+vec3(spec*.07);
      if(vEmission>0.)color+=vPaint*vEmission*min(lampMode,1.)*2.4;
      if(vEmission<0.)color+=vec3(1.,.012,.003)*(-vEmission)*reverseLight*2.8;
      gl_FragColor=vec4(pow(max(color,vec3(0.)),vec3(1./2.2)),1.);
    }`});
}
function rack(p,z,width,length,y){
  for(const x of [-width/2,width/2])p.tube([x,y,z-length/2],[x,y,z+length/2],.027,paint.frame);
  for(let i=0;i<5;i++){const zz=z-length/2+i*length/4;p.tube([-width/2,y,zz],[width/2,y,zz],.023,paint.frame);}
  for(const x of [-width/2,width/2]){p.tube([x,y-.18,z-length/2],[x,y,z-length/2],.024,paint.frame);p.tube([x,y-.18,z+length/2],[x,y,z+length/2],.024,paint.frame);}
}
function wheel(lunar,radius,width,material){
  const p=new Parts();p.cylinder(radius,radius,width,[0,0,0],lunar?0x56595a:paint.rubber,[0,0,Math.PI/2],28);
  for(const side of [-1,1]){
    p.cylinder(radius*.60,radius*.60,.035,[side*(width/2+.008),0,0],paint.frame,[0,0,Math.PI/2],20);
    p.cylinder(radius*.24,radius*.24,.055,[side*(width/2+.035),0,0],paint.metal,[0,0,Math.PI/2],12);
    for(let i=0;i<8;i++){const a=i*TAU/8;p.tube([side*(width/2+.03),Math.cos(a)*radius*.18,Math.sin(a)*radius*.18],[side*(width/2+.03),Math.cos(a)*radius*.56,Math.sin(a)*radius*.56],lunar?.019:.028,paint.metal);}
  }
  for(let i=0;i<(lunar?28:24);i++){const a=i*TAU/(lunar?28:24);
    p.box([width*.94,lunar?.027:.065,lunar?.045:.095],[0,Math.cos(a)*radius,Math.sin(a)*radius],lunar?paint.metal:0x343837,[a,0,lunar?.24:(i%2?.22:-.22)]);
  }
  return p.mesh(material);
}
export function createVehicleModel(lunar){
  const root=new THREE.Group(),p=new Parts(),material=vehicleMaterial();material.uniforms.lunar.value=lunar?1:0;
  const wheelbase=lunar?2.10:1.62,track=lunar?1.74:1.48,radius=lunar?.39:.36,width=lunar?.29:.34;
  // Coordinates are metres; model forward is -Z, root is at the axle midpoint.
  if(lunar){
    p.box([1.56,.16,2.73],[0,.18,0],paint.ivory).box([1.25,.16,1.76],[0,-.02,.12],paint.dark);
    for(const x of [-.68,.68]){
      p.tube([x,.02,-1.3],[x,.02,1.3],.045,paint.frame);
      p.tube([x,.40,-1.0],[x,.40,.64],.025,paint.gold);
      p.tube([x,.21,-1.0],[x,.40,-1.0],.025,paint.frame);
      p.tube([x,.21,.64],[x,.40,.64],.025,paint.frame);
    }
    // Two distinct open front seats, tubular frames, belts and stitched pads.
    for(const x of [-.39,.39]){
      p.box([.59,.13,.56],[x,.53,.02],paint.seat).box([.57,.66,.12],[x,.89,.30],paint.seat,[-.11,0,0]);
      p.box([.46,.028,.43],[x,.61,0],0xd7d6cb).box([.044,.67,.022],[x-.16,.90,.218],paint.dark,[-.11,0,0]);
      p.box([.044,.67,.022],[x+.16,.90,.218],paint.dark,[-.11,0,0]);
      for(const dx of [-.24,.24]){p.tube([x+dx,.23,-.21],[x+dx,.49,-.21],.023,paint.frame);p.tube([x+dx,.23,.31],[x+dx,1.25,.36],.023,paint.frame);}
      p.box([.07,.06,.04],[x,.63,.02],paint.gold);
    }
    p.box([1.07,.26,.35],[0,.71,-.72],paint.ivory,[-.17,0,0]);
    p.box([.27,.13,.015],[-.34,.77,-.532],0x122d34,[-.17,0,0]);
    for(let i=0;i<4;i++)p.box([.052,.027,.02],[.05+i*.13,.78,-.536],i===0?paint.red:paint.dark);
    p.tube([-.39,.49,-.63],[-.39,.95,-.41],.026,paint.frame);
    // Equipment locker, foil ribs, radiator, compact science boom.
    p.box([1.35,.43,.49],[0,.48,1.02],paint.gold).box([1.32,.07,.51],[0,.72,1.02],paint.ivory);
    for(let i=0;i<12;i++)p.box([.038,.33,.016],[-.59+i*.108,.48,1.273],i%2?0xb88c45:0xd3b570);
    p.box([.61,.26,.12],[.20,.92,1.09],paint.frame);
    for(let i=0;i<7;i++)p.box([.51,.011,.14],[.20,.82+i*.03,1.09],paint.metal);
    p.tube([.65,.3,.99],[.65,1.94,.99],.022,paint.frame);
    p.add(new THREE.SphereGeometry(.052,10,6),paint.ivory,V(.65,1.94,.99));
    // Closed, two-sided paraboloid. Front, backing, lip and feed share a
    // single local axis, so the reflector remains solid from every angle.
    const dishOrigin=V(.67,1.45,-.88),dishQ=new THREE.Quaternion().setFromUnitVectors(V(0,0,1),V(0,.35,-.937).normalize());
    const dishParts=new Parts();
    p.tube([.67,.25,-.88],[.67,1.40,-.84],.026,paint.frame);
    const positions=[],indices=[],rings=7,segments=32,radius=.30;
    for(let side=0;side<2;side++)for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
      const r=radius*j/rings,a=i*TAU/segments;positions.push(r*Math.cos(a),r*Math.sin(a),r*r*.83-side*.016);
    }
    const half=(rings+1)*(segments+1);
    for(let side=0;side<2;side++)for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
      const a=side*half+j*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;
      if(side===0)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
    }
    for(let i=0;i<segments;i++){const a=rings*(segments+1)+i,b=a+1;indices.push(a,b,a+half,b,b+half,a+half);}
    const dish=new THREE.BufferGeometry();dish.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));dish.setIndex(indices);dish.computeVertexNormals();
    dishParts.add(dish,paint.ivory);dishParts.torus(radius,.012,[0,0,radius*radius*.83],paint.gold);
    dishParts.cylinder(.052,.052,.085,[0,0,-.044],paint.frame,[Math.PI/2,0,0]);
    for(let i=0;i<6;i++){
      const a=i*TAU/6;
      for(let j=0;j<5;j++){const r1=.03+j*.053,r2=r1+.053;dishParts.tube([Math.cos(a)*r1,Math.sin(a)*r1,r1*r1*.83-.022],[Math.cos(a)*r2,Math.sin(a)*r2,r2*r2*.83-.022],.006,paint.gold);}
    }
    for(let i=0;i<3;i++){const a=i*TAU/3;dishParts.tube([Math.cos(a)*.26,Math.sin(a)*.26,.06],[0,0,.235],.006,paint.frame);}
    dishParts.cylinder(.025,.021,.065,[0,0,.23],paint.gold,[Math.PI/2,0,0]);
    const assembly=dishParts.mesh(material);p.add(assembly.geometry,paint.ivory);
    // Restore the assembly's authored paint attributes after positioning.
    const start=p.p.length-dishParts.p.length;
    const point=V(0,0,0),normal=V(0,0,0);
    for(let i=0;i<dishParts.p.length;i+=3){point.fromArray(dishParts.p,i).applyQuaternion(dishQ).add(dishOrigin);normal.fromArray(dishParts.n,i).applyQuaternion(dishQ);p.p[start+i]=point.x;p.p[start+i+1]=point.y;p.p[start+i+2]=point.z;p.n[start+i]=normal.x;p.n[start+i+1]=normal.y;p.n[start+i+2]=normal.z;p.c[start+i]=dishParts.c[i];p.c[start+i+1]=dishParts.c[i+1];p.c[start+i+2]=dishParts.c[i+2];}
    // Sill label stripes and fasteners are geometry, with no external textures.
    for(const x of [-.79,.79])for(let i=0;i<4;i++)p.box([.012,.052,.14],[x,.20,-.48+i*.19],i<2?paint.red:paint.frame);
  }else{
    p.box([.87,.20,1.85],[0,.09,0],paint.dark).box([.69,.28,.82],[0,.29,.09],paint.frame);
    p.box([1.36,.24,.68],[0,.52,-.68],paint.green,[.11,0,0]).box([1.35,.22,.61],[0,.57,.78],paint.green,[-.08,0,0]);
    p.box([.56,.23,1.02],[0,.73,.19],paint.black).box([.51,.035,.88],[0,.865,.21],0x444b47);
    p.box([.51,.46,.65],[0,.51,-.20],paint.green,[-.15,0,0]);
    p.box([.45,.052,.18],[0,.79,-.42],paint.red,[-.18,0,0]);
    for(const x of [-.68,.68]){
      p.box([.43,.075,.95],[x,.45,.17],paint.dark);
      for(let i=0;i<6;i++)p.box([.36,.025,.028],[x,.50,-.20+i*.12],paint.frame);
      p.tube([x,.12,-.78],[x,.12,.82],.040,paint.frame);
      for(const z of [-wheelbase/2,wheelbase/2])p.box([.52,.095,.85],[x,.50,z],paint.green,[z<0?.05:-.05,0,0]);
    }
    rack(p,-.82,1.23,.45,.85);rack(p,.91,1.26,.57,.91);
    for(const z of [-1.16,1.17]){
      p.tube([-.56,.37,z],[.56,.37,z],.040,paint.frame);
      p.tube([-.56,.37,z],[-.56,.18,z*.88],.036,paint.frame);p.tube([.56,.37,z],[.56,.18,z*.88],.036,paint.frame);
    }
    p.box([.54,.29,.035],[0,.40,-1.025],paint.dark);
    for(let i=0;i<5;i++)p.box([.45,.015,.028],[0,.29+i*.049,-1.05],paint.frame);
    // Engine cooling fins, exhaust with guard, round fuel cap.
    for(let i=0;i<7;i++)p.box([.81,.026,.47],[0,.20+i*.045,.19],i%2?paint.metal:paint.dark);
    p.cylinder(.09,.09,.51,[.49,.28,.69],paint.frame,[Math.PI/2,0,0]);
    p.cylinder(.067,.067,.052,[.49,.28,.96],paint.black,[Math.PI/2,0,0]);
    p.cylinder(.065,.065,.03,[0,.775,-.17],paint.metal);
    p.tube([0,.52,-.48],[0,1.04,-.56],.029,paint.frame);
    p.box([.25,.09,.12],[0,1.045,-.51],paint.dark,[-.25,0,0]);
    p.box([.17,.007,.065],[0,1.10,-.50],0x385253,[-.25,0,0]);
  }
  // Suspension wishbones, dampers and visible spring coils on every wheel.
  for(const x of [-track/2,track/2])for(const z of [-wheelbase/2,wheelbase/2]){
    const inner=Math.sign(x)*(lunar?.45:.38);
    p.tube([inner,.12,z-.18],[x,-.04,z],.034,paint.frame);p.tube([inner,.12,z+.18],[x,-.04,z],.034,paint.frame);
    p.tube([inner,.36,z],[x,-.05,z],.026,paint.metal);
    for(let i=0;i<6;i++){const f=i/5;p.torus(.052,.010,[inner+(x-inner)*f,.31-.30*f,z],lunar?paint.gold:paint.red,[0,0,.65]);}
    if(lunar){
      // Thin upper mudguards follow the wheel arc without closing the mesh wheel.
      p.add(new THREE.CylinderGeometry(radius+.08,radius+.08,width+.09,16,1,true,.13,Math.PI-.26),paint.ivory,V(x,.015,z),new THREE.Euler(0,0,Math.PI/2));
    }
  }
  const front=lunar?-1.37:-1.07,headY=lunar?.47:.61,headX=lunar?.57:.44;
  for(const side of [-1,1]){
    p.box([.25,.18,.14],[side*headX,headY,front+.03],paint.dark);
    p.box([.19,.115,.012],[side*headX,headY,front-.047],0xe1e9e4,[0,0,0],1);
    p.box([.15,.055,.015],[side*headX,headY-.17,lunar?1.40:1.11],paint.red,[0,0,0],-1);
  }
  const body=p.mesh(material);root.add(body);
  const wheels=[];
  for(const x of [-track/2,track/2])for(const z of [-wheelbase/2,wheelbase/2]){
    const pivot=new THREE.Group();pivot.position.set(x,0,z);const mesh=wheel(lunar,radius,width,material);pivot.add(mesh);root.add(pivot);wheels.push({pivot,mesh,x,z,front:z<0});
  }
  const controls=new Parts(),steering=new THREE.Group();
  if(lunar){controls.torus(.15,.016,[0,0,0],paint.dark);for(let i=0;i<3;i++){const a=i*TAU/3;controls.tube([0,0,0],[Math.cos(a)*.14,Math.sin(a)*.14,0],.010,paint.frame);}steering.position.set(-.39,.95,-.41);steering.rotation.x=-.4;}
  else{controls.tube([-.50,.05,.11],[-.27,0,0],.019,paint.frame);controls.tube([-.27,0,0],[.27,0,0],.019,paint.frame);controls.tube([.27,0,0],[.50,.05,.11],.019,paint.frame);for(const x of [-.48,.48]){controls.box([.21,.052,.062],[x,.05,.11],paint.rubber);controls.tube([x,.04,.09],[x,.025,.22],.009,paint.metal);}steering.position.set(0,1.10,-.53);}
  steering.add(controls.mesh(material));root.add(steering);
  root.name=lunar?'Rover · Selene 02':'Cuatrimoto · Sendero 01';
  return {root,body,wheels,steering,material,wheelbase,track,radius,
    seat:V(lunar?-.39:0,lunar?1.55:1.56,lunar?.035:.26),
    lamps:[V(-headX,headY,front-.075),V(headX,headY,front-.075)],
    rearLamp:V(0,headY-.17,lunar?1.43:1.14),
    updateLight(sky,camera,state,sunVisibility=1){const u=material.uniforms;u.sun.value.copy(sky.sun);u.earth.value.copy(sky.moon);u.day.value=sky.day;u.earthPower.value=lunar?sky.earthshine:sky.moonlight*.18;u.eye.value.copy(camera.position);camera.getWorldDirection(u.forward.value);u.torch.value=state.flashlight?1:0;u.sunVisibility.value=sunVisibility;updateVehicleLightUniforms(u,state.vehicleLighting);}
  };
}
