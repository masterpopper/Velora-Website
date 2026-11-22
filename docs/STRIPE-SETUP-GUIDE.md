# Velora Update 4.0 — private Stripe test setup

Prepared November 22, 2026. **Nothing has been published, pushed, deployed or charged by this task.** This guide is for owner-performed setup after deployment is explicitly authorized. It does not authorize a deployment. Keep the current production website unchanged until then.

## What exists, and exactly what is missing

Implemented locally: `/buy`, account sign-in with GitHub OAuth+PKCE, server-side Checkout, official Stripe SDK, raw-body signed webhook validation, D1 order/event ledger, duplicate processing protection, refund/dispute handling, independent Plus and ThemePack grants, device pairing, one-time redemption and signed ES256 test entitlements. Existing static homepage and support page are retained.

Missing: confirmed Cloudflare hosting **project name/type/repository/root/build settings**; approved private HTTPS test host; separate Velora Stripe **account ID**, test products and prices, test secret key, test webhook destination+signing secret; Velora-only GitHub OAuth client; entitlement keypair; D1 test database/binding/migration; end-to-end sandbox testing; app-native integration; launch approval and source-rights/service-terms review. No backend endpoint is currently claimed live. The old `python -m http.server` preview renders pages only.

The inspected live `https://veloratv.app` response has `Server: cloudflare`, a Cloudflare cache status and static-site headers. The local website directory has **no Git remote or Cloudflare project configuration**. This verifies Cloudflare delivery, not whether the current project is Pages, a Worker or a different origin behind Cloudflare. Follow the inspection steps below before selecting deployment settings. No authenticated hosting dashboard was inspected.

## First: revoke the exposed key

The owner reported a live restricted key was pasted in another chat. Do not copy it here, into the repo or into this test setup. In the **Velora** Stripe account, open **Developers / Workbench → API keys** (the settings search can find “API keys”), find that restricted key, open its options menu and select **Roll/Roll key** or **Delete/Revoke** as offered. Confirm revocation in Stripe. Store any replacement only in the correct host's encrypted secrets manager. This implementation accepts **test** `sk_test_…` keys only; a replacement live restricted key is not needed for this test setup. Do not send secret values in chat.

## Stripe webhook clicks — the immediate answer

Do these in the **Velora account's sandbox/test environment**, not KDesk and not live mode. You can prepare the event selection now, but Stripe needs a reachable HTTPS destination before delivery can be tested. Do not enter an invented endpoint or the undeployed production route.

1. Open the Stripe Dashboard. Click the account name at the top left. Select the separate **Velora** account. Verify its account ID under business/account details. Copy only the nonsecret `acct_…` identifier.
2. In the account picker, select **Sandboxes** and create/open a Velora sandbox, or select the account's **Test mode** if that is the available testing interface. Confirm the testing indicator before creating anything. Products, prices, keys and event destination must all belong to this SAME sandbox/account context.
3. Open **Developers → Workbench → Webhooks**. If the navigation differs, use Stripe's Dashboard search for **Webhooks** or **Event destinations**.
4. Click **Add destination** (some accounts show **Add endpoint**).
5. Choose events from **Your account**. Do not choose connected accounts, an organization-wide destination or KDesk.
6. Choose **snapshot events** / the classic v1 webhook format. This implementation explicitly requires full Event snapshots, verifies them with `constructEventAsync`, and then retrieves the current resources. Thin events need a different parser and are not compatible with this handler.
7. Choose **Select events** and add EXACTLY these supported event names:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.succeeded
payment_intent.payment_failed
charge.refunded
refund.created
refund.updated
refund.failed
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
```

8. Click **Continue**. Select **Webhook endpoint** as destination type, not EventBridge.
9. For the API version, select **2026-11-18.endive**, matching pinned `stripe@23.2.0`. If the exact snapshot API version is unavailable, stop and align SDK/destination versions before proceeding; do not silently change to a thin event format.
10. For **Endpoint URL**, after an authorized test deployment exists, enter its EXACT HTTPS origin plus **`/api/stripe/webhook`**. The template is `https://YOUR-APPROVED-TEST-HOST/api/stripe/webhook`; this is a template, not a deployed URL. Do not use localhost, `/buy`, a `#` anchor or the production domain while testing elsewhere.
11. Set a descriptive name, such as **Velora test purchases**. Click **Create destination** / **Add endpoint**.
12. Open that destination. Under **Signing secret**, click **Reveal**. Copy the `whsec_…` value directly into the Cloudflare **Preview environment's encrypted `STRIPE_WEBHOOK_SECRET`**. Do not paste it in chat, GitHub, APK code, screenshots or this guide.
13. Save the secret and, only when deployment is authorized, redeploy the same preview branch so Functions see it.
14. Open the destination's **Event deliveries** after a sandbox checkout. Expected result for handled events is HTTP **200**. Invalid signatures return **400**; configuration/database/provider errors return **503**, so Stripe retries rather than acknowledging lost fulfillment. A test dashboard “Send test event” with fabricated metadata may return 200 ignored; it is NOT proof of a real order fulfillment. The proper test starts at the site's Buy button with a signed-in account.

Stripe retries can deliver duplicates and out-of-order events. The backend records successful event IDs and recomputes each order from current Stripe state under a per-order lock. It never trusts the checkout redirect. [Official event setup](https://docs.stripe.com/events/set-up-events), [webhook troubleshooting](https://docs.stripe.com/events/manage-webhook-endpoints), [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page).

## Create the two TEST products and prices

The IDs supplied by the owner are **live references**, not test IDs:

| Item | Supplied live product | Supplied live price |
|---|---|---|
| Plus | `prod_VfkR38nmjd6LZA` | `price_1UeOx3JF7LV4As9NyAsGzgni` |
| Theme Pack + Donation | `prod_VfkRl8aJoPcEYR` | `price_1UeOwtJF7LV4As9NL4ioGgj6` |

They are recorded in `docs/LIVE-REFERENCES.json` as unverified. They are NOT loaded by the backend. Do not put them in the test environment.

1. Stay in the separate **Velora sandbox/test context** from the webhook steps.
2. Open **More → Product catalog → + Add product**.
3. Name: **Velora Plus**. Add an accurate description of Plus for the compatible app; do not promise content rights, provider queue access, bandwidth or guaranteed stream quality.
4. In **Pricing**, choose **Flat rate → One time**. Currency **USD**, amount **10.00**, quantity one. Do not choose recurring, subscription, free trial, customer-chosen amount, package pricing, adjustable quantity, coupons or a tax-added test price.
5. Save the product. Open its details. Copy **Product ID** (`prod_…`) into your nonsecret setup worksheet as `PLUS_PRODUCT_ID`.
6. In the **Pricing** section, click the $10 one-time price. Copy its **Price ID** (`price_…`) as `PLUS_PRICE_ID`. A product ID and price ID are different values.
7. Repeat **Add product**. Name: **Theme Pack + Donation**. Description: **$5 one-time digital theme purchase; a thank-you for supporting Velora. Available without Plus. Not a tax-deductible donation.**
8. Select **Flat rate → One time → USD → 5.00**. Save. Copy `THEME_PRODUCT_ID` and `THEME_PRICE_ID` from the product and its price details.
9. Keep both products/prices active. No Payment Link is needed: the authenticated server creates Checkout Sessions from this allowlist. No publishable Stripe key is needed in the browser.
10. Open **Developers / Workbench → API keys** in this same test context. Copy its **test secret key** directly into Cloudflare's encrypted `STRIPE_SECRET_KEY`. This build checks for a test key and retrieves the account using the SDK; the key's account must equal `STRIPE_ACCOUNT_ID`. No KDesk credentials are read or accepted.

The backend enforces $10/$5 in USD with no discount or tax addition in this private test. A real tax, consumer refund and geographic-sales policy still needs review before production; do not treat this test behavior as a legal tax determination. [Stripe product/price guide](https://docs.stripe.com/products-prices/manage-prices).

## Confirm the actual Cloudflare host first

1. Open the Cloudflare dashboard and choose the account that owns **veloratv.app**.
2. Open **Workers & Pages**. Inspect existing projects. Open the project whose **Custom domains** includes exactly `veloratv.app`; do not select KDesk.
3. Record the **project name**, whether it is **Pages or Worker**, its `pages.dev`/`workers.dev` hostname, and **Settings → Builds & deployments** repository, production branch, root directory, build command and output directory. Do not modify DNS or disconnect Git.
4. If it is **Pages connected to GitHub**, this package supports that model. The intended repo layout is `package.json`, lockfile, `functions/`, `backend/`, `migrations/`, `docs/`, `tests/`, and `dist/`. The production branch remains unchanged. A future approved preview branch can be named `valora-purchases-test`.
5. If it is a **Worker**, or a proxy to another hosting origin, stop before uploading this backend. A Pages Functions folder is not a Worker entrypoint. Record the actual project details so the backend can be adapted to that host. The successful Functions bundle does not establish that a Worker deployment would work unchanged.
6. If it is **Pages Direct Upload**, dashboard drag-and-drop does not compile Functions. Use a Git-integrated test project or an owner-approved Wrangler workflow; do not upload this backend as static files. Do not upload backend source, environment samples or migration SQL to a public static output directory.

No project ID or exact test hostname was discoverable locally; the remaining dashboard choices are conditional on the confirmed Pages project, rather than an invented existing host. [Cloudflare Functions setup](https://developers.cloudflare.com/pages/functions/get-started/).

## Configure D1 and Pages without touching production

The following steps describe a future authorized test setup. They have NOT been executed by this task.

1. In Cloudflare, open **Storage & databases → D1 SQL database → Create database**. Name it **valora-purchases-test**. Do not reuse KDesk's database or a live purchases database.
2. Open the new database → **Console**. Copy the complete contents of `migrations/0001_purchases.sql` into the SQL console and run it once. Its statements create the account/order/event/device tables and uniqueness constraints. Save the database's nonsecret name/UUID in the setup worksheet. For CLI migration instead, an authenticated operator can run `npx wrangler d1 execute valora-purchases-test --remote --file migrations/0001_purchases.sql`; that changes the remote test DB and is not run by this task.
3. Open the confirmed **Pages project → Settings → Bindings**. Select **Preview** environment. **Add → D1 database**, variable name **DB**, choose **valora-purchases-test**, Save. Keep Production unbound to these test resources.
4. Open **Settings → Variables and Secrets**. Select **Preview**. Add the plaintext variables listed in the table below. For each secret, choose **Encrypt** before **Save**. Do not enter anything under a similarly named KDesk project.
5. Under runtime compatibility settings, add **nodejs_compat** and set compatibility date **2026-11-22** for Preview.
6. Once a deployment is authorized, the Pages build must install the root package and compile root `functions/`. Use **Framework: None**, **Root: repository root**, **Build command: `pnpm install --frozen-lockfile && pnpm run check:bundle`**, **Build output directory: `dist`**, and Node 24 (`NODE_VERSION=24`). Keep the generated function bundle under ignored `work/`, not `dist/`; Pages performs its own Functions build from `functions/`. Lockfile is `pnpm-lock.yaml`; dependencies are pinned. If using npm, intentionally generate/review an npm lockfile first rather than silently mixing lockfiles.
7. A preview branch deployment must use the exact **branch alias** origin for `SITE_ORIGIN`, OAuth callback and Stripe destination. Example syntax only: `https://valora-purchases-test.YOUR-PROJECT.pages.dev`. Use the actual alias Cloudflare returns; do not substitute the example as if it exists. Random hash aliases will fail the deliberate exact-host check unless configured as the selected origin.
8. After variables/bindings change, an authorized redeploy is required. Never merge the test branch into production automatically.

Pages previews are public by default. To keep a future test deployment private, configure Cloudflare Access to restrict the Buy page/account/device APIs to testers. **Stripe cannot complete a human Access login**: give only the exact `/api/stripe/webhook` path an Access bypass policy so signed Stripe requests can arrive. That endpoint authenticates the raw Stripe signature and accepts no public purchase claim. Do not bypass the whole site or disable the policy globally. Test-device requests also need an appropriate tester/service access policy; never embed a Cloudflare Access service secret in the APK. Fully local/offline testing remains private without any published host. The noindex tag alone is not access control. The exact Access application/policy UI depends on the selected account and is a separate owner-controlled security setup.

[D1 setup](https://developers.cloudflare.com/d1/get-started/), [bindings and encrypted secrets](https://developers.cloudflare.com/pages/functions/bindings/), [preview deployments and access](https://developers.cloudflare.com/pages/configuration/preview-deployments/).

### Runtime settings worksheet

| Variable / binding | Where | Value to use |
|---|---|---|
| `DB` | Preview → Bindings → D1 | Velora-only test database |
| `SITE_ORIGIN` | Preview plaintext | Exact approved HTTPS test origin, no trailing slash/path |
| `PAYMENTS_MODE` | Preview plaintext | `test` |
| `PURCHASES_ENABLED` | Preview plaintext | `false` during setup; `true` only for owner-authorized sandbox testing |
| `STRIPE_ACCOUNT_ID` | Preview plaintext | Actual Velora sandbox/account `acct_…` returned by the test key |
| `PLUS_PRODUCT_ID`, `PLUS_PRICE_ID` | Preview plaintext | New TEST IDs from the steps above |
| `THEME_PRODUCT_ID`, `THEME_PRICE_ID` | Preview plaintext | New TEST IDs from the steps above |
| `GITHUB_CLIENT_ID` | Preview plaintext | Velora-only OAuth client ID |
| `ENTITLEMENT_KEY_ID` | Preview plaintext | e.g. `valora-test-v1`; agree with native test build |
| `ENTITLEMENT_PUBLIC_JWK` | Preview plaintext | Public JSON P-256 JWK, no `d` property |
| `STRIPE_SECRET_KEY` | Preview **encrypted secret** | Velora sandbox's `sk_test_…` key |
| `STRIPE_WEBHOOK_SECRET` | Preview **encrypted secret** | Signing secret for that sandbox destination |
| `GITHUB_CLIENT_SECRET` | Preview **encrypted secret** | Velora-only OAuth client secret |
| `ENTITLEMENT_PRIVATE_JWK` | Preview **encrypted secret** | Matching private JSON P-256 JWK |

The `.env.example` contains placeholders only. It is not runtime configuration. Do not fill it with secrets and upload it. No `wrangler.toml` with fabricated IDs is supplied; the guide uses dashboard bindings intentionally.

## GitHub sign-in account setup

1. In GitHub, click profile picture → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Name it **Velora Purchases Test**; homepage is the actual approved private test origin.
3. **Authorization callback URL:** exact same origin plus **`/api/auth/callback`**. Save/Register application.
4. Copy its nonsecret **Client ID** to `GITHUB_CLIENT_ID`. Click **Generate a new client secret**; put it directly in encrypted `GITHUB_CLIENT_SECRET`, not chat/repo.
5. No repository or write scope is requested. The app uses GitHub's authenticated numeric user ID as the stable account owner, then discards the access token from process memory. User sign-out revokes the website session, not the user's GitHub account.
6. Do not change callback to the public production domain while the backend is on a preview host. Native test builds must agree on that test issuer. If the native test verifier is currently hardcoded to `https://veloratv.app`, either use offline fixtures with that issuer or make a reviewed test-only issuer override; do not weaken production issuer validation.

[GitHub OAuth app registration](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [web authorization and PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

## Signing keys — no secrets in chat or files

`node scripts/generate-entitlement-key.mjs` (Windows) generates a private P-256 JWK in memory and copies it to the clipboard without printing or saving it. Immediately paste it into Cloudflare's encrypted **ENTITLEMENT_PRIVATE_JWK**, save, then clear the clipboard. The script prints only the matching public JWK, which belongs in **ENTITLEMENT_PUBLIC_JWK** and can be shared with the app developer alongside the key ID. Use this on a trusted local machine, not an online key generator. The private key is never included in the delivered files. Treat clipboard history as sensitive and clear it if enabled.

For native verification tests only, `scripts/create-native-fixtures.mjs` generates ephemeral keys in memory and writes public keys plus signed test cases to an explicitly chosen output file. These fixtures do not represent purchased access and must never be trusted by a production APK. The app contract describes exact issuer/audience/device checks.

## Sandbox test sequence after authorized setup

No real cards, live keys, real purchases or real refunds are used here. Begin with `PURCHASES_ENABLED=false` and confirm Buy buttons are disabled. Enable only in the approved test environment once all bindings/secrets are correct.

1. Visit the test host's `/buy`; verify **Private test** banner. Sign in with GitHub. Buy **Plus** with Stripe's test card **4242 4242 4242 4242**, future expiry, any test CVC. Confirm Checkout displays **USD $10, one-time**, then complete only the sandbox checkout. Expect return page to remain pending until the webhook delivery is 200 and `/api/account` returns active Plus.
2. Repeat on a fresh test account for **Theme Pack + Donation** only. Confirm **USD $5, one-time** and `theme_pack=true, plus=false`. Plus is not a prerequisite. App UI should describe Sports-source preference accurately.
3. Try canceling Checkout and directly visiting `/buy?checkout=returned&paid=true`. Neither grants an upgrade. Try decline card **4000 0000 0000 0002** in sandbox; no successful grant should appear.
4. In Stripe → **Workbench → Webhooks → Velora test purchases → Event deliveries**, open the real checkout event and **Resend** it twice. Verify one order and one processed event ID, no duplicated ownership. Deliver old success after a refund; it must not reactivate the revoked order because the handler fetches current refunds.
5. Refund in the sandbox: **Payments → choose the test payment → Refund → full amount → Confirm**. For Plus, the affected order becomes revoked and the next device sync omits that Stripe grant. Independent ThemePack or approved legacy Plus stays intact. Partial successful refunds also revoke that order in this implementation; review/disclose that policy before live sales.
6. Pending refund/dispute cases suspend access until current Stripe state resolves. In sandbox use Stripe's documented refund/dispute test scenarios. A won dispute or a failed/canceled refund can restore an otherwise paid order; a lost dispute revokes. D1 stores latest computed state, not event delivery order. See the offline tests for deterministic coverage, including out-of-order/refund-before-fulfillment behavior.
7. For delayed payment methods, enable a supported method in the Velora sandbox payment-method settings, complete its documented test flow, and observe `checkout.session.completed` with `payment_status=unpaid` remains pending. Only `async_payment_succeeded` plus current paid PaymentIntent can grant. `async_payment_failed` does not grant. The SDK does not force a list of payment methods; sandbox/account eligibility determines which Checkout methods appear. If none are eligible, use the included simulated tests rather than pretending a delayed end-to-end test occurred.
8. Test TV pairing with a native test build: init → QR → same GitHub account → explicit approval → signed entitlement. Reusing the QR pair code must fail. Generate a redemption token; redeem once, reuse must fail. `557432` must fail. A different-account device cannot be rebound with another buyer's token.
9. Revoke a device from the account page. It must get 401 on its next sync. A previously cached signed claim expires within one hour; this is the stated maximum offline revocation delay.
10. In a developer-only test client, tamper with a webhook body/signature, send the wrong account/mode/price/currency/quantity, use an expired OAuth state and forge `Origin`. Expect 400/403/409 with no grants. Do not call these manual tests production verification.

[Stripe's official testing guide](https://docs.stripe.com/testing) has current card/refund/dispute scenarios. No sandbox end-to-end payments have been executed in this task; only local simulated tests and bundle checks have run.

## Operations and recovery

- Retain durable `orders`, `webhook_events`, account mappings and audited legacy grants. Use D1 backups/Time Travel and an owner-approved backup policy. Do not clear purchases to fix a UI problem.
- Monitor webhook failed deliveries. Stripe retries; when a configuration error is fixed, resend failed genuine order events from Workbench. The handler records the event only after its database batch succeeds. Never manually mark an order active because someone shows a success URL or receipt screenshot.
- This initial Pages implementation relies on delivered/retried webhooks plus operator replay; no scheduled reconciler is deployed. Before a live launch, add/review a reconciliation job for missed events and alerting. Do not silently leave a missed refund unobserved. Inspect current Stripe resources for a given session before recovery.
- `docs/cleanup-ephemeral.sql` removes only expired OAuth/session/rate/pair/redemption entries. Run maintenance in the correct test DB; purchases and event receipts are retained. Pages has no native cron in this package; scheduled cleanup requires an owner-approved scheduler later.
- Test accounts/device APIs have request limits. Configure Cloudflare WAF/bot/rate policies before public sales; no bot protection or chargeback-proof guarantee is claimed. The public webhook path relies on Stripe signatures, not knowledge of its URL.

## Production is a separate review, not a switch

Do not set `PAYMENTS_MODE=live` or insert live IDs to “make it work”: the code rejects live keys and events. A production release requires explicit authorization, a reviewed implementation change supporting live mode, separate live DB/keys/kid/audience, verified Velora account and live allowlists, compatible app verification, app entitlement migration, end-to-end tests, refund/tax/privacy/consumer terms, provider/content rights and Stripe eligibility approval. A separate account or the wording “Donation” does not bypass service terms or restricted-business rules. The website task cannot establish ownership/licensing of third-party sources; **that approval remains unresolved**. [Stripe restricted-business rules](https://stripe.com/legal/restricted-businesses).

## Nonsecret values you may supply

Send ONLY: actual Cloudflare project name/type, GitHub website repository URL, production branch/root/output settings, approved test hostname, test D1 database name/UUID, Velora `acct_…`, the four TEST `prod_…`/`price_…` values, GitHub OAuth client ID, Stripe webhook destination ID (`we_…`) and selected API version, entitlement key ID and **public-only** JWK. Product/price live references already supplied remain unverified. Never send `sk_…`, `rk_…`, `whsec_…`, OAuth client secrets, private JWK `d`, session cookies, device bearer tokens or redemption tokens in chat.
