-- OpenRouter keys, and a usage log for Claude Code runs (nothing is charged from it yet).
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_provider_check;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_provider_check CHECK (provider IN ('openai', 'gemini', 'anthropic', 'openrouter'));

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The run id the browser and the sandbox use: <sandboxId>.<random>.
  run_key text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  sandbox_seconds integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_runs_user_day ON agent_runs (user_id, created_at DESC);

-- Client can only read. INSERT and UPDATE go through the service role.
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own agent runs" ON agent_runs FOR SELECT USING (auth.uid() = user_id);
