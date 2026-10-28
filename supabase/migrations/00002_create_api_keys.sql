CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai', 'gemini', 'anthropic')),
  encrypted_key text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- Client can only SELECT and DELETE. INSERT and UPDATE go through the service role.
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own api keys" ON api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users delete own api keys" ON api_keys FOR DELETE USING (auth.uid() = user_id);
