/**
 * Motore Probabilistico (Sezione 5.1, 5.3, 5.4)
 */

/**
 * 5.1.1 Probabilità implicita grezza = 1 / quota
 */
export function impliedProbability(odds: number): number {
  if (odds <= 1) return 0.999;
  return 1 / odds;
}

/**
 * Calcola la mediana di un array di numeri
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * 5.1.2 Rimozione del margine del bookmaker:
 * - Normalizzazione proporzionale: p_i = (1/q_i) / sum(1/q_k)
 * - Metodo di Shin (1993) quando il mercato è completo (n >= 2) e ha overround > 1.0:
 *   risolve per la quota d'informazione privilegiata z con bisezione e calcola le probabilità vere.
 */
export function removeBookmakerMarginProportional(oddsArray: number[]): number[] {
  if (oddsArray.length === 0) return [];
  if (oddsArray.length === 1) {
    // Un solo esito: impossibile depurare il margine (Sez. 6)
    return [impliedProbability(oddsArray[0])];
  }
  const implied = oddsArray.map(impliedProbability);
  const sumImplied = implied.reduce((acc, v) => acc + v, 0);
  if (sumImplied <= 0) return implied;
  return implied.map((p) => p / sumImplied);
}

export function removeBookmakerMarginShin(oddsArray: number[]): number[] {
  const n = oddsArray.length;
  if (n <= 1) {
    return removeBookmakerMarginProportional(oddsArray);
  }
  const implied = oddsArray.map(impliedProbability);
  const sumImplied = implied.reduce((a, b) => a + b, 0);

  // Se non c'è overround (o i dati sono anomali), usa la normalizzazione proporzionale
  if (sumImplied <= 1.0001 || sumImplied > 1.6) {
    return removeBookmakerMarginProportional(oddsArray);
  }

  // Per n = 2 il metodo di Shin e la formula analitica convergono rapidamente
  let low = 0;
  let high = 0.4; // z tipicamente < 0.15
  for (let iter = 0; iter < 30; iter++) {
    const z = (low + high) / 2;
    let probSum = 0;
    for (const pi of implied) {
      const term = Math.sqrt(z * z + 4 * (1 - z) * (pi * pi) / sumImplied);
      const pShin = (term - z) / (2 * (1 - z));
      probSum += pShin;
    }
    if (probSum > 1) {
      low = z;
    } else {
      high = z;
    }
  }

  const zFinal = (low + high) / 2;
  const shinProbs = implied.map((pi) => {
    const term = Math.sqrt(zFinal * zFinal + 4 * (1 - zFinal) * (pi * pi) / sumImplied);
    return (term - zFinal) / (2 * (1 - zFinal));
  });

  // Normalizzazione finale di precisione numerica per garantire somma = 1.0
  const total = shinProbs.reduce((a, b) => a + b, 0);
  return total > 0 ? shinProbs.map((p) => p / total) : removeBookmakerMarginProportional(oddsArray);
}

/**
 * Calcola le probabilità di mercato su un mercato completo con più bookmaker:
 * - Per ciascun bookmaker (o sulle mediane delle quote per esito), rimuove il margine.
 * - Restituisce per ciascun esito la mediana della quota e la probabilità depurata,
 *   oltre al flag `marginUnadjusted` se il mercato ha un solo esito disponibile.
 */
export function computeMarketProbabilitiesFromOutcomes(
  outcomes: Array<{ selection: string; line?: number; bookmakerOdds: number[] }>,
  useShin = true
): Array<{
  selection: string;
  line?: number;
  medianOdds: number;
  pMarket: number;
  marginUnadjusted: boolean;
}> {
  if (outcomes.length === 0) return [];

  const medianOddsPerOutcome = outcomes.map((o) =>
    o.bookmakerOdds.length > 0 ? Number(calculateMedian(o.bookmakerOdds).toFixed(2)) : 1.01
  );

  // Se il mercato ha un solo esito senza gli esiti complementari (Sez. 6):
  // non possiamo depurare il margine -> usiamo 1/quota e segniamo marginUnadjusted = true.
  if (outcomes.length === 1) {
    const q = medianOddsPerOutcome[0];
    return [
      {
        selection: outcomes[0].selection,
        line: outcomes[0].line,
        medianOdds: q,
        pMarket: Number(impliedProbability(q).toFixed(4)),
        marginUnadjusted: true
      }
    ];
  }

  // Calcoliamo le probabilità senza margine per ogni bookmaker (indice b) quando possibile
  const maxBooks = Math.max(...outcomes.map((o) => o.bookmakerOdds.length));
  const perOutcomeCleanProbs: number[][] = outcomes.map(() => []);

  for (let b = 0; b < maxBooks; b++) {
    const bookOddsSlice = outcomes.map((o, idx) => o.bookmakerOdds[b] ?? medianOddsPerOutcome[idx]);
    const cleanSlice = useShin
      ? removeBookmakerMarginShin(bookOddsSlice)
      : removeBookmakerMarginProportional(bookOddsSlice);
    cleanSlice.forEach((p, idx) => {
      perOutcomeCleanProbs[idx].push(p);
    });
  }

  // Mediana delle probabilità senza margine (Sez. 5.1 punto 3) e ri-normalizzazione fine
  const rawMedians = perOutcomeCleanProbs.map((probs) => calculateMedian(probs));
  const sumMedians = rawMedians.reduce((a, b) => a + b, 0);
  const normalizedMedians =
    sumMedians > 0 ? rawMedians.map((p) => p / sumMedians) : removeBookmakerMarginProportional(medianOddsPerOutcome);

  return outcomes.map((o, idx) => ({
    selection: o.selection,
    line: o.line,
    medianOdds: medianOddsPerOutcome[idx],
    pMarket: Number(normalizedMedians[idx].toFixed(4)),
    marginUnadjusted: false
  }));
}

/**
 * 5.3 Probabilità finale:
 * p_final = w * p_mercato + (1 - w) * p_ai_clamped
 * - w = 0.70 di default; sale a 0.90 se confidence dell'AI < 0.5
 * - Limita p_ai entro ±10 punti percentuali (±0.10) da p_mercato per evitare stime allucinate
 */
export function computeFinalProbability(
  pMarket: number,
  pAi?: number,
  aiConfidence?: number
): { pFinal: number; clampedPAi?: number; weightMarket: number; estimationMode: 'ai_plus_market' | 'market_only' } {
  if (pAi === undefined || pAi === null || Number.isNaN(pAi)) {
    return {
      pFinal: Number(pMarket.toFixed(4)),
      weightMarket: 1.0,
      estimationMode: 'market_only'
    };
  }

  const minAllowed = Math.max(0.01, pMarket - 0.10);
  const maxAllowed = Math.min(0.99, pMarket + 0.10);
  const clampedPAi = Math.max(minAllowed, Math.min(maxAllowed, pAi));

  const conf = aiConfidence ?? 0.5;
  const w = conf < 0.5 ? 0.90 : 0.70;
  const pFinal = w * pMarket + (1 - w) * clampedPAi;

  return {
    pFinal: Number(pFinal.toFixed(4)),
    clampedPAi: Number(clampedPAi.toFixed(4)),
    weightMarket: w,
    estimationMode: 'ai_plus_market'
  };
}

/**
 * 5.4 Valore Atteso (EV) e Edge:
 * EV   = p_final * quota - 1
 * edge = p_final - 1 / quota
 */
export function computeEvAndEdge(pFinal: number, effectiveOdds: number): { ev: number; edge: number } {
  const ev = pFinal * effectiveOdds - 1;
  const edge = pFinal - 1 / effectiveOdds;
  return {
    ev: Number(ev.toFixed(4)),
    edge: Number(edge.toFixed(4))
  };
}

