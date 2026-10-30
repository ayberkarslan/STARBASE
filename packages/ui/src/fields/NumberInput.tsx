import {useEffect,useState} from 'react';
export function NumberInput({label,unit,value,optional=false,signed=false,min=0,max=Infinity,mixed=false,integer=false,onChange}:{label:string;unit:string;value?:number;optional?:boolean;signed?:boolean;min?:number;max?:number;mixed?:boolean;integer?:boolean;onChange:(value:number|undefined)=>void}){
 const [draft,setDraft]=useState(mixed||value===undefined?'':String(value));useEffect(()=>setDraft(mixed||value===undefined?'':String(value)),[value,mixed]);
 const parse=(text:string)=>Number(text.replace(',','.'));
 const accepts=(text:string)=>optional&&text.trim()===''||text.trim()!==''&&Number.isFinite(parse(text))&&(!integer||Number.isInteger(parse(text)))&&parse(text)<=max&&(signed&&min===0||parse(text)>=min);
 const valid=mixed&&draft===''||accepts(draft);
 return <label className="inspector-number"><span>{label}</span><div><input aria-label={label} inputMode="decimal" placeholder={mixed?'Farklı':optional?'—':undefined} value={draft} aria-invalid={!valid} title={mixed?'Seçili bileşenlerde farklı değerler var':optional?'Boş: belirtilmedi':''} onChange={event=>{const text=event.target.value;setDraft(text);if(accepts(text))onChange(text.trim()===''?undefined:parse(text))}} onBlur={()=>{if(!valid)setDraft(mixed||value===undefined?'':String(value))}}/><small>{unit}</small></div></label>;
}
