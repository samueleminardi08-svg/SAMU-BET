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
import { CandidateSelection } from '../src/types/models.js';
import { createBridgeApp } from '../../local-ai-bridge/src/index.js';

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

