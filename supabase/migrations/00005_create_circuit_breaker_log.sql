CREATE TABLE circuit_breaker_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX circuit_breaker_log_user_requested_idx ON circuit_breaker_log (user_id, requested_at);

-- RLS enabled with no client policies: only the service role can access this table.
ALTER TABLE circuit_breaker_log ENABLE ROW LEVEL SECURITY;
