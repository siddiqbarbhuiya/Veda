INSERT INTO rate_config (provider, model, input_paise_per_1k_tokens, output_paise_per_1k_tokens) VALUES
  ('openai', 'gpt-4o', 18, 72),
  ('openai', 'gpt-4o-mini', 1, 3),
  ('gemini', 'gemini-1.5-flash', 1, 3),
  ('gemini', 'gemini-1.5-pro', 10, 30),
  ('anthropic', 'claude-sonnet-4', 22, 110),
  ('anthropic', 'claude-haiku-3.5', 6, 18)
ON CONFLICT (provider, model) DO NOTHING;
