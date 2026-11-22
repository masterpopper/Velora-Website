# Velora website purchase delivery contract

This package provides a guest checkout and code-delivery flow on `/buy`. Customers do not sign in. The Worker creates Stripe Checkout Sessions, verifies signed Stripe webhooks, stores order/payment state in D1, and returns a delivery code only when the corresponding order state is `active`.

| SKU | One-time amount | Delivery code |
|---|---:|---|
| `plus` | USD $10.00 | Cloudflare secret `PLUS_DELIVERY_CODE` |
| `theme_pack` | USD $5.00 | Cloudflare secret `THEME_DELIVERY_CODE` |

## Public API

- `GET /api/config`: returns mode, enabled state and product display data.
- `POST /api/checkout`: accepts `{sku, request_id}`; same-origin only; creates a server-side Stripe Checkout Session using server-configured Price IDs.
- `GET /api/purchase/status?session_id=...`: returns pending until a signed Stripe webhook verifies payment and the order becomes active. On active order it returns `{status:"paid",sku,code}`. It never trusts a redirect alone.
- `POST /api/stripe/webhook`: verifies the raw Stripe signature and recomputes current payment/refund/dispute state.

There is no buyer auth, OAuth, `/api/account`, buyer session, pairing flow, or account requirement in this purchase service.

## Important limitations

The fixed codes are shared static delivery strings. They are not unique credentials, they do not prove payment, and they cannot be revoked after a buyer has seen or shared them. Refunds can stop future website delivery but cannot make an already-disclosed code secret again.

The original app contract described the supplied Theme Pack code as a legacy/testing code rejected by the existing app API. This website package does not modify the Android/TV app. Verify app acceptance before enabling live sales. App activation changes require the app source and a separate build/test cycle.

Stripe Checkout return is not payment confirmation. Only the verified webhook updates the order to active. Failed, expired, suspended, refunded or disputed orders do not receive a code. A successful webhook event is deduplicated by event ID; order state is recomputed from current Stripe resources.
