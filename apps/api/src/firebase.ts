export interface FirebaseEnv {FIREBASE_API_KEY:string;FIREBASE_PROJECT_ID:string;FIREBASE_AUTH_EMULATOR_HOST?:string}
export async function firebase(env:FirebaseEnv,method:string,data:unknown){
 const base=env.FIREBASE_AUTH_EMULATOR_HOST?`http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`:'https://identitytoolkit.googleapis.com/v1';
 const r=await fetch(`${base}/accounts:${method}?key=${env.FIREBASE_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await r.json() as any;
 if(!r.ok)throw new Error('identity_rejected');
 return result;
}
