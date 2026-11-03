import {
  DEFAULT_TARGET_TOLERANCE,
  MAX_CANDIDATE_POOL,
  MAX_MULTIPLE_EVENTS,
  MIN_SELECTION_ODDS,
  RISK_CONFIG,
  getRiskRule
} from '../config/riskConfig.js';
import {
  BetTypeKey,
  BettingSlipResult,
  CandidateSelection,
  FeasibilityCheckResult,
  MultiSportPromptInfo
} from '../types/models.js';

export function getMarketOutcomeKey(cand: CandidateSelection): string {
  const m = cand.market.toLowerCase().trim();
  const s = cand.selection.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
  return `${m}::${s}`;
}

/**
 * Verifica di fattibilità quando N è specificato (usata anche dai test di accettazione)
 */
export function checkSlipFeasibility(
  targetOdds: number,
  numEvents: number,
  riskLevel: number
): FeasibilityCheckResult {
  const rule = getRiskRule(riskLevel);
  const g = Math.pow(targetOdds, 1 / numEvents);

  if (g > rule.maxOdds + 1e-9) {
    const suggestedMinEvents = Math.min(
      MAX_MULTIPLE_EVENTS,
      Math.ceil(Math.log(targetOdds) / Math.log(rule.maxOdds))
    );
    let suggestedMinRiskLevel: number | undefined;
    for (let r = riskLevel + 1; r <= 10; r++) {
      if (RISK_CONFIG[r].maxOdds >= g) {
        suggestedMinRiskLevel = r;
        break;
      }
    }

    const riskSuggestionText = suggestedMinRiskLevel
      ? `oppure aumenta il livello di rischio ad almeno ${suggestedMinRiskLevel} (${RISK_CONFIG[suggestedMinRiskLevel].label}, quota max ${RISK_CONFIG[suggestedMinRiskLevel].maxOdds.toFixed(2)})`
      : `oppure riduci la quota desiderata`;

    return {
      feasible: false,
      status: 'target_too_high',
      geometricMeanOdds: Number(g.toFixed(2)),
      maxAllowedOddsForRisk: rule.maxOdds,
      minAllowedOdds: MIN_SELECTION_ODDS,
      suggestedMinEvents,
      suggestedMinRiskLevel,
      message: `Richiesta incoerente: per raggiungere quota ${targetOdds.toFixed(2)} in ${numEvents} eventi serve una quota media di ${g.toFixed(2)} per selezione, che supera il massimo consentito dal livello di rischio ${riskLevel} (≤ ${rule.maxOdds.toFixed(2)}). Aumenta gli eventi ad almeno N = ${suggestedMinEvents} ${riskSuggestionText}.`
    };
  }

  if (g < MIN_SELECTION_ODDS - 1e-9) {
    const suggestedMaxEvents = Math.max(
      1,
      Math.floor(Math.log(targetOdds) / Math.log(MIN_SELECTION_ODDS))
    );
    return {
      feasible: false,
      status: 'target_too_low',
      geometricMeanOdds: Number(g.toFixed(3)),
      maxAllowedOddsForRisk: rule.maxOdds,
      minAllowedOdds: MIN_SELECTION_ODDS,
      suggestedMaxEvents,
      message: `Con ${numEvents} eventi e quota desiderata ${targetOdds.toFixed(2)}, la quota media per selezione sarebbe ${g.toFixed(2)}, inferiore alla quota minima consentita (${MIN_SELECTION_ODDS.toFixed(2)}). Riduci il numero di eventi a massimo N = ${suggestedMaxEvents} oppure aumenta la quota desiderata.`
    };
  }

  return {
    feasible: true,
    status: 'ok',
    geometricMeanOdds: Number(g.toFixed(2)),
    maxAllowedOddsForRisk: rule.maxOdds,
    minAllowedOdds: MIN_SELECTION_ODDS
  };
}

/**
 * Verifica di fattibilità automatica basata su Tipo Giocata (Singola vs Multipla fino a 50 partite),
 * Quota desiderata (fino a 3000) e Livello di rischio (1-10).
 */
export function checkAutoSlipFeasibility(
  targetOdds: number,
  riskLevel: number,
  betType: BetTypeKey
): FeasibilityCheckResult {
  const rule = getRiskRule(riskLevel);

  if (betType === 'single') {
    if (targetOdds > 30.0) {
      const minEventsForMultiple = Math.min(
        MAX_MULTIPLE_EVENTS,
        Math.max(2, Math.ceil(Math.log(targetOdds) / Math.log(3.5)))
      );
      return {
        feasible: false,
        status: 'single_exceeds_risk',
        geometricMeanOdds: Number(targetOdds.toFixed(2)),
        maxAllowedOddsForRisk: 30.0,
        minAllowedOdds: MIN_SELECTION_ODDS,
        suggestedMinEvents: minEventsForMultiple,
        suggestSwitchToMultiple: true,
        message: `Per una giocata Singola su una sola partita la quota massima realistica nei mercati SNAI è 30.00 (hai inserito ${targetOdds.toFixed(
          2
        )}). Passa a "Multipla" (servono circa ${minEventsForMultiple} partite) oppure scegli una quota ≤ 30.00.`
      };
    }

    return {
      feasible: true,
      status: 'ok',
      geometricMeanOdds: Number(targetOdds.toFixed(2)),
      maxAllowedOddsForRisk: 30.0,
      minAllowedOdds: MIN_SELECTION_ODDS
    };
  }

  // Modalità Multipla (da 2 a 50 partite)
  const effectiveMaxOddsForEstimate = riskLevel === 11 ? 3.5 : rule.maxOdds;
  const minEventsRequired = Math.max(
    2,
    Math.ceil(Math.log(targetOdds) / Math.log(effectiveMaxOddsForEstimate))
  );
  const maxEventsPossible = Math.floor(Math.log(targetOdds) / Math.log(MIN_SELECTION_ODDS));

  if (maxEventsPossible < 2) {
    return {
      feasible: false,
      status: 'target_too_low',
      geometricMeanOdds: Number(Math.sqrt(targetOdds).toFixed(2)),
      maxAllowedOddsForRisk: rule.maxOdds,
      minAllowedOdds: MIN_SELECTION_ODDS,
      message: `La quota desiderata (${targetOdds.toFixed(2)}) è troppo bassa per una Multipla (minimo 2 partite con quota ≥ 1.05, ovvero quota minima 1.11). Passa a "Singola" o inserisci una quota ≥ 1.15.`
    };
  }

  if (riskLevel !== 11 && minEventsRequired > MAX_MULTIPLE_EVENTS) {
    const requiredPerEventFor50 = Math.pow(targetOdds, 1 / MAX_MULTIPLE_EVENTS);
    let suggestedMinRiskLevel: number | undefined;
    for (let r = riskLevel + 1; r <= 11; r++) {
      if (RISK_CONFIG[r].maxOdds >= requiredPerEventFor50) {
        suggestedMinRiskLevel = r;
        break;
      }
    }

    return {
      feasible: false,
      status: 'target_too_high',
      geometricMeanOdds: Number(requiredPerEventFor50.toFixed(2)),
      maxAllowedOddsForRisk: rule.maxOdds,
      minAllowedOdds: MIN_SELECTION_ODDS,
      suggestedMinRiskLevel,
      message: `Anche con il massimo di ${MAX_MULTIPLE_EVENTS} partite, a rischio ${riskLevel}/10 non è possibile raggiungere quota ${targetOdds.toFixed(2)}. Aumenta il livello di rischio${
        suggestedMinRiskLevel
          ? suggestedMinRiskLevel === 11
            ? ' a ULTRA'
            : ` ad almeno ${suggestedMinRiskLevel}/10`
          : ''
      } o riduci la quota desiderata.`
    };
  }

  const representativeN = Math.min(MAX_MULTIPLE_EVENTS, Math.max(2, minEventsRequired));
  return {
    feasible: true,
    status: 'ok',
    geometricMeanOdds: Number(Math.pow(targetOdds, 1 / representativeN).toFixed(2)),
    maxAllowedOddsForRisk: rule.maxOdds,
    minAllowedOdds: MIN_SELECTION_ODDS,
    suggestedMinEvents: representativeN
  };
}

export function scoreAndSortCandidates(
  candidates: CandidateSelection[],
  riskLevel: number
): CandidateSelection[] {
  if (candidates.length === 0) return [];
  const alpha = riskLevel === 11 ? 0.65 : (Math.max(1, Math.min(10, riskLevel)) - 1) / 9;

  const probs = candidates.map((c) => c.pFinal);
  const evs = candidates.map((c) => c.ev);

  const minP = Math.min(...probs);
  const maxP = Math.max(...probs);
  const minEv = Math.min(...evs);
  const maxEv = Math.max(...evs);

  const rangeP = maxP - minP;
  const rangeEv = maxEv - minEv;

  const scored = candidates.map((c) => {
    const pNorm = rangeP > 1e-9 ? (c.pFinal - minP) / rangeP : 1;
    // Sezione 6.2: per quote stimate dal modello ('model'), l'EV è solo indicativo
    // e NON entra nel punteggio di selezione finché l'utente non inserisce la quota reale SNAI.
    const evNorm =
      c.sourceType === 'model' && c.snaiRealOdds === undefined
        ? 0
        : rangeEv > 1e-9
        ? (c.ev - minEv) / rangeEv
        : 1;

    const aiConfBonus = riskLevel === 11 ? 0.15 * (c.aiConfidence ?? 0.7) : 0;
    const score = (1 - alpha) * pNorm + alpha * evNorm + aiConfBonus;
    return {
      ...c,
      score: Number(score.toFixed(4))
    };
  });

  return scored.sort((a, b) => b.score - a.score || b.pFinal - a.pFinal);
}

export function buildCandidatePool(
  allSelections: CandidateSelection[],
  riskLevel: number,
  betType?: BetTypeKey,
  targetOdds?: number
): {
  recommendedSingles: CandidateSelection[];
  topPool: CandidateSelection[];
} {
  const rule = getRiskRule(riskLevel);

  const filtered =
    betType === 'single'
      ? allSelections.filter((s) => s.effectiveOdds >= MIN_SELECTION_ODDS - 1e-6)
      : allSelections.filter(
          (s) =>
            s.pFinal >= rule.minProb - 1e-6 &&
            s.effectiveOdds >= MIN_SELECTION_ODDS - 1e-6 &&
            s.effectiveOdds <= rule.maxOdds + 1e-6
        );

  let sorted = scoreAndSortCandidates(filtered, betType === 'single' ? 5 : riskLevel);
  if (betType === 'single' && targetOdds !== undefined && targetOdds > 0) {
    sorted = [...sorted].sort((a, b) => {
      const distA = Math.abs(Math.log(a.effectiveOdds) - Math.log(targetOdds));
      const distB = Math.abs(Math.log(b.effectiveOdds) - Math.log(targetOdds));
      if (Math.abs(distA - distB) > 0.08) return distA - distB;
      return b.pFinal - a.pFinal;
    });
  }

  const seenEvents = new Set<string>();
  const primaryPerEvent: CandidateSelection[] = [];
  const secondarySelections: CandidateSelection[] = [];
  const countPerEvent = new Map<string, number>();
  const balancedPool: CandidateSelection[] = [];

  for (const sel of sorted) {
    const prevCount = countPerEvent.get(sel.eventId) || 0;
    if (!seenEvents.has(sel.eventId)) {
      seenEvents.add(sel.eventId);
      primaryPerEvent.push(sel);
    } else {
      secondarySelections.push(sel);
    }
    if (prevCount < 6) {
      countPerEvent.set(sel.eventId, prevCount + 1);
      balancedPool.push(sel);
    }
  }

  // Mettiamo in testa almeno la migliore selezione di ogni evento distinto così le multiple trovano sempre tutti gli eventi
  const prioritizedPool = [
    ...primaryPerEvent,
    ...balancedPool.filter((s) => !primaryPerEvent.includes(s))
  ];

  const recommendedSingles = [...primaryPerEvent, ...secondarySelections];
  const topPool = prioritizedPool.slice(0, MAX_CANDIDATE_POOL);

  return {
    recommendedSingles,
    topPool
  };
}

export function getDifficultyLabel(combinedProb: number): BettingSlipResult['difficultyLabel'] {
  if (combinedProb >= 0.45) return 'Bassa';
  if (combinedProb >= 0.25) return 'Media';
  if (combinedProb >= 0.12) return 'Alta';
  if (combinedProb >= 0.05) return 'Molto Alta';
  return 'Estrema';
}

export function buildSlipResultObject(
  selections: CandidateSelection[],
  targetOdds: number,
  tolerance: number,
  explanation?: string,
  wasRelaxed?: boolean
): BettingSlipResult {
  const totalOdds = Number(
    selections.reduce((acc, s) => acc * s.effectiveOdds, 1).toFixed(2)
  );
  const combinedProbability = Number(
    selections.reduce((acc, s) => acc * s.pFinal, 1).toFixed(4)
  );
  const combinedEv = Number((combinedProbability * totalOdds - 1).toFixed(4));

  const minTarget = targetOdds * (1 - tolerance);
  const maxTarget = targetOdds * (1 + tolerance);
  const withinTolerance = totalOdds >= minTarget - 1e-6 && totalOdds <= maxTarget + 1e-6;

  const lowProbabilityWarning = combinedProbability < 0.05;
  const negativeEvNotice =
    combinedEv < 0
      ? `Valore atteso (EV) negativo (${(combinedEv * 100).toFixed(1)}%): il margine matematico dei bookmaker riduce il rendimento teorico nel lungo periodo.`
      : null;

  // Sezione 6.5: controllo varietà e avviso sulle stime dello stesso modello
  const counts = new Map<string, number>();
  let maxFound = 1;
  for (const s of selections) {
    const k = getMarketOutcomeKey(s);
    const c = (counts.get(k) || 0) + 1;
    counts.set(k, c);
    if (c > maxFound) maxFound = c;
  }

  const sameModelWarning =
    maxFound >= 3
      ? 'Le stime condividono lo stesso modello o mercato, la probabilità reale può essere più bassa.'
      : undefined;

  return {
    selections,
    totalOdds,
    targetOdds,
    combinedProbability,
    combinedEv,
    withinTolerance,
    toleranceUsed: tolerance,
    difficultyLabel: getDifficultyLabel(combinedProbability),
    lowProbabilityWarning,
    negativeEvNotice,
    explanation,
    sameModelWarning
  };
}

/**
 * Ricerca Beam Search per un numero fisso N di selezioni (1 selezione max per evento)
 * con supporto al vincolo di varietà (maxSameMarket) e penalità per ripetizione.
 */
export function findBestBettingSlip(
  candidatePool: CandidateSelection[],
  targetOdds: number,
  numEvents: number,
  riskLevel: number,
  tolerance: number = DEFAULT_TARGET_TOLERANCE,
  maxSameMarket?: number
): BettingSlipResult | null {
  const distinctEvents = new Set(candidatePool.map((c) => c.eventId));
  if (distinctEvents.size < numEvents || numEvents < 1) {
    return null;
  }

  const desiredGeometricStep = Math.pow(targetOdds, 1 / numEvents);
  const BEAM_WIDTH = numEvents > 12 ? 50 : 80;

  interface PartialCombo {
    selections: CandidateSelection[];
    usedEventIds: Set<string>;
    marketCounts: Map<string, number>;
    oddsProduct: number;
    probProduct: number;
    diversityPenalty: number;
  }

  // Funzione interna di ricerca con un dato limite hard su maxSameMarket
  const runBeamWithLimit = (limit?: number): { slip: BettingSlipResult; withinTol: boolean } | null => {
    let beam: PartialCombo[] = [
      {
        selections: [],
        usedEventIds: new Set<string>(),
        marketCounts: new Map<string, number>(),
        oddsProduct: 1.0,
        probProduct: 1.0,
        diversityPenalty: 0
      }
    ];

    for (let step = 1; step <= numEvents; step++) {
      const nextBeam: PartialCombo[] = [];
      const seenSignatures = new Set<string>();
      const expectedSubTarget = Math.pow(desiredGeometricStep, step);

      for (const partial of beam) {
        for (const cand of candidatePool) {
          if (partial.usedEventIds.has(cand.eventId)) continue;

          const mKey = getMarketOutcomeKey(cand);
          const currentCount = partial.marketCounts.get(mKey) || 0;
          if (limit !== undefined && currentCount >= limit) {
            continue; // Rispetta il vincolo di varietà
          }

          const nextSelections = [...partial.selections, cand];
          const signature = nextSelections
            .map((s) => s.id)
            .sort()
            .join('|');

          if (seenSignatures.has(signature)) continue;
          seenSignatures.add(signature);

          const nextUsed = new Set(partial.usedEventIds);
          nextUsed.add(cand.eventId);

          const nextCounts = new Map(partial.marketCounts);
          nextCounts.set(mKey, currentCount + 1);

          // Penalità morbida di varietà se una selezione è già presente più volte
          const addedPenalty = currentCount > 0 ? currentCount * 0.12 : 0;

          nextBeam.push({
            selections: nextSelections,
            usedEventIds: nextUsed,
            marketCounts: nextCounts,
            oddsProduct: partial.oddsProduct * cand.effectiveOdds,
            probProduct: partial.probProduct * cand.pFinal,
            diversityPenalty: partial.diversityPenalty + addedPenalty
          });
        }
      }

      if (nextBeam.length === 0) {
        return null;
      }

      if (step < numEvents) {
        nextBeam.sort((a, b) => {
          const distA = Math.abs(Math.log(a.oddsProduct) - Math.log(expectedSubTarget));
          const distB = Math.abs(Math.log(b.oddsProduct) - Math.log(expectedSubTarget));
          const heuristicA = distA - 0.35 * a.probProduct + a.diversityPenalty;
          const heuristicB = distB - 0.35 * b.probProduct + b.diversityPenalty;
          return heuristicA - heuristicB;
        });
        beam = nextBeam.slice(0, BEAM_WIDTH);
      } else {
        beam = nextBeam;
      }
    }

    const minAllowedTotal = targetOdds * (1 - tolerance);
    const maxAllowedTotal = targetOdds * (1 + tolerance);

    const withinToleranceCombos = beam.filter(
      (c) => c.oddsProduct >= minAllowedTotal - 1e-6 && c.oddsProduct <= maxAllowedTotal + 1e-6
    );

    const alpha = (Math.max(1, Math.min(10, riskLevel)) - 1) / 9;

    if (withinToleranceCombos.length > 0) {
      const pValues = withinToleranceCombos.map((c) => c.probProduct);
      const evValues = withinToleranceCombos.map((c) => c.probProduct * c.oddsProduct - 1);

      const minP = Math.min(...pValues);
      const maxP = Math.max(...pValues);
      const minEv = Math.min(...evValues);
      const maxEv = Math.max(...evValues);

      const rangeP = maxP - minP;
      const rangeEv = maxEv - minEv;

      let bestCombo = withinToleranceCombos[0];
      let bestScore = -Infinity;

      for (const combo of withinToleranceCombos) {
        const evComb = combo.probProduct * combo.oddsProduct - 1;
        const pNorm = rangeP > 1e-9 ? (combo.probProduct - minP) / rangeP : 1;
        const evNorm = rangeEv > 1e-9 ? (evComb - minEv) / rangeEv : 1;
        // Includi una penalità morbida di varietà nel punteggio finale
        const score = (1 - alpha) * pNorm + alpha * evNorm - 0.15 * combo.diversityPenalty;

        if (score > bestScore) {
          bestScore = score;
          bestCombo = combo;
        }
      }

      return {
        slip: buildSlipResultObject(
          bestCombo.selections,
          targetOdds,
          tolerance,
          `Schedina di ${bestCombo.selections.length} ${
            bestCombo.selections.length === 1 ? 'evento' : 'eventi'
          } ottimizzata entro ±${Math.round(tolerance * 100)}% dalla quota ${targetOdds.toFixed(2)}.`
        ),
        withinTol: true
      };
    }

    beam.sort((a, b) => {
      const diffA = Math.abs(Math.log(a.oddsProduct) - Math.log(targetOdds));
      const diffB = Math.abs(Math.log(b.oddsProduct) - Math.log(targetOdds));
      if (Math.abs(diffA - diffB) > 0.015) return diffA - diffB;
      return b.probProduct - a.probProduct;
    });

    const closest = beam[0];
    return {
      slip: buildSlipResultObject(
        closest.selections,
        targetOdds,
        tolerance,
        `Nota: nessuna combinazione rientra nel ±${Math.round(tolerance * 100)}% di quota ${targetOdds.toFixed(
          2
        )}. Viene mostrata la combinazione valida più vicina (${closest.selections.length} ${
          closest.selections.length === 1 ? 'partita' : 'partite'
        }, quota ${closest.oddsProduct.toFixed(2)}).`
      ),
      withinTol: false
    };
  };

  // 1. Prova con il limite richiesto
  let attempt = runBeamWithLimit(maxSameMarket);
  if (attempt && attempt.withinTol) {
    return attempt.slip;
  }

  // 2. Se non rientra nella tolleranza o non trova nulla, rilassa gradualmente fino a numEvents (Sezione 6.3)
  if (maxSameMarket !== undefined && maxSameMarket < numEvents) {
    for (let relaxedLimit = maxSameMarket + 1; relaxedLimit <= numEvents; relaxedLimit++) {
      const relaxedAttempt = runBeamWithLimit(relaxedLimit);
      if (relaxedAttempt && relaxedAttempt.withinTol) {
        relaxedAttempt.slip.explanation = `${relaxedAttempt.slip.explanation || ''} (Nota: vincolo di varietà rilassato a ${relaxedLimit} selezioni uguali per raggiungere la quota target).`;
        return relaxedAttempt.slip;
      }
    }
  }

  return attempt ? attempt.slip : null;
}

/**
 * Ricerca automatica del numero ottimale di partite (1 per Singola, da 2 a 50 per Multipla)
 * con supporto per la varietà massima di mercato.
 */
export function findBestBettingSlipAuto(
  candidatePool: CandidateSelection[],
  targetOdds: number,
  riskLevel: number,
  betType: BetTypeKey,
  tolerance: number = DEFAULT_TARGET_TOLERANCE,
  maxSameMarket?: number
): BettingSlipResult | null {
  if (candidatePool.length === 0) return null;

  if (betType === 'single') {
    const minAcceptable = targetOdds * (1 - tolerance);
    const maxAcceptable = targetOdds * (1 + tolerance);
    const inBand = candidatePool.filter(
      (c) => c.effectiveOdds >= minAcceptable && c.effectiveOdds <= maxAcceptable
    );
    if (inBand.length > 0) {
      const bestInBand = [...inBand].sort((a, b) => b.pFinal - a.pFinal || b.ev - a.ev)[0];
      return buildSlipResultObject([bestInBand], targetOdds, tolerance);
    }
    const closest = [...candidatePool].sort((a, b) => {
      const dA = Math.abs(Math.log(a.effectiveOdds) - Math.log(targetOdds));
      const dB = Math.abs(Math.log(b.effectiveOdds) - Math.log(targetOdds));
      return dA - dB || b.pFinal - a.pFinal;
    })[0];
    return buildSlipResultObject(
      [closest],
      targetOdds,
      tolerance,
      `Pronostico AI più vicino alla quota richiesta ${targetOdds.toFixed(2)} (quota trovata: ${closest.effectiveOdds.toFixed(2)}).`
    );
  }

  const rule = getRiskRule(riskLevel);
  const distinctEventsCount = new Set(candidatePool.map((c) => c.eventId)).size;
  if (distinctEventsCount === 0) return null;

  if (distinctEventsCount === 1) {
    const singleFallback = findBestBettingSlip(candidatePool, targetOdds, 1, riskLevel, tolerance, maxSameMarket);
    if (singleFallback) {
      singleFallback.explanation =
        'Nota: è stato trovato 1 solo evento compatibile nella finestra scelta.';
    }
    return singleFallback;
  }

  const maxN = Math.min(MAX_MULTIPLE_EVENTS, distinctEventsCount);
  const theoreticalMinN = Math.max(2, Math.ceil(Math.log(targetOdds) / Math.log(rule.maxOdds)));
  const startN = Math.min(maxN, theoreticalMinN);

  const maxEventOddsMap = new Map<string, number>();
  for (const c of candidatePool) {
    const prev = maxEventOddsMap.get(c.eventId) || 0;
    if (c.effectiveOdds > prev) maxEventOddsMap.set(c.eventId, c.effectiveOdds);
  }
  const eventMaxList = Array.from(maxEventOddsMap.values()).sort((a, b) => b - a);
  const avgTopEventOdds =
    eventMaxList.length > 0
      ? eventMaxList.slice(0, Math.min(10, eventMaxList.length)).reduce((a, b) => a + b, 0) /
        Math.min(10, eventMaxList.length)
      : rule.maxOdds;
  const realisticMinN = Math.min(
    maxN,
    Math.max(2, Math.floor(Math.log(targetOdds) / Math.log(Math.max(1.08, avgTopEventOdds))))
  );

  const candidateNs = new Set<number>();
  const optimalN = Math.max(
    2,
    Math.round(Math.log(targetOdds) / Math.log(Math.max(1.20, Math.min(rule.maxOdds, avgTopEventOdds))))
  );
  for (let offset = -1; offset <= 2; offset++) {
    const candidate = optimalN + offset;
    if (candidate >= 2 && candidate <= maxN) {
      candidateNs.add(candidate);
    }
  }
  if (candidateNs.size === 0) {
    candidateNs.add(Math.min(maxN, Math.max(2, startN)));
  }

  const validSlips: BettingSlipResult[] = [];
  for (const n of candidateNs) {
    const slip = findBestBettingSlip(candidatePool, targetOdds, n, riskLevel, tolerance, maxSameMarket);
    if (slip) {
      validSlips.push(slip);
    }
  }

  if (validSlips.length === 0) return null;

  const withinTol = validSlips.filter((s) => s.withinTolerance);
  const alpha = (Math.max(1, Math.min(10, riskLevel)) - 1) / 9;

  if (withinTol.length > 0) {
    withinTol.sort((a, b) => {
      const scoreA = (1 - alpha) * a.combinedProbability + alpha * a.combinedEv;
      const scoreB = (1 - alpha) * b.combinedProbability + alpha * b.combinedEv;
      return scoreB - scoreA;
    });
    return withinTol[0];
  }

  validSlips.sort((a, b) => {
    const dA = Math.abs(Math.log(a.totalOdds) - Math.log(targetOdds));
    const dB = Math.abs(Math.log(b.totalOdds) - Math.log(targetOdds));
    return dA - dB;
  });
  return validSlips[0];
}

export function evaluateMultiSportPermissionNeeded(
  candidatePool: CandidateSelection[],
  targetOdds: number,
  riskLevel: number,
  betType: BetTypeKey,
  selectedSportsCount: number,
  tolerance: number = DEFAULT_TARGET_TOLERANCE
): MultiSportPromptInfo {
  if (selectedSportsCount > 1 || betType === 'single') {
    return {
      required: false,
      reason: '',
      currentSportMaxOdds: 0,
      availableEventsInSelectedSport: 0,
      minimumEventsNeeded: 1
    };
  }

  const rule = getRiskRule(riskLevel);
  const minEventsNeeded = Math.max(2, Math.ceil(Math.log(targetOdds) / Math.log(rule.maxOdds)));

  const maxOddsByEvent = new Map<string, number>();
  for (const sel of candidatePool) {
    const prev = maxOddsByEvent.get(sel.eventId) || 0;
    if (sel.effectiveOdds > prev) {
      maxOddsByEvent.set(sel.eventId, sel.effectiveOdds);
    }
  }

  const sortedMaxEventOdds = Array.from(maxOddsByEvent.values())
    .sort((a, b) => b - a)
    .slice(0, MAX_MULTIPLE_EVENTS);

  const availableEvents = sortedMaxEventOdds.length;
  const maxAchievableOdds =
    availableEvents > 0
      ? Number(sortedMaxEventOdds.reduce((acc, q) => acc * q, 1).toFixed(2))
      : 0;

  const minTargetAcceptable = targetOdds * (1 - tolerance);

  if (availableEvents < 2 || maxAchievableOdds < minTargetAcceptable) {
    return {
      required: true,
      reason:
        availableEvents === 0
          ? `Nello sport selezionato non ci sono partite che rispettano il livello di rischio ${riskLevel}/10 (quota max ${rule.maxOdds.toFixed(
              2
            )}, prob. min ${Math.round(rule.minProb * 100)}%). Vuoi autorizzare SAMU BET a creare una schedina combinando più sport?`
          : `Con il solo sport selezionato e rischio ${riskLevel}/10 (${
              rule.label
            }) ci sono ${availableEvents} partite idonee per una quota massima combinabile di ${maxAchievableOdds.toFixed(
              2
            )} (inferiore alla quota desiderata ${targetOdds.toFixed(
              2
            )}). Vuoi autorizzare una schedina con più sport per raggiungere la quota?`,
      currentSportMaxOdds: maxAchievableOdds,
      availableEventsInSelectedSport: availableEvents,
      minimumEventsNeeded: minEventsNeeded
    };
  }

  return {
    required: false,
    reason: '',
    currentSportMaxOdds: maxAchievableOdds,
    availableEventsInSelectedSport: availableEvents,
    minimumEventsNeeded: minEventsNeeded
  };
}
