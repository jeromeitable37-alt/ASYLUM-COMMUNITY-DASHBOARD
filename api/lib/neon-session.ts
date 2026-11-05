import type { NeonQueryFunction } from '@neondatabase/serverless';
import { FIRST_PARTY_COOKIE } from './first-party-session.js';

type Sql = NeonQueryFunction<false, false>;
export type VerifiedNeonSession = {
  sessionId: string; userId: string; email: string; expiresAt: string;
};

/**
 * A session is valid only when its opaque 32-character token is present in
 * Neon Auth's unexpired session records for a verified and unbanned user.
 * Some Better Auth cookies append a signature after the opaque token.
 * Neither email, role, nor user ID from the browser is trusted.
 */
export function sessionTokenCandidates(cookieHeader: string | undefined): [string, string] | null {
  const cookies = String(cookieHeader || '').split(';').map(v => v.trim()).filter(Boolean);
  const pairs = cookies.map(v => {
    const at=v.indexOf('=');
    return at<1 ? null : {name:v.slice(0,at).trim(),value:v.slice(at+1).trim()};
  }).filter((v):v is {name:string;value:string}=>v!==null);
  const own=pairs.find(v=>v.name===FIRST_PARTY_COOKIE);
  const legacy=pairs.find(v=>/^(?:__Secure-|__Host-)?(?:neonauth|neon[-_]auth|better[-_]auth)\.session_token$/i.test(v.name));
  const rawValue=own?.value||legacy?.value;
  if(!rawValue||rawValue.length>512)return null;
  let decoded:string;
  try{decoded=decodeURIComponent(rawValue);}catch{return null;}
  const raw=decoded.replace(/^s:/,'');
  const first=raw.split('.')[0];
  const valid=(value:string)=>/^[A-Za-z0-9_-]{32}$/.test(value);
  const direct=valid(raw)?raw:'',base=valid(first)?first:'';
  if(!direct&&!base)return null;
  return [direct||base,base||direct];
}

export async function findActiveNeonDbSession(sql:Sql,cookieHeader:string|undefined):Promise<VerifiedNeonSession|null>{
  const candidates=sessionTokenCandidates(cookieHeader);
  if(!candidates)return null;
  const [one,two]=candidates;
  const rows=await sql`
    SELECT s.id::text AS session_id,s."expiresAt" AS expires_at,
           u.id::text AS user_id,u.email
      FROM neon_auth.session s
      JOIN neon_auth."user" u ON u.id=s."userId"
     WHERE (s.token=${one} OR s.token=${two})
       AND s."expiresAt">now()
       AND u."emailVerified" IS TRUE
       AND u.banned IS NOT TRUE
     LIMIT 1`;
  const row=rows[0];
  if(!row)return null;
  return {
    sessionId:String(row.session_id),userId:String(row.user_id),
    email:String(row.email),expiresAt:new Date(row.expires_at as string).toISOString(),
  };
}
