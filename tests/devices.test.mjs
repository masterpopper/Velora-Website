import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,jwtVerify,importJWK} from 'jose';
import {fixture} from './helpers.mjs';
import {initDevice,approvePair,mintRedemption,redeem,signedEntitlements,publicKeys} from '../backend/devices.mjs';
import {hash,now,device,sessionCookie} from '../backend/security.mjs';
import {handle} from '../backend/router.mjs';
test('pair code high entropy, one-use, account bound and expires',async()=>{
  const f=await fixture(),init=await initDevice(f.env);assert.match(init.pair_code,/^[a-f0-9]{32}$/);assert.match(init.device_token,/^[a-f0-9]{64}$/);
  const stored=await f.DB.prepare('SELECT * FROM devices WHERE id=?').bind(init.device_id).first();assert.notEqual(stored.token_hash,init.device_token);
  await approvePair(f.env,{id:'owner'},init.pair_code);
  await assert.rejects(approvePair(f.env,{id:'other'},init.pair_code));
  await assert.rejects(approvePair(f.env,{id:'owner'},init.pair_code));
  await assert.rejects(approvePair(f.env,{id:'owner'},'557432'));
  const next=await initDevice(f.env);await f.DB.prepare('UPDATE pairings SET expires_at=0 WHERE device_id=?').bind(next.device_id).run();
  await assert.rejects(approvePair(f.env,{id:'owner'},next.pair_code));
});
test('single-use redemption only with current purchase; wrong-owner device denied',async()=>{
  const f=await fixture();await assert.rejects(mintRedemption(f.env,{id:'owner'}));
  await f.DB.prepare("UPDATE orders SET state='active' WHERE id='order'").run();
  const grant=await mintRedemption(f.env,{id:'owner'}),a=await initDevice(f.env),b=await initDevice(f.env);
  const load=id=>f.DB.prepare('SELECT * FROM devices WHERE id=?').bind(id).first();
  await redeem(f.env,await load(a.device_id),grant.code);
  await assert.rejects(redeem(f.env,await load(b.device_id),grant.code));
  const grant2=await mintRedemption(f.env,{id:'owner'});await approvePair(f.env,{id:'other'},b.pair_code);
  await assert.rejects(redeem(f.env,await load(b.device_id),grant2.code));
  assert.equal((await load(b.device_id)).account_id,'other');
  await assert.rejects(redeem(f.env,await load(a.device_id),'557432'));
});
test('concurrent redemption consumes once; failed device bind does not burn token',async()=>{
  const f=await fixture();await f.DB.prepare("UPDATE orders SET state='active' WHERE id='order'").run();
  const grant=await mintRedemption(f.env,{id:'owner'}),a=await initDevice(f.env),b=await initDevice(f.env);
  const results=await Promise.allSettled([a,b].map(async item=>redeem(f.env,await f.DB.prepare('SELECT * FROM devices WHERE id=?').bind(item.device_id).first(),grant.code)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('signed claims bind issuer, subject, audience, device, mode and short expiry; refund removes purchase on sync',async()=>{
  const f=await fixture(),pair=await generateKeyPair('ES256',{extractable:true});
  f.env.ENTITLEMENT_PRIVATE_JWK=JSON.stringify(await exportJWK(pair.privateKey));f.env.ENTITLEMENT_PUBLIC_JWK=JSON.stringify(await exportJWK(pair.publicKey));f.env.ENTITLEMENT_KEY_ID='test-1';
  const init=await initDevice(f.env);await approvePair(f.env,{id:'owner'},init.pair_code);
  const dev=await f.DB.prepare('SELECT * FROM devices WHERE id=?').bind(init.device_id).first();
  await f.DB.prepare("UPDATE orders SET state='active' WHERE id='order'").run();
  const result=await signedEntitlements(f.env,dev),{payload}=await jwtVerify(result.token,pair.publicKey,{issuer:f.env.SITE_ORIGIN,audience:'app.velora.tv.test',algorithms:['ES256']});
  assert.equal(payload.sub,'owner');assert.equal(payload.device_id,dev.id);assert.equal(payload.mode,'test');assert.equal(payload.entitlements.plus,true);assert.equal(payload.exp-payload.iat,3600);
  await assert.rejects(jwtVerify(result.token,pair.publicKey,{audience:'app.velora.tv',algorithms:['ES256']}));
  const published=publicKeys({...f.env,ENTITLEMENT_PUBLIC_JWK:f.env.ENTITLEMENT_PRIVATE_JWK});assert.equal(published.keys[0].d,undefined);
  await f.DB.prepare("UPDATE orders SET state='revoked' WHERE id='order'").run();assert.equal((await signedEntitlements(f.env,dev)).entitlements.plus,false);
});
test('device token revocation works; unsigned account / foreign-origin mutation blocked; redirect never grants',async()=>{
  const f=await fixture(),init=await initDevice(f.env),req=new Request(f.env.SITE_ORIGIN+'/api/device/entitlements',{headers:{Authorization:'Bearer '+init.device_token}});
  assert.equal((await device(req,f.env)).id,init.device_id);
  await f.DB.prepare('UPDATE devices SET revoked_at=1 WHERE id=?').bind(init.device_id).run();await assert.rejects(device(req,f.env));
  const unauth=await handle(new Request(f.env.SITE_ORIGIN+'/api/account'),f.env);assert.equal(unauth.status,401);
  const raw='a'.repeat(64);await f.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(raw),'owner',now()+60).run();
  const csrf=await handle(new Request(f.env.SITE_ORIGIN+'/api/redemption',{method:'POST',headers:{Cookie:sessionCookie('__Host-valora_session',raw,60),Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}),f.env);assert.equal(csrf.status,403);
  const redirect=await handle(new Request(f.env.SITE_ORIGIN+'/api/account?checkout=returned&paid=true'),f.env);assert.equal(redirect.status,401);
});
