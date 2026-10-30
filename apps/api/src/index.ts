import {Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import {z} from 'zod';
import {firebase,adminUpdate,type AdminEnv} from './firebase';
import {now,token,hash,challenge,usernamePattern,allowedScopes} from './security';
type Env=AdminEnv&{DB:D1Database;PUBLIC_ORIGIN:string;TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET?:string;ASSETS:Fetcher};
type Session={hash:string;user_id:string;app_id:string|null;scopes:string;family:string;kind:string;expires:number};
const app=new Hono<{Bindings:Env;Variables:{session:Session;user:any}}>();
const fail=(status:400|401|403|404|409|429|503,code:string):never=>{throw new HTTPException(status,{message:code})};
app.onError((e,c)=>c.json({error:{code:e instanceof HTTPException?e.message:'service_unavailable'}},e instanceof HTTPException?e.status:503));
app.use('/api/*',async(c,next)=>{
 c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');
 if(Number(c.req.header('content-length')??0)>16384)return fail(400,'input_too_large');
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
async function body(c:any,schema:z.ZodTypeAny){const raw=await c.req.text();if(new TextEncoder().encode(raw).length>16384)fail(400,'input_too_large');let parsed;try{parsed=JSON.parse(raw)}catch{fail(400,'invalid_input')}const value=schema.safeParse(parsed);if(!value.success)fail(400,'invalid_input');return value.data}
async function audit(c:any,action:string,target:string){await c.env.DB.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),c.get('user')?.id??null,target,action,now()).run()}
async function issue(c:any,uid:string,kind:string,appId:string|null=null,scopes:string[]=[],family=crypto.randomUUID()){
 const value=token();const ttl=kind==='access'?600:604800;
 await c.env.DB.prepare('INSERT INTO sessions(hash,user_id,app_id,kind,expires,family,scopes,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(await hash(value),uid,appId,kind,now()+ttl,family,JSON.stringify(scopes),now()).run();return value;
}
app.use('/api/v1/*',async(c,next)=>{
 if(['/api/v1/config','/api/v1/auth/resend','/api/v1/health','/api/v1/auth/register','/api/v1/auth/login','/api/v1/auth/recover','/api/v1/auth/exchange','/api/v1/auth/refresh','/api/v1/auth/reset','/api/v1/auth/verify'].includes(c.req.path))return next();
 const bearer=c.req.header('authorization')?.replace(/^Bearer /,'');const raw=bearer??getCookie(c,'starbase');if(!raw)fail(401,'authentication_required');
 const session=await c.env.DB.prepare('SELECT * FROM sessions WHERE hash=? AND expires>? AND used=0').bind(await hash(raw!),now()).first<Session>();if(!session)fail(401,'session_expired');
 if(bearer&&session!.kind!=='access'||!bearer&&session!.kind!=='central')fail(401,'invalid_session');
 if(session!.app_id){const enabled=await c.env.DB.prepare('SELECT co.scopes FROM apps a JOIN consents co ON co.app_id=a.id WHERE a.id=? AND co.user_id=? AND a.disabled=0').bind(session!.app_id,session!.user_id).first<{scopes:string}>();if(!enabled||!allowedScopes(JSON.parse(session!.scopes),JSON.parse(enabled.scopes)))fail(403,'access_denied')}
 const user=await c.env.DB.prepare('SELECT * FROM users WHERE id=? AND disabled=0').bind(session!.user_id).first<any>();if(!user)fail(401,'account_unavailable');
 c.set('session',session!);c.set('user',user);
 if(user.must_change_password&&!['/api/v1/auth/password','/api/v1/auth/logout'].includes(c.req.path))fail(403,'password_change_required');
 await next();
});
async function permit(c:any,permission:string){if(c.get('session').kind!=='central')fail(403,'central_session_required');if(c.get('user').owner)return;
 const found=await c.env.DB.prepare('SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=? AND rp.permission_id=?').bind(c.get('user').id,permission).first();if(!found)fail(403,'permission_denied');}
async function captcha(c:any){if(new URL(c.env.PUBLIC_ORIGIN).protocol!=='https:'||c.env.FIREBASE_AUTH_EMULATOR_HOST)return;const proof=c.req.header('x-turnstile-token');if(!c.env.TURNSTILE_SECRET||!proof)fail(403,'captcha_required');const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:c.env.TURNSTILE_SECRET,response:proof,remoteip:c.req.header('cf-connecting-ip')??''})});const result:any=await r.json();if(!result.success||result.hostname!==new URL(c.env.PUBLIC_ORIGIN).hostname)fail(403,'captcha_rejected')}
async function rate(c:any){const key=`${c.req.header('cf-connecting-ip')??'local'}:${Math.floor(now()/60)}`;const row=await c.env.DB.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now()+120).first();if(row!.count>15)fail(429,'try_later')}
app.get('/api/v1/health',c=>c.json({service:'STARBASE',version:'0.1.0'}));
const credentials=z.object({username:z.string().transform(s=>s.toLowerCase()).refine(s=>usernamePattern.test(s)),password:z.string().min(12).max(128)});
app.post('/api/v1/auth/register',async c=>{
 await rate(c);await captcha(c);const b=await body(c,credentials.extend({email:z.string().email(),firstName:z.string().min(1).max(80),lastName:z.string().min(1).max(80)}));
 const uid=crypto.randomUUID();try{await c.env.DB.prepare('INSERT INTO users(id,username,email,first_name,last_name,created_at) VALUES(?,?,?,?,?,?)').bind(uid,b.username,b.email.toLowerCase(),b.firstName,b.lastName,now()).run()}catch{return fail(409,'registration_unavailable')}
 try{const result=await firebase(c.env,'signUp',{email:b.email,password:b.password,returnSecureToken:true});
 await c.env.DB.prepare('UPDATE users SET id=? WHERE id=?').bind(result.localId,uid).run();
 let verificationDelivered=true;try{await firebase(c.env,'sendOobCode',{requestType:'VERIFY_EMAIL',idToken:result.idToken})}catch{verificationDelivered=false}return c.json({verificationRequired:true,verificationDelivered},201);
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
app.post('/api/v1/auth/recover',async c=>{await rate(c);await captcha(c);const b=await body(c,z.object({email:z.string().email()}));try{await firebase(c.env,'sendOobCode',{requestType:'PASSWORD_RESET',email:b.email})}catch{}return c.json({message:'Hesap mevcutsa kurtarma e-postası gönderildi.'})});
app.post('/api/v1/auth/logout',async c=>{await c.env.DB.prepare('DELETE FROM sessions WHERE family=?').bind(c.get('session').family).run();deleteCookie(c,'starbase',{path:'/'});return c.json({ok:true})});
app.post('/api/v1/auth/logout-all',async c=>{if(c.get('session').kind!=='central')fail(403,'central_session_required');await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.get('user').id).run();deleteCookie(c,'starbase',{path:'/'});return c.json({ok:true})});
app.get('/api/v1/me',async c=>{const u=c.get('user');const s=c.get('session');const scopes=s.kind==='central'?['profile','email','organization']:JSON.parse(s.scopes);const result:any={id:u.id,username:u.username};if(scopes.includes('profile'))Object.assign(result,{firstName:u.first_name,lastName:u.last_name});if(scopes.includes('email'))Object.assign(result,{email:u.email,emailVerified:!!u.verified});if(scopes.includes('organization'))result.memberships=(await c.env.DB.prepare('SELECT d.id departmentId,d.name department,t.id teamId,t.name team FROM memberships m JOIN departments d ON d.id=m.department_id LEFT JOIN teams t ON t.id=m.team_id WHERE m.user_id=?').bind(u.id).all()).results;if(s.kind==='central')result.owner=!!u.owner;return c.json(result)});
app.get('/api/v1/organization',async c=>{if(!c.get('user').owner&&!await c.env.DB.prepare('SELECT 1 FROM user_roles WHERE user_id=?').bind(c.get('user').id).first())return fail(403,'team_membership_required');return c.json({departments:(await c.env.DB.prepare('SELECT * FROM departments WHERE archived=0').all()).results,teams:(await c.env.DB.prepare('SELECT * FROM teams WHERE archived=0').all()).results})});
app.get('/api/v1/admin/users',async c=>{await permit(c,'users.manage');return c.json((await c.env.DB.prepare('SELECT id,username,email,first_name,last_name,verified,disabled,owner FROM users ORDER BY created_at DESC LIMIT 100').all()).results)});
app.post('/api/v1/admin/departments',async c=>{await permit(c,'organization.manage');const b=await body(c,z.object({name:z.string().min(1).max(80)}));const id=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO departments(id,name) VALUES(?,?)').bind(id,b.name).run();await audit(c,'department.create',id);return c.json({id},201)});
app.post('/api/v1/admin/teams',async c=>{await permit(c,'organization.manage');const b=await body(c,z.object({departmentId:z.string(),name:z.string().min(1).max(80)}));const id=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO teams(id,department_id,name) VALUES(?,?,?)').bind(id,b.departmentId,b.name).run();await audit(c,'team.create',id);return c.json({id},201)});
app.post('/api/v1/admin/memberships',async c=>{await permit(c,'users.manage');const b=await body(c,z.object({userId:z.string(),departmentId:z.string(),teamId:z.string()}));if(!await c.env.DB.prepare('SELECT id FROM teams WHERE id=? AND department_id=? AND archived=0').bind(b.teamId,b.departmentId).first())fail(400,'invalid_team');await c.env.DB.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?,?)').bind(b.userId,b.departmentId,b.teamId).run();await audit(c,'membership.assign',b.userId);return c.json({ok:true})});
app.get('/api/v1/admin/audit',async c=>{await permit(c,'users.manage');return c.json((await c.env.DB.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 100').all()).results)});
app.get('/api/v1/apps',async c=>c.json((await c.env.DB.prepare('SELECT id,name FROM apps WHERE disabled=0').all()).results));
app.get('/api/v1/authorize',async c=>{
 const id=c.req.query('client_id');const a=await c.env.DB.prepare('SELECT * FROM apps WHERE id=? AND disabled=0').bind(id??'').first<any>();if(!a)fail(400,'unknown_app');
 const redirect=c.req.query('redirect_uri')??'';const scopes=(c.req.query('scope')??'profile').split(' ').filter(Boolean);const pkce=c.req.query('code_challenge')??'';
 if(!JSON.parse(a.redirects).includes(redirect)||!allowedScopes(scopes,JSON.parse(a.scopes))||! /^[A-Za-z0-9_-]{43}$/.test(pkce))fail(400,'invalid_authorization');
 return c.json({id:a.id,name:a.name,scopes,redirect,challenge:pkce,state:c.req.query('state')});
});
app.post('/api/v1/authorize',async c=>{
 if(c.get('session').kind!=='central')fail(403,'central_session_required');
 const b=await body(c,z.object({clientId:z.string(),redirectUri:z.string().url(),scopes:z.array(z.enum(['profile','email','organization'])),challenge:z.string().regex(/^[A-Za-z0-9_-]{43}$/),state:z.string().min(16).max(256)}));
 const a=await c.env.DB.prepare('SELECT * FROM apps WHERE id=? AND disabled=0').bind(b.clientId).first<any>();if(!a||!JSON.parse(a.redirects).includes(b.redirectUri)||!allowedScopes(b.scopes,JSON.parse(a.scopes)))fail(400,'invalid_authorization');
 const value=token();await c.env.DB.batch([
 c.env.DB.prepare('INSERT INTO consents VALUES(?,?,?) ON CONFLICT(user_id,app_id) DO UPDATE SET scopes=excluded.scopes').bind(c.get('user').id,a.id,JSON.stringify(b.scopes)),
 c.env.DB.prepare('INSERT INTO codes VALUES(?,?,?,?,?,?,?)').bind(await hash(value),c.get('user').id,a.id,b.redirectUri,b.challenge,JSON.stringify(b.scopes),now()+60)]);
 const url=new URL(b.redirectUri);url.searchParams.set('code',value);url.searchParams.set('state',b.state);return c.json({redirect:url.href});
});
app.post('/api/v1/auth/exchange',async c=>{
 await rate(c);const b=await body(c,z.object({code:z.string(),verifier:z.string().min(43).max(128),clientId:z.string(),redirectUri:z.string().url()}));
 const code=await c.env.DB.prepare('DELETE FROM codes WHERE hash=? AND expires>? AND app_id=? AND redirect=? AND challenge=? RETURNING *').bind(await hash(b.code),now(),b.clientId,b.redirectUri,await challenge(b.verifier)).first<any>();if(!code)fail(400,'invalid_code');
 const a=await c.env.DB.prepare('SELECT id FROM apps WHERE id=? AND disabled=0').bind(b.clientId).first();const u=await c.env.DB.prepare('SELECT id FROM users WHERE id=? AND disabled=0 AND must_change_password=0 AND verified=1').bind(code.user_id).first();if(!a||!u)fail(403,'access_denied');
 const family=crypto.randomUUID();return c.json({accessToken:await issue(c,code.user_id,'access',b.clientId,JSON.parse(code.scopes),family),refreshToken:await issue(c,code.user_id,'refresh',b.clientId,JSON.parse(code.scopes),family),expiresIn:600});
});
app.post('/api/v1/auth/refresh',async c=>{
 const b=await body(c,z.object({refreshToken:z.string(),clientId:z.string()}));const h=await hash(b.refreshToken);
 const old=await c.env.DB.prepare('SELECT * FROM sessions WHERE hash=? AND kind=\'refresh\' AND app_id=?').bind(h,b.clientId).first<any>();
 if(!old||old.expires<=now())fail(401,'session_expired');if(old.used){await c.env.DB.prepare('DELETE FROM sessions WHERE family=?').bind(old.family).run();fail(401,'refresh_reused')}
 const user=await c.env.DB.prepare('SELECT id FROM users WHERE id=? AND disabled=0 AND must_change_password=0 AND verified=1').bind(old.user_id).first();
 const consent=await c.env.DB.prepare('SELECT scopes FROM consents WHERE user_id=? AND app_id=?').bind(old.user_id,b.clientId).first<{scopes:string}>();
 const a=await c.env.DB.prepare('SELECT id FROM apps WHERE id=? AND disabled=0').bind(b.clientId).first();if(!user||!consent||!a||!allowedScopes(JSON.parse(old.scopes),JSON.parse(consent.scopes)))fail(403,'access_denied');
 const claimed=await c.env.DB.prepare('UPDATE sessions SET used=1 WHERE hash=? AND used=0 RETURNING hash').bind(h).first();if(!claimed){await c.env.DB.prepare('DELETE FROM sessions WHERE family=?').bind(old.family).run();fail(401,'refresh_reused')}
 const accessToken=await issue(c,old.user_id,'access',b.clientId,JSON.parse(old.scopes),old.family);const refreshToken=await issue(c,old.user_id,'refresh',b.clientId,JSON.parse(old.scopes),old.family);
 await c.env.DB.prepare('UPDATE sessions SET expires=MIN(expires,?) WHERE family=? AND used=0').bind(old.expires,old.family).run();return c.json({accessToken,refreshToken,expiresIn:Math.min(600,old.expires-now())});
});
app.get('/api/v1/connections',async c=>{if(c.get('session').kind!=='central')fail(403,'central_session_required');return c.json((await c.env.DB.prepare('SELECT a.id,a.name,c.scopes FROM consents c JOIN apps a ON a.id=c.app_id WHERE c.user_id=?').bind(c.get('user').id).all()).results)});
app.delete('/api/v1/connections/:id',async c=>{if(c.get('session').kind!=='central')fail(403,'central_session_required');await c.env.DB.batch([c.env.DB.prepare('DELETE FROM consents WHERE user_id=? AND app_id=?').bind(c.get('user').id,c.req.param('id')),c.env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND app_id=?').bind(c.get('user').id,c.req.param('id'))]);return c.json({ok:true})});
app.post('/api/v1/admin/apps',async c=>{await permit(c,'apps.manage');const b=await body(c,z.object({id:z.string().regex(/^[a-z0-9-]{3,40}$/),name:z.string().min(1),redirects:z.array(z.string().url()).min(1),origins:z.array(z.string().url()),scopes:z.array(z.enum(['profile','email','organization']))}));for(const r of b.redirects){const u=new URL(r);if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))fail(400,'https_required')}
 await c.env.DB.prepare('INSERT INTO apps(id,name,redirects,origins,scopes) VALUES(?,?,?,?,?)').bind(b.id,b.name,JSON.stringify(b.redirects),JSON.stringify(b.origins),JSON.stringify(b.scopes)).run();await audit(c,'app.create',b.id);return c.json({id:b.id},201)});
app.get('/api/v1/permissions',async c=>{const s=c.get('session');if(c.get('user').owner){const all=await c.env.DB.prepare('SELECT id FROM permissions').all<{id:string}>();return c.json(all.results.map(p=>p.id).filter(p=>s.kind==='central'||p.startsWith(s.app_id+'.')))}return c.json((await c.env.DB.prepare('SELECT DISTINCT rp.permission_id FROM user_roles ur JOIN role_permissions rp ON ur.role_id=rp.role_id WHERE ur.user_id=?').bind(c.get('user').id).all<{permission_id:string}>()).results.map(r=>r.permission_id).filter(p=>s.kind==='central'||p.startsWith(s.app_id+'.')))});

app.post('/api/v1/auth/password',async c=>{if(c.get('session').kind!=='central')fail(403,'central_session_required');const b=await body(c,z.object({currentPassword:z.string(),password:z.string().min(12).max(128)}));try{await firebase(c.env,'signInWithPassword',{email:c.get('user').email,password:b.currentPassword,returnSecureToken:true})}catch{return fail(401,'invalid_credentials')}
 await adminUpdate(c.env,c.get('user').id,{password:b.password,validSince:String(now())});await c.env.DB.batch([c.env.DB.prepare('UPDATE users SET must_change_password=0 WHERE id=?').bind(c.get('user').id),c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.get('user').id)]);deleteCookie(c,'starbase',{path:'/'});return c.json({ok:true})});
app.post('/api/v1/auth/reset',async c=>{await rate(c);const b=await body(c,z.object({code:z.string(),password:z.string().min(12).max(128)}));const result=await firebase(c.env,'resetPassword',{oobCode:b.code,newPassword:b.password});const u=await c.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(result.email).first<{id:string}>();if(u)await c.env.DB.batch([c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id),c.env.DB.prepare('UPDATE users SET must_change_password=0 WHERE id=?').bind(u.id)]);return c.json({ok:true})});
app.post('/api/v1/auth/verify',async c=>{await rate(c);const b=await body(c,z.object({code:z.string()}));await firebase(c.env,'update',{oobCode:b.code});return c.json({ok:true})});
app.post('/api/v1/admin/users/:id/password',async c=>{await permit(c,'users.manage');const b=await body(c,z.object({currentPassword:z.string(),temporaryPassword:z.string().min(12).max(128).optional()}));await reauthenticate(c,b.currentPassword);const uid=c.req.param('id');const target=await c.env.DB.prepare('SELECT email,owner FROM users WHERE id=?').bind(uid).first<any>();if(!target)fail(404,'not_found');if(target.owner&&!c.get('user').owner)fail(403,'permission_denied');
 if(b.temporaryPassword){
 // Lock first: partial upstream failure must not leave active application sessions.
 await c.env.DB.batch([c.env.DB.prepare('UPDATE users SET must_change_password=1 WHERE id=?').bind(uid),c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(uid)]);
 await adminUpdate(c.env,uid,{password:b.temporaryPassword,validSince:String(now())});await audit(c,'password.temporary',uid);
 }else{await firebase(c.env,'sendOobCode',{requestType:'PASSWORD_RESET',email:target.email});await audit(c,'password.recovery',uid)}return c.json({ok:true})});
async function reauthenticate(c:any,password:string){try{await firebase(c.env,'signInWithPassword',{email:c.get('user').email,password,returnSecureToken:true})}catch{return fail(401,'reauthentication_required')}}
app.put('/api/v1/admin/users/:id',async c=>{await permit(c,'users.manage');const b=await body(c,z.object({firstName:z.string().min(1).max(80),lastName:z.string().min(1).max(80),email:z.string().email(),disabled:z.boolean(),currentPassword:z.string()}));await reauthenticate(c,b.currentPassword);const uid=c.req.param('id');const old=await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first<any>();if(!old)fail(404,'not_found');if(old.owner&&(b.disabled||!c.get('user').owner))fail(403,'owner_protected');
 await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(uid).run();await adminUpdate(c.env,uid,{email:b.email,disableUser:b.disabled,...(old.email!==b.email?{emailVerified:false}:{}),validSince:String(now())});await c.env.DB.prepare('UPDATE users SET first_name=?,last_name=?,email=?,disabled=?,verified=? WHERE id=?').bind(b.firstName,b.lastName,b.email.toLowerCase(),Number(b.disabled),old.email===b.email?old.verified:0,uid).run();await audit(c,'user.update',uid);return c.json({ok:true})});
app.get('/api/v1/admin/roles',async c=>{await permit(c,'roles.manage');return c.json({roles:(await c.env.DB.prepare('SELECT * FROM roles').all()).results,permissions:(await c.env.DB.prepare('SELECT * FROM permissions').all()).results,assignments:(await c.env.DB.prepare('SELECT * FROM user_roles').all()).results,grants:(await c.env.DB.prepare('SELECT * FROM role_permissions').all()).results})});
app.post('/api/v1/admin/roles',async c=>{await permit(c,'roles.manage');const b=await body(c,z.object({name:z.string().min(1).max(80),permissions:z.array(z.string()),currentPassword:z.string()}));await reauthenticate(c,b.currentPassword);const id=crypto.randomUUID();await c.env.DB.batch([c.env.DB.prepare('INSERT INTO roles VALUES(?,?)').bind(id,b.name),...b.permissions.map((p:string)=>c.env.DB.prepare('INSERT INTO role_permissions VALUES(?,?)').bind(id,p))]);await audit(c,'role.create',id);return c.json({id},201)});
app.post('/api/v1/admin/permissions',async c=>{await permit(c,'roles.manage');const b=await body(c,z.object({id:z.string().regex(/^[a-z][a-z0-9_.-]{2,100}$/),description:z.string().min(1),currentPassword:z.string()}));await reauthenticate(c,b.currentPassword);await c.env.DB.prepare('INSERT INTO permissions VALUES(?,?)').bind(b.id,b.description).run();await audit(c,'permission.create',b.id);return c.json({ok:true},201)});
app.post('/api/v1/admin/role-assignments',async c=>{await permit(c,'roles.manage');const b=await body(c,z.object({userId:z.string(),roleId:z.string(),currentPassword:z.string()}));await reauthenticate(c,b.currentPassword);await c.env.DB.prepare('INSERT OR IGNORE INTO user_roles VALUES(?,?)').bind(b.userId,b.roleId).run();await audit(c,'role.assign',b.userId);return c.json({ok:true})});
app.delete('/api/v1/admin/role-assignments',async c=>{await permit(c,'roles.manage');const b=await body(c,z.object({userId:z.string(),roleId:z.string(),currentPassword:z.string()}));await reauthenticate(c,b.currentPassword);await c.env.DB.prepare('DELETE FROM user_roles WHERE user_id=? AND role_id=?').bind(b.userId,b.roleId).run();await audit(c,'role.remove',b.userId);return c.json({ok:true})});
app.post('/api/v1/admin/profile-fields',async c=>{await permit(c,'users.manage');const b=await body(c,z.object({key:z.string().regex(/^[a-z][a-z0-9_]{2,50}$/),label:z.string().min(1),type:z.enum(['text','number','date','boolean','select']),options:z.array(z.string()).default([])}));await c.env.DB.prepare('INSERT INTO profile_fields(key,label,type,options) VALUES(?,?,?,?)').bind(b.key,b.label,b.type,JSON.stringify(b.options)).run();return c.json({ok:true},201)});
app.get('/api/v1/admin/profile-fields',async c=>{await permit(c,'users.manage');return c.json((await c.env.DB.prepare('SELECT * FROM profile_fields').all()).results)});

app.post('/api/v1/admin/invites',async c=>{await permit(c,'users.manage');const b=await body(c,z.object({email:z.string().email()}));const code=token();await c.env.DB.prepare('INSERT INTO invites VALUES(?,?,?,?)').bind(await hash(code),b.email.toLowerCase(),now()+604800,c.get('user').id).run();await audit(c,'invite.create',b.email);return c.json({url:`${c.env.PUBLIC_ORIGIN}/invite?code=${code}`},201)});
app.post('/api/v1/invites/accept',async c=>{if(c.get('session').kind!=='central')fail(403,'central_session_required');const b=await body(c,z.object({code:z.string()}));const invite=await c.env.DB.prepare('DELETE FROM invites WHERE hash=? AND email=? AND expires>? RETURNING hash').bind(await hash(b.code),c.get('user').email,now()).first();if(!invite)fail(400,'invalid_invite');await c.env.DB.prepare('INSERT OR IGNORE INTO user_roles VALUES(?,?)').bind(c.get('user').id,'member').run();return c.json({ok:true})});
app.put('/api/v1/admin/profile-values/:id',async c=>{await permit(c,'users.manage');const b=await body(c,z.object({key:z.string(),value:z.unknown()}));const f=await c.env.DB.prepare('SELECT * FROM profile_fields WHERE key=?').bind(b.key).first<any>();if(!f)fail(400,'unknown_field');const valid=f.type==='text'?typeof b.value==='string'&&b.value.length<=2000:f.type==='number'?typeof b.value==='number'&&Number.isFinite(b.value):f.type==='boolean'?typeof b.value==='boolean':f.type==='date'?typeof b.value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.value):f.type==='select'?JSON.parse(f.options).includes(b.value):false;if(!valid)fail(400,'invalid_field_value');await c.env.DB.prepare('INSERT INTO profile_values VALUES(?,?,?) ON CONFLICT(user_id,field_key) DO UPDATE SET value=excluded.value').bind(c.req.param('id'),b.key,JSON.stringify(b.value)).run();await audit(c,'profile.update',c.req.param('id'));return c.json({ok:true})});
app.get('/api/v1/admin/profile-values/:id',async c=>{await permit(c,'users.manage');return c.json((await c.env.DB.prepare('SELECT * FROM profile_values WHERE user_id=?').bind(c.req.param('id')).all()).results)});
app.put('/api/v1/admin/departments/:id',async c=>{await permit(c,'organization.manage');const b=await body(c,z.object({name:z.string().min(1).max(80),archived:z.boolean()}));await c.env.DB.prepare('UPDATE departments SET name=?,archived=? WHERE id=?').bind(b.name,Number(b.archived),c.req.param('id')).run();await audit(c,'department.update',c.req.param('id'));return c.json({ok:true})});
app.put('/api/v1/admin/teams/:id',async c=>{await permit(c,'organization.manage');const b=await body(c,z.object({name:z.string().min(1).max(80),archived:z.boolean()}));await c.env.DB.prepare('UPDATE teams SET name=?,archived=? WHERE id=?').bind(b.name,Number(b.archived),c.req.param('id')).run();await audit(c,'team.update',c.req.param('id'));return c.json({ok:true})});

app.get('/api/v1/config',c=>c.json({turnstileSiteKey:c.env.TURNSTILE_SITE_KEY??null}));
app.post('/api/v1/auth/resend',async c=>{await rate(c);const b=await body(c,credentials);const u=await c.env.DB.prepare('SELECT email FROM users WHERE username=?').bind(b.username).first<{email:string}>();try{const result=await firebase(c.env,'signInWithPassword',{email:u?.email??'invalid@invalid.invalid',password:b.password,returnSecureToken:true});await firebase(c.env,'sendOobCode',{requestType:'VERIFY_EMAIL',idToken:result.idToken})}catch{}return c.json({ok:true})});

app.delete('/api/v1/admin/memberships',async c=>{await permit(c,'users.manage');const b=await body(c,z.object({userId:z.string(),departmentId:z.string(),teamId:z.string()}));await c.env.DB.prepare('DELETE FROM memberships WHERE user_id=? AND department_id=? AND team_id=?').bind(b.userId,b.departmentId,b.teamId).run();await audit(c,'membership.remove',b.userId);return c.json({ok:true})});
app.put('/api/v1/admin/roles/:id',async c=>{await permit(c,'roles.manage');const b=await body(c,z.object({name:z.string().min(1).max(80),permissions:z.array(z.string()),currentPassword:z.string()}));await reauthenticate(c,b.currentPassword);const id=c.req.param('id');if(id==='member')fail(403,'system_role');await c.env.DB.batch([c.env.DB.prepare('UPDATE roles SET name=? WHERE id=?').bind(b.name,id),c.env.DB.prepare('DELETE FROM role_permissions WHERE role_id=?').bind(id),...b.permissions.map((p:string)=>c.env.DB.prepare('INSERT INTO role_permissions VALUES(?,?)').bind(id,p))]);await audit(c,'role.update',id);return c.json({ok:true})});
app.delete('/api/v1/admin/roles/:id',async c=>{await permit(c,'roles.manage');const b=await body(c,z.object({currentPassword:z.string()}));await reauthenticate(c,b.currentPassword);const id=c.req.param('id');if(id==='member')fail(403,'system_role');await c.env.DB.batch([c.env.DB.prepare('DELETE FROM user_roles WHERE role_id=?').bind(id),c.env.DB.prepare('DELETE FROM role_permissions WHERE role_id=?').bind(id),c.env.DB.prepare('DELETE FROM roles WHERE id=?').bind(id)]);await audit(c,'role.delete',id);return c.json({ok:true})});
app.get('/api/v1/admin/apps',async c=>{await permit(c,'apps.manage');return c.json((await c.env.DB.prepare('SELECT * FROM apps').all()).results)});
app.put('/api/v1/admin/apps/:id',async c=>{await permit(c,'apps.manage');const b=await body(c,z.object({disabled:z.boolean()}));await c.env.DB.batch([c.env.DB.prepare('UPDATE apps SET disabled=? WHERE id=?').bind(Number(b.disabled),c.req.param('id')),c.env.DB.prepare('DELETE FROM sessions WHERE app_id=?').bind(c.req.param('id'))]);await audit(c,'app.status',c.req.param('id'));return c.json({ok:true})});
app.get('/api/v1/sessions',async c=>{if(c.get('session').kind!=='central')fail(403,'central_session_required');return c.json((await c.env.DB.prepare('SELECT family,app_id,kind,created_at,expires FROM sessions WHERE user_id=? AND used=0 AND expires>? AND kind IN (\'central\',\'refresh\')').bind(c.get('user').id,now()).all()).results)});
app.delete('/api/v1/sessions/:family',async c=>{if(c.get('session').kind!=='central')fail(403,'central_session_required');await c.env.DB.prepare('DELETE FROM sessions WHERE family=? AND user_id=?').bind(c.req.param('family'),c.get('user').id).run();return c.json({ok:true})});

app.notFound(c=>c.req.path.startsWith('/api/')?c.json({error:{code:'not_found'}},404):c.env.ASSETS.fetch(c.req.raw));
export default app;
