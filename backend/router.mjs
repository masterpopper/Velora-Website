import {assert,HttpError,json,origin,sameOrigin,body,account,device,rate,hash,now} from './security.mjs';
import {startAuth,finishAuth,logout} from './auth.mjs';
import {checkout,webhook,entitlements} from './payments.mjs';
import {catalog} from './catalog.mjs';
import {initDevice,approvePair,mintRedemption,redeem,signedEntitlements,publicKeys} from './devices.mjs';

export async function handle(request,bindings) {
  const env={...bindings,DB:bindings.DB?.withSession?bindings.DB.withSession('first-primary'):bindings.DB};
  try {
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
    assert(env.DB,503,'database_not_configured');
    assert(url.origin===origin(env),403,'host_rejected');
    if(path==='/api/stripe/webhook' && request.method==='POST') return json(await webhook(request,env));
    if(path==='/api/config' && request.method==='GET') return json({mode:env.PAYMENTS_MODE||'unconfigured',enabled:env.PURCHASES_ENABLED==='true'&&(env.PAYMENTS_MODE==='test'||env.PAYMENTS_MODE==='live'&&env.LIVE_PAYMENTS_APPROVED==='true'),
      auth_configured:!!(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET),
      products:Object.values(catalog(env)).map(({sku,name,amount,currency})=>({sku,name,amount,currency}))});
    if(path==='/api/entitlements/keys' && request.method==='GET') return json(publicKeys(env));
    const ip=request.headers.get('CF-Connecting-IP')||'local';
    if(path==='/api/auth/start' && request.method==='GET') {
      assert(!request.headers.get('Origin')||request.headers.get('Origin')===origin(env),403,'origin_rejected');
      await rate(env,'auth:'+ip,10,600); return await startAuth(request,env);
    }
    if(path==='/api/auth/callback' && request.method==='GET') {await rate(env,'callback:'+ip,15,600);return await finishAuth(request,env);}
    if(path==='/api/device/init' && request.method==='POST') {
      await rate(env,'init:'+ip,10,600); return json(await initDevice(env),201);
    }
    if(path.startsWith('/api/device/')) {
      const dev=await device(request,env);
      await rate(env,'device:'+dev.id,15,60);
      if(path==='/api/device/entitlements' && request.method==='GET') return json(await signedEntitlements(env,dev));
      if(path==='/api/device/redeem' && request.method==='POST') {
        const input=await body(request);return json(await redeem(env,dev,input.code));
      }
      if(path==='/api/device/unlink' && request.method==='POST') {
        await env.DB.prepare('UPDATE devices SET revoked_at=? WHERE id=?').bind(now(),dev.id).run();
        return json({revoked:true});
      }
      throw new HttpError(404,'not_found');
    }
    const owner=await account(request,env);
    await rate(env,'account:'+owner.id,60,60);
    if(path==='/api/account' && request.method==='GET') {
      const purchases=await env.DB.prepare('SELECT id,sku,state,reason,mode,created_at FROM orders WHERE account_id=? ORDER BY created_at DESC LIMIT 25').bind(owner.id).all();
      const devices=await env.DB.prepare('SELECT id,created_at,expires_at FROM devices WHERE account_id=? AND revoked_at IS NULL AND expires_at>?').bind(owner.id,now()).all();
      return json({id:owner.id,login:owner.login,entitlements:await entitlements(env,owner.id),purchases:purchases.results,devices:devices.results,mode:env.PAYMENTS_MODE});
    }
    assert(request.method==='POST',405,'method_not_allowed'); sameOrigin(request,env);
    if(path==='/api/auth/logout') return await logout(request,env);
    const input=await body(request);
    if(path==='/api/checkout') {await rate(env,'checkout:'+owner.id,10,600);return json(await checkout(env,owner,input.sku,input.request_id));}
    if(path==='/api/pair/approve') {await rate(env,'pair:'+owner.id,10,600);return json(await approvePair(env,owner,input.code));}
    if(path==='/api/redemption') {await rate(env,'redeem-mint:'+owner.id,5,600);return json(await mintRedemption(env,owner),201);}
    if(path==='/api/devices/revoke') {
      assert(typeof input.device_id==='string',400,'device_id_required');
      await env.DB.prepare('UPDATE devices SET revoked_at=? WHERE id=? AND account_id=?').bind(now(),input.device_id,owner.id).run();
      return json({revoked:true});
    }
    throw new HttpError(404,'not_found');
  }catch(error) {
    // Never log bodies, OAuth codes, cookies, bearer tokens, Stripe objects, or secret values.
    return json({error:error instanceof HttpError?error.message:'service_unavailable'},error instanceof HttpError?error.status:503);
  }
}
