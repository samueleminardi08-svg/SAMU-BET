import { BettingSlipResult, SlipReview, SlipReviewSchema } from '../types/models.js';
import { getGeminiConfig, getOrderedCandidateModels, markModelCooldown } from '../providers/geminiProvider.js';
import { sharedCache } from '../cache/cacheManager.js';

const SYSTEM_PROMPT_REVIEW = `Sei un supervisore quantitativo di scommesse sportive. Ti viene presentata una schedina già composta.
Il tuo compito è valutarla criticamente con ragionamento approfondito:
1. Rileva correlazioni nascoste o rischi congiunti tra le selezioni (es. troppe partite della stessa lega, stanchezza da coppe europee infrasettimanali, dipendenza dallo stesso pattern di gol).
2. Valuta la varietà dei mercati: se ci sono troppe gambe identiche (es. tutti Over 1.5 o tutti 1X2), stabilisci se questo aumenta la fragilità e suggerisci un valore massimo consigliato di selezioni identiche ("recommendedMaxSameMarket", intero da 1 a 5).
3. Identifica la gamba più debole ("weakestLegId", selection id esatto) e se opportuno suggerisci una tipologia di scambio più solida ("suggestedSwap").
4. Assegna un verdetto complessivo: "ok", "attenzione", oppure "sconsigliata".
5. Fornisci un elenco di avvisi sintetici e costruttivi ("warnings").

REGOLA ASSOLUTA: NON modificare né ricalcolare le probabilità matematiche o le quote. Esprimi solo un giudizio analitico qualitativo.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido in italiano con questa struttura:
{
  "verdict": "ok" | "attenzione" | "sconsigliata",
  "warnings": ["avviso 1", "avviso 2"],
  "weakestLegId": "<id selezione più vulnerabile o omesso>",
  "suggestedSwap": {
    "removeSelectionId": "<id>",
    "suggestedAlternative": "<mercato alternativo>",
    "reason": "<motivo breve>"
  },
  "recommendedMaxSameMarket": 2,
  "diversityRationale": "<breve spiegazione del perché limitare o permettere mercati uguali>"
}`;

export async function reviewSlipWithGemini(
  slip: BettingSlipResult,
  targetOdds: number,
  riskLevel: number
): Promise<SlipReview | null> {
  const { apiKey, model, configured } = getGeminiConfig();
  if (!configured || slip.selections.length === 0) {
    return null;
  }

  const legsDescription = slip.selections
    .map(
      (s, idx) =>
        `Gamba ${idx + 1} [ID: "${s.id}"]:\n` +
        `  - Partita: ${s.eventName} (${s.competitionName}) - Inizio: ${s.commenceTime}\n` +
        `  - Mercato: ${s.market} | Scelta: ${s.selection} | Quota: ${s.effectiveOdds.toFixed(2)}\n` +
        `  - Probabilità stimata: ${(s.pFinal * 100).toFixed(1)}% | Origine: ${s.sourceType} (${s.estimationMode})\n` +
        `  - Fattori chiave: ${s.keyFactors.slice(0, 2).join('; ')}\n` +
        `  - Red flags: ${s.redFlags.slice(0, 2).join('; ')}`
    )
    .join('\n\n');

  const userPrompt = `Rivedi la seguente schedina sportiva composta da ${slip.selections.length} selezioni:
Quota Totale: ${slip.totalOdds.toFixed(2)} (Quota Obiettivo: ${targetOdds.toFixed(2)})
Probabilità Combinata Stimata: ${(slip.combinedProbability * 100).toFixed(2)}%
Livello di Rischio Impostato: ${riskLevel}/11

SELEZIONI IN SCHEDINA:
${legsDescription}

Valuta correlazioni, concentrazione di mercato e coerenza con il rischio. Rispondi SOLO con il JSON richiesto.`;

  const reviewThinkingLevel = process.env.GEMINI_THINKING_LEVEL_REVIEW || 'low';
  const candidateModels = getOrderedCandidateModels(model);

  for (const activeModel of candidateModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const t0 = Date.now();
    try {
      const isGemma = activeModel.startsWith('gemma-');
      const generationConfig: Record<string, unknown> = {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      };

      if (!isGemma) {
        generationConfig.thinkingConfig = {
          thinkingLevel: reviewThinkingLevel
        };
      }

      const body = {
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT_REVIEW }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        activeModel
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        markModelCooldown(activeModel, res.status);
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
      const text = parts
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text!)
        .join('\n')
        .trim();

      if (!text) continue;

      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const startIdx = cleaned.indexOf('{');
      const endIdx = cleaned.lastIndexOf('}');
      const jsonStr = startIdx !== -1 && endIdx > startIdx ? cleaned.slice(startIdx, endIdx + 1) : cleaned;

      const parsed = JSON.parse(jsonStr);
      const validated = SlipReviewSchema.safeParse(parsed);

      sharedCache.recordAiLatency(Date.now() - t0, activeModel);

      if (validated.success) {
        return validated.data;
      }
    } catch {
      // Prova con il prossimo modello candidato
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

