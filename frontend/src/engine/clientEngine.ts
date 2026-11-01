import {
  BetTypeKey,
  BettingSlipResult,
  CandidateSelection,
  DEFAULT_TARGET_TOLERANCE,
  MAX_MULTIPLE_EVENTS,
  MIN_SELECTION_ODDS,
  RISK_CONFIG_UI
} from '../config/riskConfig';

export function computeClientFinalProbability(
  pMarket: number,
  pAi?: number,
  aiConfidence?: number
): { pFinal: number; clampedPAi?: number; estimationMode: 'ai_plus_market' | 'market_only' } {
  if (pAi === undefined || pAi === null || Number.isNaN(pAi)) {
    return { pFinal: Number(pMarket.toFixed(4)), estimationMode: 'market_only' };
  }
  const minAllowed = Math.max(0.01, pMarket - 0.10);
  const maxAllowed = Math.min(0.99, pMarket + 0.10);
  const clampedPAi = Math.max(minAllowed, Math.min(maxAllowed, pAi));
  const w = (aiConfidence ?? 0.5) < 0.5 ? 0.90 : 0.70;
  const pFinal = w * pMarket + (1 - w) * clampedPAi;
  return {
    pFinal: Number(pFinal.toFixed(4)),
    clampedPAi: Number(clampedPAi.toFixed(4)),
    estimationMode: 'ai_plus_market'
  };
}

export function recalculateSelectionWithOddsOrAI(
  sel: CandidateSelection,
  snaiRealOdds?: number,
  aiUpdate?: {
    p_ai: number;
    confidence: number;
    key_factors: string[];
    red_flags: string[];
  }
): CandidateSelection {
  const effectiveOdds =
    snaiRealOdds !== undefined && snaiRealOdds >= 1.01 ? snaiRealOdds : sel.bookmakerOdds;

  const nextPAi = aiUpdate ? aiUpdate.p_ai : sel.pAi;
  const nextConf = aiUpdate ? aiUpdate.confidence : sel.aiConfidence;

  const { pFinal, clampedPAi, estimationMode } = computeClientFinalProbability(
    sel.pMarket,
    nextPAi,
    nextConf
  );

  const ev = Number((pFinal * effectiveOdds - 1).toFixed(4));
  const edge = Number((pFinal - 1 / effectiveOdds).toFixed(4));

  return {
    ...sel,
    snaiRealOdds: snaiRealOdds !== undefined && snaiRealOdds >= 1.01 ? snaiRealOdds : undefined,
    effectiveOdds,
    pAi: clampedPAi,
    aiConfidence: nextConf,
    pFinal,
    ev,
    edge,
    estimationMode,
    keyFactors: aiUpdate && aiUpdate.key_factors.length > 0 ? aiUpdate.key_factors : sel.keyFactors,
    redFlags: aiUpdate && aiUpdate.red_flags.length > 0 ? aiUpdate.red_flags : sel.redFlags
  };
}

export function getDifficultyLabel(combinedProb: number): BettingSlipResult['difficultyLabel'] {
  if (combinedProb >= 0.45) return 'Bassa';
  if (combinedProb >= 0.25) return 'Media';
  if (combinedProb >= 0.12) return 'Alta';
  if (combinedProb >= 0.05) return 'Molto Alta';
  return 'Estrema';
}

export function buildClientSlipObject(
  selections: CandidateSelection[],
  targetOdds: number,
  tolerance = DEFAULT_TARGET_TOLERANCE,
  explanation?: string
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

  return {
    selections,
    totalOdds,
    targetOdds,
    combinedProbability,
    combinedEv,
    withinTolerance,
    toleranceUsed: tolerance,
    difficultyLabel: getDifficultyLabel(combinedProbability),
    lowProbabilityWarning: combinedProbability < 0.05,
    negativeEvNotice:
      combinedEv < 0
        ? `Valore atteso (EV) negativo (${(combinedEv * 100).toFixed(1)}%): il margine matematico dei bookmaker riduce il rendimento teorico nel lungo periodo.`
        : null,
    explanation
  };
}

function searchSlipFixedN(
  topPool: CandidateSelection[],
  targetOdds: number,
  numEvents: number,
  riskLevel: number,
  tolerance: number
): BettingSlipResult | null {
  const distinctEvents = new Set(topPool.map((c) => c.eventId));
  if (distinctEvents.size < numEvents || numEvents < 1) return null;

  const desiredGeometricStep = Math.pow(targetOdds, 1 / numEvents);
  const BEAM_WIDTH = numEvents > 12 ? 80 : 180;
  const alpha = (Math.max(1, Math.min(10, riskLevel)) - 1) / 9;

  interface PartialCombo {
    selections: CandidateSelection[];
    usedEventIds: Set<string>;
    oddsProduct: number;
    probProduct: number;
  }

  let beam: PartialCombo[] = [
    { selections: [], usedEventIds: new Set<string>(), oddsProduct: 1.0, probProduct: 1.0 }
  ];

  for (let step = 1; step <= numEvents; step++) {
    const nextBeam: PartialCombo[] = [];
    const seenSignatures = new Set<string>();
    const expectedSubTarget = Math.pow(desiredGeometricStep, step);

    for (const partial of beam) {
      for (const cand of topPool) {
        if (partial.usedEventIds.has(cand.eventId)) continue;
        const nextSelections = [...partial.selections, cand];
        const sig = nextSelections.map((s) => s.id).sort().join('|');
        if (seenSignatures.has(sig)) continue;
        seenSignatures.add(sig);

        const nextUsed = new Set(partial.usedEventIds);
        nextUsed.add(cand.eventId);
        nextBeam.push({
          selections: nextSelections,
          usedEventIds: nextUsed,
          oddsProduct: partial.oddsProduct * cand.effectiveOdds,
          probProduct: partial.probProduct * cand.pFinal
        });
      }
    }

    if (nextBeam.length === 0) return null;

    if (step < numEvents) {
      nextBeam.sort((a, b) => {
        const distA = Math.abs(Math.log(a.oddsProduct) - Math.log(expectedSubTarget));
        const distB = Math.abs(Math.log(b.oddsProduct) - Math.log(expectedSubTarget));
        return distA - 0.35 * a.probProduct - (distB - 0.35 * b.probProduct);
      });
      beam = nextBeam.slice(0, BEAM_WIDTH);
    } else {
      beam = nextBeam;
    }
  }

  const minAllowedTotal = targetOdds * (1 - tolerance);
  const maxAllowedTotal = targetOdds * (1 + tolerance);
  const withinTol = beam.filter(
    (c) => c.oddsProduct >= minAllowedTotal - 1e-6 && c.oddsProduct <= maxAllowedTotal + 1e-6
  );

  if (withinTol.length > 0) {
    const pVals = withinTol.map((c) => c.probProduct);
    const evVals = withinTol.map((c) => c.probProduct * c.oddsProduct - 1);
    const minP2 = Math.min(...pVals);
    const maxP2 = Math.max(...pVals);
    const minEv2 = Math.min(...evVals);
    const maxEv2 = Math.max(...evVals);
    const rP = maxP2 - minP2;
    const rEv = maxEv2 - minEv2;

    let best = withinTol[0];
    let bestScore = -Infinity;
    for (const c of withinTol) {
      const evComb = c.probProduct * c.oddsProduct - 1;
      const pN = rP > 1e-9 ? (c.probProduct - minP2) / rP : 1;
      const evN = rEv > 1e-9 ? (evComb - minEv2) / rEv : 1;
      const sc = (1 - alpha) * pN + alpha * evN;
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }

    return buildClientSlipObject(
      best.selections,
      targetOdds,
      tolerance,
      `Schedina di ${best.selections.length} ${
        best.selections.length === 1 ? 'partita' : 'partite'
      } ottimizzata entro ±${Math.round(tolerance * 100)}% dalla quota ${targetOdds.toFixed(2)}.`
    );
  }

  beam.sort((a, b) => {
    const dA = Math.abs(Math.log(a.oddsProduct) - Math.log(targetOdds));
    const dB = Math.abs(Math.log(b.oddsProduct) - Math.log(targetOdds));
    if (Math.abs(dA - dB) > 0.015) return dA - dB;
    return b.probProduct - a.probProduct;
  });

  const closest = beam[0];
  return buildClientSlipObject(
    closest.selections,
    targetOdds,
    tolerance,
    `Nota: nessuna combinazione rientra esattamente nel ±${Math.round(tolerance * 100)}% di quota ${targetOdds.toFixed(
      2
    )}. Viene mostrata la combinazione valida più vicina (${closest.selections.length} ${
      closest.selections.length === 1 ? 'partita' : 'partite'
    }, quota ${closest.oddsProduct.toFixed(2)}).`
  );
}

export function recomputeRecommendationsAndSlip(
  allSelections: CandidateSelection[],
  targetOdds: number,
  betType: BetTypeKey,
  riskLevel: number,
  tolerance = DEFAULT_TARGET_TOLERANCE
): {
  recommendedSingles: CandidateSelection[];
  bestSlip: BettingSlipResult | null;
} {
  const rule = RISK_CONFIG_UI[riskLevel] || RISK_CONFIG_UI[5];
  const alpha = riskLevel === 11 ? 0.65 : (Math.max(1, Math.min(10, riskLevel)) - 1) / 9;

  const aiBetsOnly = allSelections.filter((s) => s.estimationMode === 'ai_plus_market');
  const eligible =
    betType === 'single'
      ? aiBetsOnly.filter((s) => s.effectiveOdds >= MIN_SELECTION_ODDS - 1e-6)
      : aiBetsOnly.filter(
          (s) =>
            s.snaiRealOdds !== undefined ||
            (s.pFinal >= rule.minProb - 1e-6 &&
              s.effectiveOdds >= MIN_SELECTION_ODDS - 1e-6 &&
              s.effectiveOdds <= rule.maxOdds + 1e-6)
        );

  if (eligible.length === 0) {
    return { recommendedSingles: [], bestSlip: null };
  }

  const probs = eligible.map((c) => c.pFinal);
  const evs = eligible.map((c) => c.ev);
  const minP = Math.min(...probs);
  const maxP = Math.max(...probs);
  const minEv = Math.min(...evs);
  const maxEv = Math.max(...evs);
  const rangeP = maxP - minP;
  const rangeEv = maxEv - minEv;

  const scored = eligible
    .map((c) => {
      const pNorm = rangeP > 1e-9 ? (c.pFinal - minP) / rangeP : 1;
      const evNorm = rangeEv > 1e-9 ? (c.ev - minEv) / rangeEv : 1;
      const aiConfBonus = riskLevel === 11 ? 0.15 * (c.aiConfidence ?? 0.7) : 0;
      const score = Number(((1 - alpha) * pNorm + alpha * evNorm + aiConfBonus).toFixed(4));
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score || b.pFinal - a.pFinal);

  const seenEv = new Set<string>();
  const primary: CandidateSelection[] = [];
  const rest: CandidateSelection[] = [];
  for (const s of scored) {
    if (!seenEv.has(s.eventId)) {
      seenEv.add(s.eventId);
      primary.push(s);
    } else {
      rest.push(s);
    }
  }
  const recommendedSingles = [...primary, ...rest];
  const topPool = scored.slice(0, 80);

  if (betType === 'single') {
    return {
      recommendedSingles,
      bestSlip: searchSlipFixedN(topPool, targetOdds, 1, riskLevel, tolerance)
    };
  }

  const distinctEventsCount = new Set(topPool.map((c) => c.eventId)).size;
  if (distinctEventsCount === 0) return { recommendedSingles, bestSlip: null };
  if (distinctEventsCount === 1) {
    return {
      recommendedSingles,
      bestSlip: searchSlipFixedN(topPool, targetOdds, 1, riskLevel, tolerance)
    };
  }

  const maxN = Math.min(MAX_MULTIPLE_EVENTS, distinctEventsCount);
  const theoreticalMinN = Math.max(2, Math.ceil(Math.log(targetOdds) / Math.log(rule.maxOdds)));
  const startN = Math.min(maxN, theoreticalMinN);

  const maxEventOddsMap = new Map<string, number>();
  for (const c of topPool) {
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
  const upperExploreN = Math.min(maxN, Math.max(startN + 7, realisticMinN + 5));
  for (let n = startN; n <= upperExploreN; n++) {
    candidateNs.add(n);
  }
  candidateNs.add(maxN);

  const validSlips: BettingSlipResult[] = [];
  for (const n of candidateNs) {
    const s = searchSlipFixedN(topPool, targetOdds, n, riskLevel, tolerance);
    if (s) validSlips.push(s);
  }

  if (validSlips.length === 0) return { recommendedSingles, bestSlip: null };

  const withinTol = validSlips.filter((s) => s.withinTolerance);
  if (withinTol.length > 0) {
    withinTol.sort((a, b) => {
      const scA = (1 - alpha) * a.combinedProbability + alpha * a.combinedEv;
      const scB = (1 - alpha) * b.combinedProbability + alpha * b.combinedEv;
      return scB - scA;
    });
    return { recommendedSingles, bestSlip: withinTol[0] };
  }

  validSlips.sort((a, b) => {
    const dA = Math.abs(Math.log(a.totalOdds) - Math.log(targetOdds));
    const dB = Math.abs(Math.log(b.totalOdds) - Math.log(targetOdds));
    return dA - dB;
  });

  return { recommendedSingles, bestSlip: validSlips[0] };
}
