/**
 * Shared HTTP plumbing for production provider adapters. Dependency-free
 * (global fetch). Injectable fetch + timeout for tests and proxy environments.
 */

import type { InputPart } from '../provider.ts';

export interface HttpProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** Injectable for tests / proxy dispatchers. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxOutputTokens?: number;
}

export class ProviderHttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(provider: string, status: number, body: string) {
    super(`${provider} HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = 'ProviderHttpError';
    this.status = status;
    this.body = body;
  }
}

export async function postJson(
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  cfg: HttpProviderConfig,
): Promise<unknown> {
  const f = cfg.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 30_000);
  try {
    const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new ProviderHttpError(provider, res.status, text);
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderHttpError(provider, res.status, `non-JSON response: ${text.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort: pull the first JSON object out of a text blob (some models wrap it). */
export function parseLooseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('no JSON object found in model output');
  }
}

export function splitParts(input: InputPart[]): { texts: string[]; images: Array<{ mime: string; base64: string }> } {
  const texts: string[] = [];
  const images: Array<{ mime: string; base64: string }> = [];
  for (const p of input) {
    if (p.kind === 'text' && p.text) texts.push(p.text);
    else if (p.kind === 'image' && p.media?.base64) images.push({ mime: p.media.mimeType, base64: p.media.base64 });
  }
  return { texts, images };
}
