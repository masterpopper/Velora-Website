# Velora — veloratv.app

## Private purchase implementation (November 22, 2026)

The project now includes a PRIVATE, TEST-ONLY purchase backend. Do not deploy it with the old static-only upload steps. Read `docs/STRIPE-SETUP-GUIDE.md` first for hosting inspection, the webhook click-by-click setup, encrypted secrets and remaining prerequisites. No deployment or payment traffic was performed.

- `dist/buy/`: Buy page, independent $10 Plus / $5 Theme Pack + Donation digital purchases.
- `functions/`, `backend/`: Cloudflare Pages Functions API with official Stripe SDK, account auth, D1 fulfillment and signed test entitlements.
- `migrations/`: durable test database schema.
- `docs/APP-PURCHASES-CONTRACT.md`: exact native integration contract; app source remains untouched.
- `scripts/create-native-fixtures.mjs`: ephemeral offline native JWT fixtures.
- `package.json`, `pnpm-lock.yaml`, `tests/`: pinned dependencies and local validation.

Requires Node 24 and pnpm: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run check:bundle`. Checkout is disabled by default; live keys are rejected. `.env.example` has placeholders only. Never commit actual secrets or upload backend source into a static output directory. Local Python preview serves visuals only, not the API.

The older static-site notes below describe the homepage and support page, not a payment backend deployment.

Finished static website source is in dist/. No build or dependency installation is required. Serve with python -m http.server 4173 --directory dist, or upload the contents of dist/ to a static host.

The website uses embedded authentic app artwork and system fonts, so images and typography do not depend on external hosts or asset paths. Original artwork files are retained in dist/assets for editing. Sports and remote graphics are CSS illustrations, not live app screenshots.

All download buttons open https://github.com/masterpopper/reform/releases. No version-specific APK URL is hardcoded. Downloader code 7862737 was supplied by the owner. The destination of that code was not independently tested on a physical TV.

Features include mobile navigation, an accessible full-interface dialog, keyboard-operable installation tabs, code copying with a manual fallback, and native expandable FAQs. Verified at desktop and 390px mobile viewport: image decoding, no horizontal overflow, menu, dialog, installation tabs, clipboard confirmation, and download destinations. JavaScript syntax check passed.

Design draws on the supplied parky.watch reference for product clarity and installation structure, while preserving Velora branding. No third-party copy or artwork is used.

No DNS, domain, live site, app code or APK release was changed. Public deployment to veloratv.app remains separate. Work is isolated in D:/Codex/VeloraTV.app.


## Purchase code delivery
The `/buy` page reveals the Theme Pack code `557432` or Plus code `656781` only when the signed-in account has a webhook-verified active order for that product in the current payment mode. These fixed codes are display-only delivery codes, not payment proof or API redemption credentials. The signed server-side entitlement remains authoritative. Refresh the account page if Stripe's webhook has not arrived yet.
