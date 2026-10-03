// Empty inventory shell: 30 main spaces and 10 shared quick-access spaces.
// The two quick-access views represent the same slots, not extra storage.
export class Inventory {
  constructor(main,quick,hotbar){
    this.selected=0;this.main=[];this.quick=[];this.hotbar=[];
    const make=(parent,index,quickAccess)=>{
      const button=document.createElement('button');button.type='button';button.className='inventory-slot';
      button.setAttribute('aria-label',(quickAccess?'Acceso rápido ':'Inventario ')+(index+1)+', vacío');
      if(quickAccess){button.dataset.slot=String(index);button.innerHTML='<span class="slot-number">'+(index===9?'0':index+1)+'</span>';button.addEventListener('click',()=>{this.select(index);if(parent===hotbar)document.getElementById('world').focus({preventScroll:true});});}
      parent.appendChild(button);return button;
    };
    for(let i=0;i<30;i++)this.main.push(make(main,i,false));
    for(let i=0;i<10;i++){this.quick.push(make(quick,i,true));this.hotbar.push(make(hotbar,i,true));}
    this.select(0);
  }
  select(index){
    if(index<0||index>9)return;this.selected=index;
    for(let i=0;i<10;i++)for(const b of [this.quick[i],this.hotbar[i]])b.setAttribute('aria-pressed',i===index);
  }
  trapTab(event,closeButton){
    if(event.code!=='Tab')return;
    const buttons=[closeButton,...this.main,...this.quick],i=buttons.indexOf(document.activeElement);
    if(i<0||(event.shiftKey&&i===0)||(!event.shiftKey&&i===buttons.length-1)){
      event.preventDefault();buttons[event.shiftKey?buttons.length-1:0].focus();
    }
  }
}
