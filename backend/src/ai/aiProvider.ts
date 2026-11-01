import {
  AIBatchEventEstimateSchema,
  AIEstimate,
  AIEstimateSchema,
  EventAIContextPayload
} from '../types/models.js';
import {
  QUANT_ANALYST_SYSTEM_PROMPT,
  buildEventUserPrompt,
  extractTolerantJson
} from './prompts.js';

/**
 * Interfaccia AIProvider (Sezione 5.2):
 * - estimate(eventContext) -> AIEstimate[] (tutte le selezioni candidate dell'evento in 1 sola chiamata)
 */
export interface AIProvider {
  readonly name: string;
  estimate(eventContext: EventAIContextPayload): Promise<AIEstimate[]>;
}

/**
 * Implementazione predefinita: LocalBridgeProvider
 * Parla con il local-ai-bridge (o qualsiasi endpoint compatibile OpenAI / Unsloth).
 */
export class LocalBridgeProvider implements AIProvider {
  public readonly name = 'LocalBridgeProvider (Unsloth GGUF)';

  constructor(
    private readonly bridgeUrl: string,
    private readonly bridgeToken: string,
    private readonly timeoutMs = 90000
  ) {}

  public async estimate(eventContext: EventAIContextPayload): Promise<AIEstimate[]> {
    const cleanUrl = this.bridgeUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${cleanUrl}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.bridgeToken}`
        },
        body: JSON.stringify({ eventContext }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Bridge HTTP ${res.status}`);
      }

      const data = await res.json();
      if (Array.isArray(data?.estimates)) {
        const parsedBatch = AIBatchEventEstimateSchema.parse({
          event_id: eventContext.eventId,
          estimates: data.estimates
        });
        return parsedBatch.estimates;
      }

      const single = AIEstimateSchema.parse(data);
      return [single];
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Implementazione opzionale: GeminiProvider (disattivato di default,
 * attivabile solo se esiste GEMINI_API_KEY; senza ricerca Google, riceve lo stesso contesto RSS).
 */
export class GeminiProvider implements AIProvider {
  public readonly name = 'GeminiProvider (Opzionale)';

  constructor(private readonly apiKey: string) {}

  public async estimate(eventContext: EventAIContextPayload): Promise<AIEstimate[]> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY non configurata.');
    }

    const userPrompt = buildEventUserPrompt(eventContext);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        this.apiKey
      )}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: QUANT_ANALYST_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Gemini HTTP ${res.status}`);
      }

      const payload = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const rawJson = extractTolerantJson(rawText) as Record<string, unknown>;

      if (Array.isArray(rawJson?.estimates)) {
        return AIBatchEventEstimateSchema.parse({
          event_id: eventContext.eventId,
          estimates: rawJson.estimates
        }).estimates;
      }

      return [AIEstimateSchema.parse(rawJson)];
    } finally {
      clearTimeout(timer);
    }
  }
}

