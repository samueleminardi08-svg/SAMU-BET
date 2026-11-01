import { z } from 'zod';
import { EventAIContextPayload } from '../config/riskConfig';

export const STORAGE_GEMINI_API_KEY = 'samubet_gemini_api_key';
export const STORAGE_GEMINI_MODEL_KEY = 'samubet_gemini_model';
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
  apiKey?: string;
}

export function normalizeBridgeUrl(rawUrl: string): string {
  return rawUrl.trim() || '/api/ai';
}

export function loadBridgeSettings(): BridgeSettings {
  try {
    const model = localStorage.getItem(STORAGE_GEMINI_MODEL_KEY) || 'gemini-2.5-flash';
    const apiKey = localStorage.getItem(STORAGE_GEMINI_API_KEY) || '';
    return {
      url: '/api/ai',
      token: 'gemini-backend',
      model,
      apiKey
    };
  } catch {
    return { url: '/api/ai', token: 'gemini-backend', model: 'gemini-2.5-flash', apiKey: '' };
  }
}

export function saveBridgeSettings(settings: BridgeSettings): void {
  try {
    if (settings.model) {
      localStorage.setItem(STORAGE_GEMINI_MODEL_KEY, settings.model);
    }
    if (settings.apiKey !== undefined) {
      localStorage.setItem(STORAGE_GEMINI_API_KEY, settings.apiKey.trim());
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

/**
 * Verifica la validità di una chiave Google Gemini effettuando una richiesta diretta alle API Google AI Studio.
 */
export async function testDirectGeminiKey(
  apiKey: string,
  model: string = 'gemini-2.5-flash'
): Promise<BridgeHealthStatus> {
  const cleanKey = apiKey.trim();
  if (!cleanKey || cleanKey.length < 15) {
    return {
      reachable: false,
      unslothReachable: false,
      detail: 'Chiave API assente o non valida (deve iniziare con AIzaSy...).'
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`,
      { signal: controller.signal }
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const errMsg =
        errJson?.error?.message ||
        (res.status === 400 || res.status === 403
          ? 'Chiave non valida o non abilitata su Google AI Studio'
          : `HTTP ${res.status}`);
      return {
        reachable: false,
        unslothReachable: false,
        detail: `Errore verifica Google Gemini: ${errMsg}.`
      };
    }

    return {
      reachable: true,
      unslothReachable: true,
      configuredModel: model,
      loadedModels: [model],
      detail: `Google Gemini API collegata e operativa (${model}).`
    };
  } catch (err: any) {
    return {
      reachable: false,
      unslothReachable: false,
      detail: `Impossibile raggiungere i server Google Gemini (${err?.message || 'errore di rete'}).`
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function testBridgeConnection(
  customSettings?: BridgeSettings
): Promise<BridgeHealthStatus> {
  const settings = customSettings || loadBridgeSettings();
  const storedKey =
    settings.apiKey ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_GEMINI_API_KEY) : '') ||
    '';

  // 1. Prova prima l'endpoint del backend locale se attivo
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('./api/ai/health', {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timer);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      return {
        reachable: Boolean(data.bridgeOnline),
        unslothReachable: Boolean(data.unslothReachable),
        configuredModel: data.configuredModel,
        loadedModels: data.loadedModels,
        detail: data.detail
      };
    }
  } catch {
    // Backend assente (es. GitHub Pages) -> usa verifica client-side diretta
  }

  // 2. Se siamo su GitHub Pages o senza backend locale, verifica la chiave salvata su Google AI
  if (storedKey && storedKey.trim().length >= 15) {
    return testDirectGeminiKey(storedKey.trim(), settings.model || 'gemini-2.5-flash');
  }

  return {
    reachable: false,
    unslothReachable: false,
    detail: 'Gemini AI non attivo: inserisci la tua Google Gemini API Key per abilitare l\'analisi AI.'
  };
}

export async function saveAndTestGeminiKey(
  apiKey: string,
  model: string
): Promise<BridgeHealthStatus> {
  const cleanKey = apiKey.trim();
  const cleanModel = model.trim() || 'gemini-2.5-flash';

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_GEMINI_MODEL_KEY, cleanModel);
    if (cleanKey) {
      localStorage.setItem(STORAGE_GEMINI_API_KEY, cleanKey);
    }
  }

  saveBridgeSettings({ url: '/api/ai', token: 'gemini-backend', model: cleanModel, apiKey: cleanKey });

  // 1. Prova a salvare e testare sul backend se attivo (sviluppo locale)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('./api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: cleanKey, model: cleanModel }),
      signal: controller.signal
    });
    clearTimeout(timer);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      return {
        reachable: Boolean(data.bridgeOnline),
        unslothReachable: Boolean(data.unslothReachable),
        configuredModel: data.configuredModel,
        loadedModels: data.loadedModels,
        detail: data.detail
      };
    }
  } catch {
    // Backend non risponde (GitHub Pages) -> prosegui con il test diretto
  }

  // 2. Se siamo su GitHub Pages o il backend non è presente, testa direttamente con Google Gemini API
  return testDirectGeminiKey(cleanKey, cleanModel);
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
