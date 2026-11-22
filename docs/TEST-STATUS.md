# Private implementation verification

No deployment, Git push, Stripe API checkout, live-key usage, sandbox payment, refund or dispute action was performed. No account credentials were requested or stored. SDK test helper strings are obviously fake and used only in memory/local tests.

Current automated coverage is in `tests/`: real SQLite tables and transactions approximate D1's prepared/batch interface; official Stripe SDK signature verification and jose ES256 signing/verification run locally; Stripe resource retrieval is stubbed. These are not physical-TV tests or end-to-end Stripe tests.

Latest result: **24 tests passed**, including concurrent/retried checkout and lock-loss protection. Cloudflare Pages Functions compiled successfully with Wrangler 4.166.0. Browser visual inspection was attempted twice but the local browser runtime exited before opening the page; this pass has no verified desktop/mobile Buy-page screenshot. Static HTTP and markup checks are available; a configured browser/device pass remains required.

Run `pnpm install --frozen-lockfile`, `pnpm test` (Node 24), and `pnpm run check:bundle`. The bundle check compiles Cloudflare Pages Functions without deploying. Source is `functions/api/[[path]].js`; output is ignored `work/functions-build`.

Offline native fixtures:

```text
node scripts/create-native-fixtures.mjs --issuer https://veloratv.app --device-id local-test-device --account-id local-test-account --output work/native-fixtures.json
```

This writes an ephemeral public JWK and valid/rejected signed tokens without saving its private key. Never embed that ephemeral key in a production APK. Production must reject this build's `.test` audience and `mode=test`. Backend test-host issuer must exactly match the native test-build configuration. There is no production token issuance in this implementation.

Unverified integration conditions: authenticated Cloudflare Pages/D1 environment, GitHub OAuth callback, Stripe account/price resources, real webhook delivery, delayed-method eligibility, Cloudflare Access exception/routing, runtime database fault recovery, physical device pairing and native verification, tax/refund/privacy policy, and service/content-rights approval. Those require the missing configuration and later explicit deployment/testing permission.
