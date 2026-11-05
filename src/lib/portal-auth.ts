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
export async function getNeonBearer(): Promise<string> {
  const result = await neonEmailAuth.token({ fetchOptions: { credentials: 'include' } });
  if (result.error || !result.data?.token) {
    throw new Error('Your Neon session needs to be refreshed. Sign in again to access your Dashboard profile.');
  }
  return result.data.token;
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
