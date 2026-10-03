import * as THREE from './three.module.js';
import {createVehicleModel} from './vehicle-models.js?v=3.0';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export class Vehicle{
  constructor(scene,{lunar=false,heightAt=()=>0,terrain=null}={}){
    this.lunar=lunar;this.heightAt=heightAt;this.terrain=terrain;this.gravity=lunar?1.62:9.80665;
    this.model=createVehicleModel(lunar);this.root=this.model.root;scene.add(this.root);
    this.position=V();this.heading=lunar?-1.8:-1.38;this.pitch=0;this.roll=0;this.speed=0;this.steer=0;this.verticalSpeed=0;this.grounded=true;
    this.mounted=false;this.jumpQueued=false;this.boostHeld=false;this.boostTouch=false;this.boosting=false;this.throttle=0;this.lightMode=0;
    this.lighting={left:V(),right:V(),direction:V(0,0,-1),center:V(),size:V(lunar?.74:.63,.24,lunar?1.28:1.02),heading:this.heading,level:0,reverse:0,rear:V(),rearDirection:V(0,0,1),inverse:new THREE.Matrix4(),wheelShape:new THREE.Vector4(this.model.track*.5,this.model.wheelbase*.5,this.model.radius+.018,lunar?.17:.20),wheelOffsets:new THREE.Vector4()};
    this._surface={height:0,pitch:0,roll:0};this._point=V();this._forward=V();this._view=V();this._seat=V();this._local=V();this._exit=V();this._cameraFrom=V();this._suspension=[0,0,0,0];this.seatBlend=1;this.impact=0;this.lastVisibility=1;this.visibilityTime=0;
    this.parkAt(lunar?-8:-7,lunar?1.8:-2.0);this.updateLighting(0);
  }
  surface(x=this.position.x,z=this.position.z,heading=this.heading){
    const c=Math.cos(heading),s=Math.sin(heading),w=this.model.wheelbase*.5,t=this.model.track*.5;
    const h=this._suspension;let i=0;
    for(let ix=0;ix<2;ix++)for(let iz=0;iz<2;iz++){const dx=ix?t:-t,dz=iz?w:-w;h[i++]=this.heightAt(x+c*dx-s*dz,z+s*dx+c*dz);}
    const mean=(h[0]+h[1]+h[2]+h[3])*.25;
    const result=this._surface;result.height=Math.max(mean+this.model.radius,this.heightAt(x,z)+.22);result.pitch=clamp(Math.atan2((h[0]+h[2]-h[1]-h[3])*.5,w*2),-.64,.64);result.roll=clamp(Math.atan2((h[2]+h[3]-h[0]-h[1])*.5,t*2),-.55,.55);return result;
  }
  parkAt(x,z){this.position.set(x,0,z);const ground=this.surface();this.position.y=ground.height;this.pitch=ground.pitch;this.roll=ground.roll;this.speed=0;this.verticalSpeed=0;this.grounded=true;this.applyPose(0);}
  canEnter(camera,walker){
    if(this.mounted||walker.driver||!walker.enabled||!walker.grounded)return false;
    const dx=camera.position.x-this.position.x,dz=camera.position.z-this.position.z,c=Math.cos(this.heading),s=Math.sin(this.heading);
    const x=c*dx+s*dz,z=-s*dx+c*dz,hx=this.model.track*.5+.2,hz=this.model.wheelbase*.5+.3;
    const outside=Math.hypot(Math.max(0,Math.abs(x)-hx),Math.max(0,Math.abs(z)-hz));
    return outside<=1.4&&Math.abs(camera.position.y-1.68-this.position.y)<1.5;
  }
  promptPosition(target){return this.root.localToWorld(target.set(this.lunar?-.1:0,1.12,this.lunar?.04:.20));}

  mount(walker){
    this.mounted=true;this.personalTorch=false;this.speed=0;this.boostHeld=false;this.boostTouch=false;this.boosting=false;this.jumpQueued=false;
    this._cameraFrom.copy(walker.camera.position);this.seatBlend=0;
    walker.resetInput();walker.lookTween=null;walker.driver=this;walker.verticalSpeed=0;walker.bob=walker.roll=0;
    // Face the controls initially, then keep mouse/touch look independent.
    walker.yaw=this.heading;walker.pitch=.025;
  }
  dismount(walker,force=false){
    if(!this.mounted)return true;
    if(!force&&!this.grounded)return false;
    const c=Math.cos(this.heading),s=Math.sin(this.heading),base=this.model.track*.5+.95;
    let best=Infinity;
    for(const side of [-1,1])for(const dz of [.1,.8,-.5]){
      const x=this.position.x+c*base*side-s*dz,z=this.position.z+s*base*side+c*dz;
      if(Math.hypot(x,z)>598.5)continue;
      const h=this.heightAt(x,z),slope=Math.abs(this.heightAt(x+.35,z)-this.heightAt(x-.35,z))+Math.abs(this.heightAt(x,z+.35)-this.heightAt(x,z-.35));
      const score=slope+Math.abs(h+this.model.radius-this.position.y)*.4+(side<0?0:.12);
      if(score<best){best=score;this._exit.set(x,h+1.68,z);}
    }
    if(!Number.isFinite(best))this._exit.set(this.position.x*.985,this.heightAt(this.position.x*.985,this.position.z*.985)+1.68,this.position.z*.985);
    this.mounted=false;this.speed=0;this.boostHeld=false;this.boostTouch=false;this.boosting=false;this.jumpQueued=false;walker.driver=null;walker.pos.copy(this._exit);walker.verticalSpeed=0;walker.grounded=true;walker.pitch=-.04;walker.bob=walker.roll=walker.landingDip=0;walker.resetInput();return true;
  }
  jump(){if(this.mounted&&this.grounded)this.jumpQueued=true;}
  setBoost(held){this.boostTouch=Boolean(held)&&this.mounted;}
  cycleLights(){this.lightMode=(this.lightMode+1)%3;return this.lightMode;}
  resetInput(){this.jumpQueued=false;this.boostHeld=false;this.boostTouch=false;this.boosting=false;this.throttle=0;}
  drive(dt,walker,forward,steering,boost){
    this.boostHeld=Boolean(boost||this.boostTouch)&&walker.enabled;
    const before=this.heading;this.integrate(dt,forward,steering,walker.enabled);
    walker.yaw+=this.heading-before;
    walker.pos.copy(this.root.localToWorld(this._seat.copy(this.model.seat)));
    this.seatBlend=Math.min(1,this.seatBlend+dt*3.2);const t=this.seatBlend*this.seatBlend*(3-2*this.seatBlend);
    walker.camera.position.lerpVectors(this._cameraFrom,walker.pos,t);
    const comfort=walker.sway?Math.min(1,walker.sensitivity*3):0;
    walker.camera.position.y-=this.impact*.023*comfort;
    walker.camera.rotation.set(walker.pitch+this.pitch*.32*comfort,-walker.yaw,this.roll*.20*comfort,'YXZ');
    walker.grounded=this.grounded;
    if(this.landed){walker.onLand?.(this.landed*.65);this.landed=0;}
    if(this.jumped){walker.onJump?.();this.jumped=false;}
  }
  integrate(dt,throttle=0,steering=0,enabled=true){
    if(dt<=0){this.applyPose(0);return;}
    if(!enabled){throttle=0;steering=0;this.boostHeld=false;this.boostTouch=false;}
    this.throttle=throttle;this.boosting=this.mounted&&enabled&&this.boostHeld&&throttle>0;
    this.impact*=Math.exp(-dt*9);
    if(!this.mounted&&Math.abs(this.speed)<.001&&this.grounded&&!this.jumpQueued)return;
    const substeps=Math.ceil(dt*120),step=dt/substeps;
    for(let i=0;i<substeps;i++){
      const limit=(this.lunar?7.5:12.0)*(this.boosting?2.6:1),reverse=this.lunar?3.2:4.2;
      const desired=clamp(throttle,-1,1)*(throttle<0?reverse:limit);
      const acceleration=this.grounded?(this.lunar?3.7:6.0)*(this.boosting?3.4:1):.22;
      const braking=throttle===0?(enabled?3.6:8):Math.sign(desired)!==Math.sign(this.speed)?9:acceleration;
      this.speed+=clamp(desired-this.speed,-braking*step,braking*step);
      this.steer=damp(this.steer,clamp(steering,-1,1)*.56/(1+Math.pow(Math.abs(this.speed)/8,1.3)),7,step);
      const oldX=this.position.x,oldZ=this.position.z,oldHeading=this.heading;
      this.heading+=this.speed/this.model.wheelbase*Math.tan(this.steer)*step*(this.grounded?1:.15);
      this.position.x+=Math.sin(this.heading)*this.speed*step;this.position.z-=Math.cos(this.heading)*this.speed*step;
      const r=Math.hypot(this.position.x,this.position.z);
      if(r>597){this.position.x*=597/r;this.position.z*=597/r;this.speed*=.65;}
      const ground=this.surface(),travel=Math.abs(this.speed*step);
      // Reject walls rather than lifting the vehicle instantaneously up them.
      if(ground.height-this.position.y>Math.max(.16,travel*1.15)&&this.grounded){this.position.x=oldX;this.position.z=oldZ;this.heading=oldHeading;this.speed*=.45;continue;}
      if(this.jumpQueued&&this.grounded&&enabled){this.verticalSpeed=3.4;this.grounded=false;this.jumped=true;}this.jumpQueued=false;
      if(this.grounded){
        if(this.position.y-ground.height>.065){this.grounded=false;this.verticalSpeed=0;}
        else this.position.y=ground.height;
      }
      if(!this.grounded){
        this.position.y+=this.verticalSpeed*step-.5*this.gravity*step*step;this.verticalSpeed-=this.gravity*step;
        if(this.position.y<=ground.height&&this.verticalSpeed<=0){this.landed=-this.verticalSpeed;this.impact=Math.min(2,this.landed*.22);this.position.y=ground.height;this.verticalSpeed=0;this.grounded=true;}
      }
      this.pitch=damp(this.pitch,this.grounded?ground.pitch:0,this.grounded?12:1.3,step);this.roll=damp(this.roll,this.grounded?ground.roll:0,8,step);
    }
    this.applyPose(dt);
  }
  applyPose(dt){
    this.root.position.copy(this.position);this.root.rotation.set(this.pitch,-this.heading,this.roll,'YXZ');this.root.updateMatrixWorld(true);
    for(const w of this.model.wheels){
      w.pivot.rotation.y=w.front?-this.steer:0;w.mesh.rotation.x-=this.speed*dt/this.model.radius;
      this._point.set(w.x,0,w.z);this.root.localToWorld(this._point);
      const offset=this.grounded?clamp(this.heightAt(this._point.x,this._point.z)+this.model.radius-this._point.y,-.16,.16):-.05;
      w.pivot.position.y=damp(w.pivot.position.y,offset,16,dt);
    }
    if(this.lunar)this.model.steering.rotation.z=this.steer*1.7;else this.model.steering.rotation.y=-this.steer;
    this.root.updateMatrixWorld(true);
  }
  updateLighting(dt){
    const l=this.lighting;l.level=damp(l.level,this.lightMode,14,dt);l.heading=this.heading;
    this.root.localToWorld(l.left.copy(this.model.lamps[0]));this.root.localToWorld(l.right.copy(this.model.lamps[1]));
    l.direction.set(0,this.lightMode===2?-.065:-.18,-1).normalize().transformDirection(this.root.matrixWorld);
    l.center.copy(this.position);
    l.inverse.copy(this.root.matrixWorld).invert();
    const offsets=l.wheelOffsets,w=this.model.wheels;offsets.set(w[0].pivot.position.y,w[1].pivot.position.y,w[2].pivot.position.y,w[3].pivot.position.y);
    l.reverse=damp(l.reverse,this.mounted&&this.speed<-.08&&this.throttle<0?1:0,18,dt);
    if(l.reverse<.0001)l.reverse=0;
    this.root.localToWorld(l.rear.copy(this.model.rearLamp));
    l.rearDirection.set(0,-.20,1).normalize().transformDirection(this.root.matrixWorld);
  }
  exposure(camera){
    if(this.lighting.level<.001)return 0;
    camera.getWorldDirection(this._view);
    const l=this.lighting;
    // Adapt to the lit footprint only when it occupies the view; also account
    // for facing a nearby lamp from in front after leaving the vehicle.
    this._point.copy(l.left).add(l.right).multiplyScalar(.5).addScaledVector(l.direction,12);this._point.y=this.heightAt(this._point.x,this._point.z);
    const distance=this._point.distanceTo(camera.position);this._point.sub(camera.position).normalize();
    const footprint=clamp((this._view.dot(this._point)-.15)/.80,0,1)*clamp(1-distance/95,0,1);
    this._point.copy(camera.position).sub(l.center);const near=clamp(1-this._point.length()/25,0,1),towards=this._point.normalize().dot(l.direction);
    const direct=near*clamp((towards-.70)/.30,0,1)*clamp((-this._view.dot(this._point)-.65)/.35,0,1);
    return Math.max(footprint*.68,direct*.85)*Math.min(1,l.level);
  }
  collideWalker(walker){
    if(this.mounted||walker.pos.y-1.68>this.position.y+1.1)return;
    const c=Math.cos(this.heading),s=Math.sin(this.heading),dx=walker.pos.x-this.position.x,dz=walker.pos.z-this.position.z;
    let x=c*dx+s*dz,z=-s*dx+c*dz;const hx=this.model.track*.5+.40,hz=this.model.wheelbase*.5+.50;
    if(Math.abs(x)>=hx||Math.abs(z)>=hz)return;
    if(hx-Math.abs(x)<hz-Math.abs(z))x=Math.sign(x||1)*hx;else z=Math.sign(z||1)*hz;
    walker.pos.x=this.position.x+c*x-s*z;walker.pos.z=this.position.z+s*x+c*z;walker.velocity.multiplyScalar(.25);
    walker.pos.y=Math.max(walker.pos.y,this.heightAt(walker.pos.x,walker.pos.z)+1.68);
    walker.camera.position.x=walker.pos.x;walker.camera.position.z=walker.pos.z;
  }
  updateAppearance(sky,camera,state,dt){
    this.visibilityTime-=dt;if(this.visibilityTime<=0){this.visibilityTime=.18;this._point.copy(this.position);this._point.y+=.8;this.lastVisibility=this.terrain?.visibleFrom(this._point,sky.sun)??1;}
    this.model.updateLight(sky,camera,state,this.lastVisibility);
  }
}
