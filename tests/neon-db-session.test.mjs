import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionTokenCandidates, findActiveNeonDbSession } from '../.api-smoke/lib/neon-session.js';

const token='AbcdEfgh1234IjklMnop5678QrStuvWX';
assert.equal(token.length,32);

test('maps a genuine host-only opaque session cookie to Neon token candidates',()=>{
  assert.deepEqual(sessionTokenCandidates('__Host-asy-dashboard-session='+token),[token,token]);
  assert.deepEqual(sessionTokenCandidates('__Host-asy-dashboard-session='+encodeURIComponent(token+'.signature')), [token,token]);
  assert.deepEqual(sessionTokenCandidates('__Secure-neonauth.session_token='+token),[token,token]);
});

test('refuses unrelated, missing, and malformed cookies',()=>{
  for(const cookie of ['analytics='+token,'','__Host-asy-dashboard-session=small','__Host-asy-dashboard-session='+('X'.repeat(600))])
    assert.equal(sessionTokenCandidates(cookie),null);
});

test('queries active verified Neon session before returning identity',async()=>{
  let called=false;
  const fakeSql=async (parts,...values)=>{
    called=true;
    assert.deepEqual(values,[token,token]);
    const statement=parts.join('?');
    for(const needed of ['neon_auth.session','"expiresAt">now()','"emailVerified" IS TRUE','banned IS NOT TRUE'])
      assert.ok(statement.includes(needed),needed+' missing');
    return [{session_id:'session-test',user_id:'test-user',email:'test@invalid.example',expires_at:'2026-12-01T00:00:00.000Z'}];
  };
  const result=await findActiveNeonDbSession(fakeSql,'__Host-asy-dashboard-session='+token);
  assert.ok(called);
  assert.equal(result?.sessionId,'session-test');
  assert.equal(result?.userId,'test-user');
});

test('unknown or absent cookies do not call database or authenticate',async()=>{
  let called=false;
  const sql=async()=>{called=true;return []};
  const result=await findActiveNeonDbSession(sql,'csrf=not-a-session');
  assert.equal(result,null);
  assert.equal(called,false);
});
