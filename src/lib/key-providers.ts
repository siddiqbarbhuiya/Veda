// Providers that can hold a stored API key. Keep in sync with the api_keys CHECK constraint.
export const KEY_PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "omniroute", label: "OmniRoute" },
] as const;

/** Providers that need an address as well as a key. The student runs their own server there. */
export const URL_PROVIDERS: readonly string[] = ["omniroute"];

export type KeyProvider = (typeof KEY_PROVIDERS)[number]["value"];

export const KEY_PROVIDER_VALUES: readonly string[] = KEY_PROVIDERS.map((p) => p.value);

export function isKeyProvider(value: unknown): value is KeyProvider {
  return typeof value === "string" && KEY_PROVIDER_VALUES.includes(value);
}

export function providerName(provider: string): string {
  return KEY_PROVIDERS.find((p) => p.value === provider)?.label ?? provider;
}

export const MAX_KEY_LENGTH = 512;
export const MAX_LABEL_LENGTH = 60;
