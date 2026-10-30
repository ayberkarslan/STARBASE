import {useEffect,useRef,useState} from 'react';
import {YRT_Button as Button,YRT_IconButton as IconButton} from '../buttons.jsx';
import {ChevronLeft,ChevronRight,Download,Plus,Trash2,Upload} from 'lucide-react';
import {parseNumericRows,parseSeriesCsv,type NumericColumn,type NumericRow} from './numericSeries';
import {downloadFile as download} from './utils';

export default function NumericSeriesEditor({label,columns,value=[],onApply,maxRows=10000}:{label:string;columns:readonly NumericColumn[];value?:NumericRow[];onApply:(rows:NumericRow[])=>void;maxRows?:number}){
 const encode=()=>value.map(row=>columns.map(c=>row[c.key]===undefined?'':String(row[c.key])));
 const signature=JSON.stringify(value),[rows,setRows]=useState(encode),[page,setPage]=useState(0),[error,setError]=useState('');const file=useRef<HTMLInputElement>(null);
 useEffect(()=>{setRows(encode());setError('');setPage(0)},[signature]);
 const pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages-1);
 const dirty=JSON.stringify(rows)!==JSON.stringify(encode());
 function apply(){try{if(rows.length>maxRows)throw Error(`En fazla ${maxRows} satır girilebilir.`);const parsed=parseNumericRows(rows,columns),normalized=parsed.map(row=>columns.map(c=>row[c.key]===undefined?'':String(row[c.key])));if(JSON.stringify(normalized)!==JSON.stringify(encode()))onApply(parsed);setRows(normalized);setError('')}catch(e){setError(e instanceof Error?e.message:'Veriler uygulanamadı.')}}
 async function load(input?:File){if(!input)return;try{if(input.size>2_000_000)throw Error('CSV en fazla 2 MB olabilir.');const next=parseSeriesCsv(await input.text(),columns);if(next.length>maxRows)throw Error(`En fazla ${maxRows} satır girilebilir.`);setRows(next);setPage(0);setError('')}catch(e){setError(e instanceof Error?e.message:'CSV okunamadı.')}finally{if(file.current)file.current.value=''}}
 return <div className="series-editor" role="group" aria-label={label}>
  <div className="series-actions"><span>{rows.length} satır{dirty?' · Düzenlendi':''}</span><div>
   <input ref={file} hidden type="file" accept=".csv,text/csv" onChange={e=>void load(e.target.files?.[0])}/>
   <IconButton variant="ghost" size="sm" label={`${label} CSV aç`} onClick={()=>file.current?.click()}><Upload size={15}/></IconButton>
   <IconButton variant="ghost" size="sm" label={`${label} CSV indir`} onClick={()=>download('profile.csv',[columns.map(c=>c.key).join(','),...rows.map(r=>r.join(','))].join('\n'),'text/csv')}><Download size={15}/></IconButton>
   <IconButton variant="ghost" size="sm" label={`${label} satır ekle`} disabled={rows.length>=maxRows} onClick={()=>{setRows([...rows,columns.map(()=> '')]);setPage(Math.floor(rows.length/25));setError('')}}><Plus size={15}/></IconButton>
  </div></div>
  <div className="series-table"><table><thead><tr><th>#</th>{columns.map(c=><th key={c.key}>{c.label}<span>{c.unit}</span></th>)}<th/></tr></thead><tbody>{rows.slice(current*25,(current+1)*25).map((row,index)=>{const i=current*25+index;return <tr key={i}><th>{i+1}</th>{columns.map((c,j)=><td key={c.key}><input aria-label={`${label} ${i+1} ${c.label}`} inputMode="decimal" placeholder={c.optional?'—':''} value={row[j]} onChange={e=>{setRows(rows.map((r,n)=>n===i?r.map((v,k)=>k===j?e.target.value:v):r));setError('')}}/></td>)}<td><IconButton variant="ghost" size="sm" label={`${label} ${i+1} satırı sil`} onClick={()=>{setRows(rows.filter((_,n)=>n!==i));setError('')}}><Trash2 size={14}/></IconButton></td></tr>})}</tbody></table></div>
  <div className="series-actions"><div>{pages>1&&<><IconButton variant="ghost" size="sm" label="Önceki profil sayfası" disabled={current===0} onClick={()=>setPage(current-1)}><ChevronLeft size={15}/></IconButton><span>{current+1} / {pages}</span><IconButton variant="ghost" size="sm" label="Sonraki profil sayfası" disabled={current===pages-1} onClick={()=>setPage(current+1)}><ChevronRight size={15}/></IconButton></>}</div><Button size="sm" disabled={!dirty} onClick={apply}>Uygula</Button></div>
  {error&&<p className="series-error" role="alert">{error}</p>}
 </div>;
}
