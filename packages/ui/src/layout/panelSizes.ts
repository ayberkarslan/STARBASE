export function panelSizes(total:number,ratio:number,minFirst:number,minSecond:number,gap=6){
 const available=Math.max(0,total-gap);
 const factor=Math.min(1,available/Math.max(1,minFirst+minSecond));
 const min=minFirst*factor,max=available-minSecond*factor;
 const first=Math.min(max,Math.max(min,available*(Number.isFinite(ratio)?ratio:.5)));
 return {first,second:available-first,min,max,available};
}
