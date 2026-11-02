// Original Web Audio synthesis: no samples or external sound assets.
export class Sound{
 constructor(){this.context=null;this.volume=.4;this.musicVolume=.18;this.voices=new Set();this.tick=0;this.next=0;}
 start(){try{if(!this.context){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;this.context=new C();this.gain=this.context.createGain();const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=10;this.gain.connect(limiter);limiter.connect(this.context.destination);this.noise=this.context.createBuffer(1,this.context.sampleRate*.3,this.context.sampleRate);const a=this.noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;}this.gain.gain.value=this.volume;this.context.resume().catch(()=>{});this.next=this.context.currentTime+.04;}catch{this.context=null;}}
 stop(){for(const s of this.voices)try{s.stop();}catch{}this.voices.clear();}
 setVolume(v){this.volume=v;if(this.gain)this.gain.gain.value=v;}
 tone(freq,duration=.1,type='sine',volume=.12,when=0,end=freq){const c=this.context;if(!c||c.state!=='running'||!this.volume)return;const t=c.currentTime+when,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+duration);g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(volume,t+.006);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.gain);o.start(t);o.stop(t+duration+.01);this.voices.add(o);o.onended=()=>{this.voices.delete(o);o.disconnect();g.disconnect();};}
 burst(duration=.1,volume=.2,cutoff=2400){const c=this.context;if(!c||c.state!=='running'||!this.volume)return;const s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();s.buffer=this.noise;f.type='lowpass';f.frequency.value=cutoff;g.gain.value=volume;g.gain.exponentialRampToValueAtTime(.001,c.currentTime+duration);s.connect(f);f.connect(g);g.connect(this.gain);s.start();s.stop(c.currentTime+duration);this.voices.add(s);s.onended=()=>{this.voices.delete(s);s.disconnect();g.disconnect();f.disconnect();};}
 play(type,weapon=0){
  if(type==='shot'){this.burst(weapon===2?.22:.10,weapon===2?.55:.25,weapon===3?5200:2900);this.tone([170,230,90,560,320][weapon],weapon===3?.3:.12,weapon===4?'sawtooth':'triangle',.22,0,40);}
  if(type==='hit')this.tone(1150,.04,'triangle',.12);
  if(type==='kill'){this.tone(650,.08,'sine',.12);this.tone(970,.14,'sine',.10,.06);}
  if(type==='reload'||type==='loaded'){this.burst(.08,.14,4200);this.tone(130,.06,'square',.025);}
  if(type==='timeOn'){this.tone(600,.55,'sawtooth',.12,0,45);this.tone(1000,.4,'sine',.08,0,100);}
  if(type==='timeOff')this.tone(70,.3,'triangle',.10,0,700);
  if(type==='damage'){this.burst(.08,.09,600);this.tone(70,.1,'triangle',.12,0,30);}
  if(type==='relay'||type==='win'||type==='pickup'){[440,660,880].forEach((f,i)=>this.tone(f,.18,'triangle',.12,i*.08));}
  if(type==='dash')this.burst(.13,.13,1700);
  if(type==='enemyShot')this.tone(330,.08,'sawtooth',.025,0,80);
  if(type==='explosion'){this.burst(.28,.5,1600);this.tone(60,.3,'triangle',.3,0,25);}
 }
 music(slow=false){const c=this.context;if(!c||c.state!=='running'||!this.musicVolume||!this.volume)return;if(this.next<c.currentTime-.1)this.next=c.currentTime+.02;let n=0;while(this.next<c.currentTime+.10&&n++<3){const step=this.tick++,bar=Math.floor(step/16),root=[38,38,41,36][Math.floor(bar/2)%4],rate=slow?.65:1,vol=this.musicVolume,delay=Math.max(0,this.next-c.currentTime),hz=m=>440*2**((m-69)/12)*rate;if(step%4===0)this.tone(78*rate,.16,'sine',vol*.9,delay,28);if(step%2===0)this.tone(hz(root+(step%8===6?12:0)),.14,'sawtooth',vol*.18,delay);if(step%4===2)this.tone(1900,.025,'triangle',vol*.12,delay);if(step%3===0)this.tone(hz(root+24+[0,3,7,10,7][Math.floor(step/3)%5]),.22,'sine',vol*.22,delay);this.next+=60/112/4/(slow?.8:1);}}
}
