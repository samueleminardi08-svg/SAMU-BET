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
  findBestBettingSlip,
  findBestBettingSlipAuto
} from './engine/slipBuilder.js';
import { getFootballEventStats } from './providers/footballStatsProvider.js';
import {
  analyzeEventsBatchWithGemini,
  checkGeminiHealth,
  estimateEventWithGemini,
  getGeminiConfig,
  updateGeminiConfig
} from './providers/geminiProvider.js';
import { getActiveOddsProvider, getWindowEndTimestamp } from './providers/oddsProvider.js';
import { defaultFixturesProvider, formatRomeDateTime } from './providers/fixturesProvider.js';
import { reviewSlipWithGemini } from './ai/slipReview.js';
import { fetchSportRssItems, matchNewsForEvent } from './rss/rssService.js';
import {
  AnalyzeRequestSchema,
  CandidateSelection,
  CompetitionItem,
  CompetitionType,
  EventAIContextPayload,
  MarketGroupKey,
  RssNewsItem,
  SportKey,
  TimeWindowKey
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

// Endpoint Calendario & Filtro Competizioni (Sezione 3 & 4)
app.get('/api/competitions', async (req: Request, res: Response) => {
  try {
    const timeWindow = (req.query.timeWindow as TimeWindowKey) || 'hours48';
    const now = new Date();
    const to = getWindowEndTimestamp(timeWindow, now);
    const fixtures = await defaultFixturesProvider.getFixtures({
      from: now,
      to
    });

    const compMap = new Map<
      string,
      { id: string; name: string; country: string; type: CompetitionType; count: number }
    >();

    for (const f of fixtures) {
      const existing = compMap.get(f.competitionId);
      if (existing) {
        existing.count++;
      } else {
        compMap.set(f.competitionId, {
          id: f.competitionId,
          name: f.competitionName,
          country: f.country,
          type: f.type,
          count: 1
        });
      }
    }

    const competitions: CompetitionItem[] = Array.from(compMap.values())
      .map((c) => ({
        id: c.id,
        name: c.name,
        country: c.country,
        type: c.type,
        eventsCount: c.count,
        sport: 'football' as const
      }))
      .sort((a, b) => {
        if (b.eventsCount !== a.eventsCount) return b.eventsCount - a.eventsCount;
        return a.name.localeCompare(b.name);
      });

    res.json({
      competitions,
      calendarUpdatedTimestamp: formatRomeDateTime(new Date()),
      timeWindow
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore nel recupero delle competizioni';
    res.status(500).json({ error: message });
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
      competitions,
      diversityMode = 'auto',
      maxSameMarketSelection,
      tolerance,
      allowedMarketGroups,
      snaiRealOddsOverrides
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
        calendarUpdatedTimestamp: formatRomeDateTime(new Date()),
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
      await oddsProvider.fetchEvents(effectiveSports, timeWindow, competitions);

    if (events.length === 0) {
      res.json({
        generatedAt: new Date().toISOString(),
        calendarUpdatedTimestamp: formatRomeDateTime(new Date()),
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
          const selectionId = `${ev.id}::${mkt.marketKey}::${out.selection}`;

          let effectiveOdds = out.medianOdds;
          let snaiRealOddsVal: number | undefined;

          // Se l'utente ha inserito una quota reale SNAI tramite override
          const overrideVal = snaiRealOddsOverrides ? snaiRealOddsOverrides[selectionId] : undefined;
          if (typeof overrideVal === 'number') {
            snaiRealOddsVal = overrideVal;
            effectiveOdds = overrideVal;
          }

          const { ev: expectedValue, edge } = computeEvAndEdge(pFinal, effectiveOdds);

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
            snaiRealOdds: snaiRealOddsVal,
            effectiveOdds,
            pMarket: out.pMarket,
            marginUnadjusted: out.marginUnadjusted,
            sourceType: mkt.isModelDerived ? 'model' : 'market',
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
        const sortedSingle = [...evSelections]
          .filter((s) => s.effectiveOdds >= MIN_SELECTION_ODDS)
          .sort((a, b) => {
            const dA = Math.abs(Math.log(a.effectiveOdds) - Math.log(targetOdds));
            const dB = Math.abs(Math.log(b.effectiveOdds) - Math.log(targetOdds));
            return dA - dB || b.pMarket - a.pMarket;
          });
        candidateForAi = pickDiverseCandidates(sortedSingle, 8);
      } else if (riskLevel === 11) {
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
        const realisticMaxOdds = Math.min(
          riskRule.maxOdds,
          1 / Math.max(0.1, riskRule.minProb * 1.045)
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
            pMarket: s.pMarket,
            sourceType: s.sourceType
          }))
        });
      }
    }

    // 5. Esecuzione analisi AI con Google Gemini sui migliori eventi candidati
    const maxEventsToAnalyze =
      betType === 'single'
        ? 4
        : Math.min(8, Math.max(3, (feasibility.suggestedMinEvents || 3) + 1));

    const sortedContexts = Array.from(eventContextsMap.values()).sort((a, b) => {
      const bestA = a.candidateSelections[0]?.pMarket ?? 0;
      const bestB = b.candidateSelections[0]?.pMarket ?? 0;
      return bestB - bestA;
    });
    const contextsToAnalyze = sortedContexts.slice(0, maxEventsToAnalyze);
    const geminiEstimatesByEvent = await analyzeEventsBatchWithGemini(contextsToAnalyze);

    // Helper per sostituire il ruolo generico con il Nome e Cognome individuato dall'IA
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

    // 6. Costruzione selezioni: se Gemini ha stime usa 'ai_plus_market', altrimenti fallback 'market_only'
    const processedSelections: CandidateSelection[] = [];

    for (const [eventId, candidateSels] of rawSelectionsByEvent.entries()) {
      const estimates = geminiEstimatesByEvent.get(eventId) || [];
      const fallbackEst = estimates.length > 0 ? estimates[0] : null;

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

        let pFinal: number;
        let pAi: number | undefined;
        let aiConfidence: number | undefined;
        let estimationMode: 'ai_plus_market' | 'market_only';
        let keyFactors: string[];
        let redFlags: string[];

        if (directEst || fallbackEst) {
          const activeEst = directEst || fallbackEst!;
          const effectivePAi = directEst
            ? directEst.p_ai
            : Number(Math.max(0.01, Math.min(0.99, sel.pMarket + 0.01)).toFixed(4));
          const effectiveConf = directEst ? directEst.confidence : activeEst.confidence;

          const { pFinal: rawPFinal, clampedPAi } = computeFinalProbability(
            sel.pMarket,
            effectivePAi,
            effectiveConf
          );

          // Fix 2: In modalità ULTRA (riskLevel === 11), vincola clampedPAi a ±10pp da pMarket
          // e assegna peso 65% ad AI e 35% al mercato
          const effectiveClampedPAi = clampedPAi ?? sel.pMarket;
          const ultraPFinal = directEst
            ? Number((0.35 * sel.pMarket + 0.65 * effectiveClampedPAi).toFixed(4))
            : rawPFinal;

          // Fix 1: rimosso Math.max(riskRule.minProb, rawPFinal) che gonfiava artificialmente la probabilità
          pFinal = riskLevel === 11 ? ultraPFinal : rawPFinal;
          pAi = clampedPAi;
          aiConfidence = effectiveConf;
          estimationMode = 'ai_plus_market';

          keyFactors = directEst
            ? directEst.key_factors
            : [
                `Valutazione AI su ${sel.market} (${resolvedSelectionLabel}): probabilità stimata ${(
                  pFinal * 100
                ).toFixed(1)}% a quota ${sel.effectiveOdds.toFixed(2)}.`,
                ...activeEst.key_factors.slice(0, 2)
              ];
          redFlags = directEst ? directEst.red_flags : activeEst.red_flags;
        } else {
          // Fix 3: Fallback pulito a solo-mercato quando AI non è disponibile
          pFinal = sel.pMarket;
          pAi = undefined;
          aiConfidence = undefined;
          estimationMode = 'market_only';
          keyFactors = [
            `Analisi statistica di mercato fair con rimozione del margine bookmaker (probabilità ${(
              pFinal * 100
            ).toFixed(1)}%).`
          ];
          redFlags = [
            'Valutazione qualitativa AI non disponibile per questo evento: basata esclusivamente su quote.'
          ];
        }

        const { ev: expectedValue, edge } = computeEvAndEdge(pFinal, sel.effectiveOdds);

        processedSelections.push({
          ...sel,
          selection: resolvedSelectionLabel,
          pAi,
          aiConfidence,
          pFinal,
          ev: expectedValue,
          edge,
          estimationMode,
          keyFactors: keyFactors.slice(0, 4),
          redFlags:
            redFlags.length > 0
              ? redFlags.slice(0, 4)
              : ["Verifica sempre le formazioni ufficiali prima del calcio d'inizio."]
        });
      }
    }

    // 7. Pool candidati e costruzione schedina (Stadio A)
    const { recommendedSingles, topPool } = buildCandidatePool(
      processedSelections,
      riskLevel,
      betType,
      targetOdds
    );

    let bestSlip =
      numEvents !== undefined
        ? findBestBettingSlip(topPool, targetOdds, numEvents, riskLevel, effectiveTolerance)
        : findBestBettingSlipAuto(topPool, targetOdds, riskLevel, betType, effectiveTolerance);

    // Stadio B: Calcolo vincolo di varietà ed eventuale beam search diversificata
    let effectiveSlip = bestSlip;

    if (effectiveSlip && effectiveSlip.selections.length > 0) {
      const slipSize = effectiveSlip.selections.length;
      const diversityHardMax = Math.max(2, Math.ceil(slipSize / 2));
      let effectiveLimit: number | undefined;

      if (diversityMode === 'none') {
        effectiveLimit = undefined;
      } else if (diversityMode === 'high') {
        effectiveLimit = 2;
      } else if (diversityMode === 'normal') {
        effectiveLimit = 3;
      } else if (maxSameMarketSelection !== undefined) {
        effectiveLimit = Math.max(1, maxSameMarketSelection);
      } else {
        // Modalità 'auto': max 3 selezioni dello stesso mercato
        effectiveLimit = Math.max(1, Math.min(diversityHardMax, 3));
      }

      // Se il limite è attivo e inferiore al numero di selezioni, applica beam search con vincolo
      if (effectiveLimit !== undefined && effectiveLimit < slipSize) {
        const diverseSlip =
          numEvents !== undefined
            ? findBestBettingSlip(
                topPool,
                targetOdds,
                numEvents,
                riskLevel,
                effectiveTolerance,
                effectiveLimit
              )
            : findBestBettingSlipAuto(
                topPool,
                targetOdds,
                riskLevel,
                betType,
                effectiveTolerance,
                effectiveLimit
              );

        if (diverseSlip) {
          effectiveSlip = diverseSlip;
          effectiveSlip.diversityApplied = {
            mode: diversityMode,
            limit: effectiveLimit,
            maxFound: effectiveLimit
          };
        }
      }

      // Esecuzione review AI qualitativa una sola volta sulla schedina finale effettiva
      const review = await reviewSlipWithGemini(effectiveSlip, targetOdds, riskLevel);
      if (review) {
        effectiveSlip.slipReview = review;
      }
      bestSlip = effectiveSlip;
    }

    res.json({
      generatedAt: new Date().toISOString(),
      calendarUpdatedTimestamp: formatRomeDateTime(new Date()),
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
        processedSelections.length === 0
          ? 'Nessuna selezione disponibile per i criteri specificati.'
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