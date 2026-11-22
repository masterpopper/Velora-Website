import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import {fixture} from './helpers.mjs';
test('Worker serves static assets and public config; buyer OAuth endpoints are gone',async()=>{
 const f=await fixture();let staticCalls=0;const env={...f.env,ASSETS:{fetch:async()=>{staticCalls++;return new Response('static website');}}};
 assert.equal(await (await worker.fetch(new Request(f.env.SITE_ORIGIN+'/buy'),env)).text(),'static website');
 const config=await worker.fetch(new Request(f.env.SITE_ORIGIN+'/api/config'),env);assert.equal(config.status,200);
 const auth=await worker.fetch(new Request(f.env.SITE_ORIGIN+'/api/auth/start'),env);assert.equal(auth.status,404);
 const account=await worker.fetch(new Request(f.env.SITE_ORIGIN+'/api/account'),env);assert.equal(account.status,404);
 assert.equal(staticCalls,1);
});
