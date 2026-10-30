export const formatNumber=(n:number,digits=1)=>Number.isFinite(n)?n.toLocaleString('tr-TR',{maximumFractionDigits:digits}):'—';
export function downloadFile(name:string,text:string,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
