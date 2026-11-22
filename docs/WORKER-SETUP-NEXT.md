# Cloudflare Worker deployment notes

The website purchase flow is deployed as a Cloudflare Worker with static assets. It is not a Pages Functions deployment.

- Worker name in `wrangler.jsonc`: `velora-website` (must match the existing Cloudflare Worker exactly).
- Entry point: `worker/index.mjs`.
- Static website directory: `dist/`.
- Static asset binding: `ASSETS`.
- API backend: `backend/router.mjs`.
- D1 binding: `DB`.
- Buyer sign-in: not used. GitHub is only source control / deployment integration.

Workers Builds settings:
- Repository: `masterpopper/Velora-Website`.
- Root directory: repository root.
- Build command: `pnpm install --frozen-lockfile`.
- Deploy command: `pnpm exec wrangler deploy --config wrangler.jsonc`.
- Do not use `wrangler pages deploy` or omit `--config wrangler.jsonc`.

Follow `docs/STRIPE-SETUP-GUIDE.md` in order. The D1 UUID, Stripe account/product/price IDs, secret key, webhook signing secret, and actual `SITE_ORIGIN` must be supplied by the owner. No real charge or deployment has been performed by this package preparation.
