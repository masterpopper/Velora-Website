import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import {fixture} from './helpers.mjs';
import {processEvent,stripeClient,entitlements} from '../backend/payments.mjs';
test('Worker serves static assets and routes API to the backend',async()=>{
  const f=await fixture();let staticCalls=0;
  const env={...f.env,ASSETS:{fetch:async()=>{staticCalls++;return new Response('static website');}}};
  assert.equal(await (await worker.fetch(new Request(f.env.SITE_ORIGIN+'/buy'),env)).text(),'static website');
  const config=await worker.fetch(new Request(f.env.SITE_ORIGIN+'/api/config'),env);assert.equal(config.status,200);assert.equal(staticCalls,1);
  const missing=await worker.fetch(new Request(f.env.SITE_ORIGIN+'/api/account'),env);assert.equal(missing.status,401);assert.equal(staticCalls,1);
});
test('live resources require explicit approval and mode-matched credentials; no Stripe calls',async()=>{
  const f=await fixture();f.env.PAYMENTS_MODE='live';f.env.STRIPE_SECRET_KEY='rk_live_fixture_not_real';
  assert.throws(()=>stripeClient(f.env),/live_payments_not_approved/);
  f.env.LIVE_PAYMENTS_APPROVED='true';assert.ok(stripeClient(f.env));
  f.env.STRIPE_SECRET_KEY='sk_test_fixture_not_real';assert.throws(()=>stripeClient(f.env),/stripe_key_mode_mismatch/);
  await assert.rejects(processEvent(f.env,f.stripe,f.event()),/event_account_or_mode_rejected/);
});
test('simulated live fulfillment is segregated from test grants',async()=>{
  const f=await fixture();f.env.PAYMENTS_MODE='live';f.env.LIVE_PAYMENTS_APPROVED='true';
  await f.DB.prepare("UPDATE orders SET mode='live' WHERE id='order'").run();
  f.session.livemode=true;f.intent.livemode=true;f.price.livemode=true;
  await processEvent(f.env,f.stripe,{...f.event(),livemode:true});
  assert.equal((await entitlements(f.env,'owner')).plus,true);
  assert.equal((await entitlements({...f.env,PAYMENTS_MODE:'test'},'owner')).plus,false);
});
