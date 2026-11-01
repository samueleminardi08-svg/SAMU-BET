import { EventAIContextPayload } from '../types/models.js';

/**
 * Prompt di sistema obbligatorio della Sezione 10
 */
export const QUANT_ANALYST_SYSTEM_PROMPT = `Sei un analista sportivo quantitativo. Ti viene data una selezione
(evento, mercato, esito) con la probabilità di mercato già depurata dal margine.
Ti vengono forniti anche statistiche essenziali e notizie recenti (titolo, data, fonte).
Usa ESCLUSIVAMENTE queste informazioni (forma, infortuni, squalifiche, calendario,
condizioni) per stimare la probabilità che l'esito si verifichi.
Se non ci sono notizie pertinenti, dichiaralo in "red_flags" e abbassa "confidence".

Regole:
- Non inventare dati. Se le informazioni sono scarse, abbassa "confidence".
- Parti dalla probabilità di mercato e spostala solo se hai motivi concreti.
- Rispondi ESCLUSIVAMENTE con JSON valido, senza testo extra né markdown.`;

/**
 * Costruisce un prompt utente conciso (< 1500 token) con tutte le selezioni candidate
 * dello stesso evento, le statistiche essenziali e fino a 5 notizie RSS pertinenti.
 */
export function buildEventUserPrompt(ctx: EventAIContextPayload): string {
  const statsBlock =
    ctx.statsSummary.length > 0
      ? ctx.statsSummary.map((s) => `- ${s}`).join('\n')
      : '- Nessuna statistica di classifica disponibile per questa competizione.';

  const newsBlock =
    ctx.news.length > 0
      ? ctx.news
          .slice(0, 5)
          .map(
            (n, i) =>
              `${i + 1}. [${n.source} | ${n.pubDate.slice(0, 16)}] ${n.title}${
                n.excerpt ? ` — ${n.excerpt}` : ''
              }`
          )
          .join('\n')
      : 'nessuna notizia recente trovata (dichiara questa assenza in red_flags e abbassa confidence < 0.5).';

  const selectionsBlock = ctx.candidateSelections
    .map(
      (s, i) =>
        `${i + 1}) market="${s.market}", selection="${s.selection}", quota=${s.effectiveOdds.toFixed(
          2
        )}, p_mercato=${s.pMarket.toFixed(4)}`
    )
    .join('\n');

  if (ctx.candidateSelections.length === 1) {
    const sel = ctx.candidateSelections[0];
    return `/no_think
Evento: ${ctx.eventName} (${ctx.competitionName}) - Data: ${ctx.commenceTime}
event_id: "${ctx.eventId}"
Selezione da valutare:
market: "${sel.market}"
selection: "${sel.selection}"
probabilità di mercato depurata (p_mercato): ${sel.pMarket.toFixed(4)} (quota ${sel.effectiveOdds.toFixed(2)})

Statistiche essenziali:
${statsBlock}

Notizie recenti (RSS):
${newsBlock}

Restituisci ESCLUSIVAMENTE un oggetto JSON conforme allo schema:
{
  "event_id": "${ctx.eventId}",
  "market": "${sel.market}",
  "selection": "${sel.selection}",
  "p_ai": <numero tra 0.01 e 0.99, entro ±0.10 da ${sel.pMarket.toFixed(4)}>,
  "confidence": <numero tra 0.0 e 1.0>,
  "key_factors": ["fattore 1", "fattore 2"],
  "red_flags": ["rischio 1"]
}`;
  }

  return `/no_think
Evento: ${ctx.eventName} (${ctx.competitionName}) - Data: ${ctx.commenceTime}
event_id: "${ctx.eventId}"

Statistiche essenziali:
${statsBlock}

Notizie recenti (RSS):
${newsBlock}

Selezioni candidate dell'evento da stimare:
${selectionsBlock}

Restituisci ESCLUSIVAMENTE un oggetto JSON con la chiave "estimates" contenente un elemento per ciascuna selezione candidata, ciascuno con lo schema esatto:
{
  "event_id": "${ctx.eventId}",
  "estimates": [
    {
      "event_id": "${ctx.eventId}",
      "market": "string",
      "selection": "string",
      "p_ai": 0.0,
      "confidence": 0.0,
      "key_factors": ["string"],
      "red_flags": ["string"]
    }
  ]
}`;
}

/**
 * Estrae in modo tollerante un oggetto JSON anche se il modello ha aggiunto tag <think> o blocchi markdown
 */
export function extractTolerantJson(rawText: string): unknown {
  const withoutThink = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const withoutFences = withoutThink
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFences);
  } catch {
    const firstBrace = withoutFences.indexOf('{');
    const lastBrace = withoutFences.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = withoutFences.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }
    throw new Error('Impossibile estrarre un oggetto JSON valido dalla risposta del modello.');
  }
}

