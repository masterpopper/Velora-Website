# Current package verification status

This package was modified to remove buyer GitHub sign-in and implement guest Stripe Checkout with webhook-gated delivery-code display.

Verified during this preparation:
- Edited JavaScript modules pass `node --check`.
- `migrations/0001_purchases.sql` executes successfully in SQLite.
- A guest order can be inserted using the same SQL insert shape used by the Worker; the new schema has no customer account columns.
- Delivery-code values are not embedded in the Buy page HTML or browser JavaScript; the Worker reads them from encrypted secrets `PLUS_DELIVERY_CODE` and `THEME_DELIVERY_CODE`.

Not verified here:
- Full automated test suite after the refactor (the package dependencies could not be installed in this environment).
- Wrangler dry-run/deployment against the user's Cloudflare account.
- Stripe account, products, prices, secret key, webhook delivery or any payment.
- Actual code acceptance inside the Velora Android/TV app. The original supplied app contract said the Theme Pack code was rejected by the existing app API; app-side verification or changes are required before live sales.

After installing dependencies in Node 24, run `pnpm test` and `pnpm run check:worker`. The latter is a dry-run only. Then follow `docs/STRIPE-SETUP-GUIDE.md` and complete sandbox purchases before enabling live payments.
