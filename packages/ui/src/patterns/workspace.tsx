import {useEffect,useState,type ReactNode} from 'react';
import {YRT_SelectMenu as SelectMenu} from '../select.jsx';
export const fmt=(n:number,digits=1)=>Number.isFinite(n)?n.toLocaleString('tr-TR',{maximumFractionDigits:digits}):'—';
export function Panel({title,actions,children,className=''}:{title:ReactNode;actions?:ReactNode;children:ReactNode;className?:string}){return <section className={`engineering-panel ${className}`}><div className="engineering-toolbar"><span>{title}</span><div className="engineering-actions">{actions}</div></div>{children}</section>}
export function Metric({label,value,unit}:{label:string;value:ReactNode;unit?:string}){return <div className="engineering-metric"><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>}
export function NumberField({label,value,onChange,unit='',min=0,max=1e9}:{label:string;value:number;onChange:(n:number)=>void;unit?:string;min?:number;max?:number}){
 const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);const n=Number(draft);const valid=draft.trim()!==''&&Number.isFinite(n)&&n>=min&&n<=max;
 return <label className="engineering-number"><span>{label}</span><div><input aria-label={label} inputMode="decimal" value={draft} aria-invalid={!valid} onChange={e=>{setDraft(e.target.value);const number=Number(e.target.value);if(e.target.value.trim()&&Number.isFinite(number)&&number>=min&&number<=max)onChange(number)}} onBlur={()=>{if(!valid)setDraft(String(value))}}/><small>{unit}</small></div></label>;
}
export function Choice({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string}[];onChange:(v:string)=>void}){return <div className="engineering-choice"><span>{label}</span><SelectMenu label={label} value={value} options={options} onChange={onChange}/></div>}
export function Empty({icon,children}:{icon?:ReactNode;children:ReactNode}){return <div className="engineering-empty">{icon}<span>{children}</span></div>}
