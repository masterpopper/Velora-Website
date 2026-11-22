import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {fixture} from './helpers.mjs';
import {processEvent,webhook,stripeClient,checkout,purchaseStatus} from '../backend/payments.mjs';
import {catalog,validatePrice,validateSession,paymentState} from '../backend/catalog.mjs';
const stored=async f=>f.DB.prepare('SELECT * FROM orders WHERE id=?').bind('order').first();

test('verified paid checkout delivers the configured code only after webhook confirmation',async()=>{
 const f=await fixture();assert.deepEqual(await purchaseStatus(f.env,'cs_test_1'),{status:'pending'});
 await processEvent(f.env,f.stripe,f.event());assert.equal((await stored(f)).state,'active');
 assert.deepEqual(await purchaseStatus(f.env,'cs_test_1'),{status:'paid',sku:'plus',code:'654321'});
});
test('duplicate webhook delivery is idempotent',async()=>{
 const f=await fixture();await processEvent(f.env,f.stripe,f.event());const calls=f.state.calls;
 assert.deepEqual(await processEvent(f.env,f.stripe,f.event()),{duplicate:true});assert.equal(f.state.calls,calls);
});
test('unpaid async checkout remains pending, then succeeds',async()=>{
 const f=await fixture();f.session.payment_status='unpaid';f.intent.status='processing';
 await processEvent(f.env,f.stripe,f.event());assert.equal((await stored(f)).state,'pending');
 f.session.payment_status='paid';f.intent.status='succeeded';
 await processEvent(f.env,f.stripe,f.event('evt_2','checkout.session.async_payment_succeeded'));
 assert.equal((await stored(f)).state,'active');
});
test('failed, expired, refunded or disputed orders do not receive a delivery code',async()=>{
 const f=await fixture();f.session.payment_status='unpaid';f.intent.status='requires_payment_method';f.intent.last_payment_error={code:'card_declined'};
 await processEvent(f.env,f.stripe,f.event('evt_fail','checkout.session.async_payment_failed'));
 assert.equal((await purchaseStatus(f.env,'cs_test_1')).status,'failed');
});
test('refund revokes delivery and old success cannot reactivate it',async()=>{
 const f=await fixture();f.state.refunds=[{status:'succeeded'}];
 await processEvent(f.env,f.stripe,f.event('evt_refund','refund.updated',{object:'refund',payment_intent:'pi_1'}));
 assert.equal((await stored(f)).state,'revoked');assert.deepEqual(await purchaseStatus(f.env,'cs_test_1'),{status:'revoked'});
 await processEvent(f.env,f.stripe,f.event('evt_old_success'));assert.equal((await stored(f)).state,'revoked');
});
test('pending refund/dispute suspends; won dispute restores; lost dispute revokes',async()=>{
 const f=await fixture();f.state.disputes=[{status:'needs_response'}];await processEvent(f.env,f.stripe,f.event());assert.equal((await stored(f)).state,'suspended');
 f.state.disputes=[{status:'won'}];await processEvent(f.env,f.stripe,f.event('evt_win'));assert.equal((await stored(f)).state,'active');
 f.state.disputes=[{status:'lost'}];await processEvent(f.env,f.stripe,f.event('evt_loss'));assert.equal((await stored(f)).state,'revoked');
});
test('server rejects wrong price, amount, quantity and product',async()=>{
 const f=await fixture();validatePrice(f.price,catalog(f.env).plus);validateSession(f.session,f.lines,f.order);
 assert.throws(()=>validatePrice({...f.price,unit_amount:1},catalog(f.env).plus));
 assert.throws(()=>validatePrice({...f.price,recurring:{interval:'month'}},catalog(f.env).plus));
 assert.throws(()=>validateSession({...f.session,amount_total:1},f.lines,f.order));
 assert.throws(()=>validateSession(f.session,[{...f.lines[0],quantity:2}],f.order));
 f.lines[0].price.product='prod_foreign';await assert.rejects(processEvent(f.env,f.stripe,f.event()));
 assert.equal((await stored(f)).state,'pending');
});
test('wrong Stripe account and live/test mode are rejected',async()=>{
 const f=await fixture();await assert.rejects(processEvent(f.env,f.stripe,{...f.event(),account:'acct_other'}));
 await assert.rejects(processEvent(f.env,f.stripe,{...f.event(),livemode:true}));
 f.stripe.accounts.retrieve=async()=>({id:'acct_other'});await assert.rejects(processEvent(f.env,f.stripe,f.event()));
 assert.throws(()=>stripeClient({...f.env,STRIPE_SECRET_KEY:'sk_live_not_real'}));
});
test('invalid webhook signature rejected before any order mutation',async()=>{
 const f=await fixture(),sdk=new Stripe('sk_test_fixture_not_real'),secret='whsec_fixture_only_not_real';f.env.STRIPE_WEBHOOK_SECRET=secret;
 const payload=JSON.stringify(f.event()),header=sdk.webhooks.generateTestHeaderString({payload,secret});
 const request=new Request('https://valora-test.example/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':header},body:payload+' '});
 await assert.rejects(webhook(request,f.env));assert.equal((await stored(f)).state,'pending');
 const valid=new Request('https://valora-test.example/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':header},body:payload});
 f.stripe.webhooks=sdk.webhooks;await webhook(valid,f.env,f.stripe);assert.equal((await stored(f)).state,'active');
});
test('disabled checkout never calls Stripe',async()=>{
 const f=await fixture();f.env.PURCHASES_ENABLED='false';await assert.rejects(checkout(f.env,'plus',crypto.randomUUID(),f.stripe),/purchases_disabled/);
});
test('guest checkout has no account identity and is idempotent for the same request ID',async()=>{
 const f=await fixture();await f.DB.prepare('DELETE FROM orders').run();let createCount=0;
 f.stripe.checkout.sessions.create=async(data)=>{createCount++;assert.equal(data.metadata.account_id,undefined);assert.match(data.success_url,/session_id=\{CHECKOUT_SESSION_ID\}/);return {id:'cs_test_guest',url:'https://checkout.stripe.com/c/pay/guest'};};
 const requestId=crypto.randomUUID();const a=await checkout(f.env,'theme_pack',requestId,f.stripe);
 const b=await checkout(f.env,'theme_pack',requestId,f.stripe);assert.equal(a.order_id,b.order_id);assert.equal(createCount,1);
 const order=await f.DB.prepare('SELECT * FROM orders WHERE id=?').bind(a.order_id).first();assert.equal(order.sku,'theme_pack');
});
test('delivery codes are server configuration and must be set',async()=>{
 const f=await fixture();await processEvent(f.env,f.stripe,f.event());delete f.env.PLUS_DELIVERY_CODE;
 await assert.rejects(purchaseStatus(f.env,'cs_test_1'),/delivery_codes_not_configured/);
});
test('payment-state reducer handles expiry, refunds and disputes',()=>{
 assert.equal(paymentState({status:'expired'},null,[],[]).state,'expired');
 assert.equal(paymentState({payment_status:'paid'},{status:'succeeded'},[{status:'succeeded'}],[]).state,'revoked');
 assert.equal(paymentState({payment_status:'paid'},{status:'succeeded'},[],[{status:'warning_closed'}]).state,'active');
});
