export interface HierarchyEntry {id:string;parentId:string|null;label:string;meta?:string}
export type MovePlacement='inside'|'before'|'after';
export interface HierarchyMove {id:string;placement:MovePlacement}
export function validateHierarchyMove(items:HierarchyEntry[],source:string,target:HierarchyMove):string|undefined {
 const byId=new Map(items.map(item=>[item.id,item])),from=byId.get(source),to=byId.get(target.id);
 if(!from||!to)return 'Öğe bulunamadı.';
 if(!from.parentId)return 'Kök taşınamaz.';
 if(source===target.id)return 'Öğe kendisine taşınamaz.';
 let current=target.placement==='inside'?to:to.parentId?byId.get(to.parentId):undefined;
 if(!current)return 'Kökün dışına taşınamaz.';
 const seen=new Set<string>();while(current){if(current.id===source||seen.has(current.id))return 'Döngüsel bağlantı oluşamaz.';seen.add(current.id);current=current.parentId?byId.get(current.parentId):undefined}
 return undefined;
}
export function hierarchyPositions(items:HierarchyEntry[]){
 const ids=new Set(items.map(item=>item.id));if(ids.size!==items.length)throw Error('Duplicate hierarchy id');
 const children=new Map<string|null,HierarchyEntry[]>();for(const item of items){if(item.parentId&&!ids.has(item.parentId))throw Error('Missing hierarchy parent');const list=children.get(item.parentId)??[];list.push(item);children.set(item.parentId,list)}
 const nodes:{item:HierarchyEntry;x:number;y:number}[]=[],seen=new Set<string>();let row=0;
 function visit(item:HierarchyEntry,depth:number){if(seen.has(item.id))throw Error('Hierarchy cycle');seen.add(item.id);const own=nodes.length;nodes.push({item,x:24+depth*280,y:0});const kids=children.get(item.id)??[];if(kids.length){const start=row;for(const child of kids)visit(child,depth+1);nodes[own].y=(start+row-1)*100/2+24}else nodes[own].y=row++*100+24}
 for(const root of children.get(null)??[])visit(root,0);
 if(seen.size!==items.length)throw Error('Hierarchy cycle');
 return {nodes,width:Math.max(320,...nodes.map(n=>n.x+250)),height:Math.max(240,row*100+48)};
}
