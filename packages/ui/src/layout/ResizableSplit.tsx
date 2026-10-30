import {Children,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {panelSizes} from './panelSizes';


export interface ResizableSplitProps {children:[ReactNode,ReactNode];axis:'x'|'y';storageKey:string;label:string;initialRatio?:number;minFirst?:number;minSecond?:number;collapsedFirst?:boolean;className?:string;storagePrefix?:string}
export default function ResizableSplit({children,axis,storageKey,label,initialRatio=.5,minFirst=180,minSecond=180,collapsedFirst=false,className='',storagePrefix='stardrop.layout.'}:ResizableSplitProps){
 const key=`${storagePrefix}${storageKey}`;
 const [ratio,setRatio]=useState(()=>{try{const saved=Number(localStorage.getItem(key));if(saved>0&&saved<1)return saved}catch{}return initialRatio});
 const container=useRef<HTMLDivElement>(null);const [total,setTotal]=useState(0);const latest=useRef(ratio);latest.current=ratio;
 const gesture=useRef<{pointerId:number;start:number;first:number;ratio:number}|null>(null);
 const sizes=panelSizes(total,ratio,minFirst,minSecond);const parts=Children.toArray(children);
 const persist=(value:number)=>{try{localStorage.setItem(key,String(value))}catch{}};
 useLayoutEffect(()=>{const node=container.current;if(!node)return;const measure=()=>setTotal(axis==='x'?node.clientWidth:node.clientHeight);measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect()},[axis]);
 const finish=()=>{if(!gesture.current)return;gesture.current=null;delete document.body.dataset.panelResizing;persist(latest.current)};
 useEffect(()=>{const cancel=()=>finish();window.addEventListener('blur',cancel);return()=>{window.removeEventListener('blur',cancel);if(gesture.current){gesture.current=null;delete document.body.dataset.panelResizing}}},[]);
 const change=(first:number)=>{const p=panelSizes(total,first/Math.max(sizes.available,1),minFirst,minSecond);const next=p.first/Math.max(p.available,1);latest.current=next;setRatio(next);return next};
 const reset=()=>{latest.current=initialRatio;setRatio(initialRatio);persist(initialRatio)};
 return <div ref={container} className={`resizable-split split-${axis} ${collapsedFirst?'split-collapsed':''} ${className}`} style={{'--split-first':`${sizes.first}px`} as CSSProperties}>
 <div className="split-pane" hidden={collapsedFirst}>{parts[0]}</div>
 <div className="split-handle" hidden={collapsedFirst} role="separator" aria-label={label} aria-orientation={axis==='x'?'vertical':'horizontal'} aria-valuenow={Math.round(sizes.first)} aria-valuemin={Math.round(sizes.min)} aria-valuemax={Math.round(sizes.max)} tabIndex={0} title="Sürükleyerek boyutlandır · çift tıkla sıfırla" onDoubleClick={reset}
 onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);gesture.current={pointerId:event.pointerId,start:axis==='x'?event.clientX:event.clientY,first:sizes.first,ratio};document.body.dataset.panelResizing=axis}}
 onPointerMove={event=>{const g=gesture.current;if(g&&g.pointerId===event.pointerId)change(g.first+(axis==='x'?event.clientX:event.clientY)-g.start)}}
 onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
 onKeyDown={event=>{if(event.key==='Escape'&&gesture.current){const previous=gesture.current.ratio;latest.current=previous;setRatio(previous);finish();return}if(event.key==='Home'){event.preventDefault();reset();return}const keys=axis==='x'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];if(keys.includes(event.key)){event.preventDefault();persist(change(sizes.first+(keys.indexOf(event.key)===0?-1:1)*(event.shiftKey?32:8)))}}}/>
 <div className="split-pane">{parts[1]}</div>
 </div>;
}
