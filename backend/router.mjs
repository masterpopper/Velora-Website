import {assert,HttpError,json,origin,sameOrigin,body,rate} from './security.mjs';
import {checkout,webhook,purchaseStatus} from './payments.mjs';
import {catalog} from './catalog.mjs';
import {safeProviderError} from './provider-errors.mjs';

export async function handle(request,bindings) {
  const env={...bindings,DB:bindings.DB?.withSession?bindings.DB.withSession('first-primary'):bindings.DB};
  try {
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
    assert(env.DB,503,'database_not_configured');
    assert(url.origin===origin(env),403,'host_rejected');
    const ip=request.headers.get('CF-Connecting-IP')||'local';
    if(path==='/api/stripe/webhook' && request.method==='POST') return json(await webhook(request,env));
   if(path==='/api/config' && request.method==='GET') {
  const keyPrefix=(env.STRIPE_SECRET_KEY||'').trim().match(/^(sk|rk)_(live|test)_/)?.[0] || 'missing_or_unrecognized';
  return json({
    mode:env.PAYMENTS_MODE||'unconfigured',
    enabled:env.PURCHASES_ENABLED==='true'&&(env.PAYMENTS_MODE==='test'||env.PAYMENTS_MODE==='live'&&env.LIVE_PAYMENTS_APPROVED==='true'),
    stripeKeyPrefix:keyPrefix,
    products:Object.values(catalog(env)).map(({sku,name,amount,currency})=>({sku,name,amount,currency}))
  });
}
    if(path==='/api/purchase/status' && request.method==='GET') {
      await rate(env,'status:'+ip,60,60);
      return json(await purchaseStatus(env,url.searchParams.get('session_id')));
    }
    if(path==='/api/checkout' && request.method==='POST') {
      sameOrigin(request,env); await rate(env,'checkout:'+ip,10,600);
      const input=await body(request);
      return json(await checkout(env,input.sku,input.request_id));
    }
    throw new HttpError(404,'not_found');
  }catch(error) {
    if(error instanceof HttpError) return json({error:error.message},error.status);
    const failure=safeProviderError(error);
    return json(failure.body,failure.status);
  }
}
