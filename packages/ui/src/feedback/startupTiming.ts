// An indeterminate loader waits for real readiness, not simulated percentages.
export function waitForStartup(tasks:Promise<unknown>[],{signal,minimum=2000,timeout=8000}:{signal:AbortSignal;minimum?:number;timeout?:number}):Promise<void>{
 return new Promise((resolve,reject)=>{
  let shown=false,prepared=false;
  const cleanup=()=>{clearTimeout(minTimer);clearTimeout(maxTimer);signal.removeEventListener('abort',abort)};
  const finish=()=>{if(shown&&prepared){cleanup();resolve()}};
  const abort=()=>{cleanup();reject(new DOMException('Startup cancelled','AbortError'))};
  const minTimer=setTimeout(()=>{shown=true;finish()},minimum);
  const maxTimer=setTimeout(()=>{prepared=true;finish()},timeout);
  if(signal.aborted){abort();return}signal.addEventListener('abort',abort,{once:true});
  Promise.allSettled(tasks).then(()=>{prepared=true;finish()});
 });
}
