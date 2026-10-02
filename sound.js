// Quiet, non-musical environmental audio. Noise buffers are built once and
// filtered into low wind and varied grass/soil footsteps. No third-party audio.
const clamp=x=>Math.min(1,Math.max(0,x));
export function ambienceProfile(hour,night){
  const near=(center,width)=>{const d=Math.abs(((hour-center+36)%24)-12);return Math.exp(-.5*(d/width)**2);};
  const dawn=near(6.6,1.35),dusk=near(18.4,1.45),dark=clamp(night),day=clamp(1-dark)*(1-dawn*.82)*(1-dusk*.8);
  return {dawn,dusk,night:dark,day,wind:260+day*550+dawn*100+dusk*60,air:520+day*980+dawn*320+dusk*220,
    level:.083+day*.056+dawn*.022+dusk*.008,texture:.004+day*.020+dawn*.011+dusk*.014,gust:.05+day*.025+dawn*.010+dusk*.035};
}
export class Ambience{
  constructor(){this.ctx=null;this.volume=.35;this.muted=false;this.active=false;this.stepCount=0;this.nextRustle=0;}
  async start(){
    try{
      if(!this.ctx){
        const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
        this.ctx=new Ctx();const c=this.ctx;this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);
        this.buffer=c.createBuffer(2,c.sampleRate*7,c.sampleRate);
        for(let ch=0;ch<2;ch++){const data=this.buffer.getChannelData(ch);let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.021)/1.025;data[i]=brown*3.3;}const seam=Math.floor(c.sampleRate*.25);for(let i=0;i<seam;i++){const k=i/seam;data[data.length-seam+i]=data[data.length-seam+i]*(1-k)+data[i]*k;}}
        const src=c.createBufferSource();src.buffer=this.buffer;src.loop=true;
        this.windFilter=c.createBiquadFilter();this.windFilter.type='lowpass';this.windFilter.frequency.value=520;this.windFilter.Q.value=.18;
        this.windGain=c.createGain();this.windGain.gain.value=.16;src.connect(this.windFilter);this.windFilter.connect(this.windGain);this.windGain.connect(this.master);src.start();
        this.stepBuffer=c.createBuffer(1,c.sampleRate*.55,c.sampleRate);const data=this.stepBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        // Independent stereo air texture, kept below the low wind. Different
        // loop lengths and drifting filters avoid a repeatedly identical gust.
        const airBuffer=c.createBuffer(2,c.sampleRate*11.3,c.sampleRate);
        for(let ch=0;ch<2;ch++){const data=airBuffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
        const air=c.createBufferSource();air.buffer=airBuffer;air.loop=true;
        this.airFilter=c.createBiquadFilter();this.airFilter.type='bandpass';this.airFilter.Q.value=.48;this.airFilter.frequency.value=850;
        this.airGain=c.createGain();this.airGain.gain.value=0;this.airPan=c.createStereoPanner?c.createStereoPanner():c.createGain();
        air.connect(this.airFilter);this.airFilter.connect(this.airGain);this.airGain.connect(this.airPan);this.airPan.connect(this.master);air.start();
        this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-21;this.compressor.ratio.value=4;this.compressor.connect(this.master);
      }
      await this.ctx.resume();this.active=true;this.apply();
    }catch{/* Audio is optional; blocked playback never stops exploration. */}
  }
  apply(){if(!this.ctx)return;this.master.gain.setTargetAtTime(this.active&&!this.muted?this.volume*.32:0,this.ctx.currentTime,.35);}
  setVolume(v){this.volume=v;this.apply();}
  setMuted(v){this.muted=v;this.apply();}
  pause(){this.active=false;this.apply();}
  update(t,night,hour=12){
    if(!this.ctx||!this.active||this.ctx.state!=='running')return;
    const now=this.ctx.currentTime,p=ambienceProfile(hour,night),gust=Math.sin(t*p.gust)*.018+Math.sin(t*.137+2)*.012;
    this.windGain.gain.setTargetAtTime(p.level+gust,now,1.1);
    this.windFilter.frequency.setTargetAtTime(p.wind+Math.sin(t*.093)*60,now,1.4);
    this.airFilter.frequency.setTargetAtTime(p.air+Math.sin(t*.057+1)*130,now,1.6);
    this.airGain.gain.setTargetAtTime(p.texture*(.8+.2*Math.sin(t*.19)),now,1.3);
    if(this.airPan.pan)this.airPan.pan.setTargetAtTime(Math.sin(t*.043)*.23,now,.8);
    if(now>this.nextRustle){this.nextRustle=now+6+Math.random()*10+p.night*10;if(!this.muted)this.rustle(p);}
  }
  rustle(profile){
    const c=this.ctx,t=c.currentTime,duration=.9+Math.random()*.9,src=c.createBufferSource();src.buffer=this.stepBuffer;src.loop=true;src.playbackRate.value=.45+Math.random()*.28;
    const filter=c.createBiquadFilter();filter.type='bandpass';filter.Q.value=.48;filter.frequency.value=400+profile.day*600+Math.random()*240;
    const gain=c.createGain(),pan=c.createStereoPanner?c.createStereoPanner():c.createGain();if(pan.pan)pan.pan.value=(Math.random()-.5)*.7;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.007+profile.texture*.5,t+duration*.4);gain.gain.linearRampToValueAtTime(0,t+duration);
    src.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.master);src.start(t,Math.random()*.2);src.stop(t+duration+.02);
    src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
  }
  step(speed=1){
    if(!this.ctx||!this.active||this.muted||this.ctx.state!=='running')return;const c=this.ctx,t=c.currentTime;
    const source=c.createBufferSource();source.buffer=this.stepBuffer;source.playbackRate.value=.78+Math.random()*.36;
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=680+Math.random()*800;filter.Q.value=.38;
    const high=c.createBiquadFilter();high.type='highpass';high.frequency.value=100+Math.random()*65;
    const gain=c.createGain();const amplitude=(.12+Math.random()*.065)*Math.min(1.4,.85+speed*.15);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(amplitude,t+.013);gain.gain.exponentialRampToValueAtTime(.009,t+.08);gain.gain.exponentialRampToValueAtTime(.0001,t+.19+Math.random()*.07);
    const pan=c.createStereoPanner?c.createStereoPanner():c.createGain();if(pan.pan)pan.pan.value=(this.stepCount++%2?1:-1)*(.11+Math.random()*.05);
    source.connect(filter);filter.connect(high);high.connect(gain);gain.connect(pan);pan.connect(this.compressor);source.start(t,Math.random()*.18);source.stop(t+.35);source.onended=()=>{source.disconnect();filter.disconnect();high.disconnect();gain.disconnect();pan.disconnect();};
    // A muted low transient gives weight without an audible musical pitch.
    const impact=c.createBufferSource();impact.buffer=this.stepBuffer;const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=130+Math.random()*70;const g=c.createGain();g.gain.setValueAtTime(.07+Math.random()*.035,t);g.gain.exponentialRampToValueAtTime(.0001,t+.105);impact.connect(low);low.connect(g);g.connect(pan);impact.start(t,Math.random()*.3);impact.stop(t+.12);impact.onended=()=>{impact.disconnect();low.disconnect();g.disconnect();};
  }
}
