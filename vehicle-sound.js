// Soft, locally synthesized cabin/motor sound. Parked vehicles create no loop.
// Everything passes through the environment master: volume, mute and pause are
// shared with the existing soundscape. Lunar audio represents felt vibration.
export class VehicleSound {
  constructor(ambience,lunar=false){this.audio=ambience;this.lunar=lunar;this.running=false;this.nodes=null;this.nextUpdate=0;this.lastMoving=false;}
  mount(){this.running=true;this.start();}
  start(){
    const c=this.audio.ctx;if(this.nodes||!c||c.state!=='running'||!this.running)return;
    const now=c.currentTime,bus=c.createGain(),filter=c.createBiquadFilter();
    filter.type='lowpass';filter.frequency.value=this.lunar?800:620;filter.Q.value=.45;
    bus.gain.setValueAtTime(0,now);bus.gain.setTargetAtTime(.65,now,.12);filter.connect(bus);bus.connect(this.audio.master);
    const low=c.createOscillator(),motor=c.createOscillator(),lowGain=c.createGain(),motorGain=c.createGain();
    low.type='sine';motor.type='triangle';low.frequency.value=this.lunar?76:48;motor.frequency.value=this.lunar?152:96;
    lowGain.gain.value=.15;motorGain.gain.value=.085;
    low.connect(lowGain);motor.connect(motorGain);lowGain.connect(filter);motorGain.connect(filter);
    const rolling=c.createBufferSource(),rollingFilter=c.createBiquadFilter(),rollingGain=c.createGain();
    rolling.buffer=this.audio.stepBuffer;rolling.loop=true;rolling.playbackRate.value=.38;
    rollingFilter.type='lowpass';rollingFilter.frequency.value=420;rollingFilter.Q.value=.4;rollingGain.gain.value=0;
    rolling.connect(rollingFilter);rollingFilter.connect(rollingGain);rollingGain.connect(filter);
    low.start();motor.start();rolling.start();
    this.nodes={bus,filter,low,motor,lowGain,motorGain,rolling,rollingFilter,rollingGain};
    this.nextUpdate=0;this.lastMoving=false;this.transient('start');
  }
  stop(){
    this.running=false;const n=this.nodes;if(!n)return;this.nodes=null;
    const t=this.audio.ctx.currentTime;n.bus.gain.cancelScheduledValues(t);n.bus.gain.setTargetAtTime(0,t,.045);
    n.low.stop(t+.22);n.motor.stop(t+.22);n.rolling.stop(t+.22);
    n.low.onended=()=>{for(const node of Object.values(n))node.disconnect();};
  }
  transient(kind='switch',strength=1){
    const a=this.audio,c=a.ctx;if(!c||!a.active||a.muted||c.state!=='running')return;
    const t=c.currentTime,osc=c.createOscillator(),gain=c.createGain(),filter=c.createBiquadFilter();
    const start=kind==='start',land=kind==='land',duration=start?.38:land?.16:.055;
    osc.type=start?'triangle':'sine';osc.frequency.setValueAtTime(start?58:land?85:410,t);
    osc.frequency.exponentialRampToValueAtTime(start?(this.lunar?132:98):land?42:230,t+duration);
    filter.type='lowpass';filter.frequency.value=start?580:land?180:900;filter.Q.value=.3;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime((start?.15:land?.17:.12)*Math.min(1.3,strength),t+.009);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(filter);filter.connect(gain);gain.connect(a.master);osc.start(t);osc.stop(t+duration+.015);
    osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect();};
  }
  switch(){this.transient('switch');}
  land(impact){this.transient('land',.5+Math.min(6,impact)*.11);}
  update(vehicle){
    if(!this.running)return;this.start();const n=this.nodes,c=this.audio.ctx;
    if(!n||!this.audio.active||c.state!=='running'||c.currentTime<this.nextUpdate)return;
    const t=c.currentTime;this.nextUpdate=t+.04;
    const speed=Math.abs(vehicle.speed),load=Math.abs(vehicle.throttle),moving=speed>.25;
    const rpm=(this.lunar?76:48)+speed*(this.lunar?4.7:3.6)+load*12+(vehicle.boosting?20:0);
    n.low.frequency.setTargetAtTime(rpm,t,.12);n.motor.frequency.setTargetAtTime(rpm*(this.lunar?2.01:1.98),t,.10);
    n.filter.frequency.setTargetAtTime((this.lunar?720:550)+Math.min(30,speed)*17+load*110,t,.16);
    n.bus.gain.setTargetAtTime(.60+Math.min(1,speed/12)*.25+load*.12,t,.12);
    n.rollingGain.gain.setTargetAtTime(vehicle.grounded?Math.min(.095,speed*.006):0,t,.08);
    n.rolling.playbackRate.setTargetAtTime(.38+Math.min(speed,30)*.018,t,.16);
    // A brief load ramp gives the first acceleration weight, without beeps or
    // repeated ignition sounds each time the accelerator is touched.
    if(moving&&!this.lastMoving){n.motorGain.gain.cancelScheduledValues(t);n.motorGain.gain.setTargetAtTime(.12,t,.06);n.motorGain.gain.setTargetAtTime(.085,t+.24,.14);}
    this.lastMoving=moving;
  }
}
