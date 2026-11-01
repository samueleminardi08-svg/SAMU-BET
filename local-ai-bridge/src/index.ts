import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

dotenv.config({ path: '../.env' });
dotenv.config();

// Schemi Zod (Sezione 11)
export const AIEstimateSchema = z.object({
  event_id: z.string(),
  market: z.string(),
  selection: z.string(),
  p_ai: z.number().min(0.01).max(0.99),
  confidence: z.number().min(0).max(1),
  key_factors: z.array(z.string()).min(1).max(6),
  red_flags: z.array(z.string()).max(6)
});

export const AIBatchEventEstimateSchema = z.object({
  event_id: z.string(),
  estimates: z.array(AIEstimateSchema).min(1)
});

const BridgeEventContextSchema = z.object({
  eventContext: z.object({
    eventId: z.string().max(150),
    sport: z.enum(['football', 'f1', 'tennis']),
    competitionName: z.string().max(150),
    eventName: z.string().max(200),
    commenceTime: z.string().max(60),
    statsSummary: z.array(z.string().max(400)).max(10),
    news: z
      .array(
        z.object({
          title: z.string().max(250),
          pubDate: z.string().max(80),
          excerpt: z.string().max(350),
          link: z.string().max(500),
          source: z.string().max(120)
        })
      )
      .max(5),
    candidateSelections: z
      .array(
        z.object({
          selectionId: z.string().max(220),
          market: z.string().max(120),
          selection: z.string().max(120),
          line: z.number().optional(),
          effectiveOdds: z.number().min(1.01).max(1000),
          pMarket: z.number().min(0.001).max(0.999)
        })
      )
      .min(1)
      .max(10)
  })
});

// Prompt di sistema obbligatorio (Sezione 10)
export const SYSTEM_PROMPT = `Sei un analista sportivo quantitativo. Ti viene data una selezione
(evento, mercato, esito) con la probabilità di mercato già depurata dal margine.
Ti vengono forniti anche statistiche essenziali e notizie recenti (titolo, data, fonte).
Usa ESCLUSIVAMENTE queste informazioni (forma, infortuni, squalifiche, calendario,
condizioni) per stimare la probabilità che l'esito si verifichi.
Se non ci sono notizie pertinenti, dichiaralo in "red_flags" e abbassa "confidence".

Regole:
- Non inventare dati. Se le informazioni sono scarse, abbassa "confidence".
- Parti dalla probabilità di mercato e spostala solo se hai motivi concreti.
- Rispondi ESCLUSIVAMENTE con JSON valido, senza testo extra né markdown.`;

const SINGLE_ESTIMATE_JSON_SCHEMA = {
  name: 'ai_estimate',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      event_id: { type: 'string' },
      market: { type: 'string' },
      selection: { type: 'string' },
      p_ai: { type: 'number' },
      confidence: { type: 'number' },
      key_factors: { type: 'array', items: { type: 'string' } },
      red_flags: { type: 'array', items: { type: 'string' } }
    },
    required: ['event_id', 'market', 'selection', 'p_ai', 'confidence', 'key_factors', 'red_flags'],
    additionalProperties: false
  }
};

const BATCH_ESTIMATE_JSON_SCHEMA = {
  name: 'ai_batch_estimate',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      event_id: { type: 'string' },
      estimates: {
        type: 'array',
        items: SINGLE_ESTIMATE_JSON_SCHEMA.schema
      }
    },
    required: ['event_id', 'estimates'],
    additionalProperties: false
  }
};

export function extractJsonFromModelOutput(rawText: string): unknown {
  const noThink = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const noFences = noThink
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(noFences);
  } catch {
    const start = noFences.indexOf('{');
    const end = noFences.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(noFences.slice(start, end + 1));
    }
    throw new Error('JSON non trovato nella risposta del modello');
  }
}

export interface BridgeConfig {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  bridgeToken: string;
  allowedOrigins: string[];
  maxRequestsPerMinute: number;
  maxPromptChars: number;
}

export function getBridgeConfigFromEnv(): BridgeConfig {
  const rawOrigins = process.env.ALLOWED_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173';
  return {
    llmBaseUrl: (process.env.LLM_BASE_URL || 'http://127.0.0.1:8888/v1').replace(/\/+$/, ''),
    llmApiKey: process.env.LLM_API_KEY || '',
    llmModel: process.env.LLM_MODEL || 'XHToken/Spark-X2.6-1.7B-GGUF',
    bridgeToken: process.env.BRIDGE_TOKEN || '',
    allowedOrigins: rawOrigins
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    maxRequestsPerMinute: 30,
    maxPromptChars: 6000 // < 1500 token
  };
}

export function createBridgeApp(customConfig?: Partial<BridgeConfig>) {
  const cfg: BridgeConfig = { ...getBridgeConfigFromEnv(), ...customConfig };
  const app = express();

  // Sicurezza: verifica che Unsloth sia puntato solo su loopback locale (127.0.0.1 / localhost)
  const parsedLlmUrl = new URL(cfg.llmBaseUrl);
  if (parsedLlmUrl.hostname !== '127.0.0.1' && parsedLlmUrl.hostname !== 'localhost') {
    console.warn(
      `[SICUREZZA BRIDGE] Attenzione: LLM_BASE_URL (${cfg.llmBaseUrl}) non è su loopback 127.0.0.1!`
    );
  }

  // Limite dimensione body (protezione contro payload giganti)
  app.use(express.json({ limit: '16kb' }));

  // 1. Controllo rigoroso CORS con ALLOWED_ORIGIN (Sez. 5.2 & Test 5d)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed =
        cfg.allowedOrigins.includes('*') || cfg.allowedOrigins.includes(origin);
      if (!isAllowed) {
        res.status(403).json({
          error: `Origine CORS non consentita: ${origin}. Configura ALLOWED_ORIGIN nel bridge.`
        });
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 2. Rate limiting per IP
  const ipTimestamps = new Map<string, number[]>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const ip = req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const recent = (ipTimestamps.get(ip) || []).filter((t) => now - t < 60000);
    if (recent.length >= cfg.maxRequestsPerMinute) {
      res.status(429).json({ error: 'Rate limit superato sul local-ai-bridge.' });
      return;
    }
    recent.push(now);
    ipTimestamps.set(ip, recent);
    next();
  });

  // 3. Autenticazione obbligatoria con Bearer Token (BRIDGE_TOKEN)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!cfg.bridgeToken || cfg.bridgeToken.length < 8) {
      res.status(500).json({
        error: 'BRIDGE_TOKEN non configurato o troppo corto sul PC. Imposta un token sicuro in .env.'
      });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const expectedBridge = `Bearer ${cfg.bridgeToken}`;
    const expectedLlmKey = cfg.llmApiKey ? `Bearer ${cfg.llmApiKey}` : '';
    if (authHeader !== expectedBridge && (!expectedLlmKey || authHeader !== expectedLlmKey)) {
      res.status(401).json({ error: 'Token del bridge mancante o non valido (401).' });
      return;
    }
    next();
  });

  // GET /health (e alias /v1/health) — Stato del bridge e verifica connessione con Unsloth su 127.0.0.1
  app.get(['/health', '/v1/health'], async (_req: Request, res: Response) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const headers: Record<string, string> = {};
      if (cfg.llmApiKey) {
        headers.Authorization = `Bearer ${cfg.llmApiKey}`;
      }
      const r = await fetch(`${cfg.llmBaseUrl}/models`, {
        headers,
        signal: controller.signal
      });

      if (!r.ok) {
        res.json({
          status: 'bridge_ok_unsloth_error',
          bridgeOnline: true,
          unslothReachable: false,
          configuredModel: cfg.llmModel,
          detail: `Unsloth ha risposto con HTTP ${r.status}. Verifica LLM_API_KEY.`
        });
        return;
      }

      const data = (await r.json()) as {
        data?: Array<{ id: string; loaded?: boolean; status?: { value?: string } }>;
      };
      const modelsList = data.data || [];
      const loadedModels = modelsList.map((m) => m.id);
      const activelyLoaded = modelsList.find(
        (m) => m.loaded === true || m.status?.value === 'loaded'
      );
      if (activelyLoaded) {
        cfg.llmModel = activelyLoaded.id;
      } else if (loadedModels.length > 0 && !loadedModels.includes(cfg.llmModel)) {
        cfg.llmModel = loadedModels[0];
      }

      res.json({
        status: 'ok',
        bridgeOnline: true,
        unslothReachable: true,
        configuredModel: cfg.llmModel,
        loadedModels
      });
    } catch {
      res.json({
        status: 'bridge_ok_unsloth_offline',
        bridgeOnline: true,
        unslothReachable: false,
        configuredModel: cfg.llmModel,
        detail: `Unsloth non risponde su ${cfg.llmBaseUrl}. Avvia 'unsloth run --model ${cfg.llmModel} --host 127.0.0.1 --port 8888 --disable-tools'.`
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // POST /estimate (e alias /v1/estimate) — Stima AI di un evento
  app.post(['/estimate', '/v1/estimate'], async (req: Request, res: Response) => {
    const parsedReq = BridgeEventContextSchema.safeParse(req.body);
    if (!parsedReq.success) {
      res.status(400).json({
        error: 'Payload eventContext non valido.',
        details: parsedReq.error.flatten()
      });
      return;
    }

    const { eventContext } = parsedReq.data;
    const isSingle = eventContext.candidateSelections.length === 1;

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
        : 'nessuna notizia recente trovata (dichiara questa assenza in "red_flags" e abbassa "confidence" < 0.5).';

    const selectionsText = eventContext.candidateSelections
      .map(
        (s, i) =>
          `${i + 1}) market="${s.market}", selection="${s.selection}", quota=${s.effectiveOdds.toFixed(
            2
          )}, p_mercato=${s.pMarket.toFixed(4)}`
      )
      .join('\n');

    const userPrompt = `/no_think
Evento: ${eventContext.eventName} (${eventContext.competitionName}) - Data: ${eventContext.commenceTime}
event_id: "${eventContext.eventId}"

Statistiche essenziali:
${statsBlock}

Notizie recenti (RSS):
${newsBlock}

Selezioni candidate da stimare:
${selectionsText}

Rispondi ESCLUSIVAMENTE con JSON valido avente le chiavi seguenti (inserisci motivazioni reali e specifiche in italiano in key_factors e red_flags basate su statistiche e notizie dell'evento):
{"event_id":"${eventContext.eventId}","estimates":[{"event_id":"${eventContext.eventId}","market":"<nome_mercato>","selection":"<esito>","p_ai":<probabilita_0_1>,"confidence":<confidenza_0_1>,"key_factors":["<motivazione tecnica in italiano>"],"red_flags":["<incognita o assenza notizie in italiano>"]}]} `;

    if (userPrompt.length > cfg.maxPromptChars) {
      res.status(413).json({
        error: `Prompt troppo lungo (${userPrompt.length} caratteri, max ${cfg.maxPromptChars}).`
      });
      return;
    }

    async function callUnsloth(useStructuredSchema: boolean): Promise<unknown> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 85000);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (cfg.llmApiKey) {
          headers.Authorization = `Bearer ${cfg.llmApiKey}`;
        }

        // MAI inviare campi tools / tool_choice / functions per sicurezza (Sez. 5.2)
        const bodyPayload: Record<string, unknown> = {
          model: cfg.llmModel,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 650,
          // Disattiva modalità thinking su Qwen3 / modelli reasoning per risparmiare CPU
          chat_template_kwargs: { enable_thinking: false }
        };

        if (useStructuredSchema) {
          bodyPayload.response_format = {
            type: 'json_schema',
            json_schema: isSingle ? SINGLE_ESTIMATE_JSON_SCHEMA : BATCH_ESTIMATE_JSON_SCHEMA
          };
        }

        const llmRes = await fetch(`${cfg.llmBaseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyPayload),
          signal: controller.signal
        });

        if (!llmRes.ok) {
          throw new Error(`Unsloth HTTP ${llmRes.status}`);
        }

        const completion = (await llmRes.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = completion.choices?.[0]?.message?.content || '';
        return extractJsonFromModelOutput(content);
      } finally {
        clearTimeout(timeout);
      }
    }

    function validateOutput(rawJson: unknown) {
      if (isSingle) {
        const asRecord = rawJson as Record<string, unknown>;
        if (Array.isArray(asRecord?.estimates) && asRecord.estimates.length > 0) {
          return {
            event_id: eventContext.eventId,
            estimates: [AIEstimateSchema.parse(asRecord.estimates[0])]
          };
        }
        const single = AIEstimateSchema.parse(rawJson);
        return {
          event_id: eventContext.eventId,
          estimates: [single]
        };
      }
      return AIBatchEventEstimateSchema.parse(rawJson);
    }

    // Tentativo 1: con response_format json_schema
    try {
      const raw1 = await callUnsloth(true);
      const valid1 = validateOutput(raw1);
      res.json(valid1);
      return;
    } catch (firstErr) {
      // Tentativo 2 (1 solo retry come da Sez. 5.2): estrazione JSON tollerante senza response_format
      try {
        const raw2 = await callUnsloth(false);
        const valid2 = validateOutput(raw2);
        res.json(valid2);
        return;
      } catch (secondErr) {
        const msg = secondErr instanceof Error ? secondErr.message : String(firstErr);
        res.status(502).json({
          error: 'Impossibile ottenere una risposta JSON valida dal modello locale Unsloth.',
          detail: msg
        });
      }
    }
  });

  return app;
}

const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || process.env.PORT) || 8787;
if (process.env.NODE_ENV !== 'test') {
  const bridgeApp = createBridgeApp();
  bridgeApp.listen(BRIDGE_PORT, '127.0.0.1', () => {
    const cfg = getBridgeConfigFromEnv();
    console.log('============================================================');
    console.log(`[SAMU BET local-ai-bridge] Attivo su http://127.0.0.1:${BRIDGE_PORT}`);
    console.log(`-> Unsloth Target : ${cfg.llmBaseUrl} (Modello: ${cfg.llmModel})`);
    console.log(`-> CORS Consentiti: ${cfg.allowedOrigins.join(', ')}`);
    console.log('============================================================');
  });
}

