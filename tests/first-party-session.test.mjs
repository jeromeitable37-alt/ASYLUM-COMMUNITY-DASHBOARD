import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_PARTY_COOKIE, neonCookiesFromBrowser, firstPartyCookiesFromNeon,
} from '../.api-smoke/lib/first-party-session.js';

test('reissues real Neon session cookies as first-party host-only cookies', () => {
  const upstream = '__Secure-neonauth.session_token=testOpaque123; Path=/asylum_community/auth; Domain=neon.tech; SameSite=None; Secure; HttpOnly; Partitioned; Max-Age=3600';
  const cookies = firstPartyCookiesFromNeon([upstream]);
  const alias = cookies.find(c => c.startsWith(FIRST_PARTY_COOKIE + '='));
  assert.ok(alias, 'first-party session alias was not set');
  assert.match(alias, /Path=\//);
  assert.match(alias, /Secure/);
  assert.match(alias, /HttpOnly/);
  assert.match(alias, /SameSite=Lax/);
  assert.doesNotMatch(alias, /Domain=/);
  assert.doesNotMatch(alias, /Partitioned/);
  assert.match(alias, /Max-Age=3600/);
  const outbound = neonCookiesFromBrowser(FIRST_PARTY_COOKIE + '=testOpaque123; analytics=unrelated');
  assert.equal(outbound.cookieHeader, '__Secure-neonauth.session_token=testOpaque123');
  assert.equal(outbound.hasFirstPartySession, true);
  assert.equal(outbound.totalCookieCount, 2);
});

test('non-Neon cookies cannot become authenticated sessions', () => {
  const outbound = neonCookiesFromBrowser('other=session; csrf=unknown');
  assert.equal(outbound.cookieHeader, '');
  assert.equal(outbound.hasFirstPartySession, false);
});

test('sign out clears the first-party cookie even without upstream Set-Cookie', () => {
  const cookies = firstPartyCookiesFromNeon([], true);
  assert.ok(cookies.some(c => c.startsWith(FIRST_PARTY_COOKIE + '=;') && c.includes('Max-Age=0')));
});

test('legacy Neon session name continues to work without alias', () => {
  const outbound = neonCookiesFromBrowser('__Secure-neonauth.session_token=olderSession123');
  assert.equal(outbound.cookieHeader, '__Secure-neonauth.session_token=olderSession123');
});
