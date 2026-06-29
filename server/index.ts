/**
 * Minimal local server for the beta: serves the built PWA and proxies AI
 * extraction so provider API keys stay server-side. Stateless — scheduling,
 * commit, and storage all live in the client. Run with:  npm run serve
 *
 *   LIFEFLOW_PROVIDER=gemini GEMINI_API_KEY=... npm run serve
 *
 * Endpoints:
 *   GET  /api/health   -> { provider, model }
 *   POST /api/extract  -> { result: ExtractionResult, meta }   body: { parts }
 */

import http from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract } from '../src/ai/extraction.ts';
import { createProviderFromEnv, providerConfigFromEnv } from '../src/ai/registry.ts';
import { SchemaValidationError } from '../src/ai/schema.ts';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT) || 8787;
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(json);
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0]!;

  if (url === '/api/health') {
    const cfg = providerConfigFromEnv();
    return send(res, 200, { provider: cfg.provider, model: cfg.model ?? null });
  }

  if (url === '/api/extract' && req.method === 'POST') {
    try {
      const body = (await readBody(req)) as { parts?: unknown };
      const parts = Array.isArray(body.parts) ? body.parts : [];
      const provider = createProviderFromEnv();
      const out = await extract(provider, { parts: parts as never });
      return send(res, 200, { result: out.result, meta: out.meta });
    } catch (err) {
      const status = err instanceof SchemaValidationError ? 422 : 500;
      return send(res, status, { error: String(err instanceof Error ? err.message : err) });
    }
  }

  // static files
  try {
    let p = decodeURIComponent(url);
    if (p === '/') p = '/index.html';
    const file = normalize(join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    // SPA fallback
    try {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(await readFile(join(PUBLIC, 'index.html')));
    } catch {
      send(res, 404, { error: 'not found' });
    }
  }
});

server.listen(PORT, () => {
  const cfg = providerConfigFromEnv();
  console.log(`LifeFlow server on http://localhost:${PORT}  (AI provider: ${cfg.provider}${cfg.apiKey ? '' : ' — no key, client will fall back to on-device stub'})`);
});
