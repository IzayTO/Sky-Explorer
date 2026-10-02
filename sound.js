// Quiet, non-musical environmental audio. Noise buffers are built once and
// filtered into low wind and varied grass/soil footsteps. No third-party audio.
export class Ambience{
  constructor(){this.ctx=null;this.volume=.35;this.muted=false;this.active=false;this.stepCount=0;}
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
        this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-21;this.compressor.ratio.value=4;this.compressor.connect(this.master);
      }
      await this.ctx.resume();this.active=true;this.apply();
    }catch{/* Audio is optional; blocked playback never stops exploration. */}
  }
  apply(){if(!this.ctx)return;this.master.gain.setTargetAtTime(this.active&&!this.muted?this.volume*.32:0,this.ctx.currentTime,.35);}
  setVolume(v){this.volume=v;this.apply();}
  setMuted(v){this.muted=v;this.apply();}
  pause(){this.active=false;this.apply();}
  update(t,night){if(!this.ctx||!this.active)return;const now=this.ctx.currentTime;this.windGain.gain.setTargetAtTime(.13+Math.sin(t*.071)*.027+Math.sin(t*.173+2)*.018,now,.7);this.windFilter.frequency.setTargetAtTime(410+Math.sin(t*.1)*90+night*45,now,.8);}
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
