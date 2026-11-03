import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { sharedCache } from '../cache/cacheManager.js';
import { EventAIContextPayload } from '../types/models.js';

export const GeminiEstimateSchema = z.object({
  event_id: z.string(),
  market: z.string(),
  selection: z.string(),
  player_name: z.string().optional(),
  p_ai: z.number().min(0.01).max(0.99),
  confidence: z.number().min(0).max(1),
  key_factors: z.array(z.string()).min(1).max(6),
  red_flags: z.array(z.string()).max(6),
  data_gaps: z.array(z.string()).optional().default([]),
  sources: z.array(z.string()).optional().default([])
});

export const GeminiBatchEstimateSchema = z.object({
  event_id: z.string(),
  estimates: z.array(GeminiEstimateSchema).min(1)
});

export const GeminiMultiEventResponseSchema = z.object({
  events: z.array(GeminiBatchEstimateSchema)
});

const SYSTEM_PROMPT = `Sei un analista sportivo quantitativo esperto del palinsesto completo SNAI:
1. Mercati Principali ed Esiti (1X2 Finale/1°T/2°T, Doppia Chance Finale/1°T/2°T, Under/Over 0.5..7.5 Finale/1°T/2°T, Goal/No Goal Finale/1°T/2°T, Risultato Esatto 26 esiti + multipli e 1°T/2°T, Parziale/Finale 9 esiti, Multigoal Totale/Casa/Ospite, Handicap 1X2, Draw/Home/Away No Bet, Pari/Dispari, Segna Gol 1/Ultimo, Ribaltone, Casa/Ospite Segna nei 2 tempi, Vince entrambi i tempi, Vince a zero).
2. Combo e Tricombo (1X2 o DC + Under/Over, Goal/No Goal o Multigoal, Goal/No Goal + U/O, 1X2 1°T + 1X2 2°T, Parziale/Finale + U/O, Tricombo 1X2/DC + Goal/No Goal + U/O).
3. Giocatori e Prestazioni SNAI Speciali (Marcatore, Primo/Ultimo Marcatore, Doppietta/Tripletta, Marcatore + 1X2 o Risultato Esatto, Tiri/Tiri in Porta, Assist, Cartellino Giocatore, Tackle/Contrasti, Passaggi).
4. Sanzioni, Calci d'Angolo e Speciali Match (Under/Over e 1X2 Corner, Under/Over e 1X2 Cartellini/Punti Cartellino, Espulsione, Rigore, Rigore + Espulsione, Autorete, Metodo 1° Gol, Sostituzione 1°T, Minuto 1° Gol a fasce di 15 min).

REGOLE DI CALIBRAZIONE E QUALITÀ (SEZIONE 1.6):
- Parti SEMPRE dalla probabilità di mercato (p_mercato) depurata dal margine come àncora oggettiva.
- Spostala SOLO se hai elementi concreti e verificabili (infortuni pesanti dell'ultim'ora, formazioni ufficiali/probabili sbilanciate, squalifiche, motivazioni di classifica o stanchezza da calendario).
- NON inventare mai dati o statistiche. Se le informazioni su un evento sono scarse, segnalalo in "red_flags" e "data_gaps" e mantieni una "confidence" bassa (≤ 0.50).
- Riporta esplicitamente in "key_factors" l'incrocio tra formazione/uomini chiave e dati statistici.
- Quando una selezione candidata riguarda un mercato Giocatori (Marcatore, Primo/Ultimo Marcatore, Doppietta, Tiri, Tiri in Porta, Assist, Cartellino, Tackle, Passaggi) e contiene un ruolo come "Centravanti Titolare (Squadra)", "Attaccante Esterno (Squadra)", "Trequartista / Regista (Squadra)" o "Mediano Titolare (Squadra)", compila OBBLIGATORIAMENTE il campo "player_name" con il Nome e Cognome reale del titolare previsto in formazione per quella squadra e quel ruolo (es. "Lautaro Martínez (Inter)").
- Rispondi ESCLUSIVAMENTE con JSON valido in italiano.`;

function getFallbackModelsList(): string[] {
  const envFallbacks = process.env.GEMINI_FALLBACK_MODELS;
  if (envFallbacks && envFallbacks.trim()) {
    return envFallbacks
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
  }
  return [
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemma-4-26b-a4b-it',
    'gemini-3.8-flash',
    'gemini-3.7-flash'
  ];
}

const modelCooldownUntil = new Map<string, number>();

let runtimeGeminiApiKey: string = (process.env.GEMINI_API_KEY || '').trim();
let runtimeGeminiModel: string = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();

export function getOrderedCandidateModels(preferredModel: string): string[] {
  const now = Date.now();
  const fallbacks = getFallbackModelsList();
  const all = [
    preferredModel,
    ...fallbacks.filter((m) => m !== preferredModel)
  ];
  const available = all.filter((m) => (modelCooldownUntil.get(m) || 0) <= now);
  return available.length > 0 ? available : all;
}

export function markModelCooldown(model: string, status: number): void {
  const durationMs = status === 429 ? 10 * 60 * 1000 : status === 404 ? 60 * 60 * 1000 : 2 * 60 * 1000;
  modelCooldownUntil.set(model, Date.now() + durationMs);
}

export function getGeminiConfig(): { apiKey: string; model: string; configured: boolean } {
  const key = runtimeGeminiApiKey || (process.env.GEMINI_API_KEY || '').trim();
  const preferred = (runtimeGeminiModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const activeModel = getOrderedCandidateModels(preferred)[0] || preferred;
  return {
    apiKey: key,
    model: activeModel,
    configured: key.length >= 10
  };
}

export function updateGeminiConfig(newApiKey: string, newModel?: string): void {
  runtimeGeminiApiKey = newApiKey.trim();
  process.env.GEMINI_API_KEY = runtimeGeminiApiKey;
  if (newModel && newModel.trim()) {
    runtimeGeminiModel = newModel.trim();
    process.env.GEMINI_MODEL = runtimeGeminiModel;
    modelCooldownUntil.delete(runtimeGeminiModel);
  }

  try {
    const envPaths = [
      path.resolve(process.cwd(), '../.env'),
      path.resolve(process.cwd(), '.env')
    ];
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf-8');
        if (/^GEMINI_API_KEY=.*$/m.test(content)) {
          content = content.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${runtimeGeminiApiKey}`);
        } else {
          content += `\nGEMINI_API_KEY=${runtimeGeminiApiKey}\n`;
        }
        if (runtimeGeminiModel) {
          if (/^GEMINI_MODEL=.*$/m.test(content)) {
            content = content.replace(/^GEMINI_MODEL=.*$/m, `GEMINI_MODEL=${runtimeGeminiModel}`);
          } else {
            content += `\nGEMINI_MODEL=${runtimeGeminiModel}\n`;
          }
        }
        fs.writeFileSync(envPath, content, 'utf-8');
        break;
      }
    }
  } catch {
    // ignore file write errors
  }
}

export async function checkGeminiHealth(): Promise<{
  status: string;
  bridgeOnline: boolean;
  unslothReachable: boolean;
  configuredModel: string;
  loadedModels: string[];
  groundingStatus?: { enabled: boolean; used: number; budget: number; remaining: number };
  detail?: string;
}> {
  const { apiKey, model, configured } = getGeminiConfig();
  const groundingStatus = sharedCache.getGroundingStatus();

  if (!configured) {
    return {
      status: 'missing_key',
      bridgeOnline: false,
      unslothReachable: false,
      configuredModel: model,
      loadedModels: [],
      groundingStatus,
      detail: 'Inserisci la tua GEMINI_API_KEY nella scheda AI per attivare Google Gemini.'
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return {
        status: 'error',
        bridgeOnline: false,
        unslothReachable: false,
        configuredModel: model,
        loadedModels: [],
        groundingStatus,
        detail: `Chiave API Gemini non valida o modello non trovato (HTTP ${res.status}).`
      };
    }

    return {
      status: 'ok',
      bridgeOnline: true,
      unslothReachable: true,
      configuredModel: `Google Gemini (${model})`,
      loadedModels: getFallbackModelsList(),
      groundingStatus,
      detail: 'Connesso a Google Gemini API (con failover automatico multi-modello attivo).'
    };
  } catch {
    return {
      status: 'error',
      bridgeOnline: false,
      unslothReachable: false,
      configuredModel: model,
      loadedModels: [],
      groundingStatus,
      detail: 'Impossibile contattare i server Google Gemini. Verifica la connessione internet.'
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildGeminiRequestBody(
  model: string,
  userPrompt: string,
  maxOutputTokens: number,
  enableGrounding = false
): Record<string, unknown> {
  const isGemma = model.startsWith('gemma-');
  const thinkingLevel = process.env.GEMINI_THINKING_LEVEL_ESTIMATE || 'low';

  if (isGemma) {
    return {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens
      }
    };
  }

  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens,
    responseMimeType: 'application/json',
    thinkingConfig: {
      thinkingLevel
    }
  };

  const reqBody: Record<string, unknown> = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig
  };

  if (enableGrounding) {
    reqBody.tools = [{ google_search: {} }];
  }

  return reqBody;
}

function normalizeSingleEstimateObject(
  rawEst: Record<string, unknown>,
  fallbackEventId: string,
  fallbackContext?: EventAIContextPayload,
  groundingSources: string[] = []
): z.infer<typeof GeminiEstimateSchema> | null {
  const market = typeof rawEst.market === 'string' ? rawEst.market.trim() : '';
  const selection = typeof rawEst.selection === 'string' ? rawEst.selection.trim() : '';
  if (!market && !selection) return null;

  let pAi = Number(rawEst.p_ai);
  if (Number.isNaN(pAi)) {
    pAi = 0.55;
  } else if (pAi > 1 && pAi <= 100) {
    pAi = pAi / 100;
  }
  pAi = Number(Math.max(0.01, Math.min(0.99, pAi)).toFixed(4));

  let confidence = Number(rawEst.confidence);
  if (Number.isNaN(confidence)) {
    confidence = fallbackContext && fallbackContext.news.length > 0 ? 0.68 : 0.52;
  } else if (confidence > 1 && confidence <= 100) {
    confidence = confidence / 100;
  }
  confidence = Number(Math.max(0.1, Math.min(0.99, confidence)).toFixed(2));

  const rawFactors = Array.isArray(rawEst.key_factors)
    ? rawEst.key_factors.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  const keyFactors =
    rawFactors.length > 0
      ? rawFactors.slice(0, 6)
      : [
          fallbackContext?.statsSummary[0] ||
            `Quota e probabilità implicita depurata favorevoli per ${selection || market}.`
        ];

  const rawFlags = Array.isArray(rawEst.red_flags)
    ? rawEst.red_flags.filter(
        (x): x is string =>
          typeof x === 'string' &&
          x.trim().length > 0 &&
          !['nessuno', 'nessuna', 'none', 'n/a'].includes(x.trim().toLowerCase())
      )
    : [];
  const redFlags =
    rawFlags.length > 0
      ? rawFlags.slice(0, 6)
      : [
          fallbackContext && fallbackContext.news.length === 0
            ? 'Nessuna notizia RSS dell\'ultim\'ora rilevata: verifica le formazioni ufficiali.'
            : 'Verifica sempre le formazioni ufficiali prima del calcio d\'inizio.'
        ];

  const rawGaps = Array.isArray(rawEst.data_gaps)
    ? rawEst.data_gaps.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  const rawSources = Array.isArray(rawEst.sources)
    ? rawEst.sources.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  const combinedSources = Array.from(new Set([...groundingSources, ...rawSources]));

  const rawPlayerName =
    typeof rawEst.player_name === 'string' && rawEst.player_name.trim().length > 2
      ? rawEst.player_name.trim()
      : undefined;

  return {
    event_id: typeof rawEst.event_id === 'string' && rawEst.event_id.trim() ? rawEst.event_id.trim() : fallbackEventId,
    market: market || 'Mercato SNAI',
    selection: selection || market,
    ...(rawPlayerName ? { player_name: rawPlayerName } : {}),
    p_ai: pAi,
    confidence,
    key_factors: keyFactors,
    red_flags: redFlags,
    data_gaps: rawGaps.slice(0, 4),
    sources: combinedSources.slice(0, 4)
  };
}

async function callGeminiWithFallback(
  userPrompt: string,
  maxOutputTokens: number,
  timeoutMs = 14000,
  allowGrounding = false
): Promise<{ text: string; sources: string[] }> {
  const { apiKey, model: preferredModel, configured } = getGeminiConfig();
  if (!configured) {
    throw new Error('GEMINI_API_KEY non configurata.');
  }

  const candidateModels = getOrderedCandidateModels(preferredModel);
  let lastError: Error | null = null;

  for (const model of candidateModels) {
    // Prova con grounding solo se esplicitamente consentito e budget residuo disponibile
    const canGround = allowGrounding && sharedCache.canMakeGroundingCall();

    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const t0 = Date.now();

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const body = buildGeminiRequestBody(model, userPrompt, maxOutputTokens, canGround);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (res.status === 503) {
          // Retry con breve attesa
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          markModelCooldown(model, res.status);
          lastError = new Error(`Gemini (${model}) 503 in forte richiesta.`);
          break;
        }

        if (!res.ok) {
          markModelCooldown(model, res.status);
          const errText = await res.text().catch(() => '');
          lastError = new Error(`Gemini (${model}) HTTP ${res.status}: ${errText.slice(0, 140)}`);
          break;
        }

        const data = (await res.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string; thought?: boolean }>;
            };
            groundingMetadata?: {
              webSearchQueries?: string[];
            };
          }>;
        };

        if (canGround) {
          sharedCache.recordGroundingCall(1);
        }

        sharedCache.recordAiLatency(Date.now() - t0, model);

        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const textParts = parts
          .filter((p) => !p.thought && typeof p.text === 'string')
          .map((p) => p.text!)
          .join('\n');
        const rawText = (textParts || parts.map((p) => p.text || '').join('\n')).trim();

        if (!rawText) {
          lastError = new Error(`Risposta vuota da ${model}`);
          break;
        }

        const sources = candidate?.groundingMetadata?.webSearchQueries || [];
        return { text: rawText, sources };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        break;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw lastError || new Error('Tutti i modelli Gemini non sono attualmente raggiungibili.');
}

function extractCleanJsonBlock(rawText: string): unknown {
  const cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  const jsonSlice =
    startIdx !== -1 && endIdx > startIdx ? cleaned.slice(startIdx, endIdx + 1) : cleaned;
  return JSON.parse(jsonSlice);
}

export async function estimateEventWithGemini(
  eventContext: EventAIContextPayload
): Promise<z.infer<typeof GeminiBatchEstimateSchema>> {
  const statsBlock =
    eventContext.statsSummary.length > 0
      ? eventContext.statsSummary.map((s) => `- ${s}`).join('\n')
      : '- Nessuna statistica di classifica disponibile.';

  const newsBlock =
    eventContext.news.length > 0
      ? eventContext.news
          .slice(0, 5)
          .map((n, i) => `${i + 1}. [${n.source} | ${n.pubDate.slice(0, 16)}] ${n.title} — ${n.excerpt}`)
          .join('\n')
      : 'Nessuna notizia recente trovata nei feed RSS (segnalalo in red_flags e usa confidence <= 0.50).';

  const selectionsText = eventContext.candidateSelections
    .map(
      (s, i) =>
        `${i + 1}) market="${s.market}", selection="${s.selection}", quota=${s.effectiveOdds.toFixed(
          2
        )}, p_mercato=${s.pMarket.toFixed(4)}`
    )
    .join('\n');

  const prompt = `Evento: ${eventContext.eventName} (${eventContext.competitionName}) - Data: ${eventContext.commenceTime}
event_id: "${eventContext.eventId}"

Statistiche di classifica e marcatori ufficiali:
${statsBlock}

Notizie recenti e Probabili Formazioni (RSS):
${newsBlock}

Selezioni candidate da stimare:
${selectionsText}

ISTRUZIONI OBBLIGATORIE:
1. Incrocia le probabili formazioni / titolari / marcatori e le notizie sugli indisponibili con le statistiche di classifica e la probabilità di mercato depurata (p_mercato).
2. Nei "key_factors" cita l'incrocio tra formazione/uomini chiave e dati statistici; nei "red_flags" segnala eventuali dubbi di formazione, ballottaggi o assenze. Riporta in "data_gaps" eventuali dati mancanti rilevanti.
3. Se la selezione riguarda un mercato Giocatori e contiene un ruolo generico (es. "Centravanti Titolare (Squadra)"), compila OBBLIGATORIAMENTE il campo "player_name" con il Nome e Cognome reale del titolare previsto in formazione.

Restituisci ESCLUSIVAMENTE un oggetto JSON con questa struttura esatta (in italiano):
{
  "event_id": "${eventContext.eventId}",
  "estimates": [
    {
      "market": "<market esatto>",
      "selection": "<selection esatta>",
      "player_name": "<Nome Cognome (Squadra) solo se è una giocata su un Giocatore, altrimenti ometti>",
      "p_ai": 0.55,
      "confidence": 0.65,
      "key_factors": ["<incrocio formazione + motivazione tecnica in italiano>"],
      "red_flags": ["<rischio di formazione o incognita in italiano>"],
      "data_gaps": ["<lacune di informazione se presenti>"],
      "sources": ["<fonti usate>"]
    }
  ]
}`;

  try {
    const { text: rawText, sources } = await callGeminiWithFallback(prompt, 2048, 24000);
    const parsedJson = extractCleanJsonBlock(rawText) as Record<string, unknown>;
    const rawEstimates = Array.isArray(parsedJson?.estimates) ? parsedJson.estimates : [];
    const normalized = rawEstimates
      .map((e) =>
        typeof e === 'object' && e !== null
          ? normalizeSingleEstimateObject(e as Record<string, unknown>, eventContext.eventId, eventContext, sources)
          : null
      )
      .filter((e): e is z.infer<typeof GeminiEstimateSchema> => e !== null);

    if (normalized.length > 0) {
      return {
        event_id: eventContext.eventId,
        estimates: normalized
      };
    }
  } catch {
    // Se l'AI fallisce, non inventare numeri: restituisci vuoto per fallback pulito a "solo mercato"
  }

  return {
    event_id: eventContext.eventId,
    estimates: []
  };
}

const TTL_GEMINI_CACHE_MS = 2 * 60 * 60 * 1000; // 2 ore

/**
 * Analizza un gruppo di partite con Google Gemini in blocchi paralleli a concorrenza controllata.
 */
export async function analyzeEventsBatchWithGemini(
  eventContexts: EventAIContextPayload[]
): Promise<Map<string, z.infer<typeof GeminiEstimateSchema>[]>> {
  const resultMap = new Map<string, z.infer<typeof GeminiEstimateSchema>[]>();
  if (eventContexts.length === 0) return resultMap;

  const { configured } = getGeminiConfig();
  if (!configured) {
    return resultMap;
  }

  const uncachedContexts: EventAIContextPayload[] = [];
  for (const ctx of eventContexts) {
    const selKey = ctx.candidateSelections.map((s) => s.selection).join('|');
    const exactCacheKey = `gemini:est_v3:${ctx.eventId}:${selKey}`;
    const eventCacheKey = `gemini:event_latest_v3:${ctx.eventId}`;

    const cachedExact = sharedCache.get<z.infer<typeof GeminiEstimateSchema>[]>(exactCacheKey);
    if (cachedExact && cachedExact.length > 0) {
      resultMap.set(ctx.eventId, cachedExact);
      continue;
    }

    const cachedEvent = sharedCache.get<z.infer<typeof GeminiEstimateSchema>[]>(eventCacheKey) || [];
    const matchedInCache = ctx.candidateSelections.filter((cs) =>
      cachedEvent.some(
        (ce) =>
          ce.selection.toLowerCase() === cs.selection.toLowerCase() &&
          ce.market.toLowerCase() === cs.market.toLowerCase()
      )
    );

    if (matchedInCache.length === ctx.candidateSelections.length && cachedEvent.length > 0) {
      resultMap.set(ctx.eventId, cachedEvent);
      continue;
    }

    uncachedContexts.push(ctx);
  }

  if (uncachedContexts.length === 0) {
    return resultMap;
  }

  // Blocchi da 3 partite per risposte fulminee e parallele a basso tempo di attesa
  const chunkSize = 3;
  const chunks: EventAIContextPayload[][] = [];
  for (let i = 0; i < uncachedContexts.length; i += chunkSize) {
    chunks.push(uncachedContexts.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i += 2) {
    const activeChunks = chunks.slice(i, i + 2);
    await Promise.all(
      activeChunks.map(async (chunk) => {
        try {
          const eventsBlock = chunk
            .map((ev, idx) => {
              const stats =
                ev.statsSummary.length > 0
                  ? ev.statsSummary.slice(0, 4).join(' | ')
                  : 'Nessuna statistica ufficiale di classifica disponibile.';
              const news =
                ev.news.length > 0
                  ? ev.news
                      .slice(0, 3)
                      .map((n) => `[${n.source}] ${n.title}${n.excerpt ? ` (${n.excerpt.slice(0, 120)})` : ''}`)
                      .join(' | ')
                  : 'Nessuna notizia recente nei feed RSS.';
              const sels = ev.candidateSelections
                .map(
                  (s) =>
                    `   - market="${s.market}", selection="${s.selection}", quota=${s.effectiveOdds.toFixed(
                      2
                    )}, p_mercato=${s.pMarket.toFixed(4)}`
                )
                .join('\n');
              return `PARTITA ${idx + 1}: event_id="${ev.eventId}" | ${ev.eventName} (${ev.competitionName}) | Data: ${ev.commenceTime}
Statistiche & Marcatori: ${stats}
Notizie & Probabili Formazioni: ${news}
Selezioni da stimare:
${sels}`;
            })
            .join('\n\n---\n\n');

          const prompt = `Analizza le seguenti ${chunk.length} partite di calcio e valuta TUTTE le selezioni candidate indicate per ciascuna partita.
ISTRUZIONI FONDAMENTALI:
1. Per ciascuna partita controlla la probabile formazione, i titolari attesi, i marcatori/assistman stagionali e gli eventuali infortunati/squalificati, e INCROCIALI con la classifica, le notizie RSS e le probabilità di mercato depurate (p_mercato).
2. Riporta l'incrocio tra formazione/titolari e statistiche in "key_factors", e segnala dubbi di formazione o assenze in "red_flags". Registra eventuali dati mancanti in "data_gaps".
3. Quando una selezione riguarda un mercato Giocatori e contiene un ruolo generico, compila OBBLIGATORIAMENTE il campo "player_name" con il Nome e Cognome reale del titolare previsto in formazione.

${eventsBlock}

Restituisci ESCLUSIVAMENTE un oggetto JSON compatto con questa struttura esatta (in italiano):
{
  "events": [
    {
      "event_id": "<event_id esatto della partita>",
      "estimates": [
        {
          "market": "<market esatto>",
          "selection": "<selection esatta>",
          "player_name": "<Nome Cognome (Squadra) obbligatorio per mercati Giocatori, altrimenti ometti>",
          "p_ai": 0.62,
          "confidence": 0.68,
          "key_factors": ["<incrocio probabile formazione + motivazione tecnica in italiano>"],
          "red_flags": ["<incognita di formazione o rischio specifico in italiano>"],
          "data_gaps": ["<lacune se presenti>"],
          "sources": ["<fonti usate>"]
        }
      ]
    }
  ]
}`;

          const { text: rawText, sources } = await callGeminiWithFallback(prompt, 2500, 14000, false);
          const rawParsed = extractCleanJsonBlock(rawText) as {
            events?: Array<{ event_id?: string; estimates?: unknown[] }>;
          };

          const rawEventsList = Array.isArray(rawParsed?.events) ? rawParsed.events : [];
          for (const evItem of rawEventsList) {
            const evId = typeof evItem?.event_id === 'string' ? evItem.event_id.trim() : '';
            if (!evId) continue;
            const origCtx = chunk.find((c) => c.eventId === evId);
            const rawEsts = Array.isArray(evItem.estimates) ? evItem.estimates : [];
            const normalized = rawEsts
              .map((e) =>
                typeof e === 'object' && e !== null
                  ? normalizeSingleEstimateObject(e as Record<string, unknown>, evId, origCtx, sources)
                  : null
              )
              .filter((e): e is z.infer<typeof GeminiEstimateSchema> => e !== null);

            if (normalized.length > 0) {
              const prevEventEsts =
                sharedCache.get<z.infer<typeof GeminiEstimateSchema>[]>(`gemini:event_latest_v3:${evId}`) || [];
              const mergedMap = new Map<string, z.infer<typeof GeminiEstimateSchema>>();
              for (const oldE of prevEventEsts) {
                mergedMap.set(`${oldE.market.toLowerCase()}::${oldE.selection.toLowerCase()}`, oldE);
              }
              for (const newE of normalized) {
                mergedMap.set(`${newE.market.toLowerCase()}::${newE.selection.toLowerCase()}`, newE);
              }
              const mergedList = Array.from(mergedMap.values());

              resultMap.set(evId, mergedList);
              if (origCtx) {
                const selKey = origCtx.candidateSelections.map((s) => s.selection).join('|');
                sharedCache.set(`gemini:est_v3:${evId}:${selKey}`, mergedList, TTL_GEMINI_CACHE_MS);
                sharedCache.set(`gemini:event_latest_v3:${evId}`, mergedList, TTL_GEMINI_CACHE_MS);
              }
            }
          }
        } catch {
          // Se la chiamata a blocchi fallisce, le singole partite verranno lasciate a "solo mercato"
        }
      })
    );
  }

  return resultMap;
}
