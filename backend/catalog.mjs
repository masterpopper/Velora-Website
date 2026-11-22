import { assert } from './security.mjs';
export function catalog(env) {
  return {
    plus:{sku:'plus',name:'Plus',amount:1000,currency:'usd',price:env.PLUS_PRICE_ID,product:env.PLUS_PRODUCT_ID},
    theme_pack:{sku:'theme_pack',name:'Theme Pack + Donation',amount:500,currency:'usd',price:env.THEME_PRICE_ID,product:env.THEME_PRODUCT_ID}
  };
}
export function validatePrice(price, item,live=false) {
  assert(price && price.id===item.price && price.active && price.type==='one_time' && !price.recurring &&
    price.unit_amount===item.amount && price.currency==='usd' && price.billing_scheme==='per_unit' &&
    (typeof price.product==='string'?price.product:price.product?.id)===item.product && price.livemode===live,
    503,'price_configuration_rejected');
}
export function validateSession(session, lines, order) {
  assert(session.id===order.session_id && session.mode==='payment' && session.livemode===(order.mode==='live') &&
    session.client_reference_id===order.id && session.metadata?.order_id===order.id &&
    session.metadata?.account_id===order.account_id && session.metadata?.sku===order.sku &&
    session.currency==='usd' && session.amount_total===order.amount && session.amount_subtotal===order.amount &&
    (session.total_details?.amount_discount||0)===0 && (session.total_details?.amount_tax||0)===0 &&
    lines.length===1 && lines[0].quantity===1 && lines[0].price?.id===order.price_id &&
    (typeof lines[0].price.product==='string'?lines[0].price.product:lines[0].price.product?.id)===order.product_id &&
    lines[0].price.unit_amount===order.amount && lines[0].price.currency==='usd' && !lines[0].price.recurring,
    409,'session_verification_failed');
}
// Recompute from CURRENT Stripe resources, never from a stale event snapshot.
export function paymentState(session, intent, refunds, disputes) {
  if(refunds.some(r=>r.status==='succeeded')) return {state:'revoked',reason:'refunded'};
  if(disputes.some(d=>d.status==='lost')) return {state:'revoked',reason:'dispute_lost'};
  if(refunds.some(r=>r.status==='pending'||r.status==='requires_action') ||
    disputes.some(d=>!['won','warning_closed','lost'].includes(d.status)))
    return {state:'suspended',reason:'refund_or_dispute_pending'};
  if(session.payment_status==='paid' && intent?.status==='succeeded') return {state:'active',reason:'verified_payment'};
  if(session.status==='expired') return {state:'expired',reason:'checkout_expired'};
  if(intent?.status==='canceled'||intent?.last_payment_error) return {state:'failed',reason:'payment_not_succeeded'};
  return {state:'pending',reason:'awaiting_payment'};
}
