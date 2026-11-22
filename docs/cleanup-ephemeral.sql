-- Optional operator maintenance in the Velora TEST database only.
-- Never deletes purchases, webhook audit receipts, legacy grants or account records.
DELETE FROM rate_limits WHERE expires_at < unixepoch();
DELETE FROM oauth_states WHERE expires_at < unixepoch();
DELETE FROM sessions WHERE expires_at < unixepoch();
DELETE FROM pairings WHERE expires_at < unixepoch() - 86400;
DELETE FROM redemptions WHERE expires_at < unixepoch() - 86400;
