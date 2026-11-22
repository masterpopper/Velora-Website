import {assert} from './security.mjs';
export function paymentMode(env) {
  assert(['test','live'].includes(env.PAYMENTS_MODE),503,'payment_mode_not_configured');
  const live=env.PAYMENTS_MODE==='live';
  assert(!live||env.LIVE_PAYMENTS_APPROVED==='true',503,'live_payments_not_approved');
  return {live,name:live?'live':'test',audience:live?'app.velora.tv':'app.velora.tv.test'};
}
