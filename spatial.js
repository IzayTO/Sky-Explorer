import * as THREE from './three.module.js';
const EPS=1e-7;
export function orientedBox(box,matrix){
 const center=box.getCenter(new THREE.Vector3()).applyMatrix4(matrix),half=box.getSize(new THREE.Vector3()).multiplyScalar(.5),axes=[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(matrix,i));
 axes.forEach((axis,i)=>{half.setComponent(i,half.getComponent(i)*axis.length());axis.normalize();});
 const extent=new THREE.Vector3();for(let i=0;i<3;i++){extent.x+=Math.abs(axes[i].x)*half.getComponent(i);extent.y+=Math.abs(axes[i].y)*half.getComponent(i);extent.z+=Math.abs(axes[i].z)*half.getComponent(i);}
 return {center,half,axes,bounds:new THREE.Box3(center.clone().sub(extent),center.clone().add(extent))};
}
export function boxesOverlap(a,b,tolerance=.025){
 if(!a.bounds.intersectsBox(b.bounds))return false;
 const delta=b.center.clone().sub(a.center),axes=[...a.axes,...b.axes];for(const x of a.axes)for(const y of b.axes){const n=new THREE.Vector3().crossVectors(x,y);if(n.lengthSq()>EPS)axes.push(n.normalize());}
 for(const n of axes){let ra=0,rb=0;for(let i=0;i<3;i++){ra+=a.half.getComponent(i)*Math.abs(a.axes[i].dot(n));rb+=b.half.getComponent(i)*Math.abs(b.axes[i].dot(n));}if(ra+rb-Math.abs(delta.dot(n))<=tolerance)return false;}
 return true;
}
export function entityBoxes(geometry,matrix){return (geometry.userData.colliders||geometry.userData.boxes.map(box=>({box,matrix:new THREE.Matrix4()}))).map(part=>orientedBox(part.box,new THREE.Matrix4().multiplyMatrices(matrix,part.matrix)));}
export function rayBox(origin,direction,box,limit=Infinity){
 let near=-Infinity,far=Infinity;const delta=origin.clone().sub(box.center);
 for(let i=0;i<3;i++){const o=delta.dot(box.axes[i]),d=direction.dot(box.axes[i]),half=box.half.getComponent(i);if(Math.abs(d)<EPS){if(Math.abs(o)>half)return null;continue;}const a=(-half-o)/d,b=(half-o)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return null;}
 return far>Math.max(near,.003)&&near<limit?Math.max(0,near):null;
}
