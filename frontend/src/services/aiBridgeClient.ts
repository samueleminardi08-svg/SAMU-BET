import { z } from 'zod';
import { EventAIContextPayload } from '../config/riskConfig';

const STORAGE_GEMINI_MODEL_KEY = 'samubet_gemini_model';
const STORAGE_AI_CACHE_KEY = 'samubet_ai_cache_v1';
const AI_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 ore

export const ClientAIEstimateSchema = z.object({
  event_id: z.string(),
  market: z.string(),
  selection: z.string(),
  p_ai: z.number().min(0.01).max(0.99),
  confidence: z.number().min(0).max(1),
  key_factors: z.array(z.string()),
  red_flags: z.array(z.string())
});

export type ClientAIEstimate = z.infer<typeof ClientAIEstimateSchema>;

const ClientAIBatchSchema = z.object({
  event_id: z.string(),
  estimates: z.array(ClientAIEstimateSchema)
});

export interface BridgeSettings {
  url: string;
  token: string;
  model?: string;
}

export function normalizeBridgeUrl(rawUrl: string): string {
  return rawUrl.trim() || '/api/ai';
}

export function loadBridgeSettings(): BridgeSettings {
  try {
    const model = localStorage.getItem(STORAGE_GEMINI_MODEL_KEY) || 'gemini-3.1-flash-lite';
    return {
      url: '/api/ai',
      token: 'gemini-backend',
      model
    };
  } catch {
    return { url: '/api/ai', token: 'gemini-backend', model: 'gemini-3.1-flash-lite' };
  }
}

export function saveBridgeSettings(settings: BridgeSettings): void {
  try {
    if (settings.model) {
      localStorage.setItem(STORAGE_GEMINI_MODEL_KEY, settings.model);
    }
  } catch {
    // ignore storage errors
  }
}

interface CachedAIEstimateEntry {
  estimates: ClientAIEstimate[];
  expiresAt: number;
}

function getCachedEventEstimates(eventId: string): ClientAIEstimate[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_AI_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, CachedAIEstimateEntry>;
    const entry = map[eventId];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete map[eventId];
      localStorage.setItem(STORAGE_AI_CACHE_KEY, JSON.stringify(map));
      return null;
    }
    return entry.estimates;
  } catch {
    return null;
  }
}

function setCachedEventEstimates(eventId: string, estimates: ClientAIEstimate[]): void {
  try {
    const raw = localStorage.getItem(STORAGE_AI_CACHE_KEY);
    const map: Record<string, CachedAIEstimateEntry> = raw ? JSON.parse(raw) : {};
    map[eventId] = {
      estimates,
      expiresAt: Date.now() + AI_CACHE_TTL_MS
    };
    localStorage.setItem(STORAGE_AI_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export interface BridgeHealthStatus {
  reachable: boolean;
  unslothReachable: boolean;
  configuredModel?: string;
  loadedModels?: string[];
  detail?: string;
}

export async function testBridgeConnection(
  _customSettings?: BridgeSettings
): Promise<BridgeHealthStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch('/api/ai/health', {
      method: 'GET',
      signal: controller.signal
    });

    if (!res.ok) {
      return {
        reachable: false,
        unslothReachable: false,
        detail: `Errore verifica Gemini API (HTTP ${res.status}).`
      };
    }

    const data = await res.json();
    return {
      reachable: Boolean(data.bridgeOnline),
      unslothReachable: Boolean(data.unslothReachable),
      configuredModel: data.configuredModel,
      loadedModels: data.loadedModels,
      detail: data.detail
    };
  } catch {
    return {
      reachable: false,
      unslothReachable: false,
      detail: 'Backend AI non raggiungibile.'
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function saveAndTestGeminiKey(
  apiKey: string,
  model: string
): Promise<BridgeHealthStatus> {
  saveBridgeSettings({ url: '/api/ai', token: 'gemini-backend', model });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey.trim(), model }),
      signal: controller.signal
    });

    const data = await res.json();
    return {
      reachable: Boolean(data.bridgeOnline),
      unslothReachable: Boolean(data.unslothReachable),
      configuredModel: data.configuredModel,
      loadedModels: data.loadedModels,
      detail: data.detail
    };
  } catch {
    return {
      reachable: false,
      unslothReachable: false,
      detail: 'Impossibile salvare la configurazione Gemini sul backend.'
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function estimateSingleEventOnBridge(
  eventContext: EventAIContextPayload,
  externalAbortSignal?: AbortSignal
): Promise<ClientAIEstimate[]> {
  const cached = getCachedEventEstimates(eventContext.eventId);
  if (cached) {
    return cached;
  }

  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), 35000);

  const onExternalAbort = () => timeoutController.abort();
  externalAbortSignal?.addEventListener('abort', onExternalAbort);

  try {
    const res = await fetch('/api/ai/estimate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ eventContext }),
      signal: timeoutController.signal
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const raw = await res.json();
    const parsed = ClientAIBatchSchema.parse(raw);
    setCachedEventEstimates(eventContext.eventId, parsed.estimates);
    return parsed.estimates;
  } finally {
    clearTimeout(timer);
    externalAbortSignal?.removeEventListener('abort', onExternalAbort);
  }
}
