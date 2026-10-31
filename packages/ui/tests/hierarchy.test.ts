import {describe,it,expect} from 'vitest';
import {hierarchyPositions,validateHierarchyMove,type HierarchyEntry} from '../src/patterns/hierarchy';
const items:HierarchyEntry[]=[{id:'root',parentId:null,label:'Root'},{id:'one',parentId:'root',label:'One'},{id:'two',parentId:'root',label:'Two'},{id:'child',parentId:'one',label:'Child'}];
describe('portable hierarchy contracts',()=>{
 it('rejects root movement, self movement, and descendant cycles',()=>{expect(validateHierarchyMove(items,'root',{id:'one',placement:'inside'})).toBeTruthy();expect(validateHierarchyMove(items,'one',{id:'one',placement:'inside'})).toBeTruthy();expect(validateHierarchyMove(items,'one',{id:'child',placement:'inside'})).toBeTruthy();expect(validateHierarchyMove(items,'one',{id:'child',placement:'before'})).toBeTruthy()});
 it('allows valid reparenting and sibling sorting',()=>{expect(validateHierarchyMove(items,'two',{id:'one',placement:'inside'})).toBeUndefined();expect(validateHierarchyMove(items,'child',{id:'two',placement:'after'})).toBeUndefined()});
 it('rejects missing targets and placement outside the root',()=>{expect(validateHierarchyMove(items,'one',{id:'missing',placement:'inside'})).toBeTruthy();expect(validateHierarchyMove(items,'one',{id:'root',placement:'before'})).toBeTruthy()});
 it('lays out a complete forest without overlap within each column',()=>{const layout=hierarchyPositions(items);expect(layout.nodes).toHaveLength(4);for(const a of layout.nodes)for(const b of layout.nodes)if(a.item.id!==b.item.id&&a.x===b.x)expect(Math.abs(a.y-b.y)).toBeGreaterThanOrEqual(100);expect(layout.width).toBeGreaterThan(600)});
 it('rejects cyclic, orphaned, and duplicate graphs before rendering',()=>{expect(()=>hierarchyPositions([{id:'a',parentId:'b',label:'a'},{id:'b',parentId:'a',label:'b'}])).toThrow('cycle');expect(()=>hierarchyPositions([{id:'a',parentId:'missing',label:'a'}])).toThrow('parent');expect(()=>hierarchyPositions([...items,items[0]])).toThrow('Duplicate')});
});
