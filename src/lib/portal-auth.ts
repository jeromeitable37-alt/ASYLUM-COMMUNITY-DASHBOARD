import { createAuthClient } from '@neondatabase/auth';

// Only the dashboard's branch-scoped Neon Auth endpoint is used.
// A missing URL is an error: never fall back to the shared Supabase project.
const url = import.meta.env.VITE_NEON_AUTH_URL;
if (!url) console.error('VITE_NEON_AUTH_URL is not configured.');
// One native Neon Better Auth client for login, sessions and JWTs.
// Do not mix a Supabase-compatible adapter session with a native JWT client.
export const neonEmailAuth = createAuthClient(url || 'https://invalid.local', {
  // All Neon session and JWT requests must include the cross-origin auth cookie.
  // Configuring this on the client (not only on token()) keeps both in sync.
  fetchOptions: { credentials: 'include' },
});

/**
 * Fetch a fresh, short-lived EdDSA JWT from the verified Neon session cookie.
 * Never use the opaque session token as a Dashboard API Bearer credential.
 * This also refreshes tokens that may have expired (15-minute TTL).
 */
/**
 * Only signed Neon-issued JWTs are returned to Dashboard APIs. The backend
 * verifies issuer, signature, audience, expiry and canonical account mapping.
 * Depending on SDK/browser cookie behavior, JWTs may arrive in /token or the
 * set-auth-jwt response header on /get-session. Never pass opaque session
 * cookies or use a user ID/email as an authorization credential.
 */
function isJwt(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/.test(value);
}

export async function getNeonBearer(): Promise<string> {
  // Standard managed Neon JWT plugin endpoint.
  try {
    const result = await neonEmailAuth.token({ fetchOptions: { credentials: 'include' } });
    if (!result.error && isJwt(result.data?.token)) return result.data.token;
  } catch {
    // Session endpoint below may return the same signed JWT.
  }

  // Neon documents a signed JWT in the getSession response's set-auth-jwt
  // header. Some SDK versions also expose an access_token on the session.
  let sessionJwt: string | null = null;
  try {
    const response = await neonEmailAuth.getSession({
      fetchOptions: {
        credentials: 'include',
        onSuccess: ctx => {
          const jwt = ctx.response.headers.get('set-auth-jwt');
          if (isJwt(jwt)) sessionJwt = jwt;
        },
      },
    });
    if (sessionJwt) return sessionJwt;
    const session = response.data?.session as unknown as {access_token?: unknown; accessToken?: unknown} | null;
    if (isJwt(session?.access_token)) return session.access_token;
    if (isJwt(session?.accessToken)) return session.accessToken;
  } catch {
    // Only signed JWT shapes are eligible as credentials; backend verifies.
  }

  throw new Error(
    'Neon sign-in is present, but no usable security token was returned. ' +
    'Your browser may be blocking cross-site Neon session cookies. ' +
    'Try signing out and back in once. If the error remains, contact management; ' +
    'do not register a second account.'
  );
}

export type PortalSession = {
  user: { id: string; email?: string | null };
};

export function savePendingRegistration(draft: {
  email: string; display_name: string; ign: string; uid: string; streamer_mode_id: string;
}) {
  // No password, tokens, secret keys or pictures are stored in sessionStorage.
  sessionStorage.setItem('asy-neon-registration', JSON.stringify({ ...draft, saved_at: Date.now() }));
}
export function readPendingRegistration() {
  try {
    const value = sessionStorage.getItem('asy-neon-registration');
    if (!value) return null;
    const draft = JSON.parse(value) as {
      email: string; display_name: string; ign: string; uid: string; streamer_mode_id: string; saved_at: number;
    };
    if (Date.now() - draft.saved_at > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem('asy-neon-registration');
      return null;
    }
    return draft;
  } catch { return null; }
}
export function clearPendingRegistration() {
  sessionStorage.removeItem('asy-neon-registration');
}
