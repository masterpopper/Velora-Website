# Velora Update 4.0 — website/device integration contract v1

Status: implemented website API, PRIVATE TEST-ONLY, not deployed. App integration is NOT implemented by this website task. Package stays `app.velora.tv`. Production site identity is `https://veloratv.app`; no live payment endpoint is claimed. Use the exact approved private HTTPS host as BASE during testing. Set `SITE_ORIGIN` to that exact origin; the API rejects other hosts. Native/browser test flows require a test-configured Pages Functions service plus D1; the old static preview alone cannot serve API routes.

## Ownership and product semantics

- `plus`: $10 USD, one-time. `theme_pack`: $5 USD, one-time and independent of Plus. Display label: **Theme Pack + Donation**; this remains a $5 digital theme purchase, not a tax-deductible donation.
- Website identity is GitHub OAuth (no repo scope); immutable GitHub numeric ID maps to opaque `account.id`. Email, display name, Stripe receipt, redirects and a client-side Plus flag are never proof of ownership.
- The app's existing **previously working Sports-source preference** may be enabled by `Plus OR ThemePack OR NTV`. This is source preference only, not provider bandwidth, a service queue, higher performance or guaranteed streams. NTV remains an existing app-specific authority; this API does not issue NTV grants. Keep existing activation entry under Plus in the app; website does not edit that UI.
- Preserve the existing valid Plus state in the app while adding verified grants. Do not replace it with a failed sync, a false network default, an absent website account or a test claim. Do not preserve a revoked Stripe-derived grant as if it were legacy: track provenance separately.
- Existing trusted server-side Plus records can be imported into `legacy_grants` after ownership is independently verified. No public migration endpoint exists. Never import a browser/app boolean or testing code. Manual review must tie old proof to the signed-in immutable account. Existing legacy grants are not overwritten by webhook refunds of a later purchase.
- `557432` is a legacy/testing theme code. It is never a payment credential, public checkout-ownership proof, pairing code or redemption token. All API code endpoints reject it.

## Browser account API

All JSON responses use `Cache-Control: no-store`. Native APIs send `Authorization: Bearer DEVICE_TOKEN`; browser APIs use `__Host-valora_session` (Secure, HttpOnly, SameSite=Lax, 24h). Mutating browser requests require exact `Origin: BASE` and `Content-Type: application/json`. No CORS API is exposed. No Stripe/OAuth/signing secret belongs in APK or browser.

| Method/path | Request | Success |
|---|---|---|
| GET `/api/auth/start` | Browser navigation | GitHub authorization, state+PKCE; fixed callback `/api/auth/callback`, returns `/buy` |
| GET `/api/config` | none | `{mode:"test",enabled:boolean,auth_configured:boolean,products:[{sku,name,amount,currency}]}` |
| GET `/api/account` | session cookie | `{id,login,mode:"test",entitlements:{plus,theme_pack},purchases:[{id,sku,state,reason,created_at}],devices:[{id,created_at,expires_at}]}` |
| POST `/api/checkout` | `{sku:"plus"|"theme_pack",request_id:UUID}` | `{url:"https://checkout.stripe.com/...",order_id:UUID}` |
| POST `/api/pair/approve` | `{code:PAIR_CODE}` | `{paired:true,device_id:UUID}` |
| POST `/api/redemption` | `{}` | `{code:REDEMPTION_TOKEN,expires_in:600}`; requires active grant |
| POST `/api/devices/revoke` | `{device_id:UUID}` | `{revoked:true}` only for account-owned device |
| POST `/api/auth/logout` | no body | 204, clears session cookie |

`request_id` must be reused for retrying a checkout action. Server also serializes pending checkouts for the same account/SKU and uses Stripe idempotency keys. Session creation and return NEVER grant. Order states: `pending`, `active`, `failed`, `expired`, `suspended`, `revoked`.

## Native pairing: preferred QR flow

1. POST `BASE/api/device/init` with no account or purchase claims. Rate-limited. Response 201:

```json
{
  "device_id": "UUID",
  "device_token": "64 lowercase hex characters (256 random bits)",
  "pair_code": "32 lowercase hex characters (128 random bits)",
  "expires_in": 600,
  "poll_interval": 5,
  "verification_uri": "BASE/buy",
  "verification_uri_complete": "BASE/buy?pair=PAIR_CODE"
}
```

2. Store `device_token` privately in Android Keystore-backed storage. Never log it, put it in QR, pass it in URLs, analytics, crash reports or support reports. The QR contains ONLY `verification_uri_complete`. The TV may also show the readable `verification_uri` and pairing code. A generic `/buy` QR advertises purchases but does not link a device by itself.
3. Phone opens QR; website remembers pair code through sign-in, strips it from browser URL, and requires explicit **Approve this TV**. No auto-link on page load or payment return. Pairing consumes the code once, links the device to the authenticated account, and grants no product by itself.
4. Poll GET `BASE/api/device/entitlements` with bearer device token at most once per 5 seconds. 409 `{error:"pairing_pending"}` means not approved. Stop after 10 minutes and offer a new pairing; avoid tight-loop retries. 429 means back off 60 seconds. Network/5xx errors are retryable with exponential backoff+jitter; they are never an entitlement.
5. After approval, 200 contains signed entitlements (below). Polling does not create a purchase. Refresh on app resume and before claim expiry; no background rapid polling is necessary.
6. POST `/api/device/unlink` with bearer token revokes that device token. A paired token expires after 90 days; re-pair then. Account page also supports revocation.

New pairing codes and redemption tokens are high-entropy, hash-only at rest, single-use and expire in 10 minutes. The token that polls is separate from the QR code. Device init is limited to 10 per IP per 10 minutes; sync to 15 per device/minute. No client-supplied account ID is accepted.

## Optional redemption

Signed-in buyer mints a 48-hex-character (192-bit) single-use token from `/api/redemption`. A native device obtains its bearer token with `/api/device/init`, then POSTs `/api/device/redeem` with `{code:REDEMPTION_TOKEN}` and its bearer token. Success `{redeemed:true}`. This links the same account; it does not copy a permanent entitlement into the app. Then request `/api/device/entitlements`. A token cannot rebind a device already linked to a different account. Refund before redemption produces no active Stripe grant on sync. No public/shared reusable checkout code exists.

## Signed entitlement response

GET `/api/device/entitlements` returns:

```json
{
  "token": "compact ES256 JWT",
  "expires_in": 3600,
  "mode": "test",
  "entitlements": {"plus": true, "theme_pack": false}
}
```

The outer entitlement JSON is convenience only. **Native must trust only the verified JWT claims**, never unverified JSON/redirects. JWT payload:

```json
{
  "schema": 1,
  "mode": "test",
  "package": "app.velora.tv",
  "device_id": "UUID matching this installation",
  "entitlements": {"plus": true, "theme_pack": false},
  "sub": "opaque account UUID",
  "iss": "BASE",
  "aud": "app.velora.tv.test",
  "iat": 1790000000,
  "exp": 1790003600,
  "jti": "unique UUID"
}
```

Protected header `{alg:"ES256",typ:"JWT",kid:ENTITLEMENT_KEY_ID}`. GET `/api/entitlements/keys` returns standard `{keys:[public EC P-256 JWK]}`. Only a public verification key goes into an APK. Pin trusted `kid`+key and issuer in test builds or use a reviewed HTTPS rotation process anchored to known trust; never allow a JWT-provided `jku` URL or unknown algorithm. Validate signature, exact issuer, audience, package, schema, mode, local device ID, account linkage, numeric expiry, issued-at and booleans. Use a small clock-skew tolerance (e.g. 60 seconds), require `exp-iat<=3600`, reject future-issued tokens and cache until expiry only. Do not accept a cached Stripe claim indefinitely after expiry. Offline use of Stripe-derived rights stops when its signed claim expires; any existing independent legacy Plus rules remain intact.

**Production APK MUST reject `aud=app.velora.tv.test` and `mode=test`. This backend is test-only; it cannot issue a live paid grant.** A later reviewed production release must use distinct database, keys/kid, account/price allowlists, issuer and live audience `app.velora.tv`, and explicit launch approval. This contract intentionally does not turn a test purchase into production ownership.

Revocation: pending refund/open dispute suspends the affected Stripe grant; any successful refund, even partial, revokes that SKU's order; lost dispute revokes, won dispute or failed/canceled refund can restore from current paid Stripe state. Other orders/legacy Plus stay independent. Previously issued signed claims may remain valid for up to one hour, which is the documented revocation latency. No instantaneous offline revocation is claimed.

## Errors and safety limits

Errors are `{error:"machine_code"}`. 400 invalid inputs/signature; 401 sign-in/device token invalid; 403 origin/host rejected; 409 state conflict (`pairing_pending`, `pair_code_used_or_expired`, `redemption_used_expired_or_wrong_account`, `already_owned`); 413 oversized body; 415 JSON required; 429 rate limit; 503 configuration/provider/database unavailable. Webhooks returning 5xx must be retried by Stripe. Do not convert a network error or a 503 into `plus=false` and erase a legacy grant. Do not mark a successful redirect as paid.

Website task never edits the app paths. Native QR generation, Keystore storage, JWT verification, local provenance migration and feature checks remain app integration work. There is no native purchase grant yet.
