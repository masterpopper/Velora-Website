# Velora one-time purchase setup — no customer sign-in

This guide is for the website purchase flow in this package. Customers do **not** create an account and do **not** sign in with GitHub. GitHub is only the place where you store the website source code so Cloudflare can deploy it; it is not part of checkout.

## What the customer experience does

1. Customer opens `/buy` and chooses Plus ($10) or Theme Pack ($5).
2. The Worker creates a one-time Stripe Checkout Session on the server and sends the customer to Stripe.
3. Stripe processes the payment and sends a signed webhook to `/api/stripe/webhook`.
4. The Worker verifies the webhook, checks the current Stripe payment, amount, currency, product, refunds and disputes, then records the order in D1.
5. Stripe redirects the customer back to `/buy?session_id=...`. The page checks D1 and displays a code only after the verified webhook has marked the order active:
   - Plus: the value configured in encrypted Worker secret `PLUS_DELIVERY_CODE`
   - Theme Pack: the value configured in encrypted Worker secret `THEME_DELIVERY_CODE`

The redirect alone never delivers a code. If the webhook is delayed, the page waits and lets the customer check again. No GitHub OAuth app, GitHub client ID, GitHub client secret, buyer account or buyer password is needed.

**Important app limitation:** This package changes the website checkout and delivery page; it does not edit the Velora Android/TV app. The original app-purchases contract in the supplied project explicitly said the supplied Theme Pack code was a legacy/testing code rejected by its existing API endpoints. Therefore, before selling Theme Pack, verify that the actual app accepts the supplied Theme Pack code in its normal activation screen. If the app rejects it, the app itself must be changed separately. Showing a code on the website does not make the app accept it.

**Shared-code limitation:** These are fixed shared codes, not unique order credentials. Once a customer sees or shares a code, the website cannot take it back. A refund can stop the website from displaying it again, but cannot make a code already seen become secret again. The code itself is not proof of payment.

## Before starting

You need access to:
- Cloudflare account containing the existing Worker `velora-website`.
- GitHub repository `masterpopper/Velora-Website` (GitHub is deployment/source hosting only).
- The correct Velora Stripe account (not KDesk).
- The custom domain `veloratv.app`, if that is the domain you want customers to use.

Never paste Stripe secret keys or webhook signing secrets into ChatGPT, GitHub, a source file, a screenshot or a normal Cloudflare variable. Enter them only as encrypted Worker secrets. If an old restricted Stripe key was exposed in a previous chat, revoke/roll it in Stripe before proceeding.

## Part A — update the GitHub repository

1. Download and extract the updated ZIP supplied with this guide.
2. Open the existing repository `masterpopper/Velora-Website`.
3. Replace the repository files with the extracted files, keeping the folder structure. The important files are `wrangler.jsonc`, `worker/index.mjs`, `backend/`, `migrations/`, `package.json`, `pnpm-lock.yaml` and `dist/`.
4. Do not upload `.env` files containing secrets. This package uses `wrangler.jsonc` for non-secret Worker configuration and Cloudflare encrypted secrets for private values.
5. Do **not** push the files yet. First create D1, create the Stripe TEST products, and replace every required placeholder in `wrangler.jsonc`. A push before those values are filled will fail deployment.

For an easy file replacement, use GitHub Desktop: clone `masterpopper/Velora-Website`, open the local repository folder, extract this ZIP somewhere else, copy the ZIP's contents into the repository root (not the ZIP's parent folder), overwrite files when asked, then commit and push after Parts B–F are ready. Keep a backup of the current repository first.

## Part B — create the D1 database and run the SQL

Create a dedicated TEST database first. Do not use a KDesk database and do not put test transactions into a live purchase database.

1. Open Cloudflare Dashboard → **Storage & databases** → **D1 SQL Database**.
2. Click **Create database**.
3. Name it `velora-purchases-test` and create it.
4. Open the new database and copy its **Database ID** (UUID). This ID is not a secret.
5. In the extracted project, open `wrangler.jsonc`.
6. Find the D1 entry and replace `REPLACE_WITH_YOUR_D1_DATABASE_UUID` with the UUID you copied. Keep the database name `velora-purchases-test` and binding name `DB`.
7. Open the D1 database's **Console** in Cloudflare.
8. Open `migrations/0001_purchases.sql` in the extracted project, copy the entire file, paste it into the D1 Console and run it once.
9. Confirm the SQL completed successfully. It creates only the anonymous orders table, webhook event ledger and rate-limit table. There are no buyer accounts, OAuth tables, pairing tables or customer sign-in requirements.

The same SQL can be applied from a terminal at the repository root after Wrangler is authenticated:

```bash
npx wrangler d1 execute velora-purchases-test --remote --file=migrations/0001_purchases.sql --config wrangler.jsonc
```

Do not run the migration twice as a way to reset purchases. It uses `CREATE TABLE IF NOT EXISTS`; it does not delete old data.

## Part C — set the Worker configuration

The project is a **Cloudflare Worker with static assets**, not a Pages Functions project. `wrangler.jsonc` explicitly names the Worker `velora-website`, uses `worker/index.mjs`, serves the website from `dist/`, and binds D1 as `DB`. This explicit config prevents Wrangler from guessing that the repository should be deployed as Pages Functions.

1. In `wrangler.jsonc`, set `SITE_ORIGIN` to the exact HTTPS origin customers will use, with no trailing slash. Use `https://veloratv.app` only if that hostname is attached/routed to this Worker. Otherwise use the actual `https://...workers.dev` address shown in Cloudflare while testing.
2. Keep `PAYMENTS_MODE` as `test`.
3. Keep `PURCHASES_ENABLED` as `false` until Stripe test products, keys, D1 and webhook are configured.
4. Keep `LIVE_PAYMENTS_APPROVED` as `false`.
5. Replace `STRIPE_ACCOUNT_ID` with the non-secret `acct_...` ID for the correct Velora Stripe account/sandbox.
6. Replace the four product/price placeholders with the TEST IDs you create in Part E.
7. Save `wrangler.jsonc`.

Do not set `PAYMENTS_MODE=live` during setup. Do not enable live payments as part of the test.

## Part D — configure Cloudflare Workers Builds with GitHub

This GitHub connection deploys code. It does not make buyers sign in to GitHub.

1. Cloudflare Dashboard → **Workers & Pages** → open the existing Worker `velora-website`.
2. Open **Settings** → **Builds** (some dashboards label this **Builds & deployments**).
3. If a Git repository is already connected, verify it is `masterpopper/Velora-Website`. If not, click **Connect** and select that repository.
4. Set the production branch to the branch you actually commit to (usually `main`).
5. Set the root directory to the repository root (`/` or blank).
6. Leave the build command blank; Cloudflare Workers Builds already installs dependencies from the repository lockfile, as shown in your earlier build log.
7. Set the deploy command to:

```bash
pnpm exec wrangler deploy --config wrangler.jsonc
```

8. Do not use `wrangler pages deploy`, `wrangler pages functions build`, or plain `npx wrangler deploy` without the config file.
9. Save the build settings and push/commit the updated files when ready. Watch the build log. It should deploy the Worker named `velora-website` using `worker/index.mjs` and static assets from `dist/`.

Cloudflare requires the Worker name in `wrangler.jsonc` to match the Worker selected in the dashboard. If the existing Worker is not actually named `velora-website`, stop and change the `name` in the config to the exact Worker name before deploying.

## Part E — create the TEST products in Stripe

Use the **Velora** Stripe account, not KDesk. Make sure the dashboard is clearly in Test mode or the Velora sandbox before creating products or copying keys.

1. Open Stripe Dashboard and select the Velora account.
2. Switch to **Test mode** / the Velora sandbox.
3. Open **Product catalog** → **Add product**.
4. Create **Velora Plus** with a one-time price of **USD $10.00**. Do not choose recurring/subscription billing.
5. Save it. Copy the Product ID (`prod_...`) and the one-time Price ID (`price_...`). They are different IDs.
6. Create **Velora Theme Pack** with a one-time price of **USD $5.00**. Do not choose recurring billing. Save and copy its Product ID and Price ID.
7. In `wrangler.jsonc`, fill in `PLUS_PRODUCT_ID`, `PLUS_PRICE_ID`, `THEME_PRODUCT_ID`, and `THEME_PRICE_ID` with those four TEST IDs.
8. In the same Velora test context, open **Developers / Workbench → API keys** and copy the TEST secret key (`sk_test_...`). Do not put it in `wrangler.jsonc` or GitHub.
9. In Stripe account details, confirm the account ID (`acct_...`) and put that non-secret ID in `wrangler.jsonc` as `STRIPE_ACCOUNT_ID`.

The code checks the Stripe account, active one-time Price, product, USD currency and exact amounts ($10/$5) before it creates Checkout. It does not accept a client-supplied amount.

## Part F — add encrypted Stripe secrets to Cloudflare

1. Cloudflare Dashboard → Workers & Pages → `velora-website` → **Settings** → **Variables and Secrets**.
2. Add a secret named `STRIPE_SECRET_KEY` and paste the Velora TEST secret key (`sk_test_...`). Select **Secret / Encrypt**, not plain text.
3. Add a secret named `PLUS_DELIVERY_CODE` and set its value to the Plus code you want to deliver after confirmed payment.
4. Add a secret named `THEME_DELIVERY_CODE` and set its value to the Theme Pack code you want to deliver after confirmed payment.
5. Save all three secrets. The actual delivery codes are deliberately kept out of the GitHub repository and browser JavaScript.
6. Do not enable purchases yet. You still need the webhook signing secret in Part G.

If you have separate Preview and Production environments in Workers Builds, make sure you add the secrets to the environment that is actually receiving the deployment. This guide uses the selected Worker deployment, not Pages Preview bindings.

**First deployment:** Once the D1 UUID, Stripe test account ID, four TEST product/price IDs, and exact `SITE_ORIGIN` are filled in, commit and push the repository. Cloudflare should deploy the Worker with `PURCHASES_ENABLED=false`. Verify that `/buy` loads and reports that purchases are unavailable. Then add the Stripe and delivery-code secrets above if you have not already done so. Only after this first deployment should you create the webhook destination in Part G.

## Part G — create the Stripe TEST webhook

Create this only after the Worker is deployed and the URL `/api/stripe/webhook` is reachable on the exact `SITE_ORIGIN`.

1. In Stripe, stay in the same Velora TEST mode/sandbox as the test products and test secret key.
2. Open **Developers → Workbench → Webhooks** (or use Stripe Dashboard search for Webhooks / Event destinations).
3. Click **Add destination** / **Add endpoint**.
4. Choose events from **Your account**.
5. Choose **Snapshot events** (the classic event payload), not thin events.
6. Select these event names:

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

7. Select a webhook endpoint destination (not EventBridge).
8. Use API version `2026-11-18.endive` for the pinned Stripe SDK in this package. If Stripe does not offer that version in your dashboard, stop and ask for the SDK/API version to be aligned rather than choosing a thin-event destination.
9. Set the endpoint URL to your exact Worker origin plus `/api/stripe/webhook`. Example only: `https://velora-website.cloudflare-mtoth.workers.dev/api/stripe/webhook`. Use the actual Worker URL displayed in your Cloudflare account; if you use `https://veloratv.app`, ensure that hostname is routed to this Worker.
10. Create the destination.
11. Open the destination's signing secret and reveal the `whsec_...` value.
12. In Cloudflare Worker → Settings → Variables and Secrets, add `STRIPE_WEBHOOK_SECRET` as an encrypted **Secret**. Never place it in GitHub or chat.
13. Confirm the Worker now has all four encrypted secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PLUS_DELIVERY_CODE`, and `THEME_DELIVERY_CODE`.

A Stripe webhook request should receive HTTP 200 when processed. A bad signature returns 400. A missing database/secret or temporary Stripe failure returns 503 so Stripe can retry.

## Part H — enable TEST checkout and test end-to-end

Only do this after the Worker, D1 migration, Stripe test products, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PLUS_DELIVERY_CODE` and `THEME_DELIVERY_CODE` are all configured.

1. In `wrangler.jsonc`, change `PURCHASES_ENABLED` from `false` to `true`. Keep `PAYMENTS_MODE` set to `test` and `LIVE_PAYMENTS_APPROVED` set to `false`.
2. Commit and push. Wait for Cloudflare's deployment to finish successfully.
3. Open `SITE_ORIGIN/buy`.
4. Confirm the banner says Test mode and the two products show $10 and $5.
5. Click Plus. Stripe Checkout should show USD $10.00 as a one-time payment. Use Stripe's standard test card `4242 4242 4242 4242`, a future expiry date and any CVC. This is a simulated test transaction; it does not charge a real card.
6. Complete Checkout. Stripe redirects back to `/buy?session_id=...`.
7. The page waits for the signed webhook. Once the webhook has been accepted and the order becomes active, it displays the configured Plus delivery code.
8. Repeat for Theme Pack. It should show the configured Theme Pack delivery code only after its verified $5 test payment.
9. In Stripe → Webhooks → your test destination → Event deliveries, confirm the Checkout/payment event was delivered successfully (HTTP 200).
10. Test a cancelled checkout. It must not display a code.
11. Test a declined test card (Stripe's documented decline test card, e.g. `4000 0000 0000 0002`). It must not display a code.
12. Refund a test payment in Stripe. The order should no longer be eligible for code display on a later status check. Remember: a fixed code already shown to a buyer cannot be recalled or made private again.
13. If a test payment completes but no code appears, check the webhook delivery, D1 order state and Cloudflare Worker logs. Do not bypass webhook verification or manually set an order active.

## Part I — prepare LIVE sales only after tests pass

Do not do this until both products have passed sandbox checkout, both codes display correctly, webhook retries are successful, and you have verified the app accepts both codes.

1. In Stripe's LIVE mode, verify the existing Velora products and prices. The IDs already present in `docs/LIVE-REFERENCES.json` are owner-supplied but unverified; confirm they belong to the correct Velora account, are active, one-time USD prices, and exactly $10 and $5. If not, create the correct live products/prices and use their actual IDs.
2. Create a separate D1 database named `velora-purchases-live` and run `migrations/0001_purchases.sql` in that database once.
3. Update `wrangler.jsonc` to the LIVE D1 database name/UUID, live Stripe account/product/price IDs, `PAYMENTS_MODE: "live"`, and `SITE_ORIGIN: "https://veloratv.app"` (only if the domain is attached to this Worker).
4. Keep `PURCHASES_ENABLED` set to `false` and `LIVE_PAYMENTS_APPROVED` set to `false` while preparing.
5. In Stripe LIVE mode, create a separate webhook destination with the same snapshot event list and endpoint `https://veloratv.app/api/stripe/webhook` (only once that route is live and reachable).
6. Add the LIVE `sk_live_...` key and LIVE `whsec_...` signing secret as encrypted Worker secrets. Never reuse test secrets in live mode.
7. Deploy the prepared live configuration while checkout remains disabled. Verify `/api/config` reports live mode and `enabled:false`; confirm webhook delivery using Stripe's live endpoint test mechanism without creating a customer charge.
8. Only after final owner approval, set `LIVE_PAYMENTS_APPROVED` to `true` and `PURCHASES_ENABLED` to `true`, deploy, and perform a carefully controlled first real purchase/refund if appropriate.

## What is still not done by this ZIP

- It cannot create your Cloudflare account resources, choose your Stripe account, copy private Stripe keys, create the Stripe webhook, or push to your GitHub repository on your behalf.
- The package cannot verify the live product IDs until they are checked in your Stripe dashboard.
- The supplied app contract explicitly stated that the supplied Theme Pack code was rejected by the old app API. The website can show it, but the app may still reject it until the app is separately changed and tested.
- A code shown after payment is not the same as a unique/revocable entitlement. These fixed shared codes can be copied and reused by anyone who knows them.
- Taxes, refund terms, consumer disclosures, business eligibility, and rights to any third-party content/services need owner review before live sales.

## Troubleshooting

- `database_not_configured`: D1 binding must be named exactly `DB`; confirm the Wrangler config contains the correct database name and UUID, then redeploy.
- `stripe_key_mode_mismatch`: test mode requires `sk_test_...` / `rk_test_...`; live mode requires a live key.
- `stripe_account_mismatch`: the key and `STRIPE_ACCOUNT_ID` are from different Stripe accounts or sandbox contexts.
- `price_configuration_rejected`: wrong product/price ID, inactive price, recurring price, wrong amount/currency, or test/live mismatch.
- `webhook_not_configured`: add the correct `STRIPE_WEBHOOK_SECRET` as an encrypted Worker secret and redeploy.
- Stripe webhook 400: wrong endpoint signing secret, wrong Stripe environment, or signature body mismatch. Do not turn off signature checks.
- Stripe webhook 503: inspect Worker logs for database, Stripe key, account, or binding errors; Stripe retries 5xx responses.
- Customer returns but no code: verify the correct `SITE_ORIGIN`, session ID in the return URL, webhook event delivery HTTP 200, and order state in D1. A redirect alone is never proof of payment.
