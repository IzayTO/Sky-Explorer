import * as THREE from './three.module.js';
// Orthographic overlay: object axes keep their true relative orientation while
// avoiding perspective stretching and the main camera's near clipping plane.
export class BuildGizmo{
 constructor(camera,canvas,onRotate){Object.assign(this,{camera,canvas,onRotate});this.scene=new THREE.Scene();this.view=new THREE.OrthographicCamera(-1,1,1,-1,.1,2000);this.view.position.z=1000;this.view.updateMatrixWorld();this.root=new THREE.Group();this.root.visible=false;this.scene.add(this.root);this.rings=[];this.pickers=[];this.ray=new THREE.Raycaster();this.mouse=new THREE.Vector2();this.center=new THREE.Vector3();this.screen=new THREE.Vector3();this.size=new THREE.Vector3();this.drag=null;
  for(const [axis,color,rot] of [['x',0xe5a18f,[0,Math.PI/2,0]],['y',0x98d9ba,[Math.PI/2,0,0]],['z',0x98bdea,[0,0,0]]]){const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.017,6,96),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,depthTest:false,depthWrite:false,toneMapped:false}));ring.rotation.set(...rot);ring.userData.axis=axis;ring.renderOrder=10000;ring.frustumCulled=false;this.root.add(ring);this.rings.push(ring);const pick=new THREE.Mesh(new THREE.TorusGeometry(1,.11,6,72),new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));pick.rotation.copy(ring.rotation);pick.userData.axis=axis;this.root.add(pick);this.pickers.push(pick);}
  for(const [type,handler] of [['pointerdown',e=>this.begin(e)],['pointermove',e=>this.move(e)],['pointerup',e=>this.end(e)],['pointercancel',e=>this.end(e)],['lostpointercapture',e=>this.end(e)]])canvas.addEventListener(type,handler,{capture:true});
 }
 attach(){this.cancel();}
 update(preview,visible,axis='y',upright=false){this.root.visible=!!preview&&visible;if(!this.root.visible){this.cancel();return;}this.axis=axis;preview.updateMatrixWorld(true);preview.geometry.boundingBox.getCenter(this.center).applyMatrix4(preview.matrixWorld);if(preview.userData.foundation)this.center.y=preview.position.y;
  this.screen.copy(this.center).project(this.camera);if(this.screen.z>1||this.screen.z< -1){this.root.visible=false;return;}
  const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;this.view.left=-w/2;this.view.right=w/2;this.view.top=h/2;this.view.bottom=-h/2;this.view.updateProjectionMatrix();
  const radius=Math.min(h*.23,Math.max(56,Math.min(100,h*.15)));this.root.position.set(this.screen.x*w/2,this.screen.y*h/2,0);this.root.scale.setScalar(radius);this.root.quaternion.copy(this.camera.quaternion).invert().multiply(preview.quaternion);this.root.updateMatrixWorld(true);
  this.pickers.forEach(r=>r.visible=!upright||r.userData.axis==='y');this.rings.forEach(r=>{r.visible=!upright||r.userData.axis==='y';r.material.opacity=r.userData.axis===axis?.95:.58;});
 }
 render(renderer){if(!this.root.visible)return;const clear=renderer.autoClear;renderer.autoClear=false;renderer.render(this.scene,this.view);renderer.autoClear=clear;}
 consume(e){e.preventDefault();e.stopImmediatePropagation();}
 setRay(e){const b=this.canvas.getBoundingClientRect();this.mouse.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);this.ray.setFromCamera(this.mouse,this.view);return b;}
 begin(e){if(!this.root.visible||e.button!==0||this.drag)return;const b=this.setRay(e),hit=this.ray.intersectObjects(this.pickers.filter(p=>p.visible),false)[0];if(!hit)return;this.consume(e);const axis=hit.object.userData.axis,normal=new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0).applyQuaternion(this.root.quaternion),center=this.root.position.clone(),start=hit.point.clone().sub(center).normalize();this.drag={id:e.pointerId,axis,normal,center,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,center),start,previous:0,x:e.clientX,y:e.clientY,edgeOn:Math.abs(normal.z)<.18};this.canvas.setPointerCapture(e.pointerId);this.onRotate(axis,0);}
 move(e){const d=this.drag;if(d?.id!==e.pointerId)return;this.consume(e);this.setRay(e);let delta;
  if(d.edgeOn){const tangent=new THREE.Vector3().crossVectors(d.normal,d.start).normalize();const dx=e.clientX-d.x,dy=-(e.clientY-d.y);delta=(dx*tangent.x+dy*tangent.y)/Math.max(45,this.root.scale.x);d.x=e.clientX;d.y=e.clientY;}
  else{const point=this.ray.ray.intersectPlane(d.plane,new THREE.Vector3());if(!point)return;const dir=point.sub(d.center).normalize(),angle=Math.atan2(new THREE.Vector3().crossVectors(d.start,dir).dot(d.normal),d.start.dot(dir));delta=Math.atan2(Math.sin(angle-d.previous),Math.cos(angle-d.previous));d.previous=angle;}
  this.onRotate(d.axis,delta);
 }
 end(e){if(this.drag?.id!==e.pointerId)return;this.consume(e);this.cancel();}
 cancel(){if(!this.drag)return;const id=this.drag.id;this.drag=null;if(this.canvas.hasPointerCapture?.(id))this.canvas.releasePointerCapture(id);}
}
