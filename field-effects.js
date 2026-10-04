import * as THREE from './three.module.js';
const V=()=>new THREE.Vector3();
export class LaserPointer{
 constructor(){this.root=new THREE.Group();this.root.visible=false;this.from=V();this.to=V();this.side=V();this.dir=V();this.up=V();this.right=V();this.forward=V();this.eye=V();this.normal=V();this.positions=new Float32Array(66*3);const side=new Float32Array(66),dist=new Float32Array(66),idx=[];for(let i=0;i<=32;i++){side[i*2]=-1;side[i*2+1]=1;if(i<32){const j=i*2;idx.push(j,j+1,j+2,j+1,j+3,j+2);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('beamSide',new THREE.BufferAttribute(side,1));g.setAttribute('beamDistance',new THREE.BufferAttribute(dist,1).setUsage(THREE.DynamicDrawUsage));g.setIndex(idx);
  const m=new THREE.ShaderMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true,toneMapped:false,side:THREE.DoubleSide,vertexShader:'attribute float beamSide,beamDistance;varying float s,d;void main(){s=beamSide;d=beamDistance;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}',fragmentShader:'varying float s,d;void main(){float edge=pow(max(0.,1.-abs(s)),1.7);float fade=1.-smoothstep(8.,55.,d);gl_FragColor=vec4(.25,1.,.65,edge*fade*.58);}'});
  this.beam=new THREE.Mesh(g,m);this.beam.frustumCulled=false;this.beam.renderOrder=3;this.root.add(this.beam);this.spot=new THREE.Mesh(new THREE.CircleGeometry(1,18),new THREE.MeshBasicMaterial({color:0x8cffe0,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));this.spot.renderOrder=4;this.root.add(this.spot);
 }
 attach(scene){scene.add(this.root);}
 update(camera,hit,active){this.root.visible=active;if(!active)return;camera.getWorldDirection(this.forward);this.right.setFromMatrixColumn(camera.matrixWorld,0);this.up.setFromMatrixColumn(camera.matrixWorld,1);this.from.copy(camera.position).addScaledVector(this.right,.20).addScaledVector(this.up,-.17).addScaledVector(this.forward,.32);this.to.copy(hit?.point||this.forward.clone().multiplyScalar(70).add(camera.position));this.dir.copy(this.to).sub(this.from);let length=this.dir.length();this.dir.normalize();const visible=Math.min(length,60);this.eye.copy(camera.position).sub(this.from);this.side.crossVectors(this.dir,this.eye).normalize();if(this.side.lengthSq()<.001)this.side.copy(this.right);const g=this.beam.geometry;
  for(let i=0;i<=32;i++){const distance=visible*i/32,w=.008+distance*.00015;this.to.copy(this.from).addScaledVector(this.dir,distance);for(let j=0;j<2;j++){const k=i*2+j,sign=j?1:-1;g.attributes.position.setXYZ(k,this.to.x+this.side.x*w*sign,this.to.y+this.side.y*w*sign,this.to.z+this.side.z*w*sign);g.attributes.beamDistance.setX(k,distance);}}g.attributes.position.needsUpdate=true;g.attributes.beamDistance.needsUpdate=true;
  this.spot.visible=!!hit&&length<180;if(hit){this.normal.copy(hit.normal||hit.face?.normal||this.up);if(!hit.normal&&hit.object)this.normal.transformDirection(hit.object.matrixWorld);if(this.normal.dot(this.forward)>0)this.normal.negate();this.spot.position.copy(hit.point).addScaledVector(this.normal,.006);this.spot.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),this.normal);this.spot.scale.setScalar(Math.min(.075,.012+length*.0005));this.spot.material.opacity=.85*(1-Math.max(0,(length-60)/120));}
 }
}
export class AstroVisor{
 constructor(hud){this.root=document.createElement('div');this.root.id='astro-visor';this.root.hidden=true;this.root.setAttribute('aria-hidden','true');this.root.innerHTML='<div class="visor-tint"></div><div class="visor-caption">VISOR CELESTE <span>Distancias aproximadas · km</span></div>';hud.append(this.root);this.labels=new Map();this.last=-1;this.point=V();this.visible=[];this.obstacles=[];}
 update(camera,celestial,state,world,time,active){this.root.hidden=!active;if(!active)return;
  if(time-this.last>.2||this.last<0){this.last=time;this.obstacles=[...document.querySelectorAll('.celestial-panel,.top-actions,.brand-button,.moment,.compass,#hotbar,.movement-actions,.scope-actions,#backpack-button,#catalog-button,#exp-action,#exp-readout,#vehicle-status,#beacon-bearing,#lamp-quick')].map(n=>n.hidden?null:n.getBoundingClientRect()).filter(r=>r&&r.width&&r.height).map(r=>({l:r.left-5,r:r.right+5,t:r.top-5,b:r.bottom+5}));const candidates=celestial.visibleTargets(state).map(t=>{this.point.copy(t.direction).transformDirection(camera.matrixWorldInverse);if(this.point.z>=0)return null;this.point.copy(t.direction).multiplyScalar(100).add(camera.position).project(camera);if(Math.abs(this.point.x)>.92||Math.abs(this.point.y)>.80)return null;return {target:t,score:this.point.x*this.point.x+this.point.y*this.point.y};}).filter(Boolean).sort((a,b)=>a.score-b.score);this.visible=[];
   for(const {target} of candidates){if(this.visible.length>=8)break;const obstruction=world.raycast(camera.position,target.direction,700);if(obstruction)continue;this.visible.push(target);if(!this.labels.has(target.id)){const n=document.createElement('div');n.className='astro-label';n.innerHTML='<b></b><span></span><small></small>';this.labels.set(target.id,n);this.root.append(n);}const n=this.labels.get(target.id);n.querySelector('b').textContent=target.name;n.querySelector('span').textContent=Number.isFinite(target.distanceKm)?new Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(target.distanceKm)+' km':target.kind==='star'?'Distancia no disponible':'Distancia no estimada';n.querySelector('small').textContent=target.temperature?'≈ '+target.temperature.toLocaleString('es-MX')+' K · '+(target.kind==='star'?'estrella '+target.type:'temperatura efectiva'):target.description||'Sistema solar';}
  }
  for(const n of this.labels.values())n.hidden=true;
  const occupied=[...this.obstacles];
  for(const target of this.visible){
   this.point.copy(target.direction).transformDirection(camera.matrixWorldInverse);if(this.point.z>=0)continue;
   this.point.copy(target.direction).multiplyScalar(100).add(camera.position).project(camera);
   const x=(this.point.x*.5+.5)*innerWidth,y=(-this.point.y*.5+.5)*innerHeight,n=this.labels.get(target.id);
   if(x<90||x>innerWidth-90||y<16||y>innerHeight-65)continue;
   for(const below of [false,true]){const anchor=y+(below?16:-14),rect={l:x-85,r:x+85,t:below?anchor:anchor-66,b:below?anchor+66:anchor};
    if(rect.t<8||rect.b>innerHeight-60||occupied.some(b=>rect.l<b.r&&rect.r>b.l&&rect.t<b.b&&rect.b>b.t))continue;
    occupied.push(rect);n.hidden=false;n.classList.toggle('label-below',below);n.style.transform=`translate3d(${x}px,${anchor}px,0) translate(-50%,${below?'0':'-100%'})`;break;
   }
  }
 }
}
