import { createAuthClient, SupabaseAuthAdapter } from '@neondatabase/auth';

// Only the dashboard's branch-scoped Neon Auth endpoint is used.
// A missing URL is an error: never fall back to the shared Supabase project.
const url = import.meta.env.VITE_NEON_AUTH_URL;
if (!url) console.error('VITE_NEON_AUTH_URL is not configured.');
export const portalAuth = createAuthClient(url || 'https://invalid.local', {
  adapter: SupabaseAuthAdapter(),
});
export const neonEmailAuth = createAuthClient(url || 'https://invalid.local');

export type PortalSession = {
  access_token: string;
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
