/**
 * First-party session adapter for Official Dashboard only.
 * The browser stores a host-only HTTP-only session cookie on the Vercel domain.
 * Neon remains the sole authority: every protected request is checked against
 * Neon Managed Auth /get-session and the existing Dashboard role database.
 */
export const FIRST_PARTY_COOKIE = '__Host-asy-dashboard-session';
const UPSTREAM_SESSION_COOKIE = '__Secure-neonauth.session_token';

function splitCookie(raw: string): { name: string; value: string } | null {
  const pos = raw.indexOf('=');
  if (pos <= 0) return null;
  const name = raw.slice(0, pos).trim();
  const value = raw.slice(pos + 1).trim();
  return name && value ? { name, value } : null;
}

function isNeonCookie(name: string): boolean {
  return /^(?:__Secure-|__Host-)?(?:neonauth|neon[-_]auth|better[-_]auth)[._-]/i.test(name);
}

/** Never send unrelated Vercel cookies to the Neon Auth origin. */
export function neonCookiesFromBrowser(rawHeader: string | undefined): {
  cookieHeader: string; hasFirstPartySession: boolean; totalCookieCount: number;
} {
  const parts = String(rawHeader || '').split(';').map(part => part.trim()).filter(Boolean);
  const parsed = parts.map(splitCookie).filter((item): item is {name:string;value:string} => item !== null);
  const own = parsed.find(item => item.name === FIRST_PARTY_COOKIE);
  const upstream = parsed.filter(item => isNeonCookie(item.name) &&
    (!own || !/\.session_token$/i.test(item.name)));
  if (own) upstream.unshift({ name: UPSTREAM_SESSION_COOKIE, value: own.value });
  return {
    cookieHeader: upstream.map(item => item.name + '=' + item.value).join('; '),
    hasFirstPartySession: Boolean(own),
    totalCookieCount: parsed.length,
  };
}

/**
 * Reissue the opaque Neon session token as a host-only cookie.
 * __Host- requires HTTPS, Path=/, and no Domain. We intentionally do not
 * expose the token in JavaScript, HTML, response JSON or logs.
 */
export function firstPartyCookiesFromNeon(neonSetCookies: string[], isSignOut = false): string[] {
  const output: string[] = [];
  for (const raw of neonSetCookies) {
    const [head, ...attrs] = raw.split(';').map(v=>v.trim()).filter(Boolean);
    const pair = splitCookie(head || '');
    if (!pair || !isNeonCookie(pair.name)) continue;
    const originalAttributes = attrs.filter(attr =>
      !/^(?:domain|path|samesite|partitioned)(?:=|$)/i.test(attr));
    const secure = originalAttributes.some(attr => /^secure$/i.test(attr));
    const httpOnly = originalAttributes.some(attr => /^httponly$/i.test(attr));
    if (!secure) originalAttributes.push('Secure');
    if (!httpOnly) originalAttributes.push('HttpOnly');
    output.push([head, ...originalAttributes, 'Path=/', 'SameSite=Lax'].join('; '));
    if (/\.session_token$/i.test(pair.name)) {
      const wasDeleted = isSignOut || attrs.some(attr =>
        /^Max-Age\s*=\s*0$/i.test(attr) ||
        /^Expires\s*=\s*(?:Thu,\s*)?01 Jan 1970/i.test(attr));
      const expiryAttributes = attrs.filter(attr => /^(?:max-age|expires)=/i.test(attr));
      output.push([
        FIRST_PARTY_COOKIE + '=' + (wasDeleted ? '' : pair.value),
        'Path=/','Secure','HttpOnly','SameSite=Lax',
        ...(wasDeleted ? ['Max-Age=0'] : expiryAttributes),
      ].join('; '));
    }
  }
  if (isSignOut && !output.some(s => s.startsWith(FIRST_PARTY_COOKIE + '='))) {
    output.push(FIRST_PARTY_COOKIE + '=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
  }
  return output;
}
