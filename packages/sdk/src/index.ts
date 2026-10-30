import type {Profile,ProfileScope,TokenSet} from '../../contracts/src';
export interface Storage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export class Starbase {
 private tokens:TokenSet|null=null;private refreshing:Promise<void>|null=null;
 constructor(private options:{baseUrl:string;clientId:string;redirectUri:string;storage?:Storage}){}
 private async request<T>(path:string,body?:unknown,authenticated=false):Promise<T>{const r=await fetch(`${this.options.baseUrl}/api/v1${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(authenticated?{Authorization:`Bearer ${await this.getAccessToken()}`}:{})},body:body?JSON.stringify(body):undefined});const result:any=await r.json();if(!r.ok)throw new Error(result.error?.code??'starbase_error');return result}
 async login(scopes:ProfileScope[]=['profile']){const bytes=crypto.getRandomValues(new Uint8Array(32));const verifier=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');const state=crypto.randomUUID();const challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');sessionStorage.setItem('starbase.pending',JSON.stringify({verifier,state}));const url=new URL('/authorize',this.options.baseUrl);Object.entries({client_id:this.options.clientId,redirect_uri:this.options.redirectUri,scope:scopes.join(' '),code_challenge:challenge,state}).forEach(([k,v])=>url.searchParams.set(k,v));location.assign(url.href)}
 async handleCallback(url=location.href){const u=new URL(url);const saved=sessionStorage.getItem('starbase.pending');if(!saved)throw new Error('missing_login');const p=JSON.parse(saved);if(u.searchParams.get('state')!==p.state)throw new Error('state_mismatch');sessionStorage.removeItem('starbase.pending');this.tokens=await this.request<TokenSet>('/auth/exchange',{code:u.searchParams.get('code'),verifier:p.verifier,clientId:this.options.clientId,redirectUri:this.options.redirectUri});this.tokens.expiresIn=Date.now()/1000+this.tokens.expiresIn-30;this.save();history.replaceState(null,'',u.pathname);return this.getProfile()}
 private save(){if(this.tokens)this.options.storage?.setItem(`starbase.${this.options.clientId}`,this.tokens.refreshToken)}
 async getAccessToken(){if(!this.tokens){const refreshToken=this.options.storage?.getItem(`starbase.${this.options.clientId}`);if(!refreshToken)throw new Error('authentication_required');this.tokens={accessToken:'',refreshToken,expiresIn:0}}
 if(this.tokens.expiresIn<=Date.now()/1000){if(!this.refreshing)this.refreshing=this.request<TokenSet>('/auth/refresh',{refreshToken:this.tokens.refreshToken,clientId:this.options.clientId}).then(t=>{this.tokens={...t,expiresIn:Date.now()/1000+t.expiresIn-30};this.save()}).finally(()=>{this.refreshing=null});await this.refreshing}return this.tokens!.accessToken}
 getProfile(){return this.request<Profile>('/me',undefined,true)}
 async hasPermission(permission:string){return (await this.request<string[]>('/permissions',undefined,true)).includes(permission)}
 async logout(){try{await this.request('/auth/logout',{},true)}finally{this.tokens=null;this.options.storage?.removeItem(`starbase.${this.options.clientId}`)}}
 async logoutAll(){try{await this.request('/auth/logout-all',{},true)}finally{this.tokens=null;this.options.storage?.removeItem(`starbase.${this.options.clientId}`)}}
}

/** Resource servers call this on each protected request; never trust client UI checks. */
export async function requireStarbasePermission(baseUrl:string,accessToken:string,permission:string){
 const headers={Authorization:`Bearer ${accessToken}`};
 const response=await fetch(`${baseUrl}/api/v1/permissions`,{headers});
 if(!response.ok)throw new Error('invalid_session');
 const permissions=await response.json() as string[];
 if(!permissions.includes(permission))throw new Error('permission_denied');
 const profile=await fetch(`${baseUrl}/api/v1/me`,{headers});
 if(!profile.ok)throw new Error('invalid_session');return profile.json() as Promise<Profile>;
}
