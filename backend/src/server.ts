import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { sharedCache } from './cache/cacheManager.js';
import { checkEnvironmentStatus, logStartupCheck } from './config/envCheck.js';
import {
  DEFAULT_MAX_AI_EVENTS,
  DEFAULT_TARGET_TOLERANCE,
  MIN_SELECTION_ODDS,
  getRiskRule
} from './config/riskConfig.js';
import {
  computeEvAndEdge,
  computeFinalProbability,
  computeMarketProbabilitiesFromOutcomes
} from './engine/probability.js';
import {
  buildCandidatePool,
  checkAutoSlipFeasibility,
  checkSlipFeasibility,
  evaluateMultiSportPermissionNeeded,
  findBestBettingSlip,
  findBestBettingSlipAuto
} from './engine/slipBuilder.js';
import { getF1EventStats } from './providers/f1StatsProvider.js';
import { getFootballEventStats } from './providers/footballStatsProvider.js';
import {
  analyzeEventsBatchWithGemini,
  checkGeminiHealth,
  estimateEventWithGemini,
  getGeminiConfig,
  updateGeminiConfig
} from './providers/geminiProvider.js';
import { getActiveOddsProvider } from './providers/oddsProvider.js';
import { getTennisEventStats } from './providers/tennisStatsProvider.js';
import { fetchSportRssItems, matchNewsForEvent } from './rss/rssService.js';
import {
  AnalyzeRequestSchema,
  CandidateSelection,
  EventAIContextPayload,
  MarketGroupKey,
  RssNewsItem,
  SportKey
} from './types/models.js';

dotenv.config({ path: '../.env' });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

const startupReport = logStartupCheck();

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    envReport: checkEnvironmentStatus(),
    quota: sharedCache.getQuotaStatus(),
    serverTime: new Date().toISOString()
  });
});

app.get('/api/ai/health', async (_req: Request, res: Response) => {
  const health = await checkGeminiHealth();
  res.json(health);
});

app.post('/api/ai/config', async (req: Request, res: Response) => {
  const { apiKey, model } = (req.body || {}) as { apiKey?: string; model?: string };
  if (typeof apiKey === 'string') {
    updateGeminiConfig(apiKey, model);
  }
  const health = await checkGeminiHealth();
  res.json({
    ...health,
    hasKeyConfigured: getGeminiConfig().configured
  });
});

app.post('/api/ai/estimate', async (req: Request, res: Response) => {
  try {
    const { eventContext } = (req.body || {}) as { eventContext?: EventAIContextPayload };
    if (!eventContext || !eventContext.eventId) {
      res.status(400).json({ error: 'eventContext mancante.' });
      return;
    }
    const result = await estimateEventWithGemini(eventContext);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore Gemini API';
    res.status(502).json({ error: msg });
  }
});

app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const rate = sharedCache.checkIpRateLimit(ip);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Limite richieste per IP raggiunto. Riprova tra circa ${rate.resetInMinutes} minuti.`
      });
      return;
    }

    const parsed = AnalyzeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Parametri di ricerca non validi.',
        details: parsed.error.flatten()
      });
      return;
    }

    const {
      betType,
      sports,
      allowMultiSportExpansion,
      targetOdds,
      riskLevel,
      numEvents,
      timeWindow,
      tolerance,
      allowedMarketGroups
    } = parsed.data;

    const activeMarketFilter =
      Array.isArray(allowedMarketGroups) && allowedMarketGroups.length > 0
        ? new Set<MarketGroupKey>(allowedMarketGroups)
        : null;

    const classifyMarketGroup = (marketName: string): MarketGroupKey => {
      const lower = marketName.toLowerCase();

      // Giocatori e Prestazioni
      if (
        lower.includes('giocator') ||
        lower.includes('marcatore') ||
        lower.includes('doppietta') ||
        lower.includes('tripletta') ||
        lower.includes('tiri') ||
        lower.includes('assist') ||
        lower.includes('tackle') ||
        lower.includes('passaggi')
      ) {
        return 'players';
      }

      // Combo e Tricombo
      if (lower.startsWith('combo ') || lower.startsWith('tricombo ')) {
        return 'combo';
      }

      // Sanzioni ed Angoli
      if (lower.includes('angolo') || lower.includes('angoli') || lower.includes('cartellin')) {
        return 'corners_cards';
      }

      // Multigoal
      if (lower.startsWith('multigoal')) {
        return 'multigoal';
      }

      // Risultato Esatto, Rigori, Espulsioni e Speciali Match
      if (
        lower.includes('risultato esatto') ||
        lower.includes('rigore') ||
        lower.includes('espulsione') ||
        lower.includes('autorete') ||
        lower.includes('ribaltone') ||
        lower.includes('pari / dispari') ||
        lower.includes('segna 1° gol') ||
        lower.includes('segna ultimo gol') ||
        lower.includes('sostituzione') ||
        lower.includes('metodo') ||
        lower.includes('minuto') ||
        lower.includes('speciali')
      ) {
        return 'exact_specials';
      }

      // Tempi di gioco e Parziale/Finale
      if (
        lower.includes('1° tempo') ||
        lower.includes('2° tempo') ||
        lower.startsWith('parziale / finale')
      ) {
        return 'halves_htft';
      }

      // Under / Over Gol
      if (lower.startsWith('under/over') || lower.startsWith('under') || lower.startsWith('over')) {
        return 'under_over';
      }

      // Goal / No Goal e opzioni gol squadra
      if (
        lower === 'goal / no goal' ||
        lower.includes('segna') ||
        lower.includes('vince a zero') ||
        lower.includes('vince entrambi i tempi')
      ) {
        return 'gg_ng';
      }

      // 1X2, Doppia Chance, Handicap, DNB, HNB, ANB
      return '1x2_dc';
    };

    const effectiveTolerance = tolerance ?? DEFAULT_TARGET_TOLERANCE;
    const riskRule = getRiskRule(riskLevel);
    // Pronostici esclusivamente sul Calcio (tutti i campionati e coppe del mondo)
    const effectiveSports: SportKey[] = ['football'];

    // 1. Verifica fattibilità matematica
    const feasibility =
      numEvents !== undefined
        ? checkSlipFeasibility(targetOdds, numEvents, riskLevel)
        : checkAutoSlipFeasibility(targetOdds, riskLevel, betType);

    if (!feasibility.feasible) {
      res.json({
        generatedAt: new Date().toISOString(),
        betType,
        feasibility,
        multiSportPrompt: null,
        recommendedSingles: [],
        bestSlip: null,
        allCandidateSelections: [],
        aiCandidateEvents: [],
        coveredCompetitions: [],
        providerWarnings: [],
        isDemoData: false,
        quotaStatus: sharedCache.getQuotaStatus()
      });
      return;
    }

    // 2. Recupero eventi e quote dal provider attivo (solo Calcio: tutti i campionati e coppe)
    const oddsProvider = getActiveOddsProvider();
    const { events, providerWarnings, coveredCompetitions, isDemoData } =
      await oddsProvider.fetchEvents(effectiveSports, timeWindow);

    if (events.length === 0) {
      res.json({
        generatedAt: new Date().toISOString(),
        betType,
        feasibility,
        multiSportPrompt: null,
        recommendedSingles: [],
        bestSlip: null,
        allCandidateSelections: [],
        aiCandidateEvents: [],
        coveredCompetitions,
        providerWarnings,
        isDemoData,
        noEventsMessage:
          'Nessuna partita di calcio disponibile nella finestra temporale selezionata.',
        quotaStatus: sharedCache.getQuotaStatus()
      });
      return;
    }

    // 3. Recupero feed RSS per il calcio (con cache 2h)
    const rssBySport = new Map<SportKey, RssNewsItem[]>();
    const footballRssItems = await fetchSportRssItems('football');
    rssBySport.set('football', footballRssItems);

    // 4. Costruzione selezioni base con rimozione margine bookmaker, statistiche e notizie RSS
    const rawSelectionsByEvent = new Map<string, CandidateSelection[]>();
    const eventContextsMap = new Map<string, EventAIContextPayload>();

    for (const ev of events) {
      const sportNews = rssBySport.get('football') || [];
      const matchedNews = matchNewsForEvent(sportNews, ev.participants, ev.eventName, 5);
      const statsCtx = await getFootballEventStats(ev.competitionId, ev.homeTeam, ev.awayTeam);

      const evSelections: CandidateSelection[] = [];

      for (const mkt of ev.markets) {
        if (activeMarketFilter) {
          const grp = classifyMarketGroup(mkt.marketName);
          if (!activeMarketFilter.has(grp)) {
            continue;
          }
        }
        const computedOutcomes = computeMarketProbabilitiesFromOutcomes(mkt.outcomes, true);

        for (const out of computedOutcomes) {
          if (out.selection.startsWith('__complement__')) {
            continue;
          }
          const { pFinal, estimationMode } = computeFinalProbability(out.pMarket);
          const { ev: expectedValue, edge } = computeEvAndEdge(pFinal, out.medianOdds);

          const selectionId = `${ev.id}::${mkt.marketKey}::${out.selection}`;
          const candidateObj: CandidateSelection = {
            id: selectionId,
            eventId: ev.id,
            sport: 'football',
            competitionName: ev.competitionName,
            eventName: ev.eventName,
            commenceTime: ev.commenceTime,
            market: mkt.marketName,
            selection: out.selection,
            line: out.line,
            bookmakerOdds: out.medianOdds,
            effectiveOdds: out.medianOdds,
            pMarket: out.pMarket,
            marginUnadjusted: out.marginUnadjusted,
            pFinal,
            ev: expectedValue,
            edge,
            score: 0,
            estimationMode,
            keyFactors: [],
            redFlags: []
          };

          evSelections.push(candidateObj);
        }
      }

      // Funzione helper per classificare un mercato nelle 4 macro-categorie SNAI
      const getMarketCategory = (marketName: string): 'main' | 'combo' | 'player' | 'special' => {
        if (marketName.startsWith('Combo ') || marketName.startsWith('Tricombo ')) return 'combo';
        if (
          marketName.includes('Giocator') ||
          marketName.includes('Marcatore') ||
          marketName.includes('Doppietta') ||
          marketName.includes('Tripletta')
        ) {
          return 'player';
        }
        if (
          marketName.includes('Angolo') ||
          marketName.includes('Cartellin') ||
          marketName.includes('Speciali Match')
        ) {
          return 'special';
        }
        return 'main';
      };

      // Seleziona giocate diversificate per mercato e macro-categoria SNAI
      const pickDiverseCandidates = (
        sortedPool: CandidateSelection[],
        maxTotal: number
      ): CandidateSelection[] => {
        const picked = new Map<string, CandidateSelection>();
        const usedMarkets = new Set<string>();
        const usedCategories = new Set<string>();

        // 1° passaggio: almeno un candidato per ciascuna macro-categoria disponibile (con mercati diversi)
        for (const cat of ['main', 'combo', 'player', 'special'] as const) {
          const matchCat = sortedPool.find(
            (s) =>
              getMarketCategory(s.market) === cat &&
              !usedMarkets.has(s.market) &&
              !picked.has(s.id)
          );
          if (matchCat && picked.size < maxTotal) {
            picked.set(matchCat.id, matchCat);
            usedMarkets.add(matchCat.market);
            usedCategories.add(cat);
          }
        }

        // 2° passaggio: completa fino a maxTotal privilegiando mercati non ancora scelti
        for (const s of sortedPool) {
          if (picked.size >= maxTotal) break;
          if (!picked.has(s.id) && !usedMarkets.has(s.market)) {
            picked.set(s.id, s);
            usedMarkets.add(s.market);
          }
        }

        // 3° passaggio: se ancora sotto maxTotal, aggiungi i migliori rimanenti
        for (const s of sortedPool) {
          if (picked.size >= maxTotal) break;
          if (!picked.has(s.id)) {
            picked.set(s.id, s);
          }
        }

        return Array.from(picked.values());
      };

      // Selezioniamo per ciascuna partita le migliori 8 giocate SNAI diversificate da far analizzare a Gemini AI
      let candidateForAi: CandidateSelection[];
      if (betType === 'single') {
        // In Singola (senza filtro di rischio): ordiniamo per vicinanza a targetOdds e diversifichiamo i mercati
        const sortedSingle = [...evSelections]
          .filter((s) => s.effectiveOdds >= MIN_SELECTION_ODDS)
          .sort((a, b) => {
            const dA = Math.abs(Math.log(a.effectiveOdds) - Math.log(targetOdds));
            const dB = Math.abs(Math.log(b.effectiveOdds) - Math.log(targetOdds));
            return dA - dB || b.pMarket - a.pMarket;
          });
        candidateForAi = pickDiverseCandidates(sortedSingle, 8);
      } else if (riskLevel === 11) {
        // Rischio ULTRA (100% Giudizio IA, nessun limite di quota o probabilità minima):
        // Scegliamo candidati diversificati lungo diverse fasce di quota per permettere all'IA di costruire
        // la combinazione ottimale (in 2, 3, 4 o 5 partite) verso targetOdds.
        const allValidUltra = evSelections.filter((s) => s.effectiveOdds >= MIN_SELECTION_ODDS);
        const estEventsUltra = Math.max(
          2,
          Math.min(6, Math.ceil(Math.log(Math.max(1.2, targetOdds)) / Math.log(2.6)))
        );
        const idealStep1 = Math.pow(targetOdds, 1 / estEventsUltra);
        const idealStep2 = Math.pow(targetOdds, 1 / Math.max(2, estEventsUltra - 1));
        const idealStep3 = Math.pow(targetOdds, 1 / (estEventsUltra + 1));

        const byStep1 = [...allValidUltra].sort((a, b) => {
          const dA = Math.abs(Math.log(a.effectiveOdds) - Math.log(idealStep1));
          const dB = Math.abs(Math.log(b.effectiveOdds) - Math.log(idealStep1));
          return dA - dB || b.pMarket - a.pMarket;
        });
        const byStep2 = [...allValidUltra].sort((a, b) => {
          const dA = Math.abs(Math.log(a.effectiveOdds) - Math.log(idealStep2));
          const dB = Math.abs(Math.log(b.effectiveOdds) - Math.log(idealStep2));
          return dA - dB || b.pMarket - a.pMarket;
        });
        const byStep3 = [...allValidUltra].sort((a, b) => {
          const dA = Math.abs(Math.log(a.effectiveOdds) - Math.log(idealStep3));
          const dB = Math.abs(Math.log(b.effectiveOdds) - Math.log(idealStep3));
          return dA - dB || b.pMarket - a.pMarket;
        });
        const byBestProb = [...allValidUltra].sort((a, b) => b.pMarket - a.pMarket);

        const ultraBlended: CandidateSelection[] = [
          ...byStep1.slice(0, 12),
          ...byStep2.slice(0, 10),
          ...byStep3.slice(0, 10),
          ...byBestProb.slice(0, 8)
        ];
        candidateForAi = pickDiverseCandidates(ultraBlended, 8);
      } else {
        // In Multipla (Rischio 1-10): calcoliamo la quota massima realistica compatibile con riskRule.minProb
        const realisticMaxOdds = Math.min(
          riskRule.maxOdds,
          1 / Math.max(0.10, riskRule.minProb * 1.045)
        );
        const realisticMinEvents = Math.max(
          2,
          Math.ceil(
            Math.log(Math.max(1.15, targetOdds)) / Math.log(Math.max(1.08, realisticMaxOdds))
          )
        );
        const idealPerMatch = Math.pow(targetOdds, 1 / realisticMinEvents);
        const idealPerMatchNext = Math.pow(targetOdds, 1 / (realisticMinEvents + 1));

        let validForRisk = evSelections.filter(
          (s) =>
            s.pMarket >= riskRule.minProb &&
            s.effectiveOdds >= MIN_SELECTION_ODDS &&
            s.effectiveOdds <= riskRule.maxOdds + 1e-6
        );
        if (validForRisk.length < 4) {
          validForRisk = evSelections.filter(
            (s) =>
              s.pMarket >= Math.max(0.05, riskRule.minProb - 0.025) &&
              s.effectiveOdds >= MIN_SELECTION_ODDS &&
              s.effectiveOdds <= riskRule.maxOdds + 1e-6
          );
        }

        const byIdeal = [...validForRisk].sort((a, b) => {
          const dA = Math.abs(Math.log(a.effectiveOdds) - Math.log(idealPerMatch));
          const dB = Math.abs(Math.log(b.effectiveOdds) - Math.log(idealPerMatch));
          return dA - dB || b.pMarket - a.pMarket;
        });
        const byIdealNext = [...validForRisk].sort((a, b) => {
          const dA = Math.abs(Math.log(a.effectiveOdds) - Math.log(idealPerMatchNext));
          const dB = Math.abs(Math.log(b.effectiveOdds) - Math.log(idealPerMatchNext));
          return dA - dB || b.pMarket - a.pMarket;
        });
        const byHighProb = [...validForRisk].sort((a, b) => b.pMarket - a.pMarket);
        const byHighOdds = [...validForRisk].sort((a, b) => b.effectiveOdds - a.effectiveOdds);

        const blendedOrder: CandidateSelection[] = [
          ...byIdeal.slice(0, 16),
          ...byIdealNext.slice(0, 10),
          ...byHighOdds.slice(0, 6),
          ...byHighProb.slice(0, 6)
        ];

        candidateForAi = pickDiverseCandidates(blendedOrder, 8);
      }

      if (candidateForAi.length > 0) {
        rawSelectionsByEvent.set(ev.id, candidateForAi);
        eventContextsMap.set(ev.id, {
          eventId: ev.id,
          sport: 'football',
          competitionName: ev.competitionName,
          eventName: ev.eventName,
          commenceTime: ev.commenceTime,
          statsSummary: statsCtx.summaryLines,
          news: matchedNews,
          candidateSelections: candidateForAi.map((s) => ({
            selectionId: s.id,
            market: s.market,
            selection: s.selection,
            line: s.line,
            effectiveOdds: s.effectiveOdds,
            pMarket: s.pMarket
          }))
        });
      }
    }

    // 5. Esecuzione analisi AI con Google Gemini sui migliori eventi candidati (fino a 24 partite)
    const maxEventsToAnalyze = Math.min(
      24,
      Math.max(16, (feasibility.suggestedMinEvents || 4) + 6)
    );
    const contextsToAnalyze = Array.from(eventContextsMap.values()).slice(0, maxEventsToAnalyze);
    const geminiEstimatesByEvent = await analyzeEventsBatchWithGemini(contextsToAnalyze);

    // Helper per sostituire il ruolo generico con il Nome e Cognome individuato dall'IA dalla formazione
    const GENERIC_ROLE_REGEX =
      /(Centravanti Titolare|Attaccante Esterno|Trequartista \/ Regista|Mediano Titolare)\s*\(([^)]+)\)/i;

    const applyDynamicPlayerName = (
      rawSelection: string,
      aiPlayerName?: string,
      aiSelection?: string
    ): string => {
      const match = rawSelection.match(GENERIC_ROLE_REGEX);
      if (!match) return rawSelection;

      const teamInParens = match[2];
      if (
        aiPlayerName &&
        aiPlayerName.trim().length > 2 &&
        !/titolare|esterno|regista/i.test(aiPlayerName)
      ) {
        const cleanPlayer = aiPlayerName.includes('(')
          ? aiPlayerName.trim()
          : `${aiPlayerName.trim()} (${teamInParens})`;
        return rawSelection.replace(GENERIC_ROLE_REGEX, cleanPlayer);
      }

      if (
        aiSelection &&
        aiSelection.trim().length > 3 &&
        !/titolare|esterno|regista/i.test(aiSelection)
      ) {
        return aiSelection.trim();
      }

      return rawSelection;
    };

    // 6. Costruzione esclusiva delle giocate analizzate dall'IA
    const aiOnlySelections: CandidateSelection[] = [];

    for (const [eventId, candidateSels] of rawSelectionsByEvent.entries()) {
      const estimates = geminiEstimatesByEvent.get(eventId) || [];
      if (estimates.length === 0) continue;

      const fallbackEst = estimates[0];

      for (const sel of candidateSels) {
        const directEst =
          estimates.find(
            (e) =>
              e.selection.toLowerCase() === sel.selection.toLowerCase() &&
              e.market.toLowerCase() === sel.market.toLowerCase()
          ) ||
          estimates.find(
            (e) =>
              e.selection.toLowerCase() === sel.selection.toLowerCase() ||
              sel.selection.toLowerCase().includes(e.selection.toLowerCase()) ||
              e.selection.toLowerCase().includes(sel.selection.toLowerCase())
          ) ||
          estimates.find((e) => e.market.toLowerCase() === sel.market.toLowerCase());

        const resolvedSelectionLabel = applyDynamicPlayerName(
          sel.selection,
          directEst?.player_name,
          directEst?.selection
        );

        const effectivePAi = directEst
          ? directEst.p_ai
          : Number(Math.max(0.01, Math.min(0.99, sel.pMarket + 0.01)).toFixed(4));
        const effectiveConf = directEst ? directEst.confidence : fallbackEst.confidence;

        const { pFinal: rawPFinal, clampedPAi } = computeFinalProbability(
          sel.pMarket,
          effectivePAi,
          effectiveConf
        );
        // In modalità ULTRA (riskLevel === 11), ci affidiamo al giudizio dell'IA (p_ai) con peso maggiorato
        const ultraPFinal = directEst
          ? Number((0.35 * sel.pMarket + 0.65 * directEst.p_ai).toFixed(4))
          : rawPFinal;
        const pFinal =
          riskLevel === 11
            ? ultraPFinal
            : betType === 'multiple' && sel.pMarket >= riskRule.minProb - 0.01
            ? Math.max(riskRule.minProb, rawPFinal)
            : rawPFinal;

        const effectiveFactors = directEst
          ? directEst.key_factors
          : [
              `Valutazione AI su ${sel.market} (${resolvedSelectionLabel}): probabilità stimata ${(
                pFinal * 100
              ).toFixed(1)}% a quota ${sel.effectiveOdds.toFixed(2)}.`,
              ...fallbackEst.key_factors.slice(0, 2)
            ];
        const effectiveFlags = directEst ? directEst.red_flags : fallbackEst.red_flags;

        const { ev: expectedValue, edge } = computeEvAndEdge(pFinal, sel.effectiveOdds);

        aiOnlySelections.push({
          ...sel,
          selection: resolvedSelectionLabel,
          pAi: clampedPAi,
          aiConfidence: effectiveConf,
          pFinal,
          ev: expectedValue,
          edge,
          estimationMode: 'ai_plus_market',
          keyFactors: effectiveFactors.slice(0, 4),
          redFlags:
            effectiveFlags.length > 0
              ? effectiveFlags.slice(0, 4)
              : ['Verifica sempre le formazioni ufficiali prima del calcio d\'inizio.']
        });
      }
    }

    // 7. Pool candidati e costruzione schedina SOLO con le bet generate dall'IA
    const { recommendedSingles, topPool } = buildCandidatePool(
      aiOnlySelections,
      riskLevel,
      betType,
      targetOdds
    );

    const bestSlip =
      numEvents !== undefined
        ? findBestBettingSlip(topPool, targetOdds, numEvents, riskLevel, effectiveTolerance)
        : findBestBettingSlipAuto(topPool, targetOdds, riskLevel, betType, effectiveTolerance);

    res.json({
      generatedAt: new Date().toISOString(),
      betType,
      feasibility,
      multiSportPrompt: null,
      recommendedSingles,
      bestSlip,
      allCandidateSelections: topPool,
      aiCandidateEvents: [],
      coveredCompetitions,
      providerWarnings,
      isDemoData,
      noEventsMessage:
        aiOnlySelections.length === 0
          ? 'Impossibile generare pronostici AI in questo momento. Verifica che la chiave Google Gemini sia attiva.'
          : undefined,
      envReport: startupReport,
      quotaStatus: sharedCache.getQuotaStatus()
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore imprevisto del server';
    res.status(500).json({ error: message });
  }
});

const PORT = Number(process.env.PORT) || 3001;
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[SAMU BET Backend] Server in ascolto su http://localhost:${PORT}`);
  });
}

export default app;
