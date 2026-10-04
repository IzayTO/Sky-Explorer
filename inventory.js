import {ITEMS,CATEGORIES,MAX_STACK,itemIcon,validStack} from './items.js?v=3.1';
const STORAGE='sky-expedition-inventory-v1';
export class InventoryStore {
  constructor(){this.slots=Array(40).fill(null);this.selected=0;this.onChange=()=>{};}
  changed(){this.onChange();}
  add(id,qty=1){if(!ITEMS[id]||!Number.isInteger(qty)||qty<1)return qty;let left=qty;
    for(let i=0;i<40&&left;i++){const s=this.slots[i];if(s?.id===id){const n=Math.min(30-s.qty,left);s.qty+=n;left-=n;}}
    for(let i=0;i<40&&left;i++)if(!this.slots[i]){const n=Math.min(30,left);this.slots[i]={id,qty:n};left-=n;}
    this.changed();return left;
  }
  transfer(from,to){if(from===to||!this.slots[from]||to<0||to>=40)return;const a=this.slots[from],b=this.slots[to];
    if(b?.id===a.id){const n=Math.min(MAX_STACK-b.qty,a.qty);b.qty+=n;a.qty-=n;if(!a.qty)this.slots[from]=null;}
    else [this.slots[from],this.slots[to]]=[b,a];this.changed();
  }
  create(id,qty,to){if(!ITEMS[id]||ITEMS[id].sample||to<0||to>=40)return false;qty=Math.max(1,Math.min(30,Math.round(qty)));const s=this.slots[to];
    if(s&&s.id!==id)return false;if(s)s.qty=Math.min(30,s.qty+qty);else this.slots[to]={id,qty};this.changed();return true;
  }
  consume(index,qty=1){const s=this.slots[index];if(!s||s.qty<qty)return false;s.qty-=qty;if(!s.qty)this.slots[index]=null;this.changed();return true;}
  count(id){return this.slots.reduce((n,s)=>n+(s?.id===id?s.qty:0),0);}
  remove(id,qty){if(this.count(id)<qty)return false;for(let i=0;i<40&&qty;i++){const s=this.slots[i];if(s?.id===id){const n=Math.min(qty,s.qty);s.qty-=n;qty-=n;if(!s.qty)this.slots[i]=null;}}this.changed();return true;}
  split(index){const s=this.slots[index],empty=this.slots.indexOf(null);if(!s||s.qty<2||empty<0)return false;const qty=Math.floor(s.qty/2);s.qty-=qty;this.slots[empty]={id:s.id,qty};this.changed();return true;}
  select(index){if(index>=0&&index<10){this.selected=index;this.changed();}}
  get hand(){return this.slots[30+this.selected];}
  snapshot(){return this.slots.map(s=>s?{...s}:null);}
  restore(slots){this.slots=Array.from({length:40},(_,i)=>validStack(slots?.[i]));this.changed();}
}
export class Inventory extends InventoryStore {
  constructor(main,quick,hotbar){
    super();this.main=[];this.quick=[];this.hotbar=[];this.onSelect=()=>{};this.onContents=()=>{};this.onDrop=()=>false;this.notify=()=>{};this.quantity=1;this.drag=null;this.category=CATEGORIES[0];this.catalogOpen=false;
    this.panel=document.querySelector('.inventory-panel');this.overlay=document.getElementById('inventory-overlay');
    try{const d=JSON.parse(localStorage.getItem(STORAGE));if(d){this.slots=Array.from({length:40},(_,i)=>validStack(d.slots?.[i]));this.selected=Math.max(0,Math.min(9,Number(d.selected)||0));}}catch{}
    const make=(parent,index,hot=false)=>{const b=document.createElement('button');b.type='button';b.className='inventory-slot';b.dataset.index=index;
      b.addEventListener('click',e=>{if(performance.now()<(this.suppressClick||0)){e.preventDefault();e.stopPropagation();return;}if(index>=30){this.select(index-30);}if(hot)document.getElementById('world').focus({preventScroll:true});});
      if(!hot){b.addEventListener('pointerdown',e=>this.begin(e,{index}));b.addEventListener('contextmenu',e=>{e.preventDefault();this.menu(index,e.clientX,e.clientY);});}
      parent.appendChild(b);return b;};
    for(let i=0;i<30;i++)this.main.push(make(main,i));
    for(let i=0;i<10;i++){this.quick.push(make(quick,i+30));this.hotbar.push(make(hotbar,i+30,true));}
    this.onChange=()=>{this.render();this.save();this.onContents();};
    const content=document.createElement('div');content.className='inventory-layout';const bag=document.createElement('div');bag.className='inventory-bag';
    while(this.panel.children.length>1)bag.appendChild(this.panel.children[1]);
    this.catalog=document.createElement('aside');this.catalog.className='creative-catalog';this.catalog.hidden=true;
    this.catalog.innerHTML='<h3>Catálogo de campo</h3><nav class="catalog-tabs" aria-label="Categorías"></nav><label class="catalog-quantity">Cantidad <input type="range" min="1" max="30" value="1"><output>1</output></label><p class="catalog-hint">Desliza para explorar · Mantén para arrastrar</p><div class="catalog-items"></div><div class="catalog-paging"><button type="button" aria-label="Objetos anteriores">↑</button><span>Explora el catálogo</span><button type="button" aria-label="Más objetos">↓</button></div>';
    content.append(this.catalog,bag);this.panel.append(content);
    this.catalog.querySelectorAll('.catalog-paging button').forEach((b,i)=>b.onclick=()=>{const list=this.catalog.querySelector('.catalog-items');list.scrollBy({top:(i?1:-1)*Math.max(80,list.clientHeight*.8),behavior:'smooth'});});const nav=this.catalog.querySelector('nav');CATEGORIES.forEach(name=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.addEventListener('click',()=>{this.category=name;this.renderCatalog();});nav.append(b);});
    this.catalog.querySelector('input').addEventListener('input',e=>{this.quantity=Number(e.target.value);this.catalog.querySelector('output').textContent=this.quantity;});
    const book=document.createElement('button');book.type='button';book.className='icon-button catalog-toggle';book.title='Catálogo creativo';book.setAttribute('aria-label','Abrir catálogo creativo');book.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 5C8 2 3 3 3 3v17s5-1 9 1c4-2 9-1 9-1V3s-5-1-9 2Zm0 0v16"/></svg>';book.addEventListener('click',()=>this.toggleCatalog());this.panel.querySelector('header').insertBefore(book,document.getElementById('inventory-close'));this.book=book;
    this.ghost=document.createElement('div');this.ghost.className='stack-drag';this.ghost.hidden=true;document.body.append(this.ghost);
    this.context=document.createElement('div');this.context.className='stack-menu glass';this.context.hidden=true;this.context.setAttribute('role','dialog');this.overlay.append(this.context);
    document.addEventListener('pointermove',e=>this.move(e));document.addEventListener('pointerup',e=>this.end(e));document.addEventListener('pointercancel',()=>this.cancel());
    document.addEventListener('pointerdown',e=>{if(!this.context.contains(e.target))this.context.hidden=true;});
    window.addEventListener('blur',()=>this.cancel());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();});
    this.render();this.renderCatalog();document.getElementById('inventory-note').textContent='Arrastra entre casillas. Fuera de esta ventana: lanzar. Clic derecho o pulsación larga: opciones.';
  }
  select(index){super.select(index);this.onSelect(index);}
  save(){try{localStorage.setItem(STORAGE,JSON.stringify({slots:this.slots,selected:this.selected}));}catch{this.notify('No se pudo guardar la mochila. Exporta tu expedición.');}}
  render(){const draw=(b,i)=>{const s=this.slots[i],item=s&&ITEMS[s.id],key=(s?s.id+':'+s.qty:'')+':'+this.selected;if(b.dataset.renderKey===key)return;b.dataset.renderKey=key;
      b.innerHTML=(i>=30?`<span class="slot-number">${(i-29)%10}</span>`:'')+(item?itemIcon(item)+`<span class="stack-count">${s.qty}</span>`:'');
      b.setAttribute('aria-label',(item?item.name+' ×'+s.qty:'Vacío')+' · '+(i>=30?'A mano ':'Mochila ')+(i>=30?i-29:i+1));b.title=item?item.name+' ×'+s.qty:'Casilla vacía';if(i>=30)b.setAttribute('aria-pressed',i-30===this.selected);
    };this.main.forEach((b,i)=>draw(b,i));this.quick.forEach((b,i)=>draw(b,i+30));this.hotbar.forEach((b,i)=>draw(b,i+30));}
  toggleCatalog(on=!this.catalogOpen){this.catalogOpen=on;this.catalog.hidden=!on;this.panel.classList.toggle('has-catalog',on);this.book.setAttribute('aria-expanded',on);}
  renderCatalog(){this.catalog.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-pressed',b.textContent===this.category));const list=this.catalog.querySelector('.catalog-items');list.replaceChildren();
    for(const item of Object.values(ITEMS).filter(i=>i.category===this.category&&!i.sample)){const b=document.createElement('button');b.type='button';b.className='catalog-item';b.innerHTML=itemIcon(item);const span=document.createElement('span');span.textContent=item.name;b.append(span);b.title=item.note||item.name;b.addEventListener('pointerdown',e=>this.begin(e,{id:item.id}));b.addEventListener('click',e=>{if(performance.now()<(this.suppressClick||0))return;const empty=this.slots.indexOf(null);if(empty<0)return this.notify('Tu mochila está llena.');this.create(item.id,this.quantity,empty);this.notify(item.name+' añadido a la mochila.');});list.append(b);}
  }
  begin(e,source){if(e.button!==0||this.overlay.hidden||this.drag)return;if(source.index!==undefined&&!this.slots[source.index])return;e.preventDefault();e.stopPropagation();this.context.hidden=true;
    const stack=source.id?{id:source.id,qty:this.quantity}:{...this.slots[source.index]},touch=e.pointerType!=='mouse';this.drag={...source,stack,idPointer:e.pointerId,x:e.clientX,y:e.clientY,lastY:e.clientY,active:false,element:e.currentTarget,touch,scrolling:false};
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if(touch&&source.id)this.hold=setTimeout(()=>{const d=this.drag;if(d&&!d.scrolling){d.active=true;this.showDrag(d,d.x,d.y);d.element.classList.add('catalog-lifted');}},300);
    else if(touch&&source.index!==undefined)this.hold=setTimeout(()=>{if(this.drag&&!this.drag.active){this.menu(source.index,e.clientX,e.clientY);this.cancel();this.suppressClick=performance.now()+500;}},480);
  }
  showDrag(d,x,y){this.ghost.hidden=false;if(this.ghost.dataset.item!==d.stack.id+':'+d.stack.qty){this.ghost.innerHTML=itemIcon(d.stack.id)+`<b>${d.stack.qty}</b>`;this.ghost.dataset.item=d.stack.id+':'+d.stack.qty;}this.ghost.style.transform=`translate(${x+14}px,${y-40}px)`;}
  move(e){const d=this.drag;if(!d||d.idPointer!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(d.touch&&d.id&&!d.active){if(d.scrolling||(Math.abs(dy)>7&&Math.abs(dy)>Math.abs(dx)*.8)){clearTimeout(this.hold);d.scrolling=true;this.catalog.querySelector('.catalog-items').scrollTop-=e.clientY-d.lastY;d.lastY=e.clientY;e.preventDefault();return;}if(Math.abs(dx)<12)return;}
    if(!d.active&&Math.hypot(dx,dy)<7)return;clearTimeout(this.hold);d.active=true;e.preventDefault();this.showDrag(d,e.clientX,e.clientY);
    document.querySelectorAll('.drop-target').forEach(b=>b.classList.remove('drop-target'));const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.inventory-slot');hit?.classList.add('drop-target');
  }
  end(e){const d=this.drag;if(!d||d.idPointer!==e.pointerId)return;clearTimeout(this.hold);
    if(d.scrolling){this.suppressClick=performance.now()+450;this.cancel();return;}if(d.active){e.preventDefault();this.suppressClick=performance.now()+450;const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.inventory-slot'),to=hit?Number(hit.dataset.index):-1;
      if(to>=0){if(d.id){if(!this.create(d.id,d.stack.qty,to))this.notify('Esa casilla contiene otro objeto.');}else this.transfer(d.index,to);}
      else{const r=this.panel.getBoundingClientRect(),outside=e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;if(outside&&this.onDrop(d.stack)){if(d.index!==undefined)this.consume(d.index,d.stack.qty);this.notify('Objeto lanzado.');}}
    }else if(d.id){const empty=this.slots.indexOf(null);this.suppressClick=performance.now()+450;if(empty<0)this.notify('Tu mochila está llena.');else{this.create(d.id,d.stack.qty,empty);this.notify(ITEMS[d.id].name+' añadido a la mochila.');}}else if(d.index>=30)this.select(d.index-30);this.cancel();
  }
  cancel(){clearTimeout(this.hold);this.drag?.element.classList.remove('catalog-lifted');if(this.drag?.element.hasPointerCapture?.(this.drag.idPointer))this.drag.element.releasePointerCapture(this.drag.idPointer);this.drag=null;this.ghost.hidden=true;document.querySelectorAll('.drop-target').forEach(b=>b.classList.remove('drop-target'));}
  menu(index,x,y){const s=this.slots[index];if(!s)return;this.context.replaceChildren();const title=document.createElement('strong');title.textContent=ITEMS[s.id].name;this.context.append(title);
    const quantity=document.createElement('label');quantity.textContent='Elegir cantidad ';const range=document.createElement('input'),out=document.createElement('output');range.type='range';range.min=1;range.max=30;range.value=s.qty;out.textContent=s.qty;range.addEventListener('input',()=>{if(this.slots[index]?.id!==s.id)return;this.slots[index].qty=Number(range.value);out.textContent=range.value;this.changed();});quantity.append(range,out);this.context.append(quantity);
    const actions=[['Rellenar a 30',()=>{s.qty=30;this.changed();}],['Dividir',()=>{if(!this.split(index))this.notify('Necesitas dos unidades y una casilla vacía.');}],['Mover a acceso rápido',()=>{let to=this.slots.findIndex((a,i)=>i>=30&&a?.id===s.id&&a.qty<30);if(to===index)to=-1;if(to<0)to=this.slots.findIndex((a,i)=>i>=30&&!a);if(to<0)this.notify('Los diez accesos están ocupados.');else this.transfer(index,to);}],['Vaciar casilla',()=>{this.slots[index]=null;this.changed();}]];
    for(const [name,fn] of actions){const b=document.createElement('button');b.type='button';b.textContent=name;b.addEventListener('click',()=>{fn();this.context.hidden=true;});this.context.append(b);}
    this.context.hidden=false;this.context.style.left=Math.max(8,Math.min(innerWidth-240,x))+'px';this.context.style.top=Math.max(8,Math.min(innerHeight-this.context.offsetHeight-8,y))+'px';range.focus();
  }
  trapTab(e){if(e.code!=='Tab')return;const nodes=[...this.overlay.querySelectorAll('button,input,select')].filter(el=>el.offsetParent!==null&&!el.disabled);if(!nodes.length)return;const i=nodes.indexOf(document.activeElement);if(i<0||(e.shiftKey&&i===0)||(!e.shiftKey&&i===nodes.length-1)){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0].focus();}}
}
