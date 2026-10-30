export interface NumericColumn {key:string;label:string;unit:string;optional?:boolean;min?:number;max?:number}
export type NumericRow=Record<string,number|undefined>;
export function parseNumericRows(rows:string[][],columns:readonly NumericColumn[]):NumericRow[]{
 if(rows.length>10000)throw Error('En fazla 10000 satır girilebilir.');
 return rows.map((cells,index)=>{
  if(cells.length!==columns.length)throw Error(`${index+1}. satır: sütun sayısı geçersiz.`);
  return Object.fromEntries(columns.map((column,i)=>{
   const text=cells[i].trim().replace(',','.');
   if(text===''&&column.optional)return [column.key,undefined];
   const value=Number(text);
   if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)||!Number.isFinite(value)||value<(column.min??-Infinity)||value>(column.max??Infinity))throw Error(`${index+1}. satır: ${column.label} geçersiz.`);
   return [column.key,value];
  }));
 });
}
export function parseSeriesCsv(text:string,columns:readonly NumericColumn[]):string[][]{
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
 if(lines.shift()?.trim()!==columns.map(c=>c.key).join(','))throw Error(`CSV başlığı: ${columns.map(c=>c.key).join(',')}`);
 const rows=lines.filter(line=>line.trim()).map(line=>line.split(','));parseNumericRows(rows,columns);return rows;
}
