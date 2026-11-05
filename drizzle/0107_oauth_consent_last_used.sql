-- Connected apps "last used": stamped on every /mcp call. JWT access tokens
-- are not stored, so refresh-token issue time alone misses the first 10 min.
ALTER TABLE identity.oauth_consent ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
