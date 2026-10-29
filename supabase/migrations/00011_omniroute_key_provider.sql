-- OmniRoute as a key provider. The stored (encrypted) value is JSON: { baseUrl, apiKey }.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_provider_check;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_provider_check CHECK (provider IN ('openai', 'gemini', 'anthropic', 'openrouter', 'omniroute'));
