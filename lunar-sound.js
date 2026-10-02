import {Ambience} from './sound.js?v=2.0-luna';
// An artistic interior soundscape, not air travelling through lunar vacuum.
// Contact is muffled/body-transmitted; there are no wind or outdoor bird loops.
export class LunarAmbience extends Ambience{
  async start(){
    try{
      if(!this.ctx){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;const c=this.ctx=new Context();this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);
        this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-23;this.compressor.ratio.value=3;this.compressor.connect(this.master);
        const bed=c.createBuffer(2,c.sampleRate*9.7,c.sampleRate);
        for(let ch=0;ch<2;ch++){const data=bed.getChannelData(ch);let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.016)/1.018;data[i]=brown*3;}const seam=Math.floor(c.sampleRate*.3);for(let i=0;i<seam;i++){const k=i/seam;data[data.length-seam+i]=data[data.length-seam+i]*(1-k)+data[i]*k;}}
        const source=c.createBufferSource();source.buffer=bed;source.loop=true;const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=210;low.Q.value=.35;const high=c.createBiquadFilter();high.type='highpass';high.frequency.value=48;high.Q.value=.3;this.deepGain=c.createGain();this.deepGain.gain.value=.38;
        source.connect(low);low.connect(high);high.connect(this.deepGain);this.deepGain.connect(this.master);source.start();
        this.stepBuffer=c.createBuffer(1,c.sampleRate*.6,c.sampleRate);const data=this.stepBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      }
      await this.ctx.resume();this.active=true;this.apply();
    }catch{}
  }
  update(t){if(!this.ctx||!this.active)return;this.deepGain.gain.setTargetAtTime(.36+Math.sin(t*.037)*.025+Math.sin(t*.071)*.014,this.ctx.currentTime,1.5);}
  step(speed=1){this.contact(.12+Math.random()*.045,.20+Math.random()*.045,360+Math.random()*150);this.contact(.035,.28,700+Math.random()*120,.03);}
  jump(){this.contact(.095,.22,160);}
  land(impact=3){const k=Math.min(.25,.07+impact*.027);this.contact(k,.23,260);this.contact(k*.65,.21,370,.09);}
}
