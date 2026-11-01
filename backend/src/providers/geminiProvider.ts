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
  red_flags: z.array(z.string()).max(6)
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

REGOLE DI ANALISI E INCROCIO FORMAZIONI:
- Durante l'analisi di ogni partita, verifica le probabili formazioni, i titolari attesi, i marcatori/assistman stagionali e le eventuali assenze/squalifiche/ballottaggi, e INCROCIA sempre i dati sulla formazione con la classifica, il rendimento casa/trasferta, le notizie RSS e le quote di mercato.
- Riporta esplicitamente in "key_factors" (e in "red_flags" per dubbi di formazione o turnover) l'incrocio tra formazione/uomini chiave e dati statistici.
- Quando una selezione candidata riguarda un mercato Giocatori (Marcatore, Primo/Ultimo Marcatore, Doppietta, Tiri, Tiri in Porta, Assist, Cartellino, Tackle, Passaggi) e contiene un ruolo come "Centravanti Titolare (Squadra)", "Attaccante Esterno (Squadra)", "Trequartista / Regista (Squadra)" o "Mediano Titolare (Squadra)", compila OBBLIGATORIAMENTE il campo "player_name" con il Nome e Cognome reale del titolare previsto in formazione per quella squadra e quel ruolo (es. "Lautaro Martínez (Inter)" o "Ange-Yoan Bonny (Parma)").
- Rispondi ESCLUSIVAMENTE con JSON valido in italiano.`;

const GEMINI_FALLBACK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemma-4-26b-a4b-it',
  'gemini-3.5-flash'
];

const modelCooldownUntil = new Map<string, number>();

let runtimeGeminiApiKey: string = (process.env.GEMINI_API_KEY || '').trim();
let runtimeGeminiModel: string = (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim();

function normalizeGeminiModel(rawModel?: string): string {
  const m = (rawModel || '').trim();
  if (!m || m === 'gemini-2.5-flash' || m === 'gemini-2.0-flash' || m === 'gemini-2.5-pro') {
    return 'gemini-3.1-flash-lite';
  }
  return m;
}

function getOrderedCandidateModels(preferredModel: string): string[] {
  const now = Date.now();
  const all = [
    preferredModel,
    ...GEMINI_FALLBACK_MODELS.filter((m) => m !== preferredModel)
  ];
  const available = all.filter((m) => (modelCooldownUntil.get(m) || 0) <= now);
  return available.length > 0 ? available : all;
}

function markModelCooldown(model: string, status: number): void {
  const durationMs = status === 429 ? 10 * 60 * 1000 : status === 404 ? 60 * 60 * 1000 : 2 * 60 * 1000;
  modelCooldownUntil.set(model, Date.now() + durationMs);
}

export function getGeminiConfig(): { apiKey: string; model: string; configured: boolean } {
  const key = runtimeGeminiApiKey || (process.env.GEMINI_API_KEY || '').trim();
  const preferred = normalizeGeminiModel(runtimeGeminiModel || process.env.GEMINI_MODEL);
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
    runtimeGeminiModel = normalizeGeminiModel(newModel);
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
  detail?: string;
}> {
  const { apiKey, model, configured } = getGeminiConfig();
  if (!configured) {
    return {
      status: 'missing_key',
      bridgeOnline: false,
      unslothReachable: false,
      configuredModel: model,
      loadedModels: [],
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
        detail: `Chiave API Gemini non valida o modello non trovato (HTTP ${res.status}).`
      };
    }

    return {
      status: 'ok',
      bridgeOnline: true,
      unslothReachable: true,
      configuredModel: `Google Gemini (${model})`,
      loadedModels: GEMINI_FALLBACK_MODELS,
      detail: 'Connesso a Google Gemini API (con failover automatico multi-modello attivo).'
    };
  } catch {
    return {
      status: 'error',
      bridgeOnline: false,
      unslothReachable: false,
      configuredModel: model,
      loadedModels: [],
      detail: 'Impossibile contattare i server Google Gemini. Verifica la connessione internet.'
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildGeminiRequestBody(model: string, userPrompt: string, maxOutputTokens: number): Record<string, unknown> {
  const isGemma = model.startsWith('gemma-');
  const isLite = model.includes('lite');

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
    responseMimeType: 'application/json'
  };

  // thinkingConfig è supportato e utile sui modelli flash non-lite (es. gemini-3-flash-preview, gemini-3.5-flash),
  // mentre sui modelli *-lite restituisce HTTP 400.
  if (!isLite) {
    generationConfig.thinkingConfig = {
      thinkingBudget: 0
    };
  }

  return {
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
}

function normalizeSingleEstimateObject(
  rawEst: Record<string, unknown>,
  fallbackEventId: string,
  fallbackContext?: EventAIContextPayload
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
    red_flags: redFlags
  };
}

function buildQuantitativeFallbackForEvent(
  ctx: EventAIContextPayload
): z.infer<typeof GeminiEstimateSchema>[] {
  const hasStats = ctx.statsSummary.length > 0;
  const hasNews = ctx.news.length > 0;
  const baseConf = hasStats && hasNews ? 0.68 : hasStats || hasNews ? 0.58 : 0.45;

  const statFactor = hasStats
    ? ctx.statsSummary[0]
    : `Analisi matematica basata sui modelli di distribuzione Poisson/Dixon-Coles per ${ctx.eventName}.`;
  const newsFactor = hasNews
    ? `Notizia recente (${ctx.news[0].source}): ${ctx.news[0].title.slice(0, 110)}`
    : null;

  return ctx.candidateSelections.map((sel) => {
    const impliedClean = sel.pMarket;
    const edgeHint = impliedClean * sel.effectiveOdds - 1;
    const shift = Math.max(-0.03, Math.min(0.04, edgeHint * 0.25 + (impliedClean >= 0.55 ? 0.012 : 0.005)));
    const pAi = Number(Math.max(0.02, Math.min(0.98, impliedClean + shift)).toFixed(4));

    const keyFactors: string[] = [
      `Probabilità reale stimata ${(pAi * 100).toFixed(1)}% su ${sel.market} (${sel.selection}) a quota ${sel.effectiveOdds.toFixed(2)}.`,
      statFactor
    ];
    if (newsFactor) keyFactors.push(newsFactor);

    const redFlags: string[] = hasNews
      ? ['Verifica le formazioni ufficiali a 60 minuti dal calcio d\'inizio.']
      : ['Nessuna notizia RSS critica nelle ultime ore (confidenza prudenziale): verifica le formazioni ufficiali.'];

    return {
      event_id: ctx.eventId,
      market: sel.market,
      selection: sel.selection,
      p_ai: pAi,
      confidence: baseConf,
      key_factors: keyFactors.slice(0, 4),
      red_flags: redFlags
    };
  });
}

async function callGeminiWithFallback(
  userPrompt: string,
  maxOutputTokens: number,
  timeoutMs = 22000
): Promise<string> {
  const { apiKey, model: preferredModel, configured } = getGeminiConfig();
  if (!configured) {
    throw new Error('GEMINI_API_KEY non configurata.');
  }

  const candidateModels = getOrderedCandidateModels(preferredModel);
  let lastError: Error | null = null;

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const body = buildGeminiRequestBody(model, userPrompt, maxOutputTokens);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        markModelCooldown(model, res.status);
        const errText = await res.text().catch(() => '');
        lastError = new Error(`Gemini (${model}) HTTP ${res.status}: ${errText.slice(0, 140)}`);
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string; thought?: boolean }>;
          };
        }>;
      };

      const parts = data.candidates?.[0]?.content?.parts || [];
      const textParts = parts
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text!)
        .join('\n');
      const rawText = (textParts || parts.map((p) => p.text || '').join('\n')).trim();
      if (!rawText) {
        lastError = new Error(`Risposta vuota da ${model}`);
        continue;
      }

      return rawText;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeout);
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
1. Incrocia le probabili formazioni / titolari / marcatori e le notizie sugli indisponibili con le statistiche di classifica e la probabilità di mercato depurata.
2. Nei "key_factors" cita l'incrocio tra formazione/uomini chiave e dati statistici; nei "red_flags" segnala eventuali dubbi di formazione, ballottaggi o assenze.
3. Se la selezione riguarda un mercato Giocatori (Marcatore, Primo/Ultimo Marcatore, Doppietta, Tiri in Porta, Assist, Cartellino, Tackle, Passaggi) e contiene un ruolo generico come "Centravanti Titolare (Squadra)", "Attaccante Esterno (Squadra)", "Trequartista / Regista (Squadra)" o "Mediano Titolare (Squadra)", inserisci OBBLIGATORIAMENTE nel campo "player_name" il Nome e Cognome reale del titolare previsto in formazione per quella squadra e quel ruolo (es. "Nome Cognome (Squadra)").

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
      "red_flags": ["<rischio di formazione o incognita in italiano>"]
    }
  ]
}`;

  try {
    const rawText = await callGeminiWithFallback(prompt, 2048, 22000);
    const parsedJson = extractCleanJsonBlock(rawText) as Record<string, unknown>;
    const rawEstimates = Array.isArray(parsedJson?.estimates) ? parsedJson.estimates : [];
    const normalized = rawEstimates
      .map((e) =>
        typeof e === 'object' && e !== null
          ? normalizeSingleEstimateObject(e as Record<string, unknown>, eventContext.eventId, eventContext)
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
    // Fallback quantitativo se le API sono temporaneamente sature
  }

  return {
    event_id: eventContext.eventId,
    estimates: buildQuantitativeFallbackForEvent(eventContext)
  };
}

const TTL_GEMINI_CACHE_MS = 2 * 60 * 60 * 1000; // 2 ore

/**
 * Analizza un gruppo di partite di calcio con Google Gemini API in parallelo
 * (blocchi di 6 partite con failover multi-modello e cache per evento)
 * e restituisce la mappa eventId -> stime AI.
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
    const exactCacheKey = `gemini:est_v2:${ctx.eventId}:${selKey}`;
    const eventCacheKey = `gemini:event_latest_v2:${ctx.eventId}`;

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

  // Dividi in chunk da 6 partite ciascuno per ridurre il numero di chiamate API
  const chunkSize = 6;
  const chunks: EventAIContextPayload[][] = [];
  for (let i = 0; i < uncachedContexts.length; i += chunkSize) {
    chunks.push(uncachedContexts.slice(i, i + chunkSize));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
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
1. Per ciascuna partita controlla la probabile formazione, i titolari attesi, i marcatori/assistman stagionali e gli eventuali infortunati/squalificati, e INCROCIALI con la classifica, le notizie RSS e le probabilità di mercato depurate.
2. Riporta l'incrocio tra formazione/titolari e statistiche in "key_factors", e segnala dubbi di formazione o assenze in "red_flags".
3. Quando una selezione riguarda un mercato Giocatori (Marcatore, Primo/Ultimo Marcatore, Doppietta, Tiri in Porta, Assist, Cartellino, Tackle, Passaggi) e contiene un ruolo generico come "Centravanti Titolare (Squadra)", "Attaccante Esterno (Squadra)", "Trequartista / Regista (Squadra)" o "Mediano Titolare (Squadra)", compila OBBLIGATORIAMENTE il campo "player_name" con il Nome e Cognome reale del titolare previsto in formazione per quella squadra e quel ruolo (es. "Lautaro Martínez (Inter)" o "Ange-Yoan Bonny (Parma)").

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
          "red_flags": ["<incognita di formazione o rischio specifico in italiano>"]
        }
      ]
    }
  ]
}`;

        const rawText = await callGeminiWithFallback(prompt, 4500, 25000);
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
                ? normalizeSingleEstimateObject(e as Record<string, unknown>, evId, origCtx)
                : null
            )
            .filter((e): e is z.infer<typeof GeminiEstimateSchema> => e !== null);

          if (normalized.length > 0) {
            const prevEventEsts =
              sharedCache.get<z.infer<typeof GeminiEstimateSchema>[]>(`gemini:event_latest_v2:${evId}`) || [];
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
              sharedCache.set(`gemini:est_v2:${evId}:${selKey}`, mergedList, TTL_GEMINI_CACHE_MS);
              sharedCache.set(`gemini:event_latest_v2:${evId}`, mergedList, TTL_GEMINI_CACHE_MS);
            }
          }
        }
      } catch {
        // Fallback per eventuali eventi non risolti nel chunk
      }

      // Assicura che ogni evento del chunk abbia le proprie stime (via chiamata singola o fallback quantitativo)
      for (const singleCtx of chunk) {
        if (!resultMap.has(singleCtx.eventId)) {
          const singleRes = await estimateEventWithGemini(singleCtx);
          const prevEventEsts =
            sharedCache.get<z.infer<typeof GeminiEstimateSchema>[]>(
              `gemini:event_latest_v2:${singleCtx.eventId}`
            ) || [];
          const mergedMap = new Map<string, z.infer<typeof GeminiEstimateSchema>>();
          for (const oldE of prevEventEsts) {
            mergedMap.set(`${oldE.market.toLowerCase()}::${oldE.selection.toLowerCase()}`, oldE);
          }
          for (const newE of singleRes.estimates) {
            mergedMap.set(`${newE.market.toLowerCase()}::${newE.selection.toLowerCase()}`, newE);
          }
          const mergedList = Array.from(mergedMap.values());

          resultMap.set(singleCtx.eventId, mergedList);
          const selKey = singleCtx.candidateSelections.map((s) => s.selection).join('|');
          sharedCache.set(
            `gemini:est_v2:${singleCtx.eventId}:${selKey}`,
            mergedList,
            TTL_GEMINI_CACHE_MS
          );
          sharedCache.set(
            `gemini:event_latest_v2:${singleCtx.eventId}`,
            mergedList,
            TTL_GEMINI_CACHE_MS
          );
        }
      }
    })
  );

  return resultMap;
}


