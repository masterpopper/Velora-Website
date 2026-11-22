import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.mjs';
import {handle} from '../backend/router.mjs';
import {finishAuth} from '../backend/auth.mjs';
import {hash,now,challenge} from '../backend/security.mjs';
test('OAuth state is browser-bound and single-use, with PKCE and no repo scope',async()=>{
  const f=await fixture();Object.assign(f.env,{GITHUB_CLIENT_ID:'test-oauth-id',GITHUB_CLIENT_SECRET:'fixture-not-real'});
  const response=await handle(new Request(f.env.SITE_ORIGIN+'/api/auth/start'),f.env);
  assert.equal(response.status,303);const dest=new URL(response.headers.get('Location'));
  assert.equal(dest.origin,'https://github.com');assert.equal(dest.searchParams.get('scope'),'');
  assert.equal(dest.searchParams.get('code_challenge_method'),'S256');
  const state=dest.searchParams.get('state'),record=await f.DB.prepare('SELECT * FROM oauth_states WHERE hash=?').bind(await hash(state)).first();
  assert.equal(dest.searchParams.get('code_challenge'),await challenge(record.verifier));
  const noCookie=new Request(f.env.SITE_ORIGIN+'/api/auth/callback?state='+state+'&code=test');
  await assert.rejects(finishAuth(noCookie,f.env),/oauth_state_invalid/);
  await f.DB.prepare('UPDATE oauth_states SET expires_at=0').run();
  const expired=new Request(f.env.SITE_ORIGIN+'/api/auth/callback?state='+state+'&code=test',{headers:{Cookie:'__Host-valora_oauth='+state}});
  await assert.rejects(finishAuth(expired,f.env),/oauth_state_expired/);
});
test('callback errors are handled as JSON, unknown host rejected and sessions expire',async()=>{
  const f=await fixture();const response=await handle(new Request(f.env.SITE_ORIGIN+'/api/auth/callback?state=bad'),f.env);assert.equal(response.status,400);
  assert.equal((await response.json()).error,'oauth_state_invalid');
  assert.equal((await handle(new Request('https://wrong.example/api/config'),f.env)).status,403);
  const raw='a'.repeat(64);await f.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(raw),'owner',now()-1).run();
  assert.equal((await handle(new Request(f.env.SITE_ORIGIN+'/api/account',{headers:{Cookie:'__Host-valora_session='+raw}}),f.env)).status,401);
});
