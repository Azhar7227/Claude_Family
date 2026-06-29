/**
 * Client for the optional local AI proxy. Keeps provider API keys OFF the
 * browser — the proxy holds them server-side and runs the real adapters. If the
 * proxy is unreachable, the app falls back to the on-device deterministic stub,
 * so capture always works (offline-first).
 */

import type { InputPart } from '../ai/provider.ts';
import type { ExtractionResult } from '../ai/types.ts';

export interface ApiExtractResult {
  result: ExtractionResult;
  meta: { provider: string; model: string; promptVersion: string };
}

const DEFAULT_BASE = '/api';

export async function apiHealth(base = DEFAULT_BASE, timeoutMs = 2500): Promise<{ provider: string; model?: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as { provider: string; model?: string };
  } catch {
    return null;
  }
}

export async function apiExtract(parts: InputPart[], base = DEFAULT_BASE): Promise<ApiExtractResult> {
  const res = await fetch(`${base}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parts }),
  });
  if (!res.ok) throw new Error(`AI proxy error ${res.status}`);
  return (await res.json()) as ApiExtractResult;
}
