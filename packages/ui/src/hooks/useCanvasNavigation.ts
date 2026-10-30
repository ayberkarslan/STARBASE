import {useEffect,useRef,useState,type RefObject} from 'react';
export interface CanvasFrame {x:number;y:number;width:number;height:number}
export function useCanvasNavigation(svg:RefObject<SVGSVGElement>,base:CanvasFrame,zoom:number,onZoom:((zoom:number)=>void)|undefined,focus:string,blocked:boolean,enabled=true){
 const [pan,setPan]=useState({x:0,y:0}),[localZoom,setLocalZoom]=useState(zoom);
 const scale=onZoom?zoom:localZoom;
 const frame={x:base.x+pan.x+base.width*(1-1/scale)/2,y:base.y+pan.y+base.height*(1-1/scale)/2,width:base.width/scale,height:base.height/scale};
 const latest=useRef({base,frame,scale,onZoom,blocked});latest.current={base,frame,scale,onZoom,blocked};
 const reset=()=>{setPan({x:0,y:0});if(onZoom)onZoom(1);else setLocalZoom(1)};
 useEffect(()=>setPan({x:0,y:0}),[focus]);
 useEffect(()=>setLocalZoom(zoom),[zoom]);
 useEffect(()=>{
  const element=svg.current;if(!element||!enabled)return;
  const wheel=(event:WheelEvent)=>{
   event.preventDefault();event.stopPropagation();const s=latest.current;if(s.blocked)return;
   const inverse=element.getScreenCTM()?.inverse();if(!inverse)return;
   const factor=event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1;
   const at=new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse);
   if(event.ctrlKey||event.metaKey){
    const next=Math.max(.25,Math.min(8,s.scale*Math.exp(-event.deltaY*factor*.008)));
    const center={x:s.frame.x+s.frame.width/2,y:s.frame.y+s.frame.height/2};
    setPan({x:at.x+(center.x-at.x)*s.scale/next-(s.base.x+s.base.width/2),y:at.y+(center.y-at.y)*s.scale/next-(s.base.y+s.base.height/2)});
    if(s.onZoom)s.onZoom(next);else setLocalZoom(next);
   }else{
    const shifted=new DOMPoint(event.clientX+event.deltaX*factor,event.clientY+event.deltaY*factor).matrixTransform(inverse);
    setPan(p=>({x:p.x+shifted.x-at.x,y:p.y+shifted.y-at.y}));
   }
  };
  element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
 },[svg,enabled]);
 return {frame,reset};
}
