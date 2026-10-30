import {useLayoutEffect,useRef,useState} from 'react';
import {formatNumber as fmt} from './utils';
export interface PlotSeries {id:string;name:string;points:[number,number][]}
export default function Plot({series,xLabel='t · s',yLabel,title}:{series:PlotSeries[];xLabel?:string;yLabel:string;title:string}){
 const container=useRef<HTMLDivElement>(null);const [size,setSize]=useState({w:600,h:280});const [hover,setHover]=useState<number|null>(null);
 useLayoutEffect(()=>{if(!container.current)return;const obs=new ResizeObserver(([entry])=>setSize({w:Math.max(220,entry.contentRect.width),h:Math.max(160,entry.contentRect.height)}));obs.observe(container.current);return()=>obs.disconnect()},[]);
 const points=series.flatMap(s=>s.points);const maxX=Math.max(1,...points.map(p=>p[0])),minY=Math.min(0,...points.map(p=>p[1])),maxY=Math.max(1,...points.map(p=>p[1]));
 const left=62,right=size.w-24,top=32,bottom=size.h-40;const x=(n:number)=>left+n/maxX*(right-left),y=(n:number)=>bottom-(n-minY)/(maxY-minY)*(bottom-top);
 const hovered=hover===null?[]:series.map(s=>{let low=0,high=s.points.length-1;while(low<high){const m=(low+high)>>1;if(s.points[m][0]<hover)low=m+1;else high=m;}const p=s.points[low],previous=s.points[low-1];return {name:s.name,point:p&&previous&&hover-previous[0]<p[0]-hover?previous:p}}).filter(s=>s.point);
 return <div className="engineering-plot" ref={container}><svg viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label={title} onPointerLeave={()=>setHover(null)} onPointerMove={event=>{const rect=event.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(maxX,((event.clientX-rect.left)*size.w/rect.width-left)/(right-left)*maxX)))}}>
 {[0,.25,.5,.75,1].map(n=><g key={n}><line x1={left} x2={right} y1={top+(bottom-top)*n} y2={top+(bottom-top)*n} stroke="#ffffff20"/><text x={left-10} y={top+(bottom-top)*n+4} textAnchor="end">{fmt(maxY-(maxY-minY)*n,0)}</text><text x={x(maxX*n)} y={bottom+21} textAnchor="middle">{fmt(maxX*n)}</text></g>)}
 <text x={left} y={18}>{yLabel}</text><text x={right} y={size.h-3} textAnchor="end">{xLabel}</text>
 {series.map((s,i)=><polyline key={s.id} points={s.points.map(p=>`${x(p[0])},${y(p[1])}`).join(' ')} fill="none" stroke="white" strokeWidth={1.7} strokeDasharray={i?'6 4':undefined} vectorEffect="non-scaling-stroke"/>)}
 {hover!==null&&points.length>0&&<line x1={x(hover)} x2={x(hover)} y1={top} y2={bottom} stroke="white" strokeDasharray="2 5"/>}</svg>
 {!points.length&&<span className="plot-empty">Henüz sonuç yok</span>}
 {hovered.length>0&&<output className="plot-readout">{hovered.map(s=><span key={s.name}>{s.name} · {fmt(s.point[0],2)} s / {fmt(s.point[1],2)}</span>)}</output>}</div>;
}
