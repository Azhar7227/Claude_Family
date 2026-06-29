/**
 * Provider registry — the single place that maps configuration to a concrete
 * AIProvider. This is the ONLY module that knows provider class names. Business
 * logic depends on the AIProvider interface and calls createProvider(config).
 *
 * Switching providers in production is one line:  LIFEFLOW_PROVIDER=gemini
 */

import type { AIProvider } from './provider.ts';
import { DeterministicStubProvider } from './stub-provider.ts';
import { IcsExtractionProvider } from './ics-provider.ts';
import { AnthropicProvider } from './providers/anthropic.ts';
import { OpenAIProvider } from './providers/openai.ts';
import { GeminiProvider } from './providers/gemini.ts';
import type { HttpProviderConfig } from './providers/http.ts';

export type ProviderId = 'stub' | 'ics' | 'anthropic' | 'openai' | 'gemini';

export interface AppAIConfig {
  provider: ProviderId;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class MissingApiKeyError extends Error {
  constructor(provider: ProviderId) {
    super(`provider "${provider}" requires an API key (set the matching *_API_KEY env var)`);
    this.name = 'MissingApiKeyError';
  }
}

/** Build an AIProvider from config. The one factory all callers use. */
export function createProvider(config: AppAIConfig): AIProvider {
  switch (config.provider) {
    case 'stub':
      return new DeterministicStubProvider();
    case 'ics':
      return new IcsExtractionProvider();
    case 'anthropic':
    case 'openai':
    case 'gemini': {
      if (!config.apiKey) throw new MissingApiKeyError(config.provider);
      const cfg: HttpProviderConfig = { apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl, fetchImpl: config.fetchImpl };
      if (config.provider === 'anthropic') return new AnthropicProvider(cfg);
      if (config.provider === 'openai') return new OpenAIProvider(cfg);
      return new GeminiProvider(cfg);
    }
  }
}

const KEY_ENV: Record<ProviderId, string> = {
  stub: '', ics: '', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY',
};

/** Read config from environment. LIFEFLOW_PROVIDER selects; defaults to stub. */
export function providerConfigFromEnv(env: Record<string, string | undefined> = process.env): AppAIConfig {
  const provider = (env.LIFEFLOW_PROVIDER as ProviderId) || 'stub';
  const apiKey = KEY_ENV[provider] ? env[KEY_ENV[provider]] : undefined;
  return { provider, apiKey, model: env.LIFEFLOW_MODEL, baseUrl: env.LIFEFLOW_BASE_URL };
}

/** Convenience: the configured provider for the running process. */
export function createProviderFromEnv(env?: Record<string, string | undefined>): AIProvider {
  return createProvider(providerConfigFromEnv(env));
}

/** True if a provider's API key is present in env (used by the benchmark to skip unconfigured providers). */
export function isConfigured(provider: ProviderId, env: Record<string, string | undefined> = process.env): boolean {
  if (provider === 'stub' || provider === 'ics') return true;
  return Boolean(env[KEY_ENV[provider]]);
}

/**
 * Approximate prices ($ per 1M tokens), editable. Used by the benchmark to
 * estimate cost. Keyed by model id; falls back to a provider default.
 */
export interface Price {
  inPerM: number;
  outPerM: number;
}
export const PRICING: Record<string, Price> = {
  // Anthropic
  'claude-haiku-4-5': { inPerM: 1.0, outPerM: 5.0 },
  'claude-sonnet-4-6': { inPerM: 3.0, outPerM: 15.0 },
  // OpenAI
  'gpt-4o-mini': { inPerM: 0.15, outPerM: 0.6 },
  'gpt-4o': { inPerM: 2.5, outPerM: 10.0 },
  // Gemini
  'gemini-2.5-flash': { inPerM: 0.3, outPerM: 2.5 },
  'gemini-2.5-pro': { inPerM: 1.25, outPerM: 10.0 },
  // baseline
  'deterministic-stub-v1': { inPerM: 0, outPerM: 0 },
  'ics-parser-v1': { inPerM: 0, outPerM: 0 },
};

export function priceFor(model: string): Price {
  return PRICING[model] ?? { inPerM: 0, outPerM: 0 };
}
