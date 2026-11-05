import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Branch-scoped, same-origin gateway for Managed Neon Auth.
 * Its upstream is fixed by a server-side environment variable, never by user input.
 * Session cookies are set for the Vercel site itself, avoiding third-party cookie
 * restrictions while Neon continues issuing/verifying all identities and JWTs.
 *
 * Do not enable public CDN caching for this route or forward cookies to logs.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base || process.env.NEON_AUTH_CUTOVER_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Neon Auth is not configured on this environment.' });
  }

  let upstreamBase: URL;
  try {
    upstreamBase = new URL(base);
    if (upstreamBase.protocol !== 'https:' || !upstreamBase.hostname.endsWith('.neon.tech')) {
      return res.status(503).json({ error: 'Invalid Neon Auth upstream configuration.' });
    }
  } catch {
    return res.status(503).json({ error: 'Invalid Neon Auth upstream configuration.' });
  }

  const rawPath = req.query.authPath;
  const authPath = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');
  if (!authPath || authPath.length > 160 ||
      !/^[a-zA-Z0-9/_-]+$/.test(authPath) || authPath.includes('//') || authPath.includes('..')) {
    return res.status(400).json({ error: 'Invalid Neon Auth path.' });
  }
  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'HEAD'].includes(method)) {
    return res.status(405).json({ error: 'Method not supported.' });
  }

  // Prevent a cross-site page from sending authenticated writes through the proxy.
  if (method === 'POST') {
    const host = req.headers.host;
    const origin = req.headers.origin;
    if (!host || !origin || origin !== 'https://' + host) {
      return res.status(403).json({ error: 'Cross-site authentication requests are not allowed.' });
    }
  }

  const url = new URL(upstreamBase.toString().replace(/\/$/, '') + '/' + authPath);
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'authPath') continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string') url.searchParams.append(key, item);
    }
  }

  const headers = new Headers();
  for (const key of [
    'accept', 'content-type', 'origin', 'referer', 'cookie', 'user-agent',
    'accept-language', 'x-csrf-token', 'x-requested-with'
  ]) {
    const value = req.headers[key];
    if (typeof value === 'string') headers.set(key, value);
  }

  let body: string | Buffer | undefined;
  if (method === 'POST' && req.body !== undefined) {
    body = Buffer.isBuffer(req.body) ? req.body
      : typeof req.body === 'string' ? req.body
      : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(url, {
      method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000),
    });

    for (const key of ['content-type', 'set-auth-jwt', 'retry-after', 'www-authenticate']) {
      const value = upstream.headers.get(key);
      if (value) res.setHeader(key, value);
    }

    const upstreamLocation = upstream.headers.get('location');
    if (upstreamLocation) {
      const location = new URL(upstreamLocation, url);
      // Keep Neon-hosted auth callbacks on our first-party gateway; other
      // OAuth destinations may remain external.
      if (location.origin === url.origin && location.pathname.startsWith(upstreamBase.pathname)) {
        const tail = location.pathname.slice(upstreamBase.pathname.replace(/\/$/, '').length);
        res.setHeader('Location', '/api/neon-auth' + tail + location.search + location.hash);
      } else {
        res.setHeader('Location', upstreamLocation);
      }
    }

    const cookies = upstream.headers.getSetCookie();
    if (cookies.length) {
      // Never allow upstream Domain/Path to bind these cookies to neon.tech;
      // these are first-party cookies on this Vercel host.
      const safeCookies = cookies.map(cookie => cookie
        .replace(/;\s*Domain=[^;]*/gi, '')
        .replace(/;\s*Path=\/[^;]*/gi, '; Path=/'));
      res.setHeader('Set-Cookie', safeCookies);
    }

    if (method === 'HEAD' || upstream.status === 204 || upstream.status === 304) {
      return res.status(upstream.status).end();
    }
    const data = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(data);
  } catch {
    // Do not leak upstream host, headers or authentication cookies.
    return res.status(502).json({ error: 'Neon Auth service is temporarily unreachable.' });
  }
}
