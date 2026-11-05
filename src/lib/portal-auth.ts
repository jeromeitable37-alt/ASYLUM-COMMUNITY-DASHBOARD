import { createAuthClient } from '@neondatabase/auth';

// Only the dashboard's branch-scoped Neon Auth endpoint is used.
// A missing URL is an error: never fall back to the shared Supabase project.
// Authenticate through this site's first-party Vercel proxy. The proxy is
// restricted to the branch-scoped NEON_AUTH_BASE_URL on the server.
// Cookies are then first-party, even when browsers block third-party cookies.
const url = typeof window !== 'undefined'
  ? new URL('/api/neon-auth', window.location.origin).toString()
  : (import.meta.env.VITE_NEON_AUTH_URL || 'https://invalid.local');
if (!url) console.error('Neon Auth client URL is not configured.');
// One native Neon Better Auth client for login, sessions and JWTs.
// Do not mix a Supabase-compatible adapter session with a native JWT client.
// Same-origin auth gateway: normal browser credentials work without third-party cookies.
export const neonEmailAuth = createAuthClient(url || 'https://invalid.local');

// Protected dashboard requests use Neon-validated first-party session cookies.
// No raw browser JWT is required for the Owner or Member dashboard.

export type PortalSession = {
  user: { id: string; email?: string | null };
};

/**
 * The only session state used to unlock the dashboard UI.
 * Read the HTTP-only first-party cookie via the proxy rather than trusting
 * cached Neon client data or a prior third-party Preview session.
 */
export async function readVerifiedBrowserSession(): Promise<PortalSession | null> {
  const response = await fetch('/api/neon-auth/get-session', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Neon session verification is temporarily unavailable.');
  const data = await response.json() as {
    session?: unknown;
    user?: { id?: unknown; email?: unknown };
  } | null;
  const user = data?.user;
  if (!data?.session || typeof user?.id !== 'string' || !user.id ||
      typeof user.email !== 'string' || !user.email.includes('@')) {
    return null;
  }
  return { user: { id: user.id, email: user.email } };
}



/**
 * Use the official Better Auth Email OTP endpoints through the first-party
 * gateway. Some Neon SDK versions implement resetPassword with an incorrect
 * route. Never send the password or OTP to logs or non-Neon services.
 */
export async function requestNeonPasswordResetCode(email: string) {
  const { error } = await neonEmailAuth.forgetPassword.emailOtp({ email });
  if (error) throw new Error(error.message || 'Unable to request a Neon password-reset code.');
}

export async function finishNeonPasswordReset(email: string, otp: string, password: string) {
  const { error } = await neonEmailAuth.emailOtp.resetPassword({ email, otp, password });
  if (error) throw new Error(error.message || 'Unable to reset the Neon password.');
}

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
