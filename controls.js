import * as THREE from './three.module.js';
import {clamp} from './sky.js';

export const cycleHour=value=>((Number(value)%24)+24)%24;
// A native, keyboard-accessible range, with an immediate midnight wrap. While a
// finger is still held at the right edge, ignore native repeat input at that edge.
export function bindTimeLoop(input,onChange){
  let pointer=null,wrapped=false;
  input.addEventListener('pointerdown',e=>{pointer=e.pointerId;wrapped=false;});
  const release=e=>{if(e.pointerId===pointer){pointer=null;wrapped=false;}};
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>input.addEventListener(type,release));
  input.addEventListener('input',()=>{
    let raw=Number(input.value);
    if(wrapped&&pointer!==null){if(raw>.5){input.value=0;return;}wrapped=false;}
    if(raw>=24&&pointer!==null)wrapped=true;
    const hour=cycleHour(raw);input.value=hour;onChange(hour);
  });
}
// Pointer capture, Safari gesture handling, keyboard focus recovery and input
// cancellation follow walk.js in the reference. Movement is now unconstrained
// on a plane, with a 600 m circular safety limit inside an 8 km ground radius.
export class Walker{
  constructor(camera,canvas,onStep,onBoundary){
    this.camera=camera;this.canvas=canvas;this.onStep=onStep;this.onBoundary=onBoundary;this.enabled=false;this.keys=new Set();this.joy={x:0,y:0};this.pos=new THREE.Vector3(0,1.68,0);this.yaw=-Math.PI/2+.06;this.pitch=.085;this.speed=1;this.drag=null;this.joyId=null;this.velocity=new THREE.Vector2();this.distance=0;this.stepAt=0;this.sway=true;this.sensitivity=1;this.boundaryAt=0;this.lookTween=null;this.roll=0;this.bob=0;
    const focus=()=>document.getElementById('world').focus({preventScroll:true});
    canvas.addEventListener('pointerdown',e=>{if(!this.enabled||this.drag||e.button!==0)return;focus();this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);this.lookTween=null;e.preventDefault();});
    canvas.addEventListener('pointermove',e=>{if(!this.enabled)return;const locked=document.pointerLockElement===canvas;if(!locked&&this.drag?.id!==e.pointerId)return;const dx=locked?e.movementX:e.clientX-this.drag.x,dy=locked?e.movementY:e.clientY-this.drag.y;this.yaw+=dx*.0032*this.sensitivity;this.pitch=clamp(this.pitch-dy*.0032*this.sensitivity,-1.54,1.54);this.lookTween=null;if(this.drag){this.drag.x=e.clientX;this.drag.y=e.clientY;}this.onLook?.();e.preventDefault();});
    const release=e=>{if(this.drag?.id===e.pointerId)this.drag=null;};['pointerup','pointercancel','lostpointercapture'].forEach(t=>canvas.addEventListener(t,release));
    canvas.addEventListener('dblclick',()=>{if(!this.enabled||matchMedia('(pointer:coarse)').matches)return;if(document.pointerLockElement)document.exitPointerLock();else{try{const p=canvas.requestPointerLock?.();p?.catch?.(()=>{});}catch{}}});
    window.addEventListener('keydown',e=>{if(!this.enabled||e.ctrlKey||e.metaKey||e.altKey)return;const tag=e.target.tagName;if(e.target.isContentEditable||tag==='TEXTAREA'||tag==='SELECT'||(tag==='INPUT'&&!['range','checkbox'].includes(e.target.type)))return;if(e.code.startsWith('Arrow')&&tag==='INPUT')return;
      if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();this.keys.add(e.code);focus();}
    });window.addEventListener('keyup',e=>this.keys.delete(e.code));window.addEventListener('blur',()=>this.resetInput());window.addEventListener('pagehide',()=>this.resetInput());document.addEventListener('visibilitychange',()=>this.resetInput());
  }
  bindJoystick(el,thumb){
    this.joyEl=el;this.thumb=thumb;
    const update=e=>{const r=el.getBoundingClientRect(),radius=r.width*.31;let x=(e.clientX-r.left-r.width/2)/radius,y=(r.top+r.height/2-e.clientY)/radius;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}const dead=.10,scale=length>dead?(Math.min(1,length)-dead)/(1-dead)/Math.min(1,length):0;this.joy={x:x*scale,y:y*scale};thumb.style.transform=`translate(${x*radius}px,${-y*radius}px)`;};
    el.addEventListener('pointerdown',e=>{if(!this.enabled||this.joyId!==null)return;this.joyId=e.pointerId;thumb.style.transition='none';el.setPointerCapture(e.pointerId);document.getElementById('world').focus({preventScroll:true});update(e);e.preventDefault();});
    el.addEventListener('pointermove',e=>{if(this.enabled&&e.pointerId===this.joyId){update(e);e.preventDefault();}});
    const stop=e=>{if(this.joyId===e.pointerId)this.releaseJoystick();};['pointerup','pointercancel','lostpointercapture'].forEach(t=>el.addEventListener(t,stop));['touchstart','touchmove'].forEach(t=>el.addEventListener(t,e=>e.preventDefault(),{passive:false}));
  }
  releaseJoystick(){const id=this.joyId;this.joyId=null;this.joy={x:0,y:0};if(this.thumb){this.thumb.style.transition='transform 180ms cubic-bezier(.2,.7,.2,1)';this.thumb.style.transform='';}if(id!==null&&this.joyEl?.hasPointerCapture(id))this.joyEl.releasePointerCapture(id);}
  resetInput(){this.keys.clear();this.releaseJoystick();const id=this.drag?.id;this.drag=null;if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.velocity.set(0,0);}
  aim(direction){this.lookTween={yaw:this.yaw,pitch:this.pitch,targetYaw:Math.atan2(direction.x,-direction.z),targetPitch:Math.asin(clamp(direction.y,-1,1)),elapsed:0};this.resetInput();}
  resetPosition(){this.pos.set(0,1.68,0);this.resetInput();}
  update(dt){
    if(this.lookTween){const a=this.lookTween;a.elapsed+=dt;const t=clamp(a.elapsed/.85);const k=t*t*(3-2*t);const delta=Math.atan2(Math.sin(a.targetYaw-a.yaw),Math.cos(a.targetYaw-a.yaw));this.yaw=a.yaw+delta*k;this.pitch=a.pitch+(a.targetPitch-a.pitch)*k;if(t>=1)this.lookTween=null;}
    let f=0,s=0,turn=0;if(this.enabled){const k=this.keys;f=(k.has('KeyW')||k.has('ArrowUp')?1:0)-(k.has('KeyS')||k.has('ArrowDown')?1:0)+this.joy.y;s=(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0)+this.joy.x;turn=(k.has('KeyE')||k.has('ArrowRight')?1:0)-(k.has('KeyQ')||k.has('ArrowLeft')?1:0);}
    const length=Math.hypot(f,s);if(length>1){f/=length;s/=length;}this.yaw+=turn*dt*1.3*Math.max(this.sensitivity,.12);
    const targetX=(Math.sin(this.yaw)*f+Math.cos(this.yaw)*s)*2.05*this.speed,targetZ=(-Math.cos(this.yaw)*f+Math.sin(this.yaw)*s)*2.05*this.speed;
    const response=1-Math.exp(-dt*11);this.velocity.x+=(targetX-this.velocity.x)*response;this.velocity.y+=(targetZ-this.velocity.y)*response;
    let nx=this.pos.x+this.velocity.x*dt,nz=this.pos.z+this.velocity.y*dt;const r=Math.hypot(nx,nz),limit=600;if(r>limit){nx*=limit/r;nz*=limit/r;if(performance.now()-this.boundaryAt>5500){this.boundaryAt=performance.now();this.onBoundary?.();}}
    const walked=Math.hypot(nx-this.pos.x,nz-this.pos.z);this.pos.x=nx;this.pos.z=nz;this.distance+=walked;
    if(this.distance-this.stepAt>.94&&walked>.0005){this.onStep?.(this.speed);this.stepAt=this.distance;}
    const moving=dt>0?clamp(walked/dt/2):0,steadiness=Math.min(1,this.sensitivity*4);
    const gait=this.distance*Math.PI/.94;
    const roll=this.sway?Math.sin(gait)*.0055*moving*steadiness:0;
    const bob=this.sway?Math.sin(gait*2)*.012*moving*steadiness:0;
    // Under a third of a degree, alternating feet, and a quick damped return.
    // The telescope attenuates motion rather than magnifying the sway.
    const settle=1-Math.exp(-dt*(length>.01&&this.sway?15:23));
    this.roll+=(roll-this.roll)*settle;this.bob+=(bob-this.bob)*settle;
    this.camera.position.set(this.pos.x,this.pos.y+this.bob,this.pos.z);this.camera.rotation.order='YXZ';this.camera.rotation.set(this.pitch,-this.yaw,this.roll,'YXZ');
    return walked;
  }
}
