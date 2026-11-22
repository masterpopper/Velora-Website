CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY,
 sku TEXT NOT NULL CHECK(sku IN ('plus','theme_pack')),
 request_id TEXT NOT NULL UNIQUE,
 stripe_account TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 price_id TEXT NOT NULL,
 product_id TEXT NOT NULL,
 amount INTEGER NOT NULL,
 currency TEXT NOT NULL CHECK(currency='usd'),
 session_id TEXT UNIQUE,
 payment_intent TEXT UNIQUE,
 checkout_url TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','active','failed','expired','suspended','revoked')),
 reason TEXT NOT NULL DEFAULT 'awaiting_webhook',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 lock_token TEXT,
 lock_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS orders_state ON orders(state,mode,created_at);
CREATE TABLE IF NOT EXISTS webhook_events (
 id TEXT PRIMARY KEY, order_id TEXT, type TEXT NOT NULL, processed_at INTEGER NOT NULL
);
