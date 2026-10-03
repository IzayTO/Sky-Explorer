import * as THREE from './three.module.js';
import {clamp} from './sky.js?v=2.3';

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
    this.camera=camera;this.canvas=canvas;this.onStep=onStep;this.onBoundary=onBoundary;this.enabled=false;this.keys=new Set();this.joy={x:0,y:0};this.pos=new THREE.Vector3(0,1.68,0);this.yaw=-Math.PI/2+.06;this.pitch=.085;this.speed=1;this.drag=null;this.joyId=null;this.velocity=new THREE.Vector2();this.distance=0;this.stepAt=0;this.sway=true;this.sensitivity=1;this.boundaryAt=0;this.lookTween=null;this.roll=0;this.bob=0;this.gravity=9.80665;this.groundHeight=()=>0;this.verticalSpeed=0;this.grounded=true;this.jumpQueued=false;this.landingDip=0;this.driver=null;this.sprintHeld=false;this.actionPointers=new Map();
    const focus=()=>document.getElementById('world').focus({preventScroll:true});
    canvas.addEventListener('pointerdown',e=>{if(!this.enabled||this.drag||e.button!==0)return;focus();this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);this.lookTween=null;e.preventDefault();});
    canvas.addEventListener('pointermove',e=>{if(!this.enabled)return;const locked=document.pointerLockElement===canvas;if(!locked&&this.drag?.id!==e.pointerId)return;const dx=locked?e.movementX:e.clientX-this.drag.x,dy=locked?e.movementY:e.clientY-this.drag.y;this.yaw+=dx*.0032*this.sensitivity;this.pitch=clamp(this.pitch-dy*.0032*this.sensitivity,-1.54,1.54);this.lookTween=null;if(this.drag){this.drag.x=e.clientX;this.drag.y=e.clientY;}this.onLook?.();e.preventDefault();});
    const release=e=>{if(this.drag?.id===e.pointerId)this.drag=null;};['pointerup','pointercancel','lostpointercapture'].forEach(t=>canvas.addEventListener(t,release));
    canvas.addEventListener('dblclick',()=>{if(!this.enabled||matchMedia('(pointer:coarse)').matches)return;if(document.pointerLockElement)document.exitPointerLock();else{try{const p=canvas.requestPointerLock?.();p?.catch?.(()=>{});}catch{}}});
    window.addEventListener('keydown',e=>{if(!this.enabled||e.ctrlKey||e.metaKey||e.altKey)return;const tag=e.target.tagName;if(e.target.isContentEditable||tag==='TEXTAREA'||tag==='SELECT'||(tag==='INPUT'&&!['range','checkbox'].includes(e.target.type)))return;if(e.code.startsWith('Arrow')&&tag==='INPUT')return;
      if(e.code==='Space'&&tag!=='BUTTON'&&tag!=='INPUT'){e.preventDefault();if(!e.repeat)this.jump();focus();}
      if(['KeyW','KeyA','KeyS','KeyD','KeyQ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();this.keys.add(e.code);focus();}
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
  bindActionButton(el,action,hold=false){
    let pointer=null,lastX=0,lastY=0;
    const stop=e=>{if(pointer!==e.pointerId)return;const id=pointer;pointer=null;this.actionPointers.delete(id);if(hold)action(false);el.classList.remove('held');if(el.hasPointerCapture(id))el.releasePointerCapture(id);};
    el.addEventListener('pointerdown',e=>{if(!this.enabled||pointer!==null||e.button!==0)return;pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;el.setPointerCapture(pointer);el.classList.add('held');this.actionPointers.set(pointer,()=>stop({pointerId:pointer}));action(true);document.getElementById('world').focus({preventScroll:true});e.preventDefault();e.stopPropagation();});
    el.addEventListener('pointermove',e=>{if(e.pointerId!==pointer||!this.enabled)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;this.yaw+=dx*.0032*this.sensitivity;this.pitch=clamp(this.pitch-dy*.0032*this.sensitivity,-1.54,1.54);this.lookTween=null;e.preventDefault();});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>el.addEventListener(type,stop));
    // Native keyboard/assistive activation; pointer clicks have already fired.
    el.addEventListener('click',e=>{if(e.detail===0&&this.enabled){action(true);if(hold)action(false);}});
  }
  resetInput(){this.sprintHeld=false;for(const release of [...this.actionPointers.values()])release();this.driver?.resetInput();this.jumpQueued=false;this.keys.clear();this.releaseJoystick();const id=this.drag?.id;this.drag=null;if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.velocity.set(0,0);}
  aim(direction){this.lookTween={yaw:this.yaw,pitch:this.pitch,targetYaw:Math.atan2(direction.x,-direction.z),targetPitch:Math.asin(clamp(direction.y,-1,1)),elapsed:0};this.resetInput();}
  setEnvironment(heightAt,gravity){this.groundHeight=heightAt||(()=>0);this.gravity=gravity;this.resetPosition();}
  jump(){if(!this.enabled)return;if(this.driver){this.driver.jump();return;}if(this.grounded)this.jumpQueued=true;}
  resetPosition(){this.pos.set(0,this.groundHeight(0,0)+1.68,0);this.verticalSpeed=0;this.grounded=true;this.landingDip=0;this.resetInput();}
  update(dt){
    if(this.lookTween){const a=this.lookTween;a.elapsed+=dt;const t=clamp(a.elapsed/.85);const k=t*t*(3-2*t);const delta=Math.atan2(Math.sin(a.targetYaw-a.yaw),Math.cos(a.targetYaw-a.yaw));this.yaw=a.yaw+delta*k;this.pitch=a.pitch+(a.targetPitch-a.pitch)*k;if(t>=1)this.lookTween=null;}
    let f=0,s=0,turn=0;if(this.enabled){const k=this.keys;f=(k.has('KeyW')||k.has('ArrowUp')?1:0)-(k.has('KeyS')||k.has('ArrowDown')?1:0)+this.joy.y;s=(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0)+this.joy.x;turn=(k.has('ArrowRight')?1:0)-(k.has('KeyQ')||k.has('ArrowLeft')?1:0);}
    const sprint=this.enabled&&(this.sprintHeld||this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'));
    if(this.driver){this.driver.drive(dt,this,clamp(f,-1,1),clamp(s+turn,-1,1),sprint);return 0;}
    const length=Math.hypot(f,s);if(length>1){f/=length;s/=length;}this.yaw+=turn*dt*1.3*Math.max(this.sensitivity,.12);
    const targetX=(Math.sin(this.yaw)*f+Math.cos(this.yaw)*s)*2.05*this.speed*(sprint?2.25:1),targetZ=(-Math.cos(this.yaw)*f+Math.sin(this.yaw)*s)*2.05*this.speed*(sprint?2.25:1);
    const response=1-Math.exp(-dt*11);this.velocity.x+=(targetX-this.velocity.x)*response;this.velocity.y+=(targetZ-this.velocity.y)*response;
    let nx=this.pos.x+this.velocity.x*dt,nz=this.pos.z+this.velocity.y*dt;const r=Math.hypot(nx,nz),limit=600;if(r>limit){nx*=limit/r;nz*=limit/r;if(performance.now()-this.boundaryAt>5500){this.boundaryAt=performance.now();this.onBoundary?.();}}
    if(this.resolveMovement){const resolved=this.resolveMovement(nx,nz);nx=resolved.x;nz=resolved.z;}
    let walked=Math.hypot(nx-this.pos.x,nz-this.pos.z);
    const previousGround=this.groundHeight(this.pos.x,this.pos.z),nextGround=this.groundHeight(nx,nz);
    // Walkable slopes; an abrupt ledge cannot push the capsule up a wall.
    if(nextGround-previousGround>Math.max(.26,walked*1.15)&&nextGround>this.pos.y-1.42){nx=this.pos.x;nz=this.pos.z;walked=0;this.velocity.multiplyScalar(.3);}
    this.pos.x=nx;this.pos.z=nz;const floor=this.groundHeight(nx,nz);
    if(this.jumpQueued&&this.grounded&&this.enabled){this.verticalSpeed=3.25;this.grounded=false;this.onJump?.();}this.jumpQueued=false;
    if(this.grounded){if(this.pos.y-1.68-floor>.32){this.grounded=false;this.verticalSpeed=0;}else this.pos.y=floor+1.68;}
    if(!this.grounded&&dt>0){const steps=Math.ceil(dt/(1/120)),step=dt/steps;for(let i=0;i<steps;i++){
      this.pos.y+=this.verticalSpeed*step-.5*this.gravity*step*step;this.verticalSpeed-=this.gravity*step;
      if(this.pos.y<=floor+1.68&&this.verticalSpeed<0){const impact=-this.verticalSpeed;this.pos.y=floor+1.68;this.verticalSpeed=0;this.grounded=true;this.landingDip=this.sway?-Math.min(.05,impact*.007):0;this.stepAt=this.distance;this.onLand?.(impact);break;}
    }}
    this.landingDip*=Math.exp(-dt*13);if(this.grounded)this.distance+=walked;
    if(this.grounded&&this.distance-this.stepAt>.94&&walked>.0005){this.onStep?.(this.speed);this.stepAt=this.distance;}
    const moving=dt>0&&this.grounded?clamp(walked/dt/2):0,steadiness=Math.min(1,this.sensitivity*4);
    const gait=this.distance*Math.PI/.94;
    const roll=this.sway?Math.sin(gait)*.0055*moving*steadiness:0;
    const bob=this.sway?Math.sin(gait*2)*.012*moving*steadiness:0;
    // Under a third of a degree, alternating feet, and a quick damped return.
    // The telescope attenuates motion rather than magnifying the sway.
    const settle=1-Math.exp(-dt*(length>.01&&this.sway?15:23));
    this.roll+=(roll-this.roll)*settle;this.bob+=(bob-this.bob)*settle;
    this.camera.position.set(this.pos.x,this.pos.y+this.bob+this.landingDip,this.pos.z);this.camera.rotation.order='YXZ';this.camera.rotation.set(this.pitch,-this.yaw,this.roll,'YXZ');
    return walked;
  }
}
