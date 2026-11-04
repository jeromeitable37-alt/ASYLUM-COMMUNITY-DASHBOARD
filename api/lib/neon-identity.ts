import type { VercelRequest } from '@vercel/node';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Preview-to-production migration gate for Managed Neon Auth.
 * Never accepts unverified email, trusts browser-provided identity, or
 * derives dashboard admin rights from the new Neon Auth role column.
 * The legacy dashboard UUID remains canonical in all existing tables.
 */
type Sql = NeonQueryFunction<false, false>;

export class PortalAuthError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
type PortalIdentity = {
  id: string;
  email: string;
  user_metadata: { display_name: string };
  neon_subject: string;
};
let jwksCache: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedUrl: string | undefined;
function jwks(url: string) {
  if (cachedUrl !== url || !jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(url));
    cachedUrl = url;
  }
  return jwksCache;
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

export async function requirePortalIdentity(req: VercelRequest, sql: Sql): Promise<PortalIdentity> {
  if (process.env.NEON_AUTH_CUTOVER_ENABLED !== 'true') {
    throw new PortalAuthError(503, 'Neon authentication migration is not enabled on this environment.');
  }
  const keyUrl = process.env.NEON_AUTH_JWKS_URL;
  const issuer = process.env.NEON_AUTH_BASE_URL;
  if (!keyUrl || !issuer) throw new PortalAuthError(503, 'Neon Auth server configuration is incomplete.');
  const bearer = req.headers.authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer) throw new PortalAuthError(401, 'Sign in to your verified Neon account.');
  let subject: unknown;
  try {
    const { payload } = await jwtVerify(bearer, jwks(keyUrl), {
      algorithms: ['EdDSA'],
      issuer: issuer.replace(/\/$/, ''),
      clockTolerance: 10,
    });
    subject = payload.sub;
  } catch {
    throw new PortalAuthError(401, 'Neon session could not be verified. Please sign in again.');
  }
  if (!uuid(subject)) throw new PortalAuthError(401, 'Neon account ID is invalid.');
  // Managed Neon Auth is the source of truth for verified email ownership.
  const users = await sql`SELECT id::text AS subject,email,"emailVerified" AS verified,name,banned
    FROM neon_auth."user" WHERE id=${subject}::uuid LIMIT 1`;
  const neonUser = users[0];
  if (!neonUser || neonUser.banned) throw new PortalAuthError(403, 'Neon account cannot access this dashboard.');
  if (!neonUser.verified) throw new PortalAuthError(403,
    'Please verify your Neon Auth email using the six-digit code before accessing the Dashboard.');
  const email = String(neonUser.email || '').trim().toLowerCase();
  if (!email.includes('@')) throw new PortalAuthError(403, 'Verified email address is missing.');

  const linked = await sql`SELECT dashboard_user_id::text AS user_id,verified_email
    FROM portal_auth_migration_links WHERE neon_subject=${subject} LIMIT 1`;
  let legacyId = String(linked[0]?.user_id || '');
  if (linked.length && String(linked[0].verified_email).toLowerCase() !== email)
    throw new PortalAuthError(403, 'Email changed since your account was linked. Contact management.');

  if (!linked.length) {
    const legacy = await sql`SELECT i.user_id::text AS user_id,a.role
      FROM identities i LEFT JOIN community_admins a ON a.user_id=i.user_id
      WHERE lower(i.email)=${email} LIMIT 2`;
    if (legacy.length > 1) throw new PortalAuthError(409, 'Duplicate legacy accounts require management review.');
    if (legacy.length && legacy[0].role) {
      // A new login cannot acquire an existing Owner/Admin role just by
      // signing up with the same email. Owner must explicitly approve linking.
      throw new PortalAuthError(403,
        'Your existing management account needs an Owner-approved Neon Auth migration link.');
    }
    if (legacy.length) {
      legacyId = String(legacy[0].user_id);
    } else {
      legacyId = subject;
      await sql`INSERT INTO identities(user_id,email) VALUES (${legacyId}::uuid,${email})
        ON CONFLICT(user_id) DO NOTHING`;
    }
    const saved = await sql`INSERT INTO portal_auth_migration_links
        (neon_subject,dashboard_user_id,verified_email)
        VALUES (${subject},${legacyId}::uuid,${email})
        ON CONFLICT DO NOTHING RETURNING dashboard_user_id::text AS user_id`;
    if (saved.length) {
      legacyId = String(saved[0].user_id);
    } else {
      const concurrent = await sql`SELECT dashboard_user_id::text AS user_id,verified_email
        FROM portal_auth_migration_links WHERE neon_subject=${subject} LIMIT 1`;
      if (!concurrent.length || String(concurrent[0].verified_email).toLowerCase() !== email)
        throw new PortalAuthError(409, 'This identity was already linked. Contact management.');
      legacyId = String(concurrent[0].user_id);
    }
  }
  if (!uuid(legacyId)) throw new PortalAuthError(500, 'Account mapping failed.');
  const portal = await sql`SELECT portal_status FROM identities WHERE user_id=${legacyId}::uuid LIMIT 1`;
  if (!portal.length) throw new PortalAuthError(403, 'Dashboard identity does not exist.');
  if (portal[0].portal_status !== 'active')
    throw new PortalAuthError(403, 'Dashboard access is disabled or archived. Contact management.');
  return {
    id: legacyId,
    email,
    user_metadata: { display_name: String(neonUser.name || '') },
    neon_subject: subject,
  };
}
