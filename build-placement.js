import * as THREE from './three.module.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z), TAU=Math.PI*2;
const walls=new Set(['wall','window','door','corner','column']);
const tiles=new Set(['floor','roof','foundation']);
const upright=r=>Math.abs(Math.sin(r.x))<.001&&Math.abs(Math.sin(r.z))<.001;
const quarter=r=>upright(r)&&Math.abs(Math.sin(r.y*2))<.001;
export function footprint(item,params={}){return [params.width||item.size[0],params.depth||params.run||item.size[2]];}
function local(point,entity){return point.clone().sub(entity.position).applyAxisAngle(V(0,1,0),-entity.rotation.y);}
function worldPoint(point,entity){return point.clone().applyAxisAngle(V(0,1,0),entity.rotation.y).add(entity.position);}
function top(e){return e.position.y+(e.item.kind==='foundation'?0:e.item.size[1]);}
function nearestFloor(world,point){const options=world.entities.filter(e=>['floor','foundation'].includes(e.item.kind)&&upright(e.rotation));const score=e=>{const p=local(point,e),[w,d]=footprint(e.item,e.params),outside=Math.hypot(Math.max(0,Math.abs(p.x)-w/2),Math.max(0,Math.abs(p.z)-d/2));return outside*10+(e.item.kind==='foundation'?2:0)+Math.abs(point.y-top(e))*.01;};return options.sort((a,b)=>score(a)-score(b))[0];}
function supportRay(world,camera,direction){if(direction.y>=-.001)return null;let best=null;for(const e of world.entities){if(!tiles.has(e.item.kind)||e.item.kind==='roof'||!upright(e.rotation))continue;const t=(top(e)-camera.position.y)/direction.y;if(t<.1||t>18)continue;const p=camera.position.clone().addScaledVector(direction,t),q=local(p,e),[w,d]=footprint(e.item,e.params);if(Math.abs(q.x)>w/2+.14||Math.abs(q.z)>d/2+.14)continue;if(!best||t<best.distance)best={point:p,normal:V(0,1,0),entity:e,distance:t};}return best;}

function cell(point,w,d,frame,rot){
 const origin=frame?worldPoint(V(-footprint(frame.item,frame.params)[0]/2,0,-footprint(frame.item,frame.params)[1]/2),frame):V();
 const yaw=frame?.rotation.y||0,p=point.clone().sub(origin).applyAxisAngle(V(0,1,0),-yaw),a=rot.y-yaw;
 const sx=Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*d,sz=Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*d;
 p.x=Math.round((p.x-sx/2)/sx)*sx+sx/2;p.z=Math.round((p.z-sz/2)/sz)*sz+sz/2;
 const out=p.applyAxisAngle(V(0,1,0),yaw).add(origin);point.x=out.x;point.z=out.z;return point;
}
function edge(point,e){const p=local(point,e),[w,d]=footprint(e.item,e.params);const candidates=[{axis:'x',sign:-1,distance:Math.abs(p.x+w/2)},{axis:'x',sign:1,distance:Math.abs(p.x-w/2)},{axis:'z',sign:-1,distance:Math.abs(p.z+d/2)},{axis:'z',sign:1,distance:Math.abs(p.z-d/2)}];return {...candidates.sort((a,b)=>a.distance-b.distance)[0],p,w,d};}
function neighbor(position,item,rotation,e,point){const pick=edge(point,e),[w,d]=footprint(item),a=rotation.y-e.rotation.y,hx=(Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*d)/2,hz=(Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*d)/2;
 const p=pick.p;p.x=Math.round((p.x+pick.w/2-hx)/(hx*2))*hx*2-pick.w/2+hx;p.z=Math.round((p.z+pick.d/2-hz)/(hz*2))*hz*2-pick.d/2+hz;if(hx<=pick.w/2)p.x=Math.max(-pick.w/2+hx,Math.min(pick.w/2-hx,p.x));if(hz<=pick.d/2)p.z=Math.max(-pick.d/2+hz,Math.min(pick.d/2-hz,p.z));
 if(pick.axis==='x')p.x=pick.sign*(pick.w/2+hx);else p.z=pick.sign*(pick.d/2+hz);p.y=0;position.copy(worldPoint(p,e));return position;
}
function roofRay(world,camera,direction){
 // The upper plane of a room is a generous aiming target. Looking through an
 // unfinished ceiling no longer requires hitting a few pixels of wall trim.
 let best=null;
 for(const wall of world.entities){if(!walls.has(wall.item.kind)||wall.item.size[1]<2||!upright(wall.rotation)||Math.abs(direction.y)<.001)continue;
  const y=top(wall),t=(y-camera.position.y)/direction.y;if(t<.1||t>18)continue;const p=camera.position.clone().addScaledVector(direction,t),floor=nearestFloor(world,p);if(!floor)continue;
  const q=local(p,floor),[fw,fd]=footprint(floor.item,floor.params);if(Math.abs(q.x)>fw/2+.16||Math.abs(q.z)>fd/2+.16||Math.abs(top(floor)-wall.position.y)>.3||wall.position.distanceTo(floor.position)>Math.hypot(fw,fd)+2)continue;
  if(!best||t<best.distance)best={point:p,normal:V(0,-1,0),entity:wall,distance:t,roofPlane:true,frame:floor};
 }return best;
}
function adaptiveRamp(world,hit){
 const e=hit.entity;if(!e||!tiles.has(e.item.kind))return {valid:false,reason:'Apunta al borde de un cimiento o un piso.'};
 const pick=edge(hit.point,e),p=pick.p,normal=V();if(pick.axis==='x'){p.x=pick.sign*pick.w/2;p.z=Math.max(-pick.d/2+1,Math.min(pick.d/2-1,Math.round(p.z)));normal.x=pick.sign;}else{p.z=pick.sign*pick.d/2;p.x=Math.max(-pick.w/2+1,Math.min(pick.w/2-1,Math.round(p.x)));normal.z=pick.sign;}p.y=0;
 const upper=worldPoint(p,e);upper.y=top(e);normal.applyAxisAngle(V(0,1,0),e.rotation.y);let chosen=null;
 for(let run=2;run<=48;run+=.5){const end=upper.clone().addScaledVector(normal,run),bottom=world.ground(end.x,end.z)+.025,rise=upper.y-bottom;if(rise<.06||rise/run>.40)continue;let clear=true;const profile=[];
  for(let i=0;i<=24;i++){const distance=run*i/24,s=upper.clone().addScaledVector(normal,distance);const ground=world.ground(s.x,s.z);if(ground>upper.y-rise*i/24+.025){clear=false;break;}profile.push(ground-bottom-.06);}if(clear){chosen={run,rise,bottom,end,profile};break;}
 }if(!chosen)return {valid:false,reason:'Este borde necesita una rampa de más de 48 m; elige una ladera menos profunda.'};
 const position=upper.clone().addScaledVector(normal,chosen.run/2);position.y=chosen.bottom;
 return {valid:true,position,rotation:new THREE.Euler(0,Math.atan2(normal.x,normal.z),0),params:{run:chosen.run,rise:chosen.rise,profile:chosen.profile,snapped:true},hit};
}
export function placement(world,item,camera,rotation,dimensions={}){
 if(dimensions.locked)return {valid:true,reason:'',position:dimensions.locked.position.clone(),rotation:rotation.clone(),params:{...dimensions.locked.params},hit:dimensions.locked.hit};
 const direction=camera.getWorldDirection(V());let hit=world.raycast(camera.position,direction,18);const rot=rotation.clone(),magnet=dimensions.magnet!==false;
 if(item.kind==='roof'&&magnet){const plane=roofRay(world,camera,direction);if(plane&&(!hit||plane.distance<hit.distance-.03))hit=plane;}
 if(magnet&&walls.has(item.kind)){const surface=supportRay(world,camera,direction);if(surface&&(!hit||surface.distance<=hit.distance+.02))hit=surface;}
 if(!hit)return {valid:false,reason:item.kind==='roof'?'Mira el borde superior de una pared o el hueco del techo.':'Mira una superficie cercana.'};
 if(item.id==='ramp-adaptive')return adaptiveRamp(world,hit);
 const position=hit.point.clone();let params={},valid=true,reason='';const target=hit.entity,kind=item.kind;
 if(kind==='foundation'){
  rot.x=rot.z=0;if(magnet&&!dimensions.rotationTouched&&target?.item.kind==='foundation')rot.y=target.rotation.y;position.x=Math.round(position.x*2)/2;position.z=Math.round(position.z*2)/2;
  const snap=magnet?world.snapFoundation(position,rot,dimensions.width,dimensions.depth,hit):null;if(snap){position.x=snap.x;position.z=snap.z;}
  params=world.foundationParams(position,rot,dimensions.width,dimensions.depth);if(snap){const automatic=position.y,low=automatic+.25-params.fill;if(automatic-.22>snap.y-.02){valid=false;reason='El terreno sobrepasa este nivel; amplía hacia otra zona.';}position.y=snap.y;params.fill=Math.max(.3,snap.y-low+.25);params.snapped=true;}
 }else if(item.surface==='wall'){
  if(!target||Math.abs(hit.normal.y)>.35){valid=false;reason='Acerca la mira a una pared.';}
  if(!dimensions.rotationTouched)rot.set(0,Math.atan2(hit.normal.x,hit.normal.z),0);position.addScaledVector(hit.normal,.012);position.y-=item.size[1]/2;
 }else if(item.surface==='ceiling'){
  if(!target||hit.normal.y>-.5){valid=false;reason='Mira la parte inferior de una cubierta.';}position.y-=.008;
 }else if(magnet&&upright(rot)&&(!dimensions.rotationTouched||Math.abs(Math.sin((rot.y-(nearestFloor(world,position)?.rotation.y||0))*2))<.001)&&item.category==='Construcción'){
  const frame=hit.frame||nearestFloor(world,position),[w,d]=item.size;
  if(kind==='roof'){
   if(target?.item.kind==='roof'&&!hit.roofPlane){if(!dimensions.rotationTouched)rot.y=target.rotation.y;neighbor(position,item,rot,target,hit.point);position.y=target.position.y;}
   else if(target&&walls.has(target.item.kind)){
    if(!dimensions.rotationTouched)rot.y=frame?.rotation.y||target.rotation.y;position.y=top(target);
    if(!hit.roofPlane){const normal=V(0,0,1).applyAxisAngle(V(0,1,0),target.rotation.y);const cameraSide=Math.sign(camera.position.clone().sub(target.position).dot(normal))||1;const span=(Math.abs(Math.sin(rot.y-target.rotation.y))*item.size[0]+Math.abs(Math.cos(rot.y-target.rotation.y))*item.size[2])/2;const tangent=V(1,0,0).applyAxisAngle(V(0,1,0),target.rotation.y),alongSpan=(Math.abs(Math.cos(rot.y-target.rotation.y))*item.size[0]+Math.abs(Math.sin(rot.y-target.rotation.y))*item.size[2]),space=Math.max(0,(target.item.size[0]-alongSpan)/2),along=Math.max(-space,Math.min(space,hit.point.clone().sub(target.position).dot(tangent)));position.copy(target.position).addScaledVector(normal,cameraSide*span).addScaledVector(tangent,along);position.y=top(target);}
    cell(position,item.size[0],item.size[2],frame,rot);
   }else{valid=false;reason='Apunta a una pared alta, al hueco superior o a otra cubierta.';}
   params.snapped=valid;
  }else if(kind==='floor'){
   if(target?.item.kind==='floor'){if(!dimensions.rotationTouched)rot.y=target.rotation.y;neighbor(position,item,rot,target,hit.point);position.y=target.position.y;}
   else{cell(position,item.size[0],item.size[2],frame,rot);position.y=target&&tiles.has(target.item.kind)?top(target):world.support(position.x,position.z,hit.point.y);}
   params.snapped=!!target;
  }else if(walls.has(kind)&&target&&tiles.has(target.item.kind)){
   const pick=edge(hit.point,target),p=pick.p,along=kind==='column'?0:item.size[0]/2;
   if(!dimensions.rotationTouched)rot.set(0,target.rotation.y+(pick.axis==='x'?Math.PI/2:0),0);
   if(pick.axis==='x'){p.x=pick.sign*pick.w/2;p.z=Math.round((p.z+pick.d/2-along)/2)*2-pick.d/2+along;p.z=Math.max(-pick.d/2+along,Math.min(pick.d/2-along,p.z));}else{p.z=pick.sign*pick.d/2;p.x=Math.round((p.x+pick.w/2-along)/2)*2-pick.w/2+along;p.x=Math.max(-pick.w/2+along,Math.min(pick.w/2-along,p.x));}p.y=0;position.copy(worldPoint(p,target));position.y=top(target);params.snapped=true;
  }else if(walls.has(kind)&&target&&walls.has(target.item.kind)){
   if(!dimensions.rotationTouched)rot.y=target.rotation.y;const p=local(hit.point,target),sign=p.x>=0?1:-1;position.copy(worldPoint(V(sign*(target.item.size[0]+item.size[0])/2,0,0),target));position.y=target.position.y;params.snapped=true;
  }else{position.x=Math.round(position.x*2)/2;position.z=Math.round(position.z*2)/2;position.y=hit.normal.y>.5?world.support(position.x,position.z,hit.point.y):hit.point.y;}
 }else if(hit.normal.y>.5){position.y=world.support(position.x,position.z,hit.point.y);}
 // Lunar construction needs support beneath its actual footprint, not the
 // empty corners of a rotated world-axis bounding rectangle.
 if(world.lunar&&item.structural){const [w,d]=footprint(item,params),checks=walls.has(kind)?[[-w/2+.10,0],[w/2-.10,0]]:[[-w/2+.08,-d/2+.08],[w/2-.08,d/2-.08],[w/2-.08,-d/2+.08],[-w/2+.08,d/2-.08]];
  if(checks.some(([x,z])=>{const p=V(x,0,z).applyAxisAngle(V(0,1,0),rot.y).add(position);return !world.foundationAt(p.x,p.z);})){valid=false;reason='Primero coloca un cimiento que cubra esta pieza.';}
 }
 return {valid,reason,position,rotation:rot,params,hit};
}
