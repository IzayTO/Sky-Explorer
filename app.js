import * as THREE from './three.module.js';
import {Sky,clamp,smooth,phaseName} from './sky.js?v=2.3';
import {Terrain} from './terrain.js?v=3.0';
import {Walker,bindTimeLoop,cycleHour} from './controls.js?v=3.0';
import {Ambience} from './sound.js?v=2.0-luna';
import {LunarSky,MOON_GRAVITY} from './lunar-sky.js?v=2.2';
import {LunarTerrain} from './lunar-terrain.js?v=3.0';
import {Vehicle} from './vehicles.js?v=3.0';
import {VehicleSound} from './vehicle-sound.js?v=2.3';
import {Inventory} from './inventory.js?v=3.0';
import {Expedition} from './expedition.js?v=3.0';
import {LunarAmbience} from './lunar-sound.js';

const $=id=>document.getElementById(id),mobile=matchMedia('(pointer:coarse)').matches,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const icons={
  backpack:'<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M7 6h10a3 3 0 0 1 3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a3 3 0 0 1 3-3Zm-3 5H1v8h3m16-8h3v8h-3M8 13h8v6H8zM8 9h8"/>',
  seat:'<path d="M7 3v9a3 3 0 0 0 3 3h8M7 8h8v7M5 16v5m13-6v6M6 21h14"/>',
  exit:'<path d="M10 4H4v16h6m3-12 5 4-5 4m-5-4h13"/>',
  sprint:'<circle cx="15" cy="4" r="2"/><path d="m7 9 5-2 4 4 4 1M12 7l-2 7 4 2-1 5m-3-7-3 4H3"/>',
  boost:'<path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z"/>',
  headlights:'<path d="M13 6v12C3 19 3 5 13 6ZM17 6h5m-5 4h5m-5 4h5m-5 4h5"/>',
  jump:'<path d="M12 19V5m-5 5 5-5 5 5M5 21h14"/>',
  flashlight:'<path d="m8 10 2 11h4l2-11M7 6h10v4H7zM12 1v2M5 2l2 2m12-2-2 2"/>',
  earth:'<circle cx="12" cy="12" r="9"/><path d="m6 6 4 3-1 3 4 2 1 5m2-15-2 4 4 3 3-1"/>',
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
const icon=(el,name)=>{if(el.dataset.renderedIcon===name)return;el.dataset.renderedIcon=name;el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.eye}</svg>`;};
document.querySelectorAll('[data-icon]').forEach(el=>icon(el,el.dataset.icon));
let toastTimer;function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
const state={inventory:false,destination:'earth',moonAppearance:'natural',headlightExposure:0,vehicleLighting:null,flashlight:false,hour:17.8,phase:.17,targetPhase:.17,playing:false,direction:1,duration:12,path:0,fov:100,speed:1,volume:.35,milky:true,sway:!reduced,quality:'auto',scope:false,zoom:0,zoomReveal:0,active:false,hiddenUI:false,panel:false};
// Only personal preferences are local. Every fresh visit starts at sunset.
try{const saved=JSON.parse(localStorage.getItem('a-cielo-abierto-prefs-v1')||'null');if(saved){for(const key of ['fov','speed','volume','milky','sway','quality','duration','moonAppearance'])if(saved[key]!==undefined)state[key]=saved[key];state.fov=clamp(Number(state.fov)||100,55,120);state.speed=clamp(Number(state.speed)||1,.4,4);state.volume=clamp(Number(state.volume)||0);state.duration=clamp(Number(state.duration)||12,2,60);if(!['auto','high','balanced'].includes(state.quality))state.quality='auto';}}catch{}
function save(){try{const {fov,speed,volume,milky,sway,quality,duration,moonAppearance}=state;localStorage.setItem('a-cielo-abierto-prefs-v1',JSON.stringify({fov,speed,volume,milky,sway,quality,duration,moonAppearance}));}catch{}}
let renderer,scene,camera,sky,terrain,walker,audio,vehicle,motor,inventory,expedition,raf,frameTime=0,elapsed=0,uiTime=0,performanceFrames=0,performanceSum=0,autoScale=1,contextLost=false,phaseImageData;
const promptPoint=new THREE.Vector3();
let targetHour=null,phaseControlUntil=0,previewBuffer=null,lastPreviewKey='';const environments={};let switching=false;const lunarAudio=new LunarAmbience();
const surfaceAnimations=new WeakMap();
function showSurface(el,show){
  const wasHidden=el.hidden,style=wasHidden?null:getComputedStyle(el);
  const from={opacity:style?style.opacity:0,transform:style?style.transform:'translateY(8px) scale(.99)'};
  surfaceAnimations.get(el)?.cancel();el.hidden=false;el.inert=!show;
  if(reduced||!el.animate){el.hidden=!show;return;}
  const animation=el.animate([from,{opacity:show?1:0,transform:show?'translateY(0) scale(1)':'translateY(6px) scale(.99)'}],{duration:show?280:190,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
  surfaceAnimations.set(el,animation);
  animation.onfinish=()=>{if(surfaceAnimations.get(el)!==animation)return;el.hidden=!show;animation.cancel();surfaceAnimations.delete(el);};
}

function viewport(){return {w:window.innerWidth,h:window.innerHeight};}
function targetFov(){if(!state.scope||state.zoom===0)return state.fov;const {w,h}=viewport();const levels=state.mountedScope?[0,6,1,.10]:state.destination==='moon'?[0,14,4,1.05]:[0,20,8,4.1];return levels[state.zoom]/Math.min(1,w/h);}
function pixelRatio(){const base=Math.min(devicePixelRatio||1,mobile?1.65:2);return state.quality==='high'?Math.min(devicePixelRatio||1,2):state.quality==='balanced'?Math.min(base,1.25):base*autoScale;}
function resize(){if(!renderer)return;const {w,h}=viewport();renderer.setPixelRatio(pixelRatio());renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);

async function init(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0x111d25);$('world').appendChild(renderer.domElement);
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(state.fov,innerWidth/innerHeight,.08,18000);camera.position.set(0,1.68,0);
    const moon=await new THREE.TextureLoader().loadAsync(new URL('./moon.jpg',import.meta.url).href);moon.colorSpace=THREE.NoColorSpace;moon.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);moon.minFilter=THREE.LinearMipmapLinearFilter;
    sky=new Sky(scene,moon);terrain=new Terrain(scene,mobile);audio=new Ambience();audio.setVolume(state.volume);
    walker=new Walker(camera,renderer.domElement,s=>audio.step(s),()=>toast(state.destination==='moon'?'Has llegado al límite de exploración. Sigue en otra dirección.':'Has llegado al límite de la pradera. Puedes seguir en otra dirección.'));walker.bindJoystick($('joystick'),$('joy-thumb'));walker.sway=state.sway;walker.speed=state.speed;
    walker.onJump=()=>{if(!vehicle?.mounted)audio.jump();};walker.onLand=impact=>vehicle?.mounted?motor.land(impact):audio.land(impact);
    vehicle=new Vehicle(scene);motor=new VehicleSound(audio);state.vehicleLighting=vehicle.lighting;environments.earth={scene,sky,terrain,audio,vehicle,motor,preview:moon.image,saved:null};
    walker.onLook=()=>{$('look-hint').style.opacity='0';};
    setupMoonPreview(moon.image);bindUI();expedition=new Expedition({state,camera,walker,renderer,inventory,getEnv:()=>environments[state.destination],toast,setScope,setZoom,setInventory});expedition.activate();syncPreferences();registerSkyTools();resize();walker.update(0);sky.update(camera,state,0,pixelRatio());terrain.update(camera,sky,0);expedition.update(0,0,pixelRatio());renderer.compile(scene,camera);renderer.render(scene,camera);
    $('enter').disabled=false;$('enter-label').textContent='Explorar';$('moon-destination').disabled=false;$('moon-enter-label').textContent='Explorar';
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(raf);walker.resetInput();audio.pause();toast('Recuperando el paisaje…');});
    renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;for(const env of Object.values(environments))env.terrain.lightCache?.invalidate();frameTime=0;if(state.active)audio.start();raf=requestAnimationFrame(frame);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);walker.resetInput();audio.pause();frameTime=0;}else if(!contextLost){if(state.active)audio.start();raf=requestAnimationFrame(frame);}});
    raf=requestAnimationFrame(frame);
  }catch(e){console.error(e);$('loading-error').hidden=false;$('loading-error').textContent=/WebGL/i.test(e.message)?'Este navegador no pudo iniciar los gráficos 3D. Prueba abrir la página en Safari o Chrome con la aceleración gráfica disponible.':'No se pudo abrir el paisaje. Comprueba que subiste todos los archivos juntos y abre la dirección de GitHub Pages en Safari o Chrome actualizado.';$('enter-label').textContent='No disponible';}
}
async function prepareMoon(){
  if(environments.moon)return environments.moon;
  const loader=new THREE.TextureLoader();
  const [earth,height,regolith]=await Promise.all(['earth.jpg','lunar-height.png','regolith.jpg'].map(name=>loader.loadAsync(new URL('./'+name,import.meta.url).href)));
  earth.colorSpace=THREE.NoColorSpace;earth.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);earth.wrapS=THREE.RepeatWrapping;
  const lunarScene=new THREE.Scene(),lunarSky=new LunarSky(lunarScene,environments.earth.sky,earth),lunarTerrain=new LunarTerrain(lunarScene,height,regolith,mobile);lunarSky.terrain=lunarTerrain;
  const lunarVehicle=new Vehicle(lunarScene,{lunar:true,heightAt:(x,z)=>lunarTerrain.heightAt(x,z),terrain:lunarTerrain});
  return environments.moon={motor:new VehicleSound(lunarAudio,true),vehicle:lunarVehicle,scene:lunarScene,sky:lunarSky,terrain:lunarTerrain,audio:lunarAudio,preview:earth.image,saved:{hour:8.6,phase:.25,targetPhase:.25,path:0,pos:null,yaw:-1.8,pitch:.23}};
}
async function enterDestination(destination){
  if(switching)return;expedition?.exitSeat();if(state.expeditionPanel)expedition.closeDialog();expedition?.clearPreview();if(state.inventory)setInventory(false);if(vehicle?.mounted)leaveVehicle(true);switching=true;$('enter').disabled=true;$('moon-destination').disabled=true;
  const nextAudio=destination==='moon'?lunarAudio:environments.earth.audio;nextAudio.setVolume(state.volume);
  // Resume within the initiating tap, before loading any local texture (iOS).
  const audible=nextAudio.start();if(audio!==nextAudio)audio.pause();
  $('fade').classList.add('on');$('loading-error').hidden=true;
  try{
    if(destination==='moon'){$('moon-enter-label').textContent='Abriendo…';await new Promise(resolve=>requestAnimationFrame(resolve));await prepareMoon();}
    if(destination!==state.destination){const old=environments[state.destination];old.saved={hour:state.hour,phase:state.phase,targetPhase:state.targetPhase,path:state.path,pos:walker.pos.clone(),yaw:walker.yaw,pitch:walker.pitch};
      const env=environments[destination];scene=env.scene;sky=env.sky;terrain=env.terrain;audio=env.audio;vehicle=env.vehicle;motor=env.motor;state.vehicleLighting=vehicle.lighting;state.destination=destination;
      const saved=env.saved;if(saved){Object.assign(state,{hour:saved.hour,phase:saved.phase,targetPhase:saved.targetPhase,path:saved.path});}
      walker.setEnvironment(destination==='moon'?(x,z)=>terrain.heightAt(x,z):null,destination==='moon'?MOON_GRAVITY:9.80665);
      if(saved){if(saved.pos){walker.pos.copy(saved.pos);walker.pos.y=walker.groundHeight(walker.pos.x,walker.pos.z)+1.68;}walker.yaw=saved.yaw;walker.pitch=saved.pitch;}
      setupMoonPreview(env.preview);
    }
    state.active=true;state.playing=false;targetHour=null;state.zoomReveal=0;walker.enabled=true;walker.resetInput();setFlashlight(false);setZoom(0);camera.fov=state.fov;camera.updateProjectionMatrix();
    expedition.activate();applyDestinationUI();syncVehicleUI();hideUI(false);$('hud').hidden=false;$('welcome').classList.add('leaving');setTimeout(()=>$('welcome').hidden=true,780);$('world').focus({preventScroll:true});
    await audible;audio.setVolume(state.volume);icon($('sound-button'),audio.muted?'mute':'volume');$('sound-button').setAttribute('aria-pressed',!audio.muted);$('sound-button').setAttribute('aria-label',audio.muted?'Activar ambiente':'Silenciar ambiente');
    walker.update(0);sky.update(camera,state,elapsed,pixelRatio());expedition.update(elapsed,0,pixelRatio());terrain.prepareLighting?.(renderer,camera,sky);terrain.update(camera,sky,elapsed,state);renderer.compile(scene,camera);renderer.render(scene,camera);
    requestAnimationFrame(()=>$('fade').classList.remove('on'));setTimeout(()=>{$('look-hint').style.opacity='0';},8500);
  }catch(error){console.error(error);nextAudio.pause();$('loading-error').hidden=false;$('loading-error').textContent='No se pudo abrir este paisaje. Revisa que todos los archivos del ZIP estén juntos.';$('fade').classList.remove('on');}
  finally{switching=false;$('enter').disabled=false;$('moon-destination').disabled=false;$('moon-enter-label').textContent='Explorar';}
}
function setFlashlight(on){state.flashlight=Boolean(on)&&!vehicle?.mounted;$('flashlight-setting').checked=state.flashlight;$('flashlight-button').setAttribute('aria-pressed',state.flashlight);$('flashlight-button').setAttribute('aria-label',state.flashlight?'Apagar linterna':'Encender linterna');}
function useLight(){
  if(vehicle?.mounted){vehicle.cycleLights();motor.switch();syncLightUI();}
  else setFlashlight(!state.flashlight);
}
function syncLightUI(){
  const riding=vehicle?.mounted;const mode=vehicle?.lightMode||0;
  icon($('flashlight-button'),riding?'headlights':'flashlight');
  $('flashlight-button').dataset.mode=riding?String(mode):'';
  $('flashlight-button').setAttribute('aria-pressed',riding?mode>0:state.flashlight);
  $('flashlight-button').setAttribute('aria-label',riding?['Encender luces bajas','Cambiar a luces altas','Apagar faros'][mode]:state.flashlight?'Apagar linterna':'Encender linterna');
  $('flashlight-button').title=riding?'Faros: apagados / bajas / altas · F':'Linterna · F';
  $('lunar-flash-setting').hidden=Boolean(riding);$('headlight-setting-row').hidden=!riding;$('headlight-setting').value=mode;
  $('vehicle-lights').textContent=['Faros apagados','Luces bajas','Luces altas'][mode];
}
function syncVehicleUI(){
  const riding=Boolean(vehicle?.mounted);document.body.classList.toggle('riding',riding);
  $('vehicle-exit').hidden=!riding;$('sprint-button').hidden=riding;$('boost-button').hidden=!riding;$('vehicle-status').hidden=!riding;
  $('jump-button').setAttribute('aria-label',riding?'Saltar con el vehículo':'Saltar');
  $('vehicle-name').textContent=state.destination==='moon'?'Selene · Rover':'Sendero · Cuatrimoto';
  $('vehicle-enter').hidden=true;syncLightUI();
}
function enterVehicle(){
  if(!vehicle.canEnter(camera,walker)||state.panel||state.inventory||!state.active)return;
  const torch=state.flashlight;setScope(false);setFlashlight(false);vehicle.mount(walker);vehicle.personalTorch=torch;motor.mount();syncVehicleUI();
  $('world').focus({preventScroll:true});
}
function leaveVehicle(force=false){
  if(!vehicle?.mounted)return;
  const torch=vehicle.personalTorch;
  if(!vehicle.dismount(walker,force)){toast('Espera a tocar el suelo para bajar.');return;}
  motor.stop();setFlashlight(torch);syncVehicleUI();$('world').focus({preventScroll:true});
}
function updateVehicleUI(){
  const riding=vehicle.mounted;
  if(riding){
    $('vehicle-speed').textContent=Math.round(Math.abs(vehicle.speed)*3.6)+' km/h'+(vehicle.speed<-.1?' · R':'');
    $('boost-status').textContent=vehicle.boosting?'Impulso activo':'Mantén para impulsar';
    $('boost-button').setAttribute('aria-label',vehicle.boosting?'Impulso activo; suelta para detener':'Mantener para usar impulso');
    $('boost-button').classList.toggle('boost-active',vehicle.boosting);
  }
}
function updateVehiclePrompt(){
  const button=$('vehicle-enter');if(expedition?.updatePrompt()||state.expeditionPanel||expedition?.seated){button.hidden=true;return;}
  let visible=state.active&&!state.panel&&!state.inventory&&!state.scope&&!state.hiddenUI&&vehicle.canEnter(camera,walker);
  if(visible){
    vehicle.promptPosition(promptPoint).project(camera);
    visible=promptPoint.z>=-1&&promptPoint.z<=1&&Math.abs(promptPoint.x)<1.08&&Math.abs(promptPoint.y)<1.08;
    if(visible)button.style.transform=`translate3d(${(promptPoint.x*.5+.5)*innerWidth}px,${(-promptPoint.y*.5+.5)*innerHeight}px,0) translate(-50%,-50%)`;
  }
  button.hidden=!visible;
}
function setInventory(open){
  if(open&&(!state.active||state.hiddenUI))return;
  if(open&&state.panel)setPanel(false,false);
  if(state.expeditionPanel)expedition.closeDialog();if(!open){inventory.cancel();inventory.context.hidden=true;}
  state.inventory=open;$('inventory-overlay').hidden=!open;document.body.classList.toggle('inventory-open',open);
  $('backpack-button').setAttribute('aria-expanded',open);
  for(const child of $('hud').children)if(child.id!=='inventory-overlay')child.inert=open;
  walker.enabled=state.active&&!open&&!state.panel;walker.resetInput();
  if(open){walker.lookTween=null;if(document.pointerLockElement)document.exitPointerLock();$('inventory-close').focus();}
  else $('world').focus({preventScroll:true});
}

function selectPhase(value,preset=false){
  if(state.destination==='moon'){
    const hour=sky.hourForPhase(value),delta=((hour-state.hour+36)%24)-12;
    targetHour={from:state.hour,to:state.hour+delta,elapsed:0,duration:preset?.5:.16};
    phaseControlUntil=elapsed+(preset?.55:.20);state.playing=false;
  }else state.targetPhase=value;
  $('phase').value=value*1000;
}
function applyDestinationUI(){
  const lunar=state.destination==='moon';document.body.classList.toggle('on-moon',lunar);$('destination-label').textContent=lunar?'LUNA':'TIERRA';$('phase-label').textContent=lunar?'Fase de la Tierra':'Fase lunar';$('lunar-phase-link').hidden=!lunar;$('solar-path-field').hidden=lunar;$('moon-appearance-field').hidden=lunar;$('flashlight-button').hidden=false;$('lunar-flash-setting').hidden=false;
  $('sky-note').textContent=lunar?'El cielo se revela al apartar la mirada de la luz. La Tierra permanece casi fija sobre este horizonte.':'Su brillo aparece al caer la noche y se atenúa con la luz de la Luna.';
  $('gravity-note').textContent=lunar?'Un salto más alto, una caída más lenta. Espacio: saltar · F: linterna.':'Mantén Shift para correr sin límite. Espacio: saltar · F: linterna.';
  $('aim-moon').setAttribute('aria-label',lunar?'Centrar la Tierra':'Centrar la Luna');$('aim-moon').title=lunar?'Centrar la Tierra':'Centrar la Luna';icon($('aim-moon'),lunar?'earth':'moon');
  $('phase').value=state.phase*1000;const marks=document.querySelectorAll('.time-marks span');marks.forEach((mark,i)=>mark.textContent=lunar?['0 %','25','50','75','100 %'][i]:['00','06','12','18','24'][i]);
  const preset=document.querySelectorAll('[data-hour]');preset.forEach((el,i)=>el.textContent=lunar?['Noche','Salida del Sol','Día','Puesta del Sol','Noche'][i]:['Noche','Amanecer','Día','Atardecer','Noche'][i]);
  $('controls-help').innerHTML=mobile?'<p>Joystick izquierdo: avanzar, retroceder y dirigir.</p><p>Arrastra para mirar, también desde los botones de acción. Mantén correr para sprintar; al conducir, mantén el rayo para usar el impulso.</p><p>Linterna o faros: apagados → bajas → altas. Salto y salida a la derecha.</p>':'<p><kbd>WASD</kbd> Mover / conducir · <kbd>← →</kbd> Girar</p><p><kbd>Espacio</kbd> Saltar · <kbd>Shift</kbd> Correr / impulso</p><p><kbd>F</kbd> Linterna / faros · <kbd>E</kbd> Subir / bajar</p><p>Arrastrar: mirar · Doble clic: capturar ratón · <kbd>Esc</kbd> Liberar</p><p><kbd>B</kbd> Mochila · <kbd>1–9, 0</kbd> Casilla a mano</p><p><kbd>C</kbd> Catálogo · <kbd>J</kbd> Cuaderno</p><p><kbd>R</kbd> Girar 90° · <kbd>Supr</kbd> Recuperar pieza</p><p><kbd>Ctrl Z / Y</kbd> Deshacer / rehacer</p><p><kbd>T</kbd> Telescopio · <kbd>H</kbd> Ocultar interfaz</p>';
  updateReadouts();
}
function bindUI(){
  $('moon-destination').addEventListener('click',()=>enterDestination('moon'));
  $('enter').addEventListener('click',()=>enterDestination('earth'));
  $('home').addEventListener('click',()=>{expedition?.exitSeat();if(state.expeditionPanel)expedition.closeDialog();if(state.inventory)setInventory(false);leaveVehicle(true);state.active=false;walker.enabled=false;walker.resetInput();state.playing=false;setScope(false);setPanel(false);if(document.pointerLockElement)document.exitPointerLock();audio.pause();$('welcome').hidden=false;requestAnimationFrame(()=>$('welcome').classList.remove('leaving'));$('hud').hidden=true;$('enter').focus();});
  document.body.classList.toggle('touch-controls',mobile);
  walker.bindActionButton($('jump-button'),()=>walker.jump());
  walker.bindActionButton($('flashlight-button'),()=>useLight());
  walker.bindActionButton($('sprint-button'),held=>{walker.sprintHeld=held;},true);
  walker.bindActionButton($('boost-button'),held=>vehicle.setBoost(held),true);
  inventory=new Inventory($('inventory-main'),$('inventory-quick'),$('hotbar'));
  $('backpack-button').addEventListener('click',()=>setInventory(!state.inventory));$('inventory-close').addEventListener('click',()=>setInventory(false));
  $('inventory-overlay').addEventListener('click',e=>{if(performance.now()<(inventory.suppressClick||0))return;if(e.target===$('inventory-overlay'))setInventory(false);});
  $('vehicle-enter').addEventListener('click',enterVehicle);$('vehicle-exit').addEventListener('click',()=>leaveVehicle());
  $('headlight-setting').addEventListener('change',e=>{vehicle.lightMode=Number(e.target.value);motor.switch();syncLightUI();});
  document.querySelectorAll('[data-moon-look]').forEach(b=>b.addEventListener('click',()=>{state.moonAppearance=b.dataset.moonLook;document.querySelectorAll('[data-moon-look]').forEach(el=>el.setAttribute('aria-pressed',el===b));save();}));
 $('flashlight-setting').addEventListener('change',e=>setFlashlight(e.target.checked));
  $('settings-button').addEventListener('click',()=>setPanel(!state.panel));$('close-settings').addEventListener('click',()=>setPanel(false));
  const tabs=[$('sky-tab'),$('walk-tab')];tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>activateTab(index));tab.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();activateTab(e.key==='Home'?0:e.key==='End'?1:1-index,true);}});});
  function activateTab(index,focus=false){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',i===index);tab.tabIndex=i===index?0:-1;$(tab.getAttribute('aria-controls')).hidden=i!==index;});if(focus)tabs[index].focus();}
  bindTimeLoop($('time'),hour=>{state.hour=hour;state.playing=false;targetHour=null;updateReadouts();});
  $('play').addEventListener('click',()=>{state.playing=!state.playing;targetHour=null;updateReadouts();});
  $('cycle-direction').addEventListener('click',()=>{state.direction*=-1;icon($('cycle-direction'),state.direction===1?'forward':'backward');toast(state.direction===1?'El tiempo avanza.':'El tiempo retrocede.');});
  $('timeline-toggle').addEventListener('click',()=>{const folded=$('timeline').classList.toggle('collapsed');$('timeline-toggle').setAttribute('aria-expanded',!folded);$('timeline-toggle').setAttribute('aria-label',folded?'Desplegar ciclo':'Plegar ciclo');document.querySelector('.timeline-body').inert=folded;});
  document.querySelectorAll('[data-hour]').forEach(b=>b.addEventListener('click',()=>{targetHour={from:state.hour,to:Number(b.dataset.hour),elapsed:0};state.playing=false;updateReadouts();}));
  $('phase').addEventListener('input',e=>selectPhase(Number(e.target.value)/1000));document.querySelectorAll('[data-phase]').forEach(b=>b.addEventListener('click',()=>selectPhase(Number(b.dataset.phase),true)));
  $('duration').addEventListener('input',e=>{state.duration=Number(e.target.value);$('duration-value').textContent=`${state.duration} min`;save();});
  document.querySelectorAll('[data-path]').forEach(b=>b.addEventListener('click',()=>{state.path=Number(b.dataset.path);document.querySelectorAll('[data-path]').forEach(el=>el.setAttribute('aria-pressed',el===b));}));
  $('milky').addEventListener('change',e=>{state.milky=e.target.checked;save();});
  $('fov').addEventListener('input',e=>{if(state.scope)return;state.fov=Number(e.target.value);$('fov-value').textContent=state.fov+'°';save();});
  $('speed').addEventListener('input',e=>{state.speed=Number(e.target.value);walker.speed=state.speed;$('speed-value').textContent=state.speed.toFixed(1)+'×';save();});
  $('volume').addEventListener('input',e=>{state.volume=Number(e.target.value)/100;audio.setVolume(state.volume);$('volume-value').textContent=Math.round(state.volume*100)+' %';save();});
  $('sway').addEventListener('change',e=>{state.sway=e.target.checked;walker.sway=state.sway;save();});
  $('quality').addEventListener('change',e=>{state.quality=e.target.value;autoScale=1;resize();save();});
  $('sound-button').addEventListener('click',()=>{audio.setMuted(!audio.muted);icon($('sound-button'),audio.muted?'mute':'volume');$('sound-button').setAttribute('aria-pressed',!audio.muted);$('sound-button').setAttribute('aria-label',audio.muted?'Activar ambiente':'Silenciar ambiente');if(!audio.muted)audio.start();});
  $('reset-position').addEventListener('click',()=>{expedition.exitSeat();leaveVehicle(true);vehicle.parkAt(state.destination==='moon'?-8:-7,state.destination==='moon'?1.8:-2);walker.resetPosition();toast(state.destination==='moon'?'De nuevo en el punto de llegada.':'De nuevo en el centro de la pradera.');});
  $('scope-button').addEventListener('click',()=>setScope(!state.scope));document.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',()=>setZoom(Number(b.dataset.zoom))));
  $('aim-moon').addEventListener('click',()=>{if(state.destination==='earth'&&sky.moon.y<.008){toast('La Luna está bajo el horizonte. Avanza hacia la noche.');return;}walker.aim(sky.moon);});
  $('hide-ui').addEventListener('click',()=>hideUI(true));$('show-ui').addEventListener('click',()=>hideUI(false));
  window.addEventListener('keydown',e=>{if(state.expeditionPanel)return;if(state.inventory&&e.code==='Tab'){inventory.trapTab(e,$('inventory-close'));return;}if(!state.active||e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;const tag=e.target.tagName;if(tag==='SELECT'||tag==='TEXTAREA'||e.target.isContentEditable||(tag==='INPUT'&&!['range','checkbox'].includes(e.target.type)))return;
    if(state.inventory){
      inventory.trapTab(e,$('inventory-close'));
      if(e.code==='Escape'||e.code==='KeyB'){e.preventDefault();setInventory(false);}
      else if(/^Digit[0-9]$/.test(e.code)){e.preventDefault();inventory.select((Number(e.code.slice(-1))+9)%10);}
      return;
    }
    if(e.code==='KeyB'){e.preventDefault();setInventory(true);return;}
    if(e.code==='Escape'){if(state.panel)setPanel(false);else if(state.scope)setScope(false);else if(state.hiddenUI)hideUI(false);}
    if(e.code==='KeyE'&&!state.panel){e.preventDefault();if(!expedition.interact())vehicle.mounted?leaveVehicle():enterVehicle();}
    if(e.code==='KeyF'&&!state.panel){e.preventDefault();useLight();}
    if(e.code==='KeyT'&&!state.panel){e.preventDefault();setScope(!state.scope);}
    if(e.code==='KeyH'){e.preventDefault();hideUI(!state.hiddenUI);}
    if(e.code==='KeyM')$('sound-button').click();
    if(tag!=='INPUT'&&/^Digit[0-9]$/.test(e.code)&&!state.panel){e.preventDefault();const key=Number(e.code.slice(-1));if(state.scope&&key<4)setZoom(key);else inventory.select((key+9)%10);}

  });
  // Keep sliders keyboard-operable, while mouse/touch release doesn't trap WASD.
  document.querySelectorAll('input[type=range]').forEach(input=>input.addEventListener('pointerup',()=>input.blur()));
  document.addEventListener('pointerdown',e=>{if(state.panel&&!$('settings').contains(e.target)&&!$('settings-button').contains(e.target))setPanel(false,false);});
  updateReadouts();
}
function setPanel(open,focus=true){if(open&&state.inventory)setInventory(false);state.panel=open;showSurface($('settings'),open);$('settings-button').setAttribute('aria-expanded',open);document.body.classList.toggle('panel-open',open);walker.enabled=state.active&&!open&&!state.inventory;walker.resetInput();if(open){if(document.pointerLockElement)document.exitPointerLock();if(focus)$('close-settings').focus();}else if(focus)$('settings-button').focus();}
function hideUI(hidden){state.hiddenUI=hidden;if(hidden){if(state.inventory)setInventory(false);setPanel(false,false);}document.body.classList.toggle('ui-hidden',hidden);$('hud').inert=hidden;$('show-ui').hidden=!hidden;if(hidden)$('show-ui').focus();else $('world').focus({preventScroll:true});}
function setScope(on){if(!on&&state.mountedScope){expedition.exitSeat();return;}state.scope=on;document.body.classList.toggle('using-scope',on);$('lens').classList.toggle('active',on);showSurface($('scope-controls'),on);$('scope-button').setAttribute('aria-pressed',on);$('scope-button').setAttribute('aria-label',on?'Guardar telescopio':'Usar telescopio');$('scope-label').textContent=on?'Guardar':'Telescopio';$('fov').disabled=on;$('fov-note').textContent=on?'Guarda el telescopio para cambiar el campo de visión.':'Se ajusta con el telescopio guardado.';if(on)walker.resetInput();}
function setZoom(level){state.zoom=level;document.querySelectorAll('[data-zoom]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.zoom)===level));}
function syncPreferences(){document.querySelectorAll('[data-moon-look]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.moonLook===state.moonAppearance));for(const id of ['fov','speed','duration','quality'])$(id).value=state[id];$('volume').value=Math.round(state.volume*100);$('milky').checked=state.milky;$('sway').checked=state.sway;$('fov-value').textContent=state.fov+'°';$('speed-value').textContent=state.speed.toFixed(1)+'×';$('volume-value').textContent=Math.round(state.volume*100)+' %';$('duration-value').textContent=state.duration+' min';if(mobile)$('device-hint').textContent='Joystick para caminar · Arrastra para mirar';}
function updateReadouts(){
  const h=state.hour%24,m=Math.floor(h*60),time=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  $('clock').textContent=time;$('time').value=state.hour;$('time').setAttribute('aria-valuetext',time);
  $('moment-name').textContent=h<4.8||h>20?'Bajo las estrellas':h<6?'Antes del amanecer':h<7.5?'La primera luz':h<16.7?'A cielo abierto':h<18?'Luz de la tarde':h<19?'El último resplandor':'La hora azul';
  icon($('play'),state.playing?'pause':'play');$('play').setAttribute('aria-pressed',state.playing);$('play').setAttribute('aria-label',state.playing?'Pausar ciclo':'Reproducir ciclo');$('timeline-status').textContent=state.playing?`Un día en ${state.duration} min`:'El tiempo está en tus manos';
  const deg=(((walker?.yaw||0)*180/Math.PI)%360+360)%360;const labels=['N','NE','E','SE','S','SO','O','NO'];$('bearing').textContent=labels[Math.round(deg/45)%8];$('degrees').textContent=Math.round(deg)%360+'°';
  if(state.destination==='moon'){$('clock').textContent=Math.round(state.hour/24*100)+' %';$('time').setAttribute('aria-valuetext','Ciclo lunar, '+Math.round(state.hour/24*100)+' por ciento');$('moment-name').textContent=sky.sun.y>.01?'Bajo el Sol':sky.illumination>.12?'La luz de la Tierra':'La noche lunar';$('timeline-status').textContent=state.playing?`Un ciclo lunar en ${state.duration} min`:'29,53 días terrestres · ciclo libre';if(elapsed>=phaseControlUntil)$('phase').value=state.phase*1000;}
  const illuminated=Math.round((1-Math.cos(state.phase*Math.PI*2))*.5*100),name=state.destination==='moon'?phaseName(state.phase).replace('Luna','Tierra'):phaseName(state.phase);$('phase-value').textContent=illuminated+' % iluminada';$('phase-name').innerHTML=`${name}<small>La luz recorre su superficie.</small>`;$('phase').setAttribute('aria-valuetext',`${name}, ${illuminated} por ciento iluminada`);
  if(state.panel&&!$('sky-settings').hidden)drawPhase();
}
function setupMoonPreview(image){const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,256,128);phaseImageData=ctx.getImageData(0,0,256,128).data;lastPreviewKey='';drawPhase();}
function drawPhase(){if(!phaseImageData)return;const lunar=state.destination==='moon',key=state.destination+':'+(lunar?state.hour:state.phase).toFixed(4);if(key===lastPreviewKey)return;lastPreviewKey=key;
  const c=$('phase-preview'),ctx=c.getContext('2d'),n=104,data=previewBuffer||(previewBuffer=ctx.createImageData(n,n)),a=state.phase*Math.PI*2;
  const light=lunar?sky.u.earthLight.value:null,lx=light?.x??Math.sin(a),ly=light?.y??.025,lz=light?.z??-Math.cos(a),norm=Math.hypot(lx,ly,lz)||1,spin=lunar?sky.u.earthSpin.value+.01:0,tilt=lunar?.4091:0,ct=Math.cos(tilt),st=Math.sin(tilt);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const px=(x+.5-n/2)/(n/2-2),py=(n/2-y-.5)/(n/2-2),rr=px*px+py*py;if(rr>=1)continue;const z=Math.sqrt(1-rr),dot=(px*lx+py*ly+z*lz)/norm,mx=px*ct-py*st,my=px*st+py*ct;
    const u=(1.5+spin+Math.atan2(mx,z)/(Math.PI*2))%1,v=.5-Math.asin(clamp(my,-1,1))/Math.PI;
    const src=(clamp(Math.floor(v*128),0,127)*256+clamp(Math.floor(u*256),0,255))*4,dst=(y*n+x)*4,edge=smooth(lunar?-.07:-.055,lunar?.09:.070,dot),k=(.18+.82*Math.sqrt(Math.max(0,dot)))*edge+(lunar?0:.018)*(1-edge);for(let b=0;b<3;b++)data.data[dst+b]=phaseImageData[src+b]*k*1.4;data.data[dst+3]=255;}ctx.putImageData(data,0,0);
}
function frame(now){
  if(document.hidden||contextLost)return;raf=requestAnimationFrame(frame);const raw=frameTime?(now-frameTime)/1000:1/60;const dt=Math.min(.05,raw);frameTime=now;elapsed+=dt;
  if(targetHour){targetHour.elapsed+=dt;const p=clamp(targetHour.elapsed/(targetHour.duration||.9)),s=p*p*(3-2*p);state.hour=cycleHour(targetHour.from+(targetHour.to-targetHour.from)*s);if(p===1)targetHour=null;}
  else if(state.active&&state.playing)state.hour=cycleHour(state.hour+state.direction*Math.min(raw,1)*24/(state.duration*60));
  if(state.destination==='earth'){state.phase+=(state.targetPhase-state.phase)*(1-Math.exp(-dt*10));if(Math.abs(state.targetPhase-state.phase)<.00001)state.phase=state.targetPhase;}
  const reveal=state.scope?state.zoom/3:0;state.zoomReveal+=(reveal-state.zoomReveal)*(1-Math.exp(-dt*5));
  const desired=targetFov();if(camera.fov!==desired){camera.fov=Math.exp(Math.log(camera.fov)+(Math.log(desired)-Math.log(camera.fov))*(1-Math.exp(-dt*(reduced?20:5))));if(Math.abs(camera.fov-desired)<.0001)camera.fov=desired;camera.updateProjectionMatrix();}
  walker.sensitivity=state.scope?Math.max(.008,Math.tan(camera.fov*Math.PI/360)/Math.tan(state.fov*Math.PI/360)):1;expedition.beforeMotion();walker.update(dt);expedition.afterMotion();
  if(!vehicle.mounted){vehicle.integrate(dt,0,0,state.active&&!state.panel&&!state.inventory);vehicle.collideWalker(walker);if(!walker.driver){camera.position.x=walker.pos.x;camera.position.z=walker.pos.z;}}
  vehicle.updateLighting(dt);state.headlightExposure=Math.max(vehicle.exposure(camera),environments[state.destination].world.lights.exposure(camera));
  sky.update(camera,state,elapsed,pixelRatio());expedition.update(elapsed,dt,pixelRatio());terrain.prepareLighting?.(renderer,camera,sky);terrain.update(camera,sky,elapsed,state);vehicle.updateAppearance(sky,camera,state,dt);audio.update(elapsed,sky.night,state.hour);motor.update(vehicle);updateVehiclePrompt();renderer.render(scene,camera);
  uiTime+=dt;if(uiTime>.12){uiTime=0;updateReadouts();updateVehicleUI();}
  // Reduce only pixel density under sustained pressure. Sky layers, lunar map,
  // star catalogue and grass geometry remain intact; never degrade from one spike.
  if(state.active&&state.quality==='auto'&&raw<.2){performanceSum+=raw;performanceFrames++;if(performanceFrames===240){const avg=performanceSum/performanceFrames;performanceSum=0;performanceFrames=0;if(avg>.032&&autoScale>.76){autoScale=Math.max(.76,autoScale-.08);resize();}else if(avg<.018&&autoScale<1){autoScale=Math.min(1,autoScale+.04);resize();}}}
}
function registerSkyTools(){
  window.addEventListener('expedition-import',()=>{for(const [name,env] of Object.entries(environments)){const data=localStorage.getItem('sky-expedition-world-'+name+'-v1');if(data&&env.world)env.world.load(JSON.parse(data));if(env.celestial)env.celestial.setDate(localStorage.getItem('sky-expedition-date'));}expedition.activate();});
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const snapshot=()=>({destination:state.active?state.destination:'selector',hour:Number(state.hour.toFixed(3)),phase:Number(state.phase.toFixed(3)),playing:state.playing,telescope:state.scope,zoom:state.zoom});
  const definitions=[
    {name:'read_sky_state',title:'Leer estado del cielo',description:'Lee el momento del día, la fase lunar y el telescopio de esta experiencia.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>snapshot()},
    {name:'set_cycle_time',title:'Elegir hora del ciclo',description:'Mueve el mismo control visible de día y noche y deja el ciclo en pausa. Funciona dentro del destino activo.',inputSchema:{type:'object',properties:{hour:{type:'number',minimum:0,maximum:24}},required:['hour'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{
      if(!input||typeof input!=='object'||Object.keys(input).length!==1||typeof input.hour!=='number'||!Number.isFinite(input.hour)||input.hour<0||input.hour>24)throw new Error('La hora debe ser un número entre 0 y 24.');
      if(!state.active)throw new Error('Entra a un destino antes de modificar su cielo.');
      $('time').value=input.hour;$('time').dispatchEvent(new Event('input',{bubbles:true}));return snapshot();
    }}
  ];
  for(const tool of definitions){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
init();
