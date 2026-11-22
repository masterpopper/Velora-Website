# Velora website + guest purchase flow

The customer-facing purchase flow is intentionally simple: choose Plus ($10) or Theme Pack ($5), pay through Stripe Checkout, and receive the configured code on the return page only after a signed Stripe webhook confirms payment.

- No buyer account or GitHub sign-in is required.
- GitHub is used only to store source code and optionally trigger Cloudflare Worker deployments.

## Deployment

This repository is configured as a Cloudflare Worker with static assets, not Cloudflare Pages Functions. `wrangler.jsonc` names the Worker `velora-website`, uses `worker/index.mjs`, serves `dist/`, and binds D1 as `DB`. Replace the D1 UUID and non-secret Stripe IDs in `wrangler.jsonc`, configure the encrypted Stripe secrets in Cloudflare, and follow `docs/STRIPE-SETUP-GUIDE.md` step by step.

## Required setup

1. Create a Velora-only D1 database and run `migrations/0001_purchases.sql` once.
2. Create/verify one-time TEST Stripe products/prices: $10 Plus and $5 Theme Pack.
3. Configure `STRIPE_ACCOUNT_ID`, the four product/price IDs, exact `SITE_ORIGIN`, `PAYMENTS_MODE=test`, and keep checkout disabled until setup is complete.
4. Add encrypted `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PLUS_DELIVERY_CODE`, and `THEME_DELIVERY_CODE` Worker secrets.
5. Create the Stripe snapshot webhook at `/api/stripe/webhook` with the documented events.
6. Enable sandbox checkout and test successful, canceled, failed, and refunded payments.
7. Only after tests pass and the app is verified to accept both codes should live setup be considered.

No real deployment, Stripe account connection, secret retrieval, webhook creation, charge or live purchase has been performed by preparing this ZIP. See `docs/STRIPE-SETUP-GUIDE.md` for the full instructions and `migrations/0001_purchases.sql` for the SQL.

## Local checks

Node 24 and pnpm are used by Cloudflare's build environment. Run:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run check:worker
```

`pnpm run check:worker` is a dry-run and does not deploy. To deploy after configuration and authorization:

```bash
pnpm exec wrangler deploy --config wrangler.jsonc
```

The code delivery page is not a unique or revocable entitlement system. Shared codes can be copied and reused by anyone who knows them. The supplied app documentation specifically warned that the supplied Theme Pack code was rejected by its existing app API; the app itself must be checked/updated separately before live sales.
