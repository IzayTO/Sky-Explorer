// Stored stacks contain only these IDs and quantities. Geometry is created only
// for a placed object, one preview, or a visible dropped stack.
export const CATEGORIES=['Construcción','Muebles','Iluminación','Investigación','Exterior'];
const rows=[
 ['foundation','Cimiento adaptable',0,'foundation',[6,.35,6],'Nivel horizontal; rellena la pendiente lunar.'],
 ['floor','Piso · 4 × 4 m',0,'floor',[4,.16,4]],
 ['floor-half','Piso · 4 × 2 m',0,'floor',[4,.16,2]],
 ['floor-small','Piso · 2 × 2 m',0,'floor',[2,.16,2]],
 ['wall','Panel · 4 m',0,'wall',[4,2.8,.16]],
 ['wall-half','Panel · 2 m',0,'wall',[2,2.8,.16]],
 ['wall-low','Panel bajo',0,'wall',[4,1.2,.16]],
 ['window','Panel con ventana',0,'window',[4,2.8,.16]],
 ['door','Paso de acceso',0,'door',[4,2.8,.16]],
 ['corner','Esquina exterior',0,'corner',[1,2.8,1]],
 ['roof','Cubierta · 4 × 4 m',0,'roof',[4,.20,4]],
 ['roof-half','Cubierta · 4 × 2 m',0,'roof',[4,.20,2]],
 ['column','Columna',0,'column',[.28,2.8,.28]],
 ['stairs','Escalera · 1,4 m',0,'stairs',[1.8,1.4,2.8]],
 ['stairs-high','Escalera · 2,8 m',0,'stairs',[1.8,2.8,5.6]],
 ['ramp','Rampa de acceso',0,'ramp',[2,1.4,4]],
 ['rail','Barandal',0,'rail',[4,1.05,.12]],
 ['table','Mesa de campo',1,'table',[1.6,.84,.78]],
 ['lab','Mesa de análisis',1,'lab',[1.8,1.12,.85],'Analiza muestras de suelo y regolito.'],
 ['desk','Escritorio de observación',1,'desk',[1.4,1.12,.70]],
 ['shelf','Repisa de instrumentos',1,'shelf',[1.2,.24,.40]],
 ['cabinet','Gabinete de campaña',1,'cabinet',[.85,1.4,.48]],
 ['chair','Silla de observación',1,'chair',[.55,.90,.57]],
 ['stool','Banco de laboratorio',1,'stool',[.45,.58,.45]],
 ['rack','Estantería modular',1,'rack',[1.2,1.85,.48]],
 ['storage','Caja de almacenamiento',1,'storage',[.8,.48,.5]],
 ['lamp','Lámpara de campo',2,'lamp',[.35,1.8,.35]],
 ['wall-lamp','Aplique',2,'wall-lamp',[.32,.40,.14],'Se fija a una pared.'],
 ['ceiling-lamp','Luminaria de techo',2,'ceiling-lamp',[.75,.12,.35],'Se fija debajo de una cubierta.'],
 ['telescope','Telescopio de piso',3,'telescope',[1.2,1.55,1.5],'Óptica de observatorio; orientar, mirar y ampliar.'],
 ['spectrometer','Analizador espectral',3,'tool',[.2,.3,.15]],
 ['identifier','Identificador celeste',3,'tool',[.2,.3,.15]],
 ['rangefinder','Telémetro láser',3,'tool',[.2,.3,.15]],
 ['sampler','Recolector de muestras',3,'tool',[.2,.3,.15]],
 ['camera','Cámara científica',3,'tool',[.2,.3,.15]],
 ['notebook','Cuaderno de observaciones',3,'tool',[.2,.3,.15]],
 ['seismometer','Sismómetro',3,'seismometer',[.65,.48,.65]],
 ['radio','Antena de radio',3,'radio',[1.4,2.5,1.4]],
 ['beacon','Baliza',4,'beacon',[.38,1.4,.38]],
 ['weather','Estación meteorológica',4,'weather',[1,2.3,1]],
 ['solar','Panel solar',4,'solar',[2.4,1.15,1.6]],
 ['power','Módulo de energía',4,'power',[.7,.8,.5]],
 ['soil','Muestra de suelo',3,'sample',[.15,.2,.15]],
 ['regolith','Muestra de regolito',3,'sample',[.15,.2,.15]]
];
export const ITEMS=Object.fromEntries(rows.map(([id,name,category,kind,size,note=''])=>[id,{id,name,category:CATEGORIES[category],kind,size,note,tool:kind==='tool',sample:kind==='sample',structural:category===0&&!['foundation','stairs','ramp','rail'].includes(kind),surface:kind==='wall-lamp'||kind==='shelf'?'wall':kind==='ceiling-lamp'?'ceiling':'floor'}]));
export const MAX_STACK=30;
export const PALETTE={shell:0xc9d2c9,frame:0x52616a,dark:0x24303a,blue:0x4c768c,teal:0x6a9b93,gold:0xc89d64,white:0xe1e3d4,rubber:0x35413f};
const symbols={foundation:'M3 9 12 5l9 4-9 4-9-4v9l9 4 9-4V9M12 13v9',floor:'m2 14 10-6 10 6-10 6-10-6Zm5-3 10 6m-10 0 10-6',wall:'M3 5h18v15H3zM3 15h18M7 5v15',window:'M3 4h18v17H3zM7 8h10v7H7z',door:'M3 21V4h18v17M8 21V9h8v12',roof:'m2 13 10-9 10 9M4 12v7h16v-7',stairs:'M3 20h18V5h-5v5h-5v5H6v5',ramp:'M3 20 21 5v15H3Z',chair:'M6 3v11h13v7M6 9h10v5M5 21v-7',table:'M3 10h18M5 10v11m14-11v11M3 6h18v4H3z',lamp:'M12 10v11M7 21h10M7 10h10l-2-7H9l-2 7Z',telescope:'m3 11 13-7 4 7-13 7-4-7ZM12 16v5m0-5-5 5m5-5 5 5',radio:'M6 3c-5 10 5 17 12 10L6 3Zm3 9 9-8M12 14v7m-4 0h8',solar:'m5 3 16 3-3 12L2 15 5 3Zm-2 6 16 3m-9-8-3 12m9-11-3 12M10 17v4',tool:'M8 3h8v18H8zM10 6h4v6h-4M11 17h2',beacon:'M12 4v17M6 21h12M6 9a8 8 0 0 1 12 0M9 12a4 4 0 0 1 6 0',sample:'M8 3h8v3l3 11a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4L8 6V3Zm-1 12h10',box:'m3 7 9-4 9 4v13H3V7Zm0 0h18M9 12h6'};
export function itemIcon(item){if(typeof item==='string')item=ITEMS[item];const k=item?.kind;return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${symbols[k]||symbols[{'floor':'floor','corner':'wall','column':'wall','rail':'wall','stool':'chair','desk':'table','lab':'table','shelf':'table','wall-lamp':'lamp','ceiling-lamp':'lamp','power':'solar','weather':'beacon'}[k]]||symbols.box}"/></svg>`;}
export function validStack(s){return s&&ITEMS[s.id]&&Number.isInteger(s.qty)&&s.qty>0&&s.qty<=MAX_STACK?{id:s.id,qty:s.qty}:null;}
