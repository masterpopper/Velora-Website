import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {fixture} from './helpers.mjs';
import {processEvent,webhook,entitlements,stripeClient,checkout} from '../backend/payments.mjs';
import {catalog,validatePrice,validateSession,paymentState} from '../backend/catalog.mjs';
const stored=async f=>f.DB.prepare('SELECT * FROM orders WHERE id=?').bind('order').first();
test('paid checkout fulfills once; duplicate delivery is a no-op',async()=>{
  const f=await fixture();await processEvent(f.env,f.stripe,f.event());
  assert.equal((await stored(f)).state,'active');const calls=f.state.calls;
  assert.deepEqual(await processEvent(f.env,f.stripe,f.event()),{duplicate:true});assert.equal(f.state.calls,calls);
  assert.deepEqual(await entitlements(f.env,'owner'),{plus:true,theme_pack:false});
});
test('unpaid async checkout remains pending, then succeeds',async()=>{
  const f=await fixture();f.session.payment_status='unpaid';f.intent.status='processing';
  await processEvent(f.env,f.stripe,f.event());assert.equal((await stored(f)).state,'pending');
  f.session.payment_status='paid';f.intent.status='succeeded';
  await processEvent(f.env,f.stripe,f.event('evt_2','checkout.session.async_payment_succeeded'));
  assert.equal((await stored(f)).state,'active');
});
test('async failure never grants access; later verified success can recover',async()=>{
  const f=await fixture();f.session.payment_status='unpaid';f.intent.status='requires_payment_method';f.intent.last_payment_error={code:'card_declined'};
  await processEvent(f.env,f.stripe,f.event('evt_fail','checkout.session.async_payment_failed'));
  assert.equal((await stored(f)).state,'failed');assert.equal((await entitlements(f.env,'owner')).plus,false);
  delete f.intent.last_payment_error;f.intent.status='succeeded';f.session.payment_status='paid';
  await processEvent(f.env,f.stripe,f.event('evt_success'));assert.equal((await stored(f)).state,'active');
});
test('refund-before-fulfillment and old success event cannot regrant',async()=>{
  const f=await fixture();f.state.refunds=[{status:'succeeded'}];
  await processEvent(f.env,f.stripe,f.event('evt_refund','refund.updated',{object:'refund',payment_intent:'pi_1'}));
  assert.equal((await stored(f)).state,'revoked');
  await processEvent(f.env,f.stripe,f.event('evt_old_success'));assert.equal((await stored(f)).state,'revoked');
});
test('pending refund suspends; failed/canceled refund restores from current resources',async()=>{
  const f=await fixture();f.state.refunds=[{status:'pending'}];
  await processEvent(f.env,f.stripe,f.event());assert.equal((await stored(f)).state,'suspended');
  f.state.refunds=[{status:'failed'}];await processEvent(f.env,f.stripe,f.event('evt_failed_refund','refund.failed',{object:'refund',payment_intent:'pi_1'}));
  assert.equal((await stored(f)).state,'active');
});
test('dispute suspends; win restores; loss revokes',async()=>{
  const f=await fixture();f.state.disputes=[{status:'needs_response'}];await processEvent(f.env,f.stripe,f.event());assert.equal((await stored(f)).state,'suspended');
  f.state.disputes=[{status:'won'}];await processEvent(f.env,f.stripe,f.event('evt_win'));assert.equal((await stored(f)).state,'active');
  f.state.disputes=[{status:'lost'}];await processEvent(f.env,f.stripe,f.event('evt_loss'));assert.equal((await stored(f)).state,'revoked');
});
test('refund never removes independent legacy Plus grant',async()=>{
  const f=await fixture();await f.DB.prepare('INSERT INTO legacy_grants VALUES(?,?,?,?,?,?,NULL)').bind('legacy','owner','plus','verified-record','reviewer',1).run();
  f.state.refunds=[{status:'succeeded'}];await processEvent(f.env,f.stripe,f.event());
  assert.equal((await stored(f)).state,'revoked');assert.equal((await entitlements(f.env,'owner')).plus,true);
});
test('ThemePack is independent and does not grant Plus',async()=>{
  const f=await fixture();await f.DB.prepare("UPDATE orders SET sku='theme_pack',price_id='price_theme',product_id='prod_theme',amount=500 WHERE id='order'").run();
  Object.assign(f.session,{amount_total:500,amount_subtotal:500});f.session.metadata.sku='theme_pack';
  Object.assign(f.price,{id:'price_theme',product:'prod_theme',unit_amount:500});
  f.intent.amount=500;f.intent.metadata.sku='theme_pack';await processEvent(f.env,f.stripe,f.event());
  assert.deepEqual(await entitlements(f.env,'owner'),{plus:false,theme_pack:true});
});
test('server rejects wrong product, amount, quantity and customer ownership',async()=>{
  const f=await fixture();validatePrice(f.price,catalog(f.env).plus);validateSession(f.session,f.lines,f.order);
  assert.throws(()=>validatePrice({...f.price,unit_amount:1},catalog(f.env).plus));
  assert.throws(()=>validatePrice({...f.price,recurring:{interval:'month'}},catalog(f.env).plus));
  assert.throws(()=>validateSession({...f.session,amount_total:1},f.lines,f.order));
  assert.throws(()=>validateSession(f.session,[{...f.lines[0],quantity:2}],f.order));
  assert.throws(()=>validateSession({...f.session,metadata:{...f.session.metadata,account_id:'other'}},f.lines,f.order));
  f.lines[0].price.product='prod_foreign';await assert.rejects(processEvent(f.env,f.stripe,f.event()));
  assert.equal((await stored(f)).state,'pending');assert.equal((await f.DB.prepare('SELECT count(*) AS n FROM webhook_events').first()).n,0);
});
test('different Stripe account and live events rejected',async()=>{
  const f=await fixture();await assert.rejects(processEvent(f.env,f.stripe,{...f.event(),account:'acct_kdesk'}));
  await assert.rejects(processEvent(f.env,f.stripe,{...f.event(),livemode:true}));
  f.stripe.accounts.retrieve=async()=>({id:'acct_wrong'});await assert.rejects(processEvent(f.env,f.stripe,f.event()));
  assert.throws(()=>stripeClient({...f.env,STRIPE_SECRET_KEY:'sk_live_not_real'}));
});
test('invalid signature and modified raw body rejected before database mutation',async()=>{
  const f=await fixture(),sdk=new Stripe('sk_test_fixture_not_real'),secret='whsec_fixture_only_not_real';f.env.STRIPE_WEBHOOK_SECRET=secret;
  const payload=JSON.stringify(f.event()),header=sdk.webhooks.generateTestHeaderString({payload,secret});
  const verified=await sdk.webhooks.constructEventAsync(payload,header,secret,300,Stripe.createSubtleCryptoProvider());assert.equal(verified.id,'evt_1');
  const request=new Request('https://valora-test.example/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':header},body:payload+' '});
  await assert.rejects(webhook(request,f.env));assert.equal((await stored(f)).state,'pending');
  const validRequest=new Request('https://valora-test.example/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':header},body:payload});
  f.stripe.webhooks=sdk.webhooks;await webhook(validRequest,f.env,f.stripe);assert.equal((await stored(f)).state,'active');
});
test('expired signature rejected; order lock enforces retry rather than false success',async()=>{
  const f=await fixture(),sdk=new Stripe('sk_test_fixture_not_real'),secret='whsec_fixture_only_not_real';f.env.STRIPE_WEBHOOK_SECRET=secret;
  const payload=JSON.stringify(f.event()),header=sdk.webhooks.generateTestHeaderString({payload,secret,timestamp:1});
  await assert.rejects(webhook(new Request('https://valora-test.example/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':header},body:payload}),f.env));
  await f.DB.prepare("UPDATE orders SET lock_until=9999999999 WHERE id='order'").run();
  await assert.rejects(processEvent(f.env,f.stripe,f.event()),/order_busy_retry/);
});
test('state reducer expiry, partial refunds, won warnings and failed payment',()=>{
  assert.equal(paymentState({status:'expired'},null,[],[]).state,'expired');
  assert.equal(paymentState({payment_status:'paid'},{status:'succeeded'},[{status:'succeeded',amount:1}],[]).state,'revoked');
  assert.equal(paymentState({payment_status:'paid'},{status:'succeeded'},[],[{status:'warning_closed'}]).state,'active');
});
test('disabled checkout never calls a payment API',async()=>{
  const f=await fixture();f.env.PURCHASES_ENABLED='false';await assert.rejects(checkout(f.env,{id:'owner'},'plus',crypto.randomUUID()),/purchases_disabled/);
});
test('checkout retries and parallel clicks share a durable order and Stripe idempotency key',async()=>{
  const f=await fixture();await f.DB.prepare('DELETE FROM orders').run();
  const created=new Map(),params=[];
  f.stripe.checkout.sessions.create=async(data,options)=>{
    params.push({data,options});
    if(!created.has(options.idempotencyKey))created.set(options.idempotencyKey,{id:'cs_test_created',url:'https://checkout.stripe.com/c/pay/test'});
    return created.get(options.idempotencyKey);
  };
  const requests=[crypto.randomUUID(),crypto.randomUUID()];
  const results=await Promise.all(requests.map(id=>checkout(f.env,{id:'owner'},'plus',id,f.stripe)));
  assert.equal(results[0].order_id,results[1].order_id);assert.equal(created.size,1);
  const count=await f.DB.prepare('SELECT count(*) AS n FROM orders').first();assert.equal(count.n,1);
  assert.deepEqual(params[0].data,params.at(-1).data);
  assert.equal(params[0].data.allow_promotion_codes,false);assert.equal(params[0].data.line_items[0].price,'price_plus');
  const retry=await checkout(f.env,{id:'owner'},'plus',requests[0],f.stripe);assert.equal(retry.url,results[0].url);
  await assert.rejects(checkout(f.env,{id:'owner'},'toString',crypto.randomUUID(),f.stripe));
});
test('database update cannot acknowledge fulfillment after its lock is stolen',async()=>{
  const f=await fixture();f.stripe.checkout.sessions.listLineItems=async()=>{
    await f.DB.prepare("UPDATE orders SET lock_token='another-owner' WHERE id='order'").run();
    return {data:f.lines,has_more:false};
  };
  await assert.rejects(processEvent(f.env,f.stripe,f.event()),/order_lock_lost/);
  assert.equal((await stored(f)).state,'pending');
});
