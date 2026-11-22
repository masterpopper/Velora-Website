PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY, github_id TEXT NOT NULL UNIQUE, login TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
 hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), sku TEXT NOT NULL CHECK(sku IN ('plus','theme_pack')),
 request_id TEXT NOT NULL, stripe_account TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode='test'),
 price_id TEXT NOT NULL, product_id TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL CHECK(currency='usd'),
 session_id TEXT UNIQUE, payment_intent TEXT UNIQUE, checkout_url TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','active','failed','expired','suspended','revoked')),
 reason TEXT NOT NULL DEFAULT 'awaiting_webhook', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 lock_token TEXT, lock_until INTEGER NOT NULL DEFAULT 0,
 UNIQUE(account_id,request_id)
);
CREATE INDEX IF NOT EXISTS orders_owner ON orders(account_id,sku,state);
CREATE UNIQUE INDEX IF NOT EXISTS orders_pending ON orders(account_id,sku) WHERE state='pending';
CREATE TABLE IF NOT EXISTS webhook_events (
 id TEXT PRIMARY KEY, order_id TEXT, type TEXT NOT NULL, processed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS legacy_grants (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), sku TEXT NOT NULL CHECK(sku='plus'),
 evidence_ref TEXT NOT NULL UNIQUE, approved_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS devices (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, account_id TEXT REFERENCES accounts(id),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS pairings (
 hash TEXT PRIMARY KEY, device_id TEXT NOT NULL UNIQUE REFERENCES devices(id), expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE IF NOT EXISTS redemptions (
 hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL, consumed_at INTEGER, consumed_by TEXT
);
