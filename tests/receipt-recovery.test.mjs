import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './helpers.mjs';
import {purchaseStatus,processEvent} from '../backend/payments.mjs';
import {now} from '../backend/security.mjs';

const stored=f=>f.DB.prepare("SELECT * FROM orders WHERE id='order'").first();
test('receipt recovers a genuinely paid order even when no webhook arrived',async()=>{
 const f=await fixture();
 assert.deepEqual(await purchaseStatus(f.env,'cs_test_1',f.stripe),{status:'paid',sku:'plus',code:'654321'});
 assert.equal((await stored(f)).reason,'verified_payment');
 assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM webhook_events').first()).n,0);
 const calls=f.state.calls;await purchaseStatus(f.env,'cs_test_1',f.stripe);assert.equal(f.state.calls,calls);
 await processEvent(f.env,f.stripe,f.event());assert.equal((await stored(f)).state,'active');
});
test('receipt recovers Theme Pack independently from Plus',async()=>{
 const f=await fixture();
 await f.DB.prepare("UPDATE orders SET sku='theme_pack',price_id='price_theme',product_id='prod_theme',amount=500").run();
 f.session.metadata.sku='theme_pack';f.session.amount_total=500;f.session.amount_subtotal=500;
 Object.assign(f.price,{id:'price_theme',product:'prod_theme',unit_amount:500});
 f.intent.amount=500;f.intent.metadata.sku='theme_pack';
 assert.deepEqual(await purchaseStatus(f.env,'cs_test_1',f.stripe),{status:'paid',sku:'theme_pack',code:'123456'});
});
test('unpaid receipt remains pending and polling is throttled',async()=>{
 const f=await fixture();f.session.payment_status='unpaid';f.intent.status='processing';
 assert.deepEqual(await purchaseStatus(f.env,'cs_test_1',f.stripe),{status:'pending'});
 assert.equal((await stored(f)).state,'pending');
 const calls=f.state.calls;await purchaseStatus(f.env,'cs_test_1',f.stripe);assert.equal(f.state.calls,calls);
 await f.DB.prepare('UPDATE orders SET updated_at=?').bind(now()-16).run();
 f.session.payment_status='paid';f.intent.status='succeeded';
 assert.equal((await purchaseStatus(f.env,'cs_test_1',f.stripe)).status,'paid');
});
test('unknown or wrong-mode sessions never query Stripe or grant codes',async()=>{
 const f=await fixture();
 assert.deepEqual(await purchaseStatus(f.env,'cs_test_unknown',f.stripe),{status:'pending'});
 f.env.PAYMENTS_MODE='live';f.env.LIVE_PAYMENTS_APPROVED='true';
 assert.deepEqual(await purchaseStatus(f.env,'cs_test_1',f.stripe),{status:'pending'});
 assert.equal(f.state.calls,0);
});
for(const mismatch of ['account','price','amount','metadata','intent','bound_intent','mode']) {
 test('receipt rejects '+mismatch+' mismatch without fulfilling',async()=>{
  const f=await fixture();
  if(mismatch==='account')f.stripe.accounts.retrieve=async()=>({id:'acct_other'});
  if(mismatch==='price')f.lines[0].price.id='price_other';
  if(mismatch==='amount')f.session.amount_total=1;
  if(mismatch==='metadata')f.session.metadata.order_id='other_order';
  if(mismatch==='intent')f.intent.metadata.order_id='other_order';
  if(mismatch==='bound_intent')await f.DB.prepare("UPDATE orders SET payment_intent='pi_other'").run();
  if(mismatch==='mode')f.session.livemode=true;
  await assert.rejects(purchaseStatus(f.env,'cs_test_1',f.stripe));
  assert.equal((await stored(f)).state,'pending');assert.equal((await stored(f)).lock_until,0);
 });
}
test('current refunds and disputes block receipt recovery',async()=>{
 for(const kind of ['refund','dispute']){
  const f=await fixture();
  if(kind==='refund')f.state.refunds=[{status:'succeeded'}];else f.state.disputes=[{status:'needs_response'}];
  const result=await purchaseStatus(f.env,'cs_test_1',f.stripe);
  assert.equal(result.status,kind==='refund'?'revoked':'suspended');assert.equal(result.code,undefined);
 }
});
test('Stripe permission errors leave order pending and release the lock',async()=>{
 const f=await fixture();f.stripe.refunds.list=async()=>{throw Object.assign(new Error('private provider detail'),{type:'StripePermissionError'});};
 await assert.rejects(purchaseStatus(f.env,'cs_test_1',f.stripe));
 assert.equal((await stored(f)).state,'pending');assert.equal((await stored(f)).lock_until,0);
});
test('concurrent webhook lock does not create another fulfillment',async()=>{
 const f=await fixture();await f.DB.prepare('UPDATE orders SET lock_until=?').bind(now()+300).run();
 assert.deepEqual(await purchaseStatus(f.env,'cs_test_1',f.stripe),{status:'pending'});
 assert.equal(f.state.calls,0);
});
test('receipt keeps verification errors visible after its polling limit',async()=>{
 const nodes=new Map();const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',hidden:true,addEventListener(){}});return nodes.get(selector);};
 const sandbox={document:{querySelector:node,querySelectorAll:()=>[]},URL,Map,encodeURIComponent,
  location:{href:'https://veloratv.app/buy'},setTimeout:fn=>fn(),
  fetch:async()=>({ok:false,json:async()=>({error:'stripe_permission_denied'})})};
 vm.createContext(sandbox);vm.runInContext(readFileSync(new URL('../dist/buy/buy.js',import.meta.url),'utf8'),sandbox);
 await vm.runInContext("checkSession('cs_test_1')",sandbox);
 assert.equal(node('#receipt-title').textContent,'Payment verification needs attention');
 assert.match(node('#receipt-message').textContent,/stripe_permission_denied/);
 assert.match(node('#receipt-message').textContent,/Do not pay again/);
});
