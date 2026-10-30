import {Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import {z} from 'zod';
import {firebase,type FirebaseEnv} from './firebase';
import {now,token,hash,challenge,usernamePattern,allowedScopes} from './security';
type Env=FirebaseEnv&{DB:D1Database;PUBLIC_ORIGIN:string;ASSETS:Fetcher};
type Session={hash:string;user_id:string;app_id:string|null;scopes:string;family:string;kind:string;expires:number};
const app=new Hono<{Bindings:Env;Variables:{session:Session;user:any}}>();
const fail=(status:400|401|403|404|409|429|503,code:string):never=>{throw new HTTPException(status,{message:code})};
app.onError((e,c)=>c.json({error:{code:e instanceof HTTPException?e.message:'service_unavailable'}},e instanceof HTTPException?e.status:503));
app.use('/api/*',async(c,next)=>{
 c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');
 const origin=c.req.header('origin');
 if(origin&&origin!==c.env.PUBLIC_ORIGIN){
 const apps=await c.env.DB.prepare('SELECT origins FROM apps WHERE disabled=0').all<{origins:string}>();
 if(!apps.results.some(a=>(JSON.parse(a.origins) as string[]).includes(origin)))return fail(403,'origin_rejected');
 c.header('Access-Control-Allow-Origin',origin);c.header('Vary','Origin');
 c.header('Access-Control-Allow-Headers','content-type,authorization');c.header('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
 }
 if(c.req.method==='OPTIONS')return c.body(null,204);
 if(!['GET','HEAD'].includes(c.req.method)&&getCookie(c,'starbase')&&origin!==c.env.PUBLIC_ORIGIN)return fail(403,'csrf_rejected');
 await next();
});
async function body(c:any,schema:z.ZodTypeAny){const value=schema.safeParse(await c.req.json().catch(()=>null));if(!value.success)fail(400,'invalid_input');return value.data}
async function audit(c:any,action:string,target:string){await c.env.DB.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),c.get('user')?.id??null,target,action,now()).run()}
async function issue(c:any,uid:string,kind:string,appId:string|null=null,scopes:string[]=[],family=crypto.randomUUID()){
 const value=token();const ttl=kind==='access'?600:604800;
 await c.env.DB.prepare('INSERT INTO sessions(hash,user_id,app_id,kind,expires,family,scopes,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(await hash(value),uid,appId,kind,now()+ttl,family,JSON.stringify(scopes),now()).run();return value;
}
app.use('/api/v1/*',async(c,next)=>{
 if(['/api/v1/health','/api/v1/auth/register','/api/v1/auth/login','/api/v1/auth/recover','/api/v1/auth/exchange','/api/v1/auth/refresh'].includes(c.req.path))return next();
 const bearer=c.req.header('authorization')?.replace(/^Bearer /,'');const raw=bearer??getCookie(c,'starbase');if(!raw)fail(401,'authentication_required');
 const session=await c.env.DB.prepare('SELECT * FROM sessions WHERE hash=? AND expires>? AND used=0').bind(await hash(raw!),now()).first<Session>();if(!session)fail(401,'session_expired');
 if(bearer&&session!.kind!=='access'||!bearer&&session!.kind!=='central')fail(401,'invalid_session');
 const user=await c.env.DB.prepare('SELECT * FROM users WHERE id=? AND disabled=0').bind(session!.user_id).first<any>();if(!user)fail(401,'account_unavailable');
 c.set('session',session!);c.set('user',user);
 if(user.must_change_password&&!['/api/v1/auth/password','/api/v1/auth/logout'].includes(c.req.path))fail(403,'password_change_required');
 await next();
});
async function permit(c:any,permission:string){if(c.get('session').kind!=='central')fail(403,'central_session_required');if(c.get('user').owner)return;
 const found=await c.env.DB.prepare('SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=? AND rp.permission_id=?').bind(c.get('user').id,permission).first();if(!found)fail(403,'permission_denied');}
async function rate(c:any){const key=`${c.req.header('cf-connecting-ip')??'local'}:${Math.floor(now()/60)}`;const row=await c.env.DB.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now()+120).first<{count:number}>();if(row!.count>15)fail(429,'try_later')}
app.get('/api/v1/health',c=>c.json({service:'STARBASE',version:'0.1.0'}));
const credentials=z.object({username:z.string().transform(s=>s.toLowerCase()).refine(s=>usernamePattern.test(s)),password:z.string().min(12).max(128)});
app.post('/api/v1/auth/register',async c=>{
 await rate(c);const b=await body(c,credentials.extend({email:z.string().email(),firstName:z.string().min(1).max(80),lastName:z.string().min(1).max(80)}));
 const uid=crypto.randomUUID();try{await c.env.DB.prepare('INSERT INTO users(id,username,email,first_name,last_name,created_at) VALUES(?,?,?,?,?,?)').bind(uid,b.username,b.email.toLowerCase(),b.firstName,b.lastName,now()).run()}catch{return fail(409,'registration_unavailable')}
 try{const result=await firebase(c.env,'signUp',{email:b.email,password:b.password,returnSecureToken:true});
 await c.env.DB.prepare('UPDATE users SET id=? WHERE id=?').bind(result.localId,uid).run();
 await firebase(c.env,'sendOobCode',{requestType:'VERIFY_EMAIL',idToken:result.idToken});return c.json({verificationRequired:true},201);
 }catch{await c.env.DB.prepare('DELETE FROM users WHERE id=?').bind(uid).run();return fail(400,'registration_incomplete')}
});
app.post('/api/v1/auth/login',async c=>{
 await rate(c);const b=await body(c,credentials);const u=await c.env.DB.prepare('SELECT * FROM users WHERE username=? AND disabled=0').bind(b.username).first<any>();
 let result:any;try{result=await firebase(c.env,'signInWithPassword',{email:u?.email??'invalid@invalid.invalid',password:b.password,returnSecureToken:true})}catch{return fail(401,'invalid_credentials')}
 if(!u||result.localId!==u.id)fail(401,'invalid_credentials');
 const lookup=await firebase(c.env,'lookup',{idToken:result.idToken});if(!lookup.users?.[0]?.emailVerified&&!u.must_change_password)fail(403,'email_verification_required');
 await c.env.DB.prepare('UPDATE users SET verified=? WHERE id=?').bind(lookup.users?.[0]?.emailVerified?1:0,u.id).run();
 const value=await issue(c,u.id,'central');setCookie(c,'starbase',value,{httpOnly:true,secure:new URL(c.env.PUBLIC_ORIGIN).protocol==='https:',sameSite:'Lax',path:'/',maxAge:604800});
 return c.json({authenticated:true,passwordChangeRequired:!!u.must_change_password});
});
app.post('/api/v1/auth/recover',async c=>{await rate(c);const b=await body(c,z.object({email:z.string().email()}));try{await firebase(c.env,'sendOobCode',{requestType:'PASSWORD_RESET',email:b.email})}catch{}return c.json({message:'Hesap mevcutsa kurtarma e-postası gönderildi.'})});
app.post('/api/v1/auth/logout',async c=>{await c.env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(c.get('session').hash).run();deleteCookie(c,'starbase',{path:'/'});return c.json({ok:true})});
app.post('/api/v1/auth/logout-all',async c=>{await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.get('user').id).run();deleteCookie(c,'starbase',{path:'/'});return c.json({ok:true})});
app.get('/api/v1/me',async c=>{const u=c.get('user');const s=c.get('session');const scopes=s.kind==='central'?['profile','email','organization']:JSON.parse(s.scopes);const result:any={id:u.id,username:u.username};if(scopes.includes('profile'))Object.assign(result,{firstName:u.first_name,lastName:u.last_name});if(scopes.includes('email'))Object.assign(result,{email:u.email,emailVerified:!!u.verified});if(scopes.includes('organization'))result.memberships=(await c.env.DB.prepare('SELECT d.id departmentId,d.name department,t.id teamId,t.name team FROM memberships m JOIN departments d ON d.id=m.department_id LEFT JOIN teams t ON t.id=m.team_id WHERE m.user_id=?').bind(u.id).all()).results;if(s.kind==='central')result.owner=!!u.owner;return c.json(result)});
app.get('/api/v1/organization',async c=>c.json({departments:(await c.env.DB.prepare('SELECT * FROM departments WHERE archived=0').all()).results,teams:(await c.env.DB.prepare('SELECT * FROM teams WHERE archived=0').all()).results}));
app.get('/api/v1/admin/users',async c=>{await permit(c,'users.manage');return c.json((await c.env.DB.prepare('SELECT id,username,email,first_name,last_name,verified,disabled,owner FROM users ORDER BY created_at DESC LIMIT 100').all()).results)});
app.post('/api/v1/admin/departments',async c=>{await permit(c,'organization.manage');const b=await body(c,z.object({name:z.string().min(1).max(80)}));const id=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO departments(id,name) VALUES(?,?)').bind(id,b.name).run();await audit(c,'department.create',id);return c.json({id},201)});
app.post('/api/v1/admin/teams',async c=>{await permit(c,'organization.manage');const b=await body(c,z.object({departmentId:z.string(),name:z.string().min(1).max(80)}));const id=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO teams(id,department_id,name) VALUES(?,?,?)').bind(id,b.departmentId,b.name).run();await audit(c,'team.create',id);return c.json({id},201)});
app.post('/api/v1/admin/memberships',async c=>{await permit(c,'users.manage');const b=await body(c,z.object({userId:z.string(),departmentId:z.string(),teamId:z.string()}));if(!await c.env.DB.prepare('SELECT id FROM teams WHERE id=? AND department_id=? AND archived=0').bind(b.teamId,b.departmentId).first())fail(400,'invalid_team');await c.env.DB.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?,?)').bind(b.userId,b.departmentId,b.teamId).run();await audit(c,'membership.assign',b.userId);return c.json({ok:true})});
app.get('/api/v1/admin/audit',async c=>{await permit(c,'users.manage');return c.json((await c.env.DB.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 100').all()).results)});
app.get('/api/v1/apps',async c=>c.json((await c.env.DB.prepare('SELECT id,name FROM apps WHERE disabled=0').all()).results));
app.get('*',c=>c.env.ASSETS.fetch(c.req.raw));
export default app;
