import Stripe from 'stripe';
import {assert,now,token,HttpError,boundedText} from './security.mjs';
import {catalog,validatePrice,validateSession,paymentState} from './catalog.mjs';
import {paymentMode} from './mode.mjs';

export function stripeClient(env) {
  const mode=paymentMode(env);
  assert(new RegExp('^(sk|rk)_'+mode.name+'_').test(env.STRIPE_SECRET_KEY||''),503,'stripe_key_mode_mismatch');
  return new Stripe(env.STRIPE_SECRET_KEY, {httpClient:Stripe.createFetchHttpClient(),timeout:8000,maxNetworkRetries:1});
}
export async function assertStripeAccount(stripe,env) {
  const owner=await stripe.accounts.retrieve();
  assert(/^acct_/.test(env.STRIPE_ACCOUNT_ID||'') && owner.id===env.STRIPE_ACCOUNT_ID,503,'stripe_account_mismatch');
}
export async function entitlements(env,accountId) {
  const grants=await env.DB.prepare(`SELECT sku FROM orders WHERE account_id=? AND mode=? AND state='active'
    UNION SELECT sku FROM legacy_grants WHERE account_id=? AND revoked_at IS NULL`)
    .bind(accountId,env.PAYMENTS_MODE,accountId).all();
  return {plus:grants.results.some(x=>x.sku==='plus'),theme_pack:grants.results.some(x=>x.sku==='theme_pack')};
}
export async function checkout(env,owner,sku,requestId,client) {
  assert(env.PURCHASES_ENABLED==='true',503,'purchases_disabled');
  const mode=paymentMode(env);
  assert(['plus','theme_pack'].includes(sku),400,'invalid_checkout_request');
  const item=catalog(env)[sku];
  assert(/^[a-f0-9-]{32,64}$/.test(requestId||''),400,'invalid_checkout_request');
  assert(!(await entitlements(env,owner.id))[sku],409,'already_owned');
  const stripe=client||stripeClient(env);
  await assertStripeAccount(stripe,env);
  const price=await stripe.prices.retrieve(item.price);
  validatePrice(price,item,mode.live);
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT OR IGNORE INTO orders
    (id,account_id,sku,request_id,stripe_account,mode,price_id,product_id,amount,currency,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,'usd',?,?)`)
    .bind(id,owner.id,sku,requestId,env.STRIPE_ACCOUNT_ID,mode.name,item.price,item.product,item.amount,now(),now()).run();
  const order=await env.DB.prepare(`SELECT * FROM orders WHERE account_id=? AND sku=? AND
    (state='pending' OR request_id=?) ORDER BY CASE WHEN request_id=? THEN 0 ELSE 1 END LIMIT 1`)
    .bind(owner.id,sku,requestId,requestId).first();
  assert(order && order.state==='pending',409,'checkout_already_finished');
  assert(order.mode===mode.name && order.price_id===item.price && order.product_id===item.product && order.stripe_account===env.STRIPE_ACCOUNT_ID,
    409,'pending_order_configuration_changed');
  if(order.checkout_url) return {url:order.checkout_url,order_id:order.id};
  const session=await stripe.checkout.sessions.create({
    mode:'payment',client_reference_id:order.id,line_items:[{price:item.price,quantity:1}],
    metadata:{order_id:order.id,account_id:owner.id,sku},
    payment_intent_data:{metadata:{order_id:order.id,account_id:owner.id,sku}},
    success_url:env.SITE_ORIGIN+'/buy?checkout=returned',cancel_url:env.SITE_ORIGIN+'/buy?checkout=cancelled',
    allow_promotion_codes:false
  },{idempotencyKey:'valora-'+mode.name+'-order-'+order.id});
  assert(session.url?.startsWith('https://checkout.stripe.com/'),503,'checkout_url_invalid');
  await env.DB.prepare('UPDATE orders SET session_id=?,checkout_url=?,updated_at=? WHERE id=?')
    .bind(session.id,session.url,now(),order.id).run();
  return {url:session.url,order_id:order.id};
}

export const acceptedEvents = new Set([
  'checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed',
  'checkout.session.expired','payment_intent.succeeded','payment_intent.payment_failed',
  'charge.refunded','refund.created','refund.updated','refund.failed',
  'charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated'
]);
const objectId=value=>typeof value==='string'?value:value?.id;
async function allPages(list,params) {
  const result=[]; let cursor;
  do {
    const page=await list({...params,limit:100,...(cursor?{starting_after:cursor}:{})});
    result.push(...page.data); cursor=page.has_more?page.data.at(-1)?.id:null;
    assert(result.length<=1000 && (!page.has_more || cursor),503,'resource_pagination_limit');
  }while(cursor);
  return result;
}
async function findOrder(env,stripe,event) {
  const object=event.data.object;
  if(event.type.startsWith('checkout.session.')) {
    return env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(object.metadata?.order_id||'').first();
  }
  let pi=object.object==='payment_intent'?object.id:objectId(object.payment_intent);
  if(!pi && object.charge) pi=objectId((await stripe.charges.retrieve(objectId(object.charge))).payment_intent);
  if(!pi) return null;
  let order=await env.DB.prepare('SELECT * FROM orders WHERE payment_intent=?').bind(pi).first();
  if(!order) {
    const intent=await stripe.paymentIntents.retrieve(pi);
    order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(intent.metadata?.order_id||'').first();
    if(order && order.session_id) {
      const session=await stripe.checkout.sessions.retrieve(order.session_id);
      assert(objectId(session.payment_intent)===pi,409,'payment_intent_mismatch');
    } else if(order) {
      // A webhook can race the create-session response. Retry rather than acknowledge a dropped fulfillment.
      throw new HttpError(503,'checkout_binding_pending');
    }
  }
  return order;
}
export async function processEvent(env,stripe,event) {
  const mode=paymentMode(env);
  assert(event.livemode===mode.live && (!event.account || event.account===env.STRIPE_ACCOUNT_ID),400,'event_account_or_mode_rejected');
  if(!acceptedEvents.has(event.type)) return {ignored:true};
  if(await env.DB.prepare('SELECT id FROM webhook_events WHERE id=?').bind(event.id).first()) return {duplicate:true};
  await assertStripeAccount(stripe,env);
  const order=await findOrder(env,stripe,event);
  if(!order) return {ignored:true}; // Not a Velora order: no entitlement is ever created from metadata alone.
  assert(order.stripe_account===env.STRIPE_ACCOUNT_ID && order.mode===mode.name,409,'order_account_mismatch');
  const lock=token();
  const acquired=await env.DB.prepare('UPDATE orders SET lock_token=?,lock_until=? WHERE id=? AND lock_until<? RETURNING id')
    .bind(lock,now()+300,order.id,now()).first();
  assert(acquired,503,'order_busy_retry');
  try {
    let sessionId=order.session_id;
    if(!sessionId && event.type.startsWith('checkout.session.')) sessionId=event.data.object.id;
    assert(sessionId,503,'checkout_binding_pending');
    const session=await stripe.checkout.sessions.retrieve(sessionId);
    const lines=await stripe.checkout.sessions.listLineItems(sessionId,{limit:2});
    validateSession(session,lines.data,{...order,session_id:sessionId});
    assert(!lines.has_more,409,'unexpected_line_items');
    let intent=null,refunds=[],disputes=[];
    if(session.payment_intent) {
      intent=await stripe.paymentIntents.retrieve(objectId(session.payment_intent));
      assert(intent.livemode===mode.live && intent.amount===order.amount && intent.currency==='usd' &&
        intent.metadata?.order_id===order.id && intent.metadata?.account_id===order.account_id &&
        intent.metadata?.sku===order.sku,409,'intent_verification_failed');
      refunds=await allPages(params=>stripe.refunds.list(params),{payment_intent:intent.id});
      if(intent.latest_charge) {
        disputes=await allPages(params=>stripe.disputes.list(params),{charge:objectId(intent.latest_charge)});
      }
    }
    const state=paymentState(session,intent,refunds,disputes);
    await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET session_id=?,payment_intent=?,state=?,reason=?,updated_at=?
        WHERE id=? AND lock_token=?`).bind(sessionId,intent?.id||null,state.state,state.reason,now(),order.id,lock),
      env.DB.prepare(`INSERT OR IGNORE INTO webhook_events(id,order_id,type,processed_at)
        SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND lock_token=?)`)
        .bind(event.id,order.id,event.type,now(),order.id,lock),
      env.DB.prepare('UPDATE orders SET lock_until=0,lock_token=NULL WHERE id=? AND lock_token=?').bind(order.id,lock)
    ]);
    assert(await env.DB.prepare('SELECT id FROM webhook_events WHERE id=?').bind(event.id).first(),503,'order_lock_lost');
    return {received:true};
  }finally {
    await env.DB.prepare('UPDATE orders SET lock_until=0,lock_token=NULL WHERE id=? AND lock_token=?').bind(order.id,lock).run();
  }
}
export async function webhook(request,env,stripe=stripeClient(env)) {
  assert(env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'),503,'webhook_not_configured');
  const raw=await boundedText(request,1024*1024);
  let event;
  try {
    event=await stripe.webhooks.constructEventAsync(raw,request.headers.get('stripe-signature')||'',
      env.STRIPE_WEBHOOK_SECRET,300,Stripe.createSubtleCryptoProvider());
  }catch { throw new HttpError(400,'invalid_webhook_signature'); }
  return processEvent(env,stripe,event);
}
