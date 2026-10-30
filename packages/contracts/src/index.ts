export type ProfileScope='profile'|'email'|'organization';
export interface Profile {id:string;username:string;firstName?:string;lastName?:string;email?:string;emailVerified?:boolean;owner?:boolean;memberships?:{departmentId:string;department:string;teamId:string|null;team:string|null}[]}
export interface TokenSet {accessToken:string;refreshToken:string;expiresIn:number}
