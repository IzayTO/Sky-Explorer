import * as THREE from './three.module.js';
import {Sky,clamp,phaseName} from './sky.js';
import {Terrain} from './terrain.js';
import {Walker} from './controls.js';
import {Ambience} from './sound.js';

const $=id=>document.getElementById(id),mobile=matchMedia('(pointer:coarse)').matches,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const icons={
  volume:'<path d="M11 4 6 8H3v8h3l5 4V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute:'<path d="M11 4 6 8H3v8h3l5 4V4Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  sliders:'<path d="M4 6h7m5 0h4M4 12h2m5 0h9M4 18h10m5 0h1"/><circle cx="13.5" cy="6" r="2.5"/><circle cx="8.5" cy="12" r="2.5"/><circle cx="16.5" cy="18" r="2.5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  play:'<path d="m8 4 12 8-12 8V4Z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  forward:'<path d="M4 12h15m-5-5 5 5-5 5"/>',
  backward:'<path d="M20 12H5m5-5-5 5 5 5"/>',
  chevron:'<path d="m7 14 5-5 5 5"/>',
  moon:'<path d="M20.5 13A9 9 0 0 1 11 3.5 8.8 8.8 0 1 0 20.5 13Z"/>',
  scope:'<path d="m3 13 4 8 5-3-4-8-5 3Zm5-3 4 8 6-3-5-9-5 4Zm5-4 5 9 4-2-5-10-4 3ZM2 17l2-1"/>'
};
const icon=(el,name)=>el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.eye}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>icon(el,el.dataset.icon));
let toastTimer;function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
const state={hour:17.8,phase:.17,targetPhase:.17,playing:false,direction:1,duration:12,path:0,fov:100,speed:1,volume:.35,milky:true,sway:!reduced,quality:'auto',scope:false,zoom:0,zoomReveal:0,active:false,hiddenUI:false,panel:false};
// Only personal preferences are local. Every fresh visit starts at sunset.
try{const saved=JSON.parse(localStorage.getItem('a-cielo-abierto-prefs-v1')||'null');if(saved){for(const key of ['fov','speed','volume','milky','sway','quality','duration'])if(saved[key]!==undefined)state[key]=saved[key];state.fov=clamp(Number(state.fov)||100,55,120);state.speed=clamp(Number(state.speed)||1,.4,4);state.volume=clamp(Number(state.volume)||0);state.duration=clamp(Number(state.duration)||12,2,60);if(!['auto','high','balanced'].includes(state.quality))state.quality='auto';}}catch{}
function save(){try{const {fov,speed,volume,milky,sway,quality,duration}=state;localStorage.setItem('a-cielo-abierto-prefs-v1',JSON.stringify({fov,speed,volume,milky,sway,quality,duration}));}catch{}}
let renderer,scene,camera,sky,terrain,walker,audio,raf,frameTime=0,elapsed=0,uiTime=0,performanceFrames=0,performanceSum=0,autoScale=1,contextLost=false,phaseImageData;
let targetHour=null;

function viewport(){return {w:window.innerWidth,h:window.innerHeight};}
function targetFov(){if(!state.scope||state.zoom===0)return state.fov;const {w,h}=viewport();return [0,14,4,1.05][state.zoom]/Math.min(1,w/h);}
function pixelRatio(){const base=Math.min(devicePixelRatio||1,mobile?1.65:2);return state.quality==='high'?Math.min(devicePixelRatio||1,2):state.quality==='balanced'?Math.min(base,1.25):base*autoScale;}
function resize(){if(!renderer)return;const {w,h}=viewport();renderer.setPixelRatio(pixelRatio());renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);

async function init(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0x111d25);$('world').appendChild(renderer.domElement);
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(state.fov,innerWidth/innerHeight,.08,18000);camera.position.set(0,1.68,0);
    const moon=await new THREE.TextureLoader().loadAsync(new URL('./moon.jpg',import.meta.url).href);moon.colorSpace=THREE.NoColorSpace;moon.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);moon.minFilter=THREE.LinearMipmapLinearFilter;
    sky=new Sky(scene,moon);terrain=new Terrain(scene,mobile);audio=new Ambience();audio.setVolume(state.volume);
    walker=new Walker(camera,renderer.domElement,s=>audio.step(s),()=>toast('Has llegado al límite de la pradera. Puedes seguir en otra dirección.'));walker.bindJoystick($('joystick'),$('joy-thumb'));walker.sway=state.sway;walker.speed=state.speed;
    walker.onLook=()=>{$('look-hint').style.opacity='0';};
    setupMoonPreview(moon.image);bindUI();syncPreferences();registerSkyTools();resize();walker.update(0);sky.update(camera,state,0,pixelRatio());terrain.update(camera,sky,0);renderer.compile(scene,camera);renderer.render(scene,camera);
    $('enter').disabled=false;$('enter-label').textContent='Explorar';
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(raf);walker.resetInput();audio.pause();toast('Recuperando el paisaje…');});
    renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;frameTime=0;if(state.active)audio.start();raf=requestAnimationFrame(frame);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);walker.resetInput();audio.pause();frameTime=0;}else if(!contextLost){if(state.active)audio.start();raf=requestAnimationFrame(frame);}});
    raf=requestAnimationFrame(frame);
  }catch(e){console.error(e);$('loading-error').hidden=false;$('loading-error').textContent=/WebGL/i.test(e.message)?'Este navegador no pudo iniciar los gráficos 3D. Prueba abrir la página en Safari o Chrome con la aceleración gráfica disponible.':'No se pudo abrir el paisaje. Comprueba que subiste todos los archivos juntos y abre la dirección de GitHub Pages en Safari o Chrome actualizado.';$('enter-label').textContent='No disponible';}
}
function bindUI(){
  $('moon-destination').addEventListener('click',()=>toast('La Luna no está disponible aún. Por ahora, nos espera la Tierra.'));
  $('enter').addEventListener('click',async()=>{
    state.active=true;state.playing=false;walker.enabled=true;walker.resetInput();$('hud').hidden=false;$('welcome').classList.add('leaving');await audio.start();setTimeout(()=>$('welcome').hidden=true,780);$('world').focus({preventScroll:true});
    if(mobile){$('device-hint').textContent='Joystick para caminar · Arrastra para mirar';$('controls-help').innerHTML='<p>Mueve el joystick para caminar en cualquier dirección.</p><p>Arrastra el paisaje con otro dedo para mirar.</p><p>Puedes moverte y mirar al mismo tiempo.</p>';}
    setTimeout(()=>{$('look-hint').style.opacity='0';},8500);
  });
  $('home').addEventListener('click',()=>{state.active=false;walker.enabled=false;walker.resetInput();state.playing=false;setScope(false);setPanel(false);if(document.pointerLockElement)document.exitPointerLock();audio.pause();$('welcome').hidden=false;requestAnimationFrame(()=>$('welcome').classList.remove('leaving'));$('hud').hidden=true;$('enter').focus();});
  $('settings-button').addEventListener('click',()=>setPanel(!state.panel));$('close-settings').addEventListener('click',()=>setPanel(false));
  const tabs=[$('sky-tab'),$('walk-tab')];tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>activateTab(index));tab.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();activateTab(e.key==='Home'?0:e.key==='End'?1:1-index,true);}});});
  function activateTab(index,focus=false){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',i===index);tab.tabIndex=i===index?0:-1;$(tab.getAttribute('aria-controls')).hidden=i!==index;});if(focus)tabs[index].focus();}
  $('time').addEventListener('input',e=>{state.hour=Number(e.target.value);state.playing=false;targetHour=null;updateReadouts();});
  $('play').addEventListener('click',()=>{state.playing=!state.playing;targetHour=null;updateReadouts();});
  $('cycle-direction').addEventListener('click',()=>{state.direction*=-1;icon($('cycle-direction'),state.direction===1?'forward':'backward');toast(state.direction===1?'El tiempo avanza.':'El tiempo retrocede.');});
  $('timeline-toggle').addEventListener('click',()=>{const folded=$('timeline').classList.toggle('collapsed');$('timeline-toggle').setAttribute('aria-expanded',!folded);$('timeline-toggle').setAttribute('aria-label',folded?'Desplegar ciclo':'Plegar ciclo');});
  document.querySelectorAll('[data-hour]').forEach(b=>b.addEventListener('click',()=>{targetHour={from:state.hour,to:Number(b.dataset.hour),elapsed:0};state.playing=false;updateReadouts();}));
  $('phase').addEventListener('input',e=>{state.targetPhase=Number(e.target.value)/1000;});document.querySelectorAll('[data-phase]').forEach(b=>b.addEventListener('click',()=>{state.targetPhase=Number(b.dataset.phase);$('phase').value=state.targetPhase*1000;}));
  $('duration').addEventListener('input',e=>{state.duration=Number(e.target.value);$('duration-value').textContent=`${state.duration} min`;save();});
  document.querySelectorAll('[data-path]').forEach(b=>b.addEventListener('click',()=>{state.path=Number(b.dataset.path);document.querySelectorAll('[data-path]').forEach(el=>el.setAttribute('aria-pressed',el===b));}));
  $('milky').addEventListener('change',e=>{state.milky=e.target.checked;save();});
  $('fov').addEventListener('input',e=>{if(state.scope)return;state.fov=Number(e.target.value);$('fov-value').textContent=state.fov+'°';save();});
  $('speed').addEventListener('input',e=>{state.speed=Number(e.target.value);walker.speed=state.speed;$('speed-value').textContent=state.speed.toFixed(1)+'×';save();});
  $('volume').addEventListener('input',e=>{state.volume=Number(e.target.value)/100;audio.setVolume(state.volume);$('volume-value').textContent=Math.round(state.volume*100)+' %';save();});
  $('sway').addEventListener('change',e=>{state.sway=e.target.checked;walker.sway=state.sway;save();});
  $('quality').addEventListener('change',e=>{state.quality=e.target.value;autoScale=1;resize();save();});
  $('sound-button').addEventListener('click',()=>{audio.setMuted(!audio.muted);icon($('sound-button'),audio.muted?'mute':'volume');$('sound-button').setAttribute('aria-pressed',!audio.muted);$('sound-button').setAttribute('aria-label',audio.muted?'Activar ambiente':'Silenciar ambiente');if(!audio.muted)audio.start();});
  $('reset-position').addEventListener('click',()=>{walker.resetPosition();toast('De nuevo en el centro de la pradera.');});
  $('scope-button').addEventListener('click',()=>setScope(!state.scope));document.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',()=>setZoom(Number(b.dataset.zoom))));
  $('aim-moon').addEventListener('click',()=>{if(sky.moon.y<.008){toast('La Luna está bajo el horizonte. Avanza hacia la noche.');return;}walker.aim(sky.moon);});
  $('hide-ui').addEventListener('click',()=>hideUI(true));$('show-ui').addEventListener('click',()=>hideUI(false));
  window.addEventListener('keydown',e=>{if(!state.active||e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;const tag=e.target.tagName;if(tag==='SELECT'||e.target.isContentEditable)return;
    if(e.code==='Escape'){if(state.panel)setPanel(false);else if(state.scope)setScope(false);else if(state.hiddenUI)hideUI(false);}
    if(e.code==='KeyT'){e.preventDefault();setScope(!state.scope);}if(e.code==='KeyH'){e.preventDefault();hideUI(!state.hiddenUI);}if(e.code==='KeyM')$('sound-button').click();if(state.scope&&/^Digit[0-3]$/.test(e.code)){e.preventDefault();setZoom(Number(e.code.slice(-1)));}
  });
  // Keep sliders keyboard-operable, while mouse/touch release doesn't trap WASD.
  document.querySelectorAll('input[type=range]').forEach(input=>input.addEventListener('pointerup',()=>input.blur()));
  document.addEventListener('pointerdown',e=>{if(state.panel&&!$('settings').contains(e.target)&&!$('settings-button').contains(e.target))setPanel(false,false);});
  updateReadouts();
}
function setPanel(open,focus=true){state.panel=open;$('settings').hidden=!open;$('settings-button').setAttribute('aria-expanded',open);document.body.classList.toggle('panel-open',open);walker.enabled=state.active&&!open;walker.resetInput();if(open){if(document.pointerLockElement)document.exitPointerLock();if(focus)$('close-settings').focus();}else if(focus)$('settings-button').focus();}
function hideUI(hidden){state.hiddenUI=hidden;if(hidden)setPanel(false,false);document.body.classList.toggle('ui-hidden',hidden);$('hud').inert=hidden;$('show-ui').hidden=!hidden;if(hidden)$('show-ui').focus();else $('world').focus({preventScroll:true});}
function setScope(on){state.scope=on;document.body.classList.toggle('using-scope',on);$('lens').classList.toggle('active',on);$('scope-controls').hidden=!on;$('scope-button').setAttribute('aria-pressed',on);$('scope-button').setAttribute('aria-label',on?'Guardar telescopio':'Usar telescopio');$('scope-label').textContent=on?'Guardar':'Telescopio';$('fov').disabled=on;$('fov-note').textContent=on?'Guarda el telescopio para cambiar el campo de visión.':'Se ajusta con el telescopio guardado.';if(on)walker.resetInput();}
function setZoom(level){state.zoom=level;document.querySelectorAll('[data-zoom]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.zoom)===level));}
function syncPreferences(){for(const id of ['fov','speed','duration','quality'])$(id).value=state[id];$('volume').value=Math.round(state.volume*100);$('milky').checked=state.milky;$('sway').checked=state.sway;$('fov-value').textContent=state.fov+'°';$('speed-value').textContent=state.speed.toFixed(1)+'×';$('volume-value').textContent=Math.round(state.volume*100)+' %';$('duration-value').textContent=state.duration+' min';if(mobile)$('device-hint').textContent='Joystick para caminar · Arrastra para mirar';}
function updateReadouts(){
  const h=state.hour%24,m=Math.floor(h*60),time=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  $('clock').textContent=time;$('time').value=state.hour;$('time').setAttribute('aria-valuetext',time);
  $('moment-name').textContent=h<4.8||h>20?'Bajo las estrellas':h<6?'Antes del amanecer':h<7.5?'La primera luz':h<16.7?'A cielo abierto':h<18?'Luz de la tarde':h<19?'El último resplandor':'La hora azul';
  icon($('play'),state.playing?'pause':'play');$('play').setAttribute('aria-pressed',state.playing);$('play').setAttribute('aria-label',state.playing?'Pausar ciclo':'Reproducir ciclo');$('timeline-status').textContent=state.playing?`Un día en ${state.duration} min`:'El tiempo está en tus manos';
  const deg=((walker?.yaw||0)*180/Math.PI+360)%360;const labels=['N','NE','E','SE','S','SO','O','NO'];$('bearing').textContent=labels[Math.round(deg/45)%8];$('degrees').textContent=Math.round(deg)+'°';
  const illuminated=Math.round((1-Math.cos(state.phase*Math.PI*2))*.5*100),name=phaseName(state.phase);$('phase-value').textContent=illuminated+' % iluminada';$('phase-name').innerHTML=`${name}<small>La luz recorre su superficie.</small>`;$('phase').setAttribute('aria-valuetext',`${name}, ${illuminated} por ciento iluminada`);
  if(state.panel&&!$('sky-settings').hidden)drawPhase();
}
function setupMoonPreview(image){const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,256,128);phaseImageData=ctx.getImageData(0,0,256,128).data;drawPhase();}
function drawPhase(){if(!phaseImageData)return;const c=$('phase-preview'),ctx=c.getContext('2d'),n=104,data=ctx.createImageData(n,n),a=state.phase*Math.PI*2;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const px=(x+.5-n/2)/(n/2-2),py=(n/2-y-.5)/(n/2-2),rr=px*px+py*py;if(rr>=1)continue;const z=Math.sqrt(1-rr),dot=px*Math.sin(a)-z*Math.cos(a);const u=.5+Math.atan2(px,z)/(Math.PI*2),v=.5-Math.asin(py)/Math.PI;const src=(clamp(Math.floor(v*128),0,127)*256+clamp(Math.floor(u*256),0,255))*4,dst=(y*n+x)*4,k=dot>0?.4+.6*Math.sqrt(dot):.035;for(let b=0;b<3;b++)data.data[dst+b]=phaseImageData[src+b]*k*1.4;data.data[dst+3]=255;}ctx.putImageData(data,0,0);
}
function frame(now){
  if(document.hidden||contextLost)return;raf=requestAnimationFrame(frame);const raw=frameTime?(now-frameTime)/1000:1/60;const dt=Math.min(.05,raw);frameTime=now;elapsed+=dt;
  if(targetHour){targetHour.elapsed+=dt;const p=clamp(targetHour.elapsed/.9),s=p*p*(3-2*p);state.hour=targetHour.from+(targetHour.to-targetHour.from)*s;if(p===1)targetHour=null;}
  else if(state.active&&state.playing)state.hour=(state.hour+state.direction*Math.min(raw,1)*24/(state.duration*60)+24)%24;
  state.phase+=(state.targetPhase-state.phase)*(1-Math.exp(-dt*10));if(Math.abs(state.targetPhase-state.phase)<.00001)state.phase=state.targetPhase;
  const reveal=state.scope?state.zoom/3:0;state.zoomReveal+=(reveal-state.zoomReveal)*(1-Math.exp(-dt*5));
  const desired=targetFov();camera.fov=Math.exp(Math.log(camera.fov)+(Math.log(desired)-Math.log(camera.fov))*(1-Math.exp(-dt*(reduced?20:5))));if(Math.abs(camera.fov-desired)<.0001)camera.fov=desired;camera.updateProjectionMatrix();
  walker.sensitivity=state.scope?Math.max(.008,Math.tan(camera.fov*Math.PI/360)/Math.tan(state.fov*Math.PI/360)):1;walker.update(dt);
  sky.update(camera,state,elapsed,pixelRatio());terrain.update(camera,sky,elapsed);audio.update(elapsed,sky.night);renderer.render(scene,camera);
  uiTime+=dt;if(uiTime>.12){uiTime=0;updateReadouts();}
  // Reduce only pixel density under sustained pressure. Sky layers, lunar map,
  // star catalogue and grass geometry remain intact; never degrade from one spike.
  if(state.active&&state.quality==='auto'&&raw<.2){performanceSum+=raw;performanceFrames++;if(performanceFrames===240){const avg=performanceSum/performanceFrames;performanceSum=0;performanceFrames=0;if(avg>.032&&autoScale>.76){autoScale=Math.max(.76,autoScale-.08);resize();}else if(avg<.018&&autoScale<1){autoScale=Math.min(1,autoScale+.04);resize();}}}
}
function registerSkyTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const snapshot=()=>({destination:state.active?'earth':'selector',hour:Number(state.hour.toFixed(3)),phase:Number(state.phase.toFixed(3)),playing:state.playing,telescope:state.scope,zoom:state.zoom});
  const definitions=[
    {name:'read_sky_state',title:'Leer estado del cielo',description:'Lee el momento del día, la fase lunar y el telescopio de esta experiencia.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>snapshot()},
    {name:'set_cycle_time',title:'Elegir hora del ciclo',description:'Mueve el mismo control visible de día y noche y deja el ciclo en pausa. Solo funciona dentro de Tierra.',inputSchema:{type:'object',properties:{hour:{type:'number',minimum:0,maximum:24}},required:['hour'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{
      if(!input||typeof input!=='object'||Object.keys(input).length!==1||typeof input.hour!=='number'||!Number.isFinite(input.hour)||input.hour<0||input.hour>24)throw new Error('La hora debe ser un número entre 0 y 24.');
      if(!state.active)throw new Error('Entra a Tierra antes de modificar su cielo.');
      $('time').value=input.hour;$('time').dispatchEvent(new Event('input',{bubbles:true}));return snapshot();
    }}
  ];
  for(const tool of definitions){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
init();
