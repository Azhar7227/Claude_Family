/**
 * Isomorphic base64 → UTF-8 decode (browser `atob` or Node `Buffer`).
 * Lets the deterministic pipeline run identically in the browser and Node,
 * so the web app exercises the real engine — not a reimplementation.
 */
export function base64ToUtf8(b64: string): string {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}
