# Actual host confirmed: Cloudflare Worker

November 22, 2026 update. This supersedes the Pages-specific deployment steps in STRIPE-SETUP-GUIDE.md. Its Stripe webhook/product/OAuth instructions still apply, but choose the correct live/test context. No deployment, Git push, real Stripe API request, charge, key retrieval or DNS change has been performed.

Confirmed by owner:
- GitHub website: https://github.com/masterpopper/Velora-Website
- Existing Worker: `velora-website`
- Existing Worker URL: https://velora-website.cloudflare-mtoth.workers.dev/
- Intended public domain: https://veloratv.app

The repository was read-only cloned into work/hosting-inspection; inspected commit 07dbd8d contains static root files and no Worker configuration. Nothing was pushed. Prepared Worker entrypoint: worker/index.mjs. It routes /api/* to the same backend and uses the ASSETS binding for static pages. wrangler.example.jsonc is an incomplete template, not a deployed configuration.

## Immediate owner inputs

1. Revoke the exposed live restricted key in the Velora Stripe account. Do not send its replacement here. The publishable key is not secret and is not needed by this hosted Checkout implementation.
2. Provide the Velora Stripe account ID (`acct_…`). In Stripe choose the correct account, then Settings → Business → Account details (or use Dashboard search for Account details) and copy only Account ID. No KDesk account or key is accepted.
3. Cloudflare → Storage & databases → D1 SQL database → Create database. For the intended future live service, use a NEW Velora-only database, e.g. `valora-purchases-live`. Copy its database UUID (nonsecret). Do not mix sandbox purchases with live ownership. Run migrations/0001_purchases.sql once in its Console ONLY after owner approval to configure that database.
4. Confirm the HTTPS origin on which the backend will ultimately run. Production app uses https://veloratv.app; the workers.dev address is a different issuer and cookie origin. Do not tell the native verifier to accept arbitrary hosts. A separate test Worker needs a reviewed test-app issuer setting; a prepared live release needs a production-compatible native verifier.

## Worker runtime setup — owner action, not performed here

1. Cloudflare → Workers & Pages → `velora-website` → Settings. Record its existing Build configuration/linked repository and production branch before making changes. A push to its production branch can deploy automatically. Do not upload or push this work yet.
2. For a separate integration environment, create a new Worker named `velora-purchases-test` and keep the existing site's route/domain unchanged. Copy wrangler.example.jsonc to wrangler.jsonc locally and fill in the actual Worker name, database UUID/name and exact origin. Select test prices/key in this isolated environment. No test Worker has been created by this task.
3. For an eventual approved live deployment, use the confirmed `velora-website` Worker, a separate live D1, and the actual https://veloratv.app origin, after authorization to update production. Do not configure a wildcard route that intercepts KDesk.
4. Worker → Settings → Bindings → Add → D1 database: variable **DB**, choose the correct Velora-only database. If deployment uses Wrangler config, keep this binding and UUID in that config as well; don't rely on an omitted dashboard binding surviving deployment.
5. Worker → Settings → Variables and Secrets → Add. Set the nonsecret variables from .env.example for test or .env.live.example for prepared live. For STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GITHUB_CLIENT_SECRET and ENTITLEMENT_PRIVATE_JWK, choose type **Secret** and paste directly there. Never put them in plain-text variables, GitHub, APK or chat. Keep **PURCHASES_ENABLED=false** and **LIVE_PAYMENTS_APPROVED=false** while preparing.
6. Worker module **worker/index.mjs**, compatibility date **2026-11-22**, flag **nodejs_compat**, static asset directory **dist**, binding **ASSETS**, run_worker_first **["/api/*"]**. Runtime contains backend code; do not use `wrangler deploy --assets .` because that could upload source/config files publicly.
7. Install pinned dependencies from the repository root with pnpm install --frozen-lockfile. Run pnpm test and pnpm run check:worker. The latter uses --dry-run and cannot deploy. No actual deployment command has been run by this task.
8. Build/deploy commands for a future owner-approved Git integration must use the actual wrangler.jsonc config; do not select Pages Functions settings. Standard Worker deploy is npx wrangler deploy --config wrangler.jsonc, but it is NOT authorized or run now. Node 24 is required for local tests.

## Real products: prepared, not verified or enabled

The owner requested real one-time USD purchases. .env.live.example contains the supplied Plus $10 and ThemePack $5 product/price IDs; those are unverified references. The backend now supports mode-matched live resources ONLY behind **LIVE_PAYMENTS_APPROVED=true**, and checkout additionally requires **PURCHASES_ENABLED=true**. Both remain false in delivered configuration. Live Stripe resources are never accepted in test mode; grants are filtered by mode.

The replacement restricted live key must be from the same Velora account and permit the exact API operations used: Account read; Product/Price read; Checkout Sessions write/read and line-item read; PaymentIntent read; Charge read; Refund read; Dispute read. Do not grant payment/refund creation or broad write permissions that this code doesn't use. Stripe may group these permissions differently in its UI; verify the installed SDK calls against the selected permissions before launch. Never use a revoked key or KDesk key. There is no live network verification from this task.

After the authorized HTTPS backend exists, open Stripe's LIVE context → Workbench → Webhooks → Add destination → Your account → Snapshot events. Use the exact event list and 2026-11-18.endive API version in STRIPE-SETUP-GUIDE.md. Endpoint is the ACTUAL origin plus /api/stripe/webhook. The proposed production endpoint is https://veloratv.app/api/stripe/webhook, but it is not claimed deployed or reachable. Reveal the destination's signing secret and paste only into the Worker's encrypted STRIPE_WEBHOOK_SECRET. A test destination secret and live destination secret are not interchangeable.

GitHub OAuth app callback must be the same actual origin plus /api/auth/callback. ENTITLEMENT_PUBLIC_JWK and key ID can be shared; private JWK only goes in encrypted Worker settings. Signing utility and native fixtures are documented in the main setup guide.

## Native constraint and launch gates

Existing code84 reportedly pins issuer https://veloratv.app and test audience app.velora.tv.test. Live claims now use **mode=live and audience app.velora.tv**, with a distinct live key ID/keypair. Code84's current test verifier must reject those live claims until the app team implements/reviews the live verifier. Do not charge for a benefit the installed app cannot verify. App package remains app.velora.tv; this task does not modify or publish the APK.

APP-PURCHASES-CONTRACT.md remains the route/schema contract. Its original test-only statements are superseded by this mode update: live issuance is implemented but gated OFF; test audience remains .test, live audience has no .test suffix. Production and sandbox resources must use separate databases, keys and OAuth configurations. Redirects still grant nothing, independent Plus remains intact, legacy/testing code 557432 grants no ownership, and Theme Pack + Donation is a $5 digital purchase rather than a tax-deductible donation.

Outstanding launch review: source/content rights and Stripe eligibility, refund/tax/privacy policies, native live verification and restoration, exact hosting configuration, genuine sandbox verification and later explicit authorization for production deployment/real sales. The separate account and “Donation” label do not bypass Stripe rules.

Sources: https://developers.cloudflare.com/workers/static-assets/binding/ ; https://developers.cloudflare.com/workers/configuration/secrets/ ; https://developers.cloudflare.com/d1/get-started/ .
