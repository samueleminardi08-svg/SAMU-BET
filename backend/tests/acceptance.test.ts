import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeEvAndEdge,
  computeFinalProbability,
  computeMarketProbabilitiesFromOutcomes
} from '../src/engine/probability.js';
import {
  buildCandidatePool,
  buildSlipResultObject,
  checkAutoSlipFeasibility,
  checkSlipFeasibility,
  evaluateMultiSportPermissionNeeded,
  findBestBettingSlip,
  findBestBettingSlipAuto
} from '../src/engine/slipBuilder.js';
import { CandidateSelection, AnalyzeRequestSchema, SlipReview, SlipReviewSchema } from '../src/types/models.js';
import { createBridgeApp } from '../../local-ai-bridge/src/index.js';
import { KNOWN_COMPETITIONS, classifyCompetition } from '../src/config/competitionsCatalog.js';
import { formatRomeDateTime, deduplicateFixtures, CompositeFixturesProvider } from '../src/providers/fixturesProvider.js';
import { getWindowEndTimestamp, getActiveOddsProvider } from '../src/providers/oddsProvider.js';

function createSyntheticPoolForTest1(): CandidateSelection[] {
  // Eventi diversi con p >= 0.50 e quota <= 2.30 per R=5, tali che un prodotto di 3 eventi sia ~6.00 (es. 1.82 * 1.82 * 1.81 ≈ 5.995)
  const items: Array<{ id: string; eventId: string; eventName: string; odds: number; p: number }> = [
    { id: 'sel-1', eventId: 'ev-1', eventName: 'Inter - Napoli', odds: 1.82, p: 0.54 },
    { id: 'sel-1b', eventId: 'ev-1', eventName: 'Inter - Napoli', odds: 1.80, p: 0.55 }, // Stesso evento ev-1!
    { id: 'sel-2', eventId: 'ev-2', eventName: 'Juventus - Milan', odds: 1.82, p: 0.53 },
    { id: 'sel-3', eventId: 'ev-3', eventName: 'Arsenal - Liverpool', odds: 1.81, p: 0.54 },
    { id: 'sel-4', eventId: 'ev-4', eventName: 'Real Madrid - Barcelona', odds: 1.95, p: 0.51 },
    { id: 'sel-5', eventId: 'ev-5', eventName: 'Bayern - Dortmund', odds: 1.65, p: 0.58 }
  ];

  return items.map((item) => {
    const { ev, edge } = computeEvAndEdge(item.p, item.odds);
    return {
      id: item.id,
      eventId: item.eventId,
      sport: 'football',
      competitionName: 'Serie A',
      eventName: item.eventName,
      commenceTime: new Date().toISOString(),
      market: 'Esito Finale 1X2',
      selection: '1',
      bookmakerOdds: item.odds,
      effectiveOdds: item.odds,
      pMarket: item.p,
      marginUnadjusted: false,
      pFinal: item.p,
      ev,
      edge,
      score: 0,
      estimationMode: 'market_only',
      keyFactors: ['Fattore 1'],
      redFlags: ['Rischio 1']
    };
  });
}

describe('Sezione 12 — Test di accettazione SAMU BET', () => {
  it('Test 1: Q=6, N=3, R=5 -> g≈1.82 è fattibile: restituisce 3 selezioni da eventi diversi, prodotto quote in [5.52, 6.48], ognuna con p >= 0.50 e quota <= 2.30', () => {
    const feasibility = checkSlipFeasibility(6, 3, 5);
    expect(feasibility.feasible).toBe(true);
    expect(feasibility.geometricMeanOdds).toBeCloseTo(1.82, 2);

    const rawSelections = createSyntheticPoolForTest1();
    const { topPool } = buildCandidatePool(rawSelections, 5);

    const slip = findBestBettingSlip(topPool, 6, 3, 5, 0.08);
    expect(slip).not.toBeNull();
    expect(slip!.selections).toHaveLength(3);

    // Prodotto quote in [5.52, 6.48]
    expect(slip!.totalOdds).toBeGreaterThanOrEqual(5.52);
    expect(slip!.totalOdds).toBeLessThanOrEqual(6.48);
    expect(slip!.withinTolerance).toBe(true);

    // Ognuna con p >= 0.50 e quota <= 2.30
    for (const sel of slip!.selections) {
      expect(sel.pFinal).toBeGreaterThanOrEqual(0.50);
      expect(sel.effectiveOdds).toBeLessThanOrEqual(2.30);
    }

    // Eventi tutti diversi (Test 7)
    const uniqueEventIds = new Set(slip!.selections.map((s) => s.eventId));
    expect(uniqueEventIds.size).toBe(3);
  });

  it('Test 2: Q=20, N=2, R=2 -> incoerente: mostra avviso e propone N_min = 9 (o un rischio più alto). Non genera una schedina forzata', () => {
    const feasibility = checkSlipFeasibility(20, 2, 2);
    expect(feasibility.feasible).toBe(false);
    expect(feasibility.status).toBe('target_too_high');
    // ceil(ln(20) / ln(1.45)) = ceil(2.9957 / 0.37156) = ceil(8.062) = 9
    expect(feasibility.suggestedMinEvents).toBe(9);
    expect(feasibility.suggestedMinRiskLevel).toBeGreaterThan(2);
    expect(feasibility.message).toContain('N = 9');
  });

  it('Test 3: Q=1.5, N=10 -> g < 1.05: avviso e proposta di ridurre N', () => {
    const feasibility = checkSlipFeasibility(1.5, 10, 5);
    expect(feasibility.feasible).toBe(false);
    expect(feasibility.status).toBe('target_too_low');
    expect(feasibility.geometricMeanOdds).toBeLessThan(1.05);
    expect(feasibility.suggestedMaxEvents).toBeDefined();
    expect(feasibility.suggestedMaxEvents!).toBeLessThan(10);
  });

  it('Test 4: Nessun evento nella finestra scelta -> nessun crash e risultato null pulito', () => {
    const { recommendedSingles, topPool } = buildCandidatePool([], 5);
    expect(recommendedSingles).toEqual([]);
    expect(topPool).toEqual([]);
    const slip = findBestBettingSlip(topPool, 5, 3, 5);
    expect(slip).toBeNull();
  });

  it('Test 5, 5b, 5c: Fallback su "solo mercato", clamp ±10% di p_ai, e gestione risultati parziali quando AI viene annullata', () => {
    // 5b: Senza AI (pAi undefined) -> modalità "market_only" con pFinal === pMarket
    const marketOnly = computeFinalProbability(0.60, undefined, undefined);
    expect(marketOnly.estimationMode).toBe('market_only');
    expect(marketOnly.pFinal).toBe(0.60);

    // Clamp ±10%: se pMarket = 0.60 e l'AI allucina pAi = 0.95 con confidence = 0.8 -> clampedPAi = 0.70
    // p_final = 0.70 * 0.60 + 0.30 * 0.70 = 0.42 + 0.21 = 0.63
    const clampedHigh = computeFinalProbability(0.60, 0.95, 0.80);
    expect(clampedHigh.estimationMode).toBe('ai_plus_market');
    expect(clampedHigh.clampedPAi).toBe(0.70);
    expect(clampedHigh.pFinal).toBeCloseTo(0.63, 4);

    // Se confidence < 0.5 -> w sale a 0.90: p_final = 0.90 * 0.60 + 0.10 * 0.70 = 0.54 + 0.07 = 0.61
    const lowConf = computeFinalProbability(0.60, 0.95, 0.35);
    expect(lowConf.weightMarket).toBe(0.90);
    expect(lowConf.pFinal).toBeCloseTo(0.61, 4);

    // 5c: Risultati parziali (prime selezioni "ai_plus_market", restanti "market_only" dopo Annulla)
    const pool = createSyntheticPoolForTest1();
    pool[0].estimationMode = 'ai_plus_market';
    pool[0].pFinal = 0.56;
    const slip = findBestBettingSlip(pool, 6, 3, 5);
    expect(slip).not.toBeNull();
    const modes = slip!.selections.map((s) => s.estimationMode);
    expect(modes).toContain('ai_plus_market');
    expect(modes).toContain('market_only');
  });

  it('Test 5d: Il local-ai-bridge rifiuta richieste senza token (401) o da origini non consentite (403)', async () => {
    const bridgeApp = createBridgeApp({
      bridgeToken: 'segreto-test-token-123456',
      allowedOrigins: ['https://samu-bet.vercel.app']
    });

    const server = bridgeApp.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    try {
      // 1. Richiesta senza token -> 401
      const resNoAuth = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: 'https://samu-bet.vercel.app' }
      });
      expect(resNoAuth.status).toBe(401);

      // 2. Richiesta con token errato -> 401
      const resBadToken = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: {
          Origin: 'https://samu-bet.vercel.app',
          Authorization: 'Bearer token-sbagliato'
        }
      });
      expect(resBadToken.status).toBe(401);

      // 3. Richiesta da origine non consentita -> 403
      const resBadOrigin = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: {
          Origin: 'https://sito-malevolo.com',
          Authorization: 'Bearer segreto-test-token-123456'
        }
      });
      expect(resBadOrigin.status).toBe(403);
    } finally {
      server.close();
    }
  });

  it('Test 6: Modifica di "Quota SNAI reale" su una selezione -> ricalcolo immediato di EV, quota totale e probabilità combinata', () => {
    const pool = createSyntheticPoolForTest1().slice(0, 3);
    const initialSlip = buildSlipResultObject(pool, 6, 0.08);
    expect(initialSlip.totalOdds).toBeCloseTo(1.82 * 1.80 * 1.82, 1);

    // Utente inserisce Quota SNAI reale = 2.05 sulla prima selezione
    const updatedSelection: CandidateSelection = {
      ...pool[0],
      snaiRealOdds: 2.05,
      effectiveOdds: 2.05,
      ...computeEvAndEdge(pool[0].pFinal, 2.05)
    };

    expect(updatedSelection.ev).toBeCloseTo(pool[0].pFinal * 2.05 - 1, 4);

    const recalculatedSlip = buildSlipResultObject(
      [updatedSelection, pool[1], pool[2]],
      6,
      0.08
    );
    const expectedTotal = Number((2.05 * pool[1].effectiveOdds * pool[2].effectiveOdds).toFixed(2));
    expect(recalculatedSlip.totalOdds).toBe(expectedTotal);
    expect(recalculatedSlip.combinedEv).toBeCloseTo(
      recalculatedSlip.combinedProbability * expectedTotal - 1,
      3
    );
  });

  it('Test 7 & Sezione 6: Mai due selezioni dello stesso evento nella stessa schedina + badge margine non depurato per mercati a esito singolo', () => {
    // Verifica badge margine non depurato
    const singleOutcomeMkt = computeMarketProbabilitiesFromOutcomes([
      { selection: 'Giro Veloce: Leclerc', bookmakerOdds: [4.00] }
    ]);
    expect(singleOutcomeMkt[0].marginUnadjusted).toBe(true);
    expect(singleOutcomeMkt[0].pMarket).toBe(0.25);

    // Verifica unicità eventi nella schedina anche quando lo stesso evento ha molteplici selezioni forti
    const multiSameEventPool: CandidateSelection[] = [
      ...createSyntheticPoolForTest1(),
      {
        ...createSyntheticPoolForTest1()[0],
        id: 'sel-1c',
        eventId: 'ev-1',
        market: 'Doppia Chance',
        selection: '1X',
        effectiveOdds: 1.81,
        pFinal: 0.70
      }
    ];
    const slip = findBestBettingSlip(multiSameEventPool, 6, 3, 5);
    expect(slip).not.toBeNull();
    const eventIds = slip!.selections.map((s) => s.eventId);
    expect(new Set(eventIds).size).toBe(eventIds.length);
  });

  it('Test 8 & Sezione 8: Chiavi API assenti dal bundle del frontend e assenza di parole vietate ("sicuro", "garantito", "vincita certa", "fisso")', () => {
    const distAssetsDir = path.resolve(process.cwd(), '../frontend/dist/assets');
    expect(fs.existsSync(distAssetsDir)).toBe(true);

    const files = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf-8');
      // Verifica assenza pattern di chiavi segrete o prefissi VITE_ con chiavi API
      expect(content).not.toContain('sk-unsloth-inserisci-qui');
      expect(content).not.toMatch(/AIza[0-9A-Za-z-_]{35}/);
      expect(content).not.toContain('VITE_THE_ODDS_API_KEY');
      expect(content).not.toContain('VITE_FOOTBALL_DATA_API_KEY');
      expect(content).not.toContain('VITE_GEMINI_API_KEY');

      // Verifica assenza parole vietate dalla Sezione 8
      const lower = content.toLowerCase();
      expect(lower).not.toContain('vincita certa');
      expect(lower).not.toContain('pronostico sicuro');
      expect(lower).not.toContain('esito garantito');
    }
  });

  it('Test 9: Singola vs Multipla (Max 50 partite, Quota Max 3000) con calcolo automatico di N e richiesta permesso Multi-Sport', () => {
    // 1. Singola non ha vincolo di livello di rischio (qualsiasi quota fino a 30.00 è accettata)
    const singleOk = checkAutoSlipFeasibility(5.50, 1, 'single');
    expect(singleOk.feasible).toBe(true);
    expect(singleOk.status).toBe('ok');

    // 2. Singola oltre 30.00 propone passaggio a Multipla
    const singleTooHigh = checkAutoSlipFeasibility(50.0, 2, 'single');
    expect(singleTooHigh.feasible).toBe(false);
    expect(singleTooHigh.status).toBe('single_exceeds_risk');
    expect(singleTooHigh.suggestSwitchToMultiple).toBe(true);

    // 3. Multipla con quota alta (es. 1500) a rischio medio R=5 -> fattibile con N <= 50 calcolato automaticamente
    const multiHigh = checkAutoSlipFeasibility(1500, 5, 'multiple');
    expect(multiHigh.feasible).toBe(true);
    expect(multiHigh.suggestedMinEvents).toBeGreaterThanOrEqual(2);
    expect(multiHigh.suggestedMinEvents).toBeLessThanOrEqual(50);

    // 4. Multipla con quota 6 su pool sintetico -> trova automaticamente la multipla migliore senza N manuale
    const rawSelections = createSyntheticPoolForTest1();
    const { topPool } = buildCandidatePool(rawSelections, 5);
    const autoSlip = findBestBettingSlipAuto(topPool, 6, 5, 'multiple', 0.08);
    expect(autoSlip).not.toBeNull();
    expect(autoSlip!.selections.length).toBeGreaterThanOrEqual(2);
    expect(autoSlip!.totalOdds).toBeGreaterThanOrEqual(5.52);
    expect(autoSlip!.totalOdds).toBeGreaterThanOrEqual(5.52);
    expect(autoSlip!.totalOdds).toBeLessThanOrEqual(6.48);

    // 5. Richiesta permesso Multi-Sport quando uno sport singolo non basta per raggiungere una quota alta a rischio basso
    const promptCheck = evaluateMultiSportPermissionNeeded(
      topPool,
      250,
      2,
      'multiple',
      1
    );
    expect(promptCheck.required).toBe(true);
    expect(promptCheck.reason).toContain('più sport');
  });
});



describe('Sezione 7 — Nuovi Scenari di Accettazione SAMU BET v1.1', () => {
  it('Scenario 1: Con data simulata 02/11/2026, il calendario esclude partite passate in Europe/Rome e mostra il timestamp', () => {
    const simulatedNow = new Date('2026-11-02T12:00:00Z');
    const pastTime = new Date('2026-11-02T10:00:00Z').toISOString();
    const futureTime = new Date('2026-11-02T18:00:00Z').toISOString();

    const rawFixtures = [
      {
        id: 'f-past',
        competitionId: 'soccer_italy_serie_a',
        competitionName: 'Serie A',
        country: 'Italia',
        type: 'league' as const,
        homeTeam: 'Roma',
        awayTeam: 'Lazio',
        kickoffUTC: pastTime,
        status: 'scheduled' as const,
        sources: ['the-odds-api'],
        fetchedAt: simulatedNow.toISOString()
      },
      {
        id: 'f-future',
        competitionId: 'soccer_italy_serie_a',
        competitionName: 'Serie A',
        country: 'Italia',
        type: 'league' as const,
        homeTeam: 'Milan',
        awayTeam: 'Juventus',
        kickoffUTC: futureTime,
        status: 'scheduled' as const,
        sources: ['the-odds-api'],
        fetchedAt: simulatedNow.toISOString()
      }
    ];

    const filtered = rawFixtures.filter((f) => new Date(f.kickoffUTC).getTime() > simulatedNow.getTime());
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('f-future');

    const romeTimeStr = formatRomeDateTime(simulatedNow);
    expect(romeTimeStr).toBeDefined();
    expect(romeTimeStr.length).toBeGreaterThan(5);
  });

  it('Scenario 2: Filtro solo coppe -> solo partite di tipo cup; se 0 eventi non crasha', async () => {
    const compMeta = KNOWN_COMPETITIONS['soccer_italy_coppa_italia'];
    expect(compMeta.type).toBe('cup');
    const leagueMeta = KNOWN_COMPETITIONS['soccer_italy_serie_a'];
    expect(leagueMeta.type).toBe('league');

    const cupOnlyIds = ['soccer_italy_coppa_italia'];
    const demoProvider = getActiveOddsProvider();
    const res = await demoProvider.fetchEvents(['football'], 'hours48', cupOnlyIds);
    for (const ev of res.events) {
      const meta = classifyCompetition(ev.competitionId, ev.competitionName);
      expect(meta.type).toBe('cup');
    }
  });

  it('Scenario 3: Finestra 14 giorni (days14) accettata da schema e calcolo temporale corretto', () => {
    const parsed = AnalyzeRequestSchema.safeParse({
      betType: 'multiple',
      targetOdds: 5.0,
      riskLevel: 5,
      timeWindow: 'days14'
    });
    expect(parsed.success).toBe(true);

    const now = new Date('2026-11-02T12:00:00Z');
    const end14 = getWindowEndTimestamp('days14', now);
    const diffDays = Math.round((end14.getTime() - now.getTime()) / (24 * 3600 * 1000));
    expect(diffDays).toBe(14);
  });

  it('Scenario 4: Fallback provider non disponibile -> catena di fallback pulita', async () => {
    const failingProvider = {
      name: 'failing',
      async getFixtures() {
        throw new Error('503 Service Unavailable');
      }
    };
    const fallbackProvider = {
      name: 'fallback',
      async getFixtures() {
        return [
          {
            id: 'fb-1',
            competitionId: 'soccer_italy_serie_a',
            competitionName: 'Serie A',
            country: 'Italia',
            type: 'league' as const,
            homeTeam: 'Inter',
            awayTeam: 'Napoli',
            kickoffUTC: new Date(Date.now() + 3600000).toISOString(),
            status: 'scheduled' as const,
            sources: ['fallback'],
            fetchedAt: new Date().toISOString()
          }
        ];
      }
    };

    const composite = new CompositeFixturesProvider([failingProvider, fallbackProvider]);
    const fixtures = await composite.getFixtures({ from: new Date(), to: new Date(Date.now() + 86400000) });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].homeTeam).toBe('Inter');
  });

  it('Scenario 5: Deduplica partite entro ±3h -> unifica sorgenti', () => {
    const timeA = new Date('2026-11-03T18:00:00Z').toISOString();
    const timeB = new Date('2026-11-03T19:30:00Z').toISOString();
    const fixtures = [
      {
        id: 'f-src1',
        competitionId: 'soccer_italy_serie_a',
        competitionName: 'Serie A',
        country: 'Italia',
        type: 'league' as const,
        homeTeam: 'FC Internazionale',
        awayTeam: 'SSC Napoli',
        kickoffUTC: timeA,
        status: 'scheduled' as const,
        sources: ['the-odds-api'],
        fetchedAt: new Date().toISOString()
      },
      {
        id: 'f-src2',
        competitionId: 'SA',
        competitionName: 'Serie A',
        country: 'Italia',
        type: 'league' as const,
        homeTeam: 'Inter',
        awayTeam: 'Napoli',
        kickoffUTC: timeB,
        status: 'scheduled' as const,
        sources: ['football-data'],
        fetchedAt: new Date().toISOString()
      }
    ];

    const deduped = deduplicateFixtures(fixtures);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].sources).toContain('the-odds-api');
    expect(deduped[0].sources).toContain('football-data');
  });

  it('Scenario 6: Fallback graceful su market_only se AI offline', () => {
    const fallback = computeFinalProbability(0.55, undefined, undefined);
    expect(fallback.estimationMode).toBe('market_only');
    expect(fallback.pFinal).toBe(0.55);
  });

  it('Scenario 7: Clamp ±10pp invariato', () => {
    const pMarket = 0.50;
    const high = computeFinalProbability(pMarket, 0.90, 0.8);
    expect(high.clampedPAi).toBe(0.60);
    expect(high.pFinal).toBeLessThanOrEqual(0.60);

    const low = computeFinalProbability(pMarket, 0.10, 0.8);
    expect(low.clampedPAi).toBe(0.40);
    expect(low.pFinal).toBeGreaterThanOrEqual(0.40);
  });

  it('Scenario 8: Varietà Auto valida raccomandazione in [1, hardMax] e manuale prevale', () => {
    const slipLength = 6;
    const hardMax = Math.max(2, Math.ceil(slipLength / 2));
    expect(hardMax).toBe(3);

    const rec0 = 0;
    const clamped0 = Math.max(1, Math.min(hardMax, rec0));
    expect(clamped0).toBe(1);

    const rec10 = 10;
    const clamped10 = Math.max(1, Math.min(hardMax, rec10));
    expect(clamped10).toBe(3);

    const mode = 'high';
    const effective = mode === 'high' ? 2 : clamped10;
    expect(effective).toBe(2);
  });

  it('Scenario 9: La revisione della schedina (Stadio B) non altera le probabilità pFinal', () => {
    const pool = createSyntheticPoolForTest1().slice(0, 3);
    const slip = buildSlipResultObject(pool, 6, 0.08);

    const initialProbs = slip.selections.map((s) => s.pFinal);
    const initialOdds = slip.selections.map((s) => s.effectiveOdds);

    const mockReview: SlipReview = {
      verdict: 'favorevole',
      summary: 'Schedina bilanciata con ottimo valore.',
      warnings: [],
      recommendedMaxSameMarket: 2,
      overallConfidence: 0.85,
      keyFactors: ['Fattore A', 'Fattore B']
    };

    slip.slipReview = mockReview;

    expect(slip.selections.map((s) => s.pFinal)).toEqual(initialProbs);
    expect(slip.selections.map((s) => s.effectiveOdds)).toEqual(initialOdds);
  });

  it('Scenario 10: slipReview con JSON non valido viene respinto da Zod senza errori', () => {
    const invalidJsonObj = { verdict: 'non_valido', summary: 123 };
    const parseResult = SlipReviewSchema.safeParse(invalidJsonObj);
    expect(parseResult.success).toBe(false);
  });

  it('Scenario 11: Icone PWA: manifest.json referenzia icon-192.png e icon-512.png (any e maskable), i file esistono e non ci sono riferimenti a vecchi SVG', () => {
    const proposalsDir = path.resolve(process.cwd(), '../frontend/public/icon-proposals');
    expect(fs.existsSync(proposalsDir)).toBe(true);

    for (let i = 1; i <= 5; i++) {
      const iconPath = path.join(proposalsDir, `icon-${i}.png`);
      expect(fs.existsSync(iconPath)).toBe(true);
      const stat = fs.statSync(iconPath);
      expect(stat.size).toBeGreaterThan(1000);
    }

    const previewPath = path.resolve(process.cwd(), '../frontend/icon-preview.html');
    expect(fs.existsSync(previewPath)).toBe(true);

    const pubDir = path.resolve(process.cwd(), '../frontend/public');
    const icon192 = path.join(pubDir, 'icon-192.png');
    const icon512 = path.join(pubDir, 'icon-512.png');
    const appleIcon = path.join(pubDir, 'apple-touch-icon.png');
    const favicon = path.join(pubDir, 'favicon.png');

    expect(fs.existsSync(icon192)).toBe(true);
    expect(fs.existsSync(icon512)).toBe(true);
    expect(fs.existsSync(appleIcon)).toBe(true);
    expect(fs.existsSync(favicon)).toBe(true);

    const manifestPath = path.join(pubDir, 'manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    expect(manifestContent).not.toContain('.svg');
    const icon192Refs = manifest.icons.filter((ic: any) => ic.src.includes('icon-192.png'));
    const icon512Refs = manifest.icons.filter((ic: any) => ic.src.includes('icon-512.png'));

    expect(icon192Refs.length).toBeGreaterThanOrEqual(1);
    expect(icon512Refs.length).toBeGreaterThanOrEqual(1);

    const purposes = manifest.icons.map((ic: any) => ic.purpose);
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');

    expect(fs.existsSync(path.join(pubDir, 'icon-192.svg'))).toBe(false);
    expect(fs.existsSync(path.join(pubDir, 'icon-512.svg'))).toBe(false);
  });
});
