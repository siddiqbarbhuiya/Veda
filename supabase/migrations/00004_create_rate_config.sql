CREATE TABLE rate_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  input_paise_per_1k_tokens integer NOT NULL,
  output_paise_per_1k_tokens integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model)
);

ALTER TABLE rate_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read rates" ON rate_config FOR SELECT TO authenticated USING (true);
