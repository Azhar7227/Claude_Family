/**
 * AI provider PORT (dependency inversion boundary).
 *
 * Business logic depends only on this interface — never on Gemini/Claude/OpenAI.
 * Concrete providers are adapters implementing it. Adding a new provider, or a
 * new modality (OCR/vision/voice), must NOT change the orchestration layer:
 *
 *   - New provider   -> new class implementing AIProvider.
 *   - New modality   -> a new InputPart kind + a capability flag. The orchestrator
 *                       already builds a request from typed parts and checks
 *                       capabilities, so it is untouched.
 *   - Tool calling    -> the optional ToolCallingProvider extension; orchestration
 *                       that doesn't need tools never sees it.
 *
 * The provider returns RAW, UNVALIDATED output. Validation happens at the
 * boundary (schema.ts) before the Proposal engine — providers are never trusted.
 */

export type Capability =
  | 'structured_output'
  | 'vision' // can interpret image input parts
  | 'audio' // can interpret audio input parts (voice)
  | 'ocr' // can extract text from images
  | 'tool_calling';

export type InputPartKind = 'text' | 'image' | 'audio';

export interface MediaRef {
  /** Reference to bytes in object storage, OR inline base64 — provider-agnostic. */
  uploadId?: string;
  base64?: string;
  mimeType: string;
}

export interface InputPart {
  kind: InputPartKind;
  text?: string; // when kind === 'text'
  media?: MediaRef; // when kind === 'image' | 'audio'
}

/** A JSON Schema object describing the expected output. Kept as `unknown`-friendly. */
export type JsonSchema = Record<string, unknown>;

export interface StructuredRequest {
  /** Task/system instruction (provider maps to system prompt or equivalent). */
  instruction: string;
  /** Multimodal input. Text-only today; image/audio parts added later, same call. */
  input: InputPart[];
  /** The output contract. Providers that support structured_output must honor it. */
  schema: JsonSchema;
  schemaName: string;
  /** Versioned prompt id for eval traceability (TECH_SPEC §3). */
  promptVersion: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface ProviderMeta {
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn?: number;
  tokensOut?: number;
  finishReason?: string;
}

export interface StructuredResult {
  /** Parsed JSON from the model — NOT yet validated against any domain schema. */
  raw: unknown;
  meta: ProviderMeta;
}

export interface AIProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<Capability>;
  /**
   * Produce structured JSON conforming (best-effort) to req.schema.
   * MUST NOT throw on merely-invalid content — return the raw output and let
   * the boundary validator decide. MAY throw on transport/auth failure.
   */
  generateStructured(req: StructuredRequest): Promise<StructuredResult>;
}

/** Optional capability extension — providers may also support tool calling. */
export interface ToolCallingProvider extends AIProvider {
  generateWithTools(req: StructuredRequest & { tools: JsonSchema[] }): Promise<StructuredResult>;
}

export function supports(provider: AIProvider, cap: Capability): boolean {
  return provider.capabilities.has(cap);
}

/** Raised when an input part requires a capability the provider lacks. */
export class UnsupportedCapabilityError extends Error {
  readonly provider: string;
  readonly capability: Capability;
  constructor(provider: string, capability: Capability) {
    super(`provider "${provider}" does not support capability "${capability}"`);
    this.name = 'UnsupportedCapabilityError';
    this.provider = provider;
    this.capability = capability;
  }
}

/** Guard the orchestrator uses before sending non-text parts. */
export function assertCanHandle(provider: AIProvider, input: InputPart[]): void {
  for (const part of input) {
    if (part.kind === 'image' && !supports(provider, 'vision') && !supports(provider, 'ocr')) {
      throw new UnsupportedCapabilityError(provider.name, 'vision');
    }
    if (part.kind === 'audio' && !supports(provider, 'audio')) {
      throw new UnsupportedCapabilityError(provider.name, 'audio');
    }
  }
}
