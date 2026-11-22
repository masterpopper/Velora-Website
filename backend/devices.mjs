import {SignJWT,importJWK} from 'jose';
import {assert,hash,token,now} from './security.mjs';
import {entitlements} from './payments.mjs';
import {paymentMode} from './mode.mjs';

export async function initDevice(env) {
  const deviceId=crypto.randomUUID(),deviceToken=token(),pairCode=token(16);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO devices(id,token_hash,created_at,expires_at) VALUES(?,?,?,?)')
      .bind(deviceId,await hash(deviceToken),now(),now()+90*86400),
    env.DB.prepare('INSERT INTO pairings(hash,device_id,expires_at) VALUES(?,?,?)')
      .bind(await hash(pairCode),deviceId,now()+600)
  ]);
  return {device_id:deviceId,device_token:deviceToken,pair_code:pairCode,expires_in:600,poll_interval:5,
    verification_uri:env.SITE_ORIGIN+'/buy',verification_uri_complete:env.SITE_ORIGIN+'/buy?pair='+pairCode};
}
export async function approvePair(env,owner,code) {
  assert(/^[a-f0-9]{32}$/.test(code||''),400,'invalid_pair_code');
  const digest=await hash(code);
  const result=await env.DB.batch([
    env.DB.prepare(`UPDATE devices SET account_id=? WHERE id=(SELECT device_id FROM pairings
      WHERE hash=? AND expires_at>? AND consumed_at IS NULL) AND revoked_at IS NULL AND expires_at>?
      AND (account_id IS NULL OR account_id=?) RETURNING id`).bind(owner.id,digest,now(),now(),owner.id),
    env.DB.prepare(`UPDATE pairings SET consumed_at=? WHERE hash=? AND consumed_at IS NULL AND
      device_id IN(SELECT id FROM devices WHERE account_id=?)`).bind(now(),digest,owner.id)
  ]);
  assert(result[0].results.length===1,409,'pair_code_used_or_expired');
  return {paired:true,device_id:result[0].results[0].id};
}
export async function mintRedemption(env,owner) {
  const grants=await entitlements(env,owner.id);
  assert(grants.plus||grants.theme_pack,409,'no_verified_purchase');
  const raw=token(24);
  await env.DB.prepare('INSERT INTO redemptions(hash,account_id,expires_at) VALUES(?,?,?)')
    .bind(await hash(raw),owner.id,now()+600).run();
  return {code:raw,expires_in:600};
}
export async function redeem(env,dev,code) {
  assert(/^[a-f0-9]{48}$/.test(code||''),400,'invalid_redemption_code');
  const digest=await hash(code);
  const result=await env.DB.batch([
    env.DB.prepare(`UPDATE devices SET account_id=(SELECT account_id FROM redemptions WHERE hash=?
      AND consumed_at IS NULL AND expires_at>?) WHERE id=? AND revoked_at IS NULL AND
      EXISTS(SELECT 1 FROM redemptions r WHERE r.hash=? AND r.consumed_at IS NULL AND r.expires_at>?
        AND (devices.account_id IS NULL OR devices.account_id=r.account_id)) RETURNING id`)
      .bind(digest,now(),dev.id,digest,now()),
    env.DB.prepare(`UPDATE redemptions SET consumed_at=?,consumed_by=? WHERE hash=? AND consumed_at IS NULL
      AND account_id=(SELECT account_id FROM devices WHERE id=?)`).bind(now(),dev.id,digest,dev.id)
  ]);
  assert(result[0].results.length===1,409,'redemption_used_expired_or_wrong_account');
  // The code only links ownership. JWT claims still come from CURRENT durable grants.
  return {redeemed:true};
}
export async function signedEntitlements(env,dev) {
  assert(dev.account_id,409,'pairing_pending');
  const grants=await entitlements(env,dev.account_id);
  const mode=paymentMode(env);
  let jwk;
  try {jwk=JSON.parse(env.ENTITLEMENT_PRIVATE_JWK);} catch {assert(false,503,'signing_not_configured');}
  assert(jwk.kty==='EC' && jwk.crv==='P-256' && jwk.d && env.ENTITLEMENT_KEY_ID,503,'invalid_signing_key');
  let published;
  try {published=JSON.parse(env.ENTITLEMENT_PUBLIC_JWK);}catch{assert(false,503,'invalid_public_key');}
  assert(published.x===jwk.x && published.y===jwk.y && published.crv===jwk.crv,503,'signing_key_mismatch');
  const key=await importJWK(jwk,'ES256');
  const jwt=await new SignJWT({schema:1,mode:mode.name,package:'app.velora.tv',device_id:dev.id,entitlements:grants})
    .setProtectedHeader({alg:'ES256',kid:env.ENTITLEMENT_KEY_ID,typ:'JWT'})
    .setSubject(dev.account_id).setIssuer(env.SITE_ORIGIN).setAudience(mode.audience)
    .setIssuedAt(now()).setExpirationTime(now()+3600).setJti(crypto.randomUUID()).sign(key);
  return {token:jwt,expires_in:3600,entitlements:grants,mode:mode.name};
}
export function publicKeys(env) {
  let publicKey;
  try {publicKey=JSON.parse(env.ENTITLEMENT_PUBLIC_JWK);} catch {assert(false,503,'signing_not_configured');}
  // Explicit public field allowlist: never return private JWK material even if misconfigured.
  assert(publicKey.kty==='EC' && publicKey.crv==='P-256' && publicKey.x && publicKey.y,503,'invalid_public_key');
  return {keys:[{kty:'EC',crv:'P-256',x:publicKey.x,y:publicKey.y,alg:'ES256',use:'sig',kid:env.ENTITLEMENT_KEY_ID}]};
}
