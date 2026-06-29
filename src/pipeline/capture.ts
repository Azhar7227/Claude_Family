/**
 * Capture / normalize stage (TECH_SPEC §2.1–2.2).
 *
 * Turns a raw CaptureInput into provider-ready InputParts plus the context the
 * downstream stages need. Today: text is a passthrough. Image and .ics carry
 * their hooks so adding them later does not change the orchestration — they
 * simply produce different InputParts / pre-parsed events.
 */

import type { IANATz, ISODate } from '../domain/types.ts';
import type { InputPart } from '../ai/provider.ts';

export type CaptureInput =
  | { method: 'text'; text: string }
  | { method: 'image'; uploadId: string; mimeType: string; ocrText?: string; base64?: string }
  | { method: 'ics'; uploadId: string; icsText?: string };

export interface NormalizeContext {
  /** Local calendar date of capture; used as the default series anchor (dtStart). */
  referenceDate: ISODate;
  timezone: IANATz;
}

export interface NormalizedDoc {
  method: CaptureInput['method'];
  parts: InputPart[];
  referenceDate: ISODate;
  timezone: IANATz;
}

export function normalize(input: CaptureInput, ctx: NormalizeContext): NormalizedDoc {
  const base = { referenceDate: ctx.referenceDate, timezone: ctx.timezone, method: input.method };

  switch (input.method) {
    case 'text': {
      const text = input.text.trim();
      if (!text) throw new Error('empty text capture');
      return { ...base, parts: [{ kind: 'text', text }] };
    }
    case 'image': {
      // If OCR text is pre-computed, pass it as text; otherwise hand the image to
      // a vision/ocr-capable provider as an image part. Orchestration is identical.
      const parts: InputPart[] = input.ocrText
        ? [{ kind: 'text', text: input.ocrText }]
        : [{ kind: 'image', media: { uploadId: input.uploadId, mimeType: input.mimeType, base64: input.base64 } }];
      return { ...base, parts };
    }
    case 'ics': {
      // .ics is mostly deterministic; a future ics parser pre-fills events and the
      // LLM only classifies. For now we forward any provided text.
      const text = input.icsText?.trim();
      if (!text) throw new Error('ics parsing not yet implemented; provide icsText');
      return { ...base, parts: [{ kind: 'text', text }] };
    }
  }
}
