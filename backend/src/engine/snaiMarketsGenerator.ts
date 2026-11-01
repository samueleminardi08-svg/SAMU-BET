import { RawMarketOdds } from '../types/models.js';
import { calculateMedian, removeBookmakerMarginShin } from './probability.js';

/**
 * Calcola P(X = k) per una distribuzione di Poisson con media lambda.
 */
function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) {
    logP -= Math.log(i);
  }
  return Math.exp(logP);
}

/**
 * Costruisce una matrice di probabilità dei risultati esatti P(i, j) per i, j in [0..8]
 * con correzione di Dixon-Coles sui punteggi bassi (0-0, 1-0, 0-1, 1-1) e
 * calibrazione esatta sulle probabilità depurate dal margine (p1, pX, p2) e pOver25.
 */
export function buildCalibratedScoreMatrix(
  p1: number,
  pX: number,
  p2: number,
  pOver25?: number
): { matrix: number[][]; lambdaHome: number; lambdaAway: number } {
  const maxGoals = 8;

  // 1. Stima del numero totale di gol attesi (Lambda = lambdaHome + lambdaAway)
  let totalLambda = 2.65;
  if (pOver25 !== undefined && pOver25 > 0.15 && pOver25 < 0.88) {
    let low = 1.4;
    let high = 4.2;
    for (let iter = 0; iter < 25; iter++) {
      const mid = (low + high) / 2;
      const p012 =
        poissonPmf(mid, 0) + poissonPmf(mid, 1) + poissonPmf(mid, 2);
      const pOv = 1 - p012;
      if (pOv < pOver25) {
        low = mid;
      } else {
        high = mid;
      }
    }
    totalLambda = (low + high) / 2;
  } else {
    totalLambda = Math.max(1.85, Math.min(3.55, 3.35 - 2.4 * pX));
  }

  // 2. Bisezione sulla ripartizione s = lambdaHome / totalLambda per centrare p1 / (p1 + p2)
  const targetHomeShareOfDecisive = p1 / Math.max(0.01, p1 + p2);
  let sLow = 0.10;
  let sHigh = 0.90;
  for (let iter = 0; iter < 25; iter++) {
    const sMid = (sLow + sHigh) / 2;
    const lH = totalLambda * sMid;
    const lA = totalLambda * (1 - sMid);
    let winH = 0;
    let winA = 0;
    for (let i = 0; i <= maxGoals; i++) {
      const pH = poissonPmf(lH, i);
      for (let j = 0; j <= maxGoals; j++) {
        const pJoint = pH * poissonPmf(lA, j);
        if (i > j) winH += pJoint;
        else if (i < j) winA += pJoint;
      }
    }
    const share = winH / Math.max(1e-6, winH + winA);
    if (share < targetHomeShareOfDecisive) {
      sLow = sMid;
    } else {
      sHigh = sMid;
    }
  }

  const sFinal = (sLow + sHigh) / 2;
  const lambdaHome = totalLambda * sFinal;
  const lambdaAway = totalLambda * (1 - sFinal);

  // 3. Costruzione matrice base con correzione Dixon-Coles (rho = -0.09)
  const rho = -0.09;
  const matrix: number[][] = Array.from({ length: maxGoals + 1 }, () =>
    new Array(maxGoals + 1).fill(0)
  );

  let rawSum1 = 0;
  let rawSumX = 0;
  let rawSum2 = 0;

  for (let i = 0; i <= maxGoals; i++) {
    const pH = poissonPmf(lambdaHome, i);
    for (let j = 0; j <= maxGoals; j++) {
      const pA = poissonPmf(lambdaAway, j);
      let tau = 1.0;
      if (i === 0 && j === 0) {
        tau = Math.max(0.4, 1 - lambdaHome * lambdaAway * rho);
      } else if (i === 0 && j === 1) {
        tau = Math.max(0.4, 1 + lambdaHome * rho);
      } else if (i === 1 && j === 0) {
        tau = Math.max(0.4, 1 + lambdaAway * rho);
      } else if (i === 1 && j === 1) {
        tau = Math.max(0.4, 1 - rho);
      }

      const val = pH * pA * tau;
      matrix[i][j] = val;
      if (i > j) rawSum1 += val;
      else if (i === j) rawSumX += val;
      else rawSum2 += val;
    }
  }

  // 4. Riscalamento esatto sulle 3 regioni (Casa, Pareggio, Ospite) per coincidere con (p1, pX, p2)
  const scale1 = rawSum1 > 0 ? p1 / rawSum1 : 1;
  const scaleX = rawSumX > 0 ? pX / rawSumX : 1;
  const scale2 = rawSum2 > 0 ? p2 / rawSum2 : 1;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      if (i > j) matrix[i][j] *= scale1;
      else if (i === j) matrix[i][j] *= scaleX;
      else matrix[i][j] *= scale2;
    }
  }

  return { matrix, lambdaHome, lambdaAway };
}

/**
 * Converte una probabilità p in una quota con margine bookmaker (overround)
 * e restituisce la coppia [esito, complemento] per consentire la depurazione esatta del margine.
 */
function buildBinaryOutcomePair(
  selectionLabel: string,
  probYes: number,
  overround = 1.06,
  line?: number
): Array<{ selection: string; line?: number; bookmakerOdds: number[] }> {
  const pClamped = Math.max(0.012, Math.min(0.975, probYes));
  const pNo = 1 - pClamped;
  const qYes = Number(Math.max(1.03, 1 / (pClamped * overround)).toFixed(2));
  const qNo = Number(Math.max(1.03, 1 / (pNo * overround)).toFixed(2));

  return [
    { selection: selectionLabel, line, bookmakerOdds: [qYes] },
    { selection: `__complement__${selectionLabel}`, line, bookmakerOdds: [qNo] }
  ];
}

/**
 * Converte due esiti espliciti Sì/No in una coppia di outcome entrambi visibili.
 */
function buildExplicitYesNoOutcomes(
  yesLabel: string,
  noLabel: string,
  probYes: number,
  overround = 1.065,
  line?: number
): Array<{ selection: string; line?: number; bookmakerOdds: number[] }> {
  const pClamped = Math.max(0.015, Math.min(0.975, probYes));
  const pNo = 1 - pClamped;
  const qYes = Number(Math.max(1.03, 1 / (pClamped * overround)).toFixed(2));
  const qNo = Number(Math.max(1.03, 1 / (pNo * overround)).toFixed(2));

  return [
    { selection: yesLabel, line, bookmakerOdds: [qYes] },
    { selection: noLabel, line, bookmakerOdds: [qNo] }
  ];
}

/**
 * Converte una terna di probabilità (che sommano a ~1) in 3 outcome con margine bookmaker.
 */
function buildTernaryOutcomes(
  items: Array<{ label: string; prob: number }>,
  overround = 1.065
): Array<{ selection: string; bookmakerOdds: number[] }> {
  const rawSum = items.reduce((a, b) => a + Math.max(0.01, b.prob), 0);
  return items.map((it) => {
    const pNorm = Math.max(0.015, Math.min(0.96, Math.max(0.01, it.prob) / rawSum));
    const q = Number(Math.max(1.04, 1 / (pNorm * overround)).toFixed(2));
    return {
      selection: it.label,
      bookmakerOdds: [q]
    };
  });
}

interface TeamPlayersProfile {
  striker: string;
  secondAttacker: string;
  playmaker: string;
  midfielder: string;
}

/**
 * Restituisce i ruoli base della squadra (senza nomi hardcoded statici).
 * Durante l'analisi della partita, l'IA incrocia le probabili formazioni, i marcatori ufficiali
 * della competizione e le notizie RSS per sostituire dinamicamente il ruolo con il Nome e Cognome
 * del titolare effettivo previsto in campo.
 */
function resolveTeamPlayers(teamName: string): TeamPlayersProfile {
  return {
    striker: `Centravanti Titolare (${teamName})`,
    secondAttacker: `Attaccante Esterno (${teamName})`,
    playmaker: `Trequartista / Regista (${teamName})`,
    midfielder: `Mediano Titolare (${teamName})`
  };
}

/**
 * Genera l'intero catalogo completo di mercati SNAI per una partita di Calcio:
 * 1. Mercati Principali ed Esiti (1X2 Finale/1°T/2°T, DC Finale/1°T/2°T, U/O 0.5..7.5, U/O 1°T/2°T,
 *    GG/NG Finale/1°T/2°T, Risultato Esatto 26 esiti + multipli + 1°T/2°T, Parziale/Finale 9 esiti,
 *    Multigoal Totale/Casa/Ospite, Handicap 1X2, DNB, Home/Away No Bet, Pari/Dispari Finale/1°T/2°T,
 *    Segna Gol 1/Ultimo, Ribaltone, Squadra Segna Sì/No, Segna nei 2 tempi, Vince entrambi i tempi, Vince a zero)
 * 2. Tutte le Combo SNAI (1X2+U/O, 1X2+GG/NG, 1X2+Multigoal, DC+U/O, DC+GG/NG, DC+Multigoal,
 *    GG/NG+U/O, 1X2 1°T + 1X2 2°T, Parziale/Finale + U/O, Tricombo)
 * 3. Giocatori e Prestazioni SNAI Speciali (Marcatore, Primo/Ultimo Marcatore, Doppietta/Tripletta,
 *    Marcatore+1X2, Marcatore+Risultato Esatto, Tiri/Tiri in Porta, Assist, Cartellino, Tackle/Contrasti, Passaggi)
 * 4. Sanzioni, Calci d'Angolo e Speciali Match (U/O Angoli, 1X2 Angoli, U/O Cartellini e Punti Cartellino,
 *    1X2 Cartellini, Espulsione Sì/No, Rigore Sì/No, Rigore+Espulsione, Autorete Sì/No, Metodo 1° Gol,
 *    Sostituzione 1°T Sì/No, Minuto del 1° Gol a fasce di 15 e 10 minuti).
 */
export function generateFootballSnaiMarkets(
  homeTeam: string,
  awayTeam: string,
  existingMarkets: RawMarketOdds[]
): RawMarketOdds[] {
  const h2hMarket = existingMarkets.find((m) => m.marketKey === 'h2h');
  if (!h2hMarket || h2hMarket.outcomes.length < 3) {
    return existingMarkets;
  }

  const out1 = h2hMarket.outcomes.find((o) => o.selection.startsWith('1 '));
  const outX = h2hMarket.outcomes.find((o) => o.selection.startsWith('X '));
  const out2 = h2hMarket.outcomes.find((o) => o.selection.startsWith('2 '));

  if (!out1 || !outX || !out2) {
    return existingMarkets;
  }

  const q1 = calculateMedian(out1.bookmakerOdds);
  const qX = calculateMedian(outX.bookmakerOdds);
  const q2 = calculateMedian(out2.bookmakerOdds);
  const [p1, pX, p2] = removeBookmakerMarginShin([q1, qX, q2]);

  let pOver25: number | undefined;
  const totals25 = existingMarkets.find((m) => m.marketKey === 'totals_2.5');
  if (totals25 && totals25.outcomes.length === 2) {
    const ov = totals25.outcomes.find((o) => o.selection.startsWith('Over'));
    const un = totals25.outcomes.find((o) => o.selection.startsWith('Under'));
    if (ov && un) {
      const [pOv] = removeBookmakerMarginShin([
        calculateMedian(ov.bookmakerOdds),
        calculateMedian(un.bookmakerOdds)
      ]);
      pOver25 = pOv;
    }
  }

  const { matrix, lambdaHome, lambdaAway } = buildCalibratedScoreMatrix(p1, pX, p2, pOver25);
  const maxGoals = matrix.length - 1;
  const totalLambda = lambdaHome + lambdaAway;

  const sumMatrix = (pred: (i: number, j: number) => boolean): number => {
    let total = 0;
    for (let i = 0; i <= maxGoals; i++) {
      for (let j = 0; j <= maxGoals; j++) {
        if (pred(i, j)) total += matrix[i][j];
      }
    }
    return Math.max(0.005, Math.min(0.99, total));
  };

  // Matrici 1° Tempo (44% dei gol attesi) e 2° Tempo (56% dei gol attesi)
  const lH1 = lambdaHome * 0.44;
  const lA1 = lambdaAway * 0.44;
  const lH2 = lambdaHome * 0.56;
  const lA2 = lambdaAway * 0.56;

  const maxHalfGoals = 5;
  const matrixHT: number[][] = Array.from({ length: maxHalfGoals + 1 }, () =>
    new Array(maxHalfGoals + 1).fill(0)
  );
  const matrix2HT: number[][] = Array.from({ length: maxHalfGoals + 1 }, () =>
    new Array(maxHalfGoals + 1).fill(0)
  );

  let sumHT = 0;
  let sum2HT = 0;
  for (let i = 0; i <= maxHalfGoals; i++) {
    const ph1 = poissonPmf(lH1, i);
    const ph2 = poissonPmf(lH2, i);
    for (let j = 0; j <= maxHalfGoals; j++) {
      const v1 = ph1 * poissonPmf(lA1, j);
      const v2 = ph2 * poissonPmf(lA2, j);
      matrixHT[i][j] = v1;
      matrix2HT[i][j] = v2;
      sumHT += v1;
      sum2HT += v2;
    }
  }
  for (let i = 0; i <= maxHalfGoals; i++) {
    for (let j = 0; j <= maxHalfGoals; j++) {
      matrixHT[i][j] /= sumHT;
      matrix2HT[i][j] /= sum2HT;
    }
  }

  const sumHalf = (mat: number[][], pred: (i: number, j: number) => boolean): number => {
    let tot = 0;
    for (let i = 0; i <= maxHalfGoals; i++) {
      for (let j = 0; j <= maxHalfGoals; j++) {
        if (pred(i, j)) tot += mat[i][j];
      }
    }
    return Math.max(0.008, Math.min(0.985, tot));
  };

  const p1HT = sumHalf(matrixHT, (i, j) => i > j);
  const pXHT = sumHalf(matrixHT, (i, j) => i === j);
  const p2HT = sumHalf(matrixHT, (i, j) => i < j);

  const p1_2T = sumHalf(matrix2HT, (i, j) => i > j);
  const pX_2T = sumHalf(matrix2HT, (i, j) => i === j);
  const p2_2T = sumHalf(matrix2HT, (i, j) => i < j);

  const resultMarkets: RawMarketOdds[] = [...existingMarkets];
  const existingKeys = new Set(existingMarkets.map((m) => m.marketKey));

  // ============================================================================
  // SEZIONE 1: MERCATI PRINCIPALI ED ESITI
  // ============================================================================

  // 1.1 Esito 1° Tempo & Esito 2° Tempo (1X2)
  resultMarkets.push({
    marketKey: 'h2h_1st_half',
    marketName: 'Esito 1° Tempo',
    outcomes: buildTernaryOutcomes([
      { label: `1° Tempo: 1 (${homeTeam})`, prob: p1HT },
      { label: '1° Tempo: X', prob: pXHT },
      { label: `1° Tempo: 2 (${awayTeam})`, prob: p2HT }
    ])
  });

  resultMarkets.push({
    marketKey: 'h2h_2nd_half',
    marketName: 'Esito 2° Tempo',
    outcomes: buildTernaryOutcomes([
      { label: `2° Tempo: 1 (${homeTeam})`, prob: p1_2T },
      { label: '2° Tempo: X', prob: pX_2T },
      { label: `2° Tempo: 2 (${awayTeam})`, prob: p2_2T }
    ])
  });

  // 1.2 Doppia Chance Primo Tempo & Secondo Tempo
  resultMarkets.push({
    marketKey: 'dc_1st_half_1x',
    marketName: 'Doppia Chance 1° Tempo',
    outcomes: buildBinaryOutcomePair('1X 1° Tempo', p1HT + pXHT, 1.06)
  });
  resultMarkets.push({
    marketKey: 'dc_1st_half_x2',
    marketName: 'Doppia Chance 1° Tempo',
    outcomes: buildBinaryOutcomePair('X2 1° Tempo', pXHT + p2HT, 1.06)
  });
  resultMarkets.push({
    marketKey: 'dc_1st_half_12',
    marketName: 'Doppia Chance 1° Tempo',
    outcomes: buildBinaryOutcomePair('12 1° Tempo', p1HT + p2HT, 1.06)
  });

  resultMarkets.push({
    marketKey: 'dc_2nd_half_1x',
    marketName: 'Doppia Chance 2° Tempo',
    outcomes: buildBinaryOutcomePair('1X 2° Tempo', p1_2T + pX_2T, 1.06)
  });
  resultMarkets.push({
    marketKey: 'dc_2nd_half_x2',
    marketName: 'Doppia Chance 2° Tempo',
    outcomes: buildBinaryOutcomePair('X2 2° Tempo', pX_2T + p2_2T, 1.06)
  });
  resultMarkets.push({
    marketKey: 'dc_2nd_half_12',
    marketName: 'Doppia Chance 2° Tempo',
    outcomes: buildBinaryOutcomePair('12 2° Tempo', p1_2T + p2_2T, 1.06)
  });

  // 1.3 Under / Over Totale (da 0.5 a 7.5 Gol)
  const fullGoalLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5];
  for (const line of fullGoalLines) {
    const mKey = `totals_${line}`;
    if (!existingKeys.has(mKey)) {
      const minG = Math.ceil(line);
      let pOv = 0;
      for (let k = 0; k < minG; k++) {
        pOv += poissonPmf(totalLambda, k);
      }
      pOv = Math.max(0.01, Math.min(0.985, 1 - pOv));
      if (line <= 4.5) {
        pOv = sumMatrix((i, j) => i + j >= minG);
      }
      resultMarkets.push({
        marketKey: mKey,
        marketName: `Under/Over ${line} Gol`,
        line,
        outcomes: buildExplicitYesNoOutcomes(`Over ${line}`, `Under ${line}`, pOv, 1.055, line)
      });
    }
  }

  // 1.4 Under / Over Primo Tempo e Secondo Tempo (0.5, 1.5, 2.5)
  for (const line of [0.5, 1.5, 2.5]) {
    const minG = Math.ceil(line);
    const pOv1 = sumHalf(matrixHT, (i, j) => i + j >= minG);
    resultMarkets.push({
      marketKey: `totals_1st_half_${line}`,
      marketName: `Under/Over ${line} 1° Tempo`,
      line,
      outcomes: buildExplicitYesNoOutcomes(
        `Over ${line} 1° Tempo`,
        `Under ${line} 1° Tempo`,
        pOv1,
        1.06,
        line
      )
    });

    const pOv2 = sumHalf(matrix2HT, (i, j) => i + j >= minG);
    resultMarkets.push({
      marketKey: `totals_2nd_half_${line}`,
      marketName: `Under/Over ${line} 2° Tempo`,
      line,
      outcomes: buildExplicitYesNoOutcomes(
        `Over ${line} 2° Tempo`,
        `Under ${line} 2° Tempo`,
        pOv2,
        1.06,
        line
      )
    });
  }

  // 1.5 Goal / No Goal (Finale, 1° Tempo, 2° Tempo)
  const pGG = sumMatrix((i, j) => i >= 1 && j >= 1);
  if (!existingKeys.has('btts')) {
    resultMarkets.push({
      marketKey: 'btts',
      marketName: 'Goal / No Goal',
      outcomes: buildExplicitYesNoOutcomes('Goal (GG)', 'No Goal (NG)', pGG, 1.06)
    });
  }

  const pGG1 = sumHalf(matrixHT, (i, j) => i >= 1 && j >= 1);
  resultMarkets.push({
    marketKey: 'btts_1st_half',
    marketName: 'Goal / No Goal 1° Tempo',
    outcomes: buildExplicitYesNoOutcomes('Goal 1° Tempo', 'No Goal 1° Tempo', pGG1, 1.065)
  });

  const pGG2 = sumHalf(matrix2HT, (i, j) => i >= 1 && j >= 1);
  resultMarkets.push({
    marketKey: 'btts_2nd_half',
    marketName: 'Goal / No Goal 2° Tempo',
    outcomes: buildExplicitYesNoOutcomes('Goal 2° Tempo', 'No Goal 2° Tempo', pGG2, 1.065)
  });

  // 1.6 Risultato Esatto Finale (fino a 26 esiti + Altro + Risultato Esatto Multiplo)
  let sum25Scores = 0;
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const pScore = Math.max(0.008, Math.min(0.35, matrix[i]?.[j] ?? 0.01));
      sum25Scores += matrix[i]?.[j] ?? 0;
      const qScore = Number((1 / (pScore * 1.08)).toFixed(2));
      if (qScore <= 35.0) {
        resultMarkets.push({
          marketKey: `exact_${i}_${j}`,
          marketName: 'Risultato Esatto (26 Esiti)',
          outcomes: buildBinaryOutcomePair(`Risultato Esatto: ${i}-${j}`, pScore, 1.08)
        });
      }
    }
  }
  const pAltroExact = Math.max(0.02, Math.min(0.25, 1 - sum25Scores));
  resultMarkets.push({
    marketKey: 'exact_other',
    marketName: 'Risultato Esatto (26 Esiti)',
    outcomes: buildBinaryOutcomePair('Risultato Esatto: Altro (5+ gol squadra)', pAltroExact, 1.08)
  });

  // Risultato Esatto Multiplo (Gruppi SNAI)
  const multiExactGroups: Array<{ key: string; label: string; pred: (i: number, j: number) => boolean }> = [
    {
      key: 'multi_exact_home_narrow',
      label: 'Risultato Multiplo: 1-0 / 2-0 / 2-1',
      pred: (i, j) => (i === 1 && j === 0) || (i === 2 && j === 0) || (i === 2 && j === 1)
    },
    {
      key: 'multi_exact_away_narrow',
      label: 'Risultato Multiplo: 0-1 / 0-2 / 1-2',
      pred: (i, j) => (i === 0 && j === 1) || (i === 0 && j === 2) || (i === 1 && j === 2)
    },
    {
      key: 'multi_exact_draws',
      label: 'Risultato Multiplo: 0-0 / 1-1 / 2-2',
      pred: (i, j) => (i === 0 && j === 0) || (i === 1 && j === 1) || (i === 2 && j === 2)
    },
    {
      key: 'multi_exact_home_high',
      label: 'Risultato Multiplo: 3-0 / 3-1 / 3-2 / 4-0',
      pred: (i, j) =>
        (i === 3 && (j === 0 || j === 1 || j === 2)) || (i === 4 && j === 0)
    }
  ];
  for (const grp of multiExactGroups) {
    resultMarkets.push({
      marketKey: grp.key,
      marketName: 'Risultato Esatto Multiplo',
      outcomes: buildBinaryOutcomePair(grp.label, sumMatrix(grp.pred), 1.075)
    });
  }

  // 1.7 Risultato Esatto Primo Tempo e Secondo Tempo
  const halfExactCoords: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 0],
    [0, 2],
    [2, 1],
    [1, 2]
  ];
  for (const [hi, hj] of halfExactCoords) {
    const pHTScore = Math.max(0.015, Math.min(0.55, matrixHT[hi][hj]));
    if (1 / (pHTScore * 1.075) <= 28.0) {
      resultMarkets.push({
        marketKey: `exact_1h_${hi}_${hj}`,
        marketName: 'Risultato Esatto 1° Tempo',
        outcomes: buildBinaryOutcomePair(`Risultato Esatto 1°T: ${hi}-${hj}`, pHTScore, 1.075)
      });
    }

    const p2HTScore = Math.max(0.015, Math.min(0.55, matrix2HT[hi][hj]));
    if (1 / (p2HTScore * 1.075) <= 28.0) {
      resultMarkets.push({
        marketKey: `exact_2h_${hi}_${hj}`,
        marketName: 'Risultato Esatto 2° Tempo',
        outcomes: buildBinaryOutcomePair(`Risultato Esatto 2°T: ${hi}-${hj}`, p2HTScore, 1.075)
      });
    }
  }

  // 1.8 Parziale / Finale (Tutti i 9 esiti inclusi Ribaltoni 2/1 e 1/2)
  const pRibaltoneHome = Math.max(0.018, Math.min(0.12, p2HT * p1 * 0.55));
  const pRibaltoneAway = Math.max(0.015, Math.min(0.12, p1HT * p2 * 0.55));
  const htFtPairs: Array<{ key: string; label: string; p: number }> = [
    { key: '1_1', label: 'Parziale/Finale: 1/1', p: Math.max(0.03, p1HT * (p1 / Math.max(0.15, p1HT + 0.35 * pXHT))) },
    { key: 'X_1', label: 'Parziale/Finale: X/1', p: Math.max(0.03, pXHT * p1 * 1.15) },
    { key: '2_1', label: 'Parziale/Finale: 2/1 (Ribaltone Casa)', p: pRibaltoneHome },
    { key: '1_X', label: 'Parziale/Finale: 1/X', p: Math.max(0.025, p1HT * pX * 0.85) },
    { key: 'X_X', label: 'Parziale/Finale: X/X', p: Math.max(0.03, pXHT * pX * 1.35) },
    { key: '2_X', label: 'Parziale/Finale: 2/X', p: Math.max(0.025, p2HT * pX * 0.85) },
    { key: '1_2', label: 'Parziale/Finale: 1/2 (Ribaltone Ospite)', p: pRibaltoneAway },
    { key: 'X_2', label: 'Parziale/Finale: X/2', p: Math.max(0.03, pXHT * p2 * 1.15) },
    { key: '2_2', label: 'Parziale/Finale: 2/2', p: Math.max(0.03, p2HT * (p2 / Math.max(0.15, p2HT + 0.35 * pXHT))) }
  ];

  for (const hf of htFtPairs) {
    const clampedP = Math.min(0.75, Math.max(0.018, hf.p));
    resultMarkets.push({
      marketKey: `htft_${hf.key}`,
      marketName: 'Parziale / Finale',
      outcomes: buildBinaryOutcomePair(hf.label, clampedP, 1.075)
    });
  }

  // 1.9 Multigoal Totale (ampia gamma SNAI)
  const multigoalRanges: Array<{ label: string; minG: number; maxG: number }> = [
    { label: 'Multigoal 1-2', minG: 1, maxG: 2 },
    { label: 'Multigoal 1-3', minG: 1, maxG: 3 },
    { label: 'Multigoal 1-4', minG: 1, maxG: 4 },
    { label: 'Multigoal 1-5', minG: 1, maxG: 5 },
    { label: 'Multigoal 1-6', minG: 1, maxG: 6 },
    { label: 'Multigoal 2-3', minG: 2, maxG: 3 },
    { label: 'Multigoal 2-4', minG: 2, maxG: 4 },
    { label: 'Multigoal 2-5', minG: 2, maxG: 5 },
    { label: 'Multigoal 2-6', minG: 2, maxG: 6 },
    { label: 'Multigoal 3-4', minG: 3, maxG: 4 },
    { label: 'Multigoal 3-5', minG: 3, maxG: 5 },
    { label: 'Multigoal 3-6', minG: 3, maxG: 6 },
    { label: 'Multigoal 4-6', minG: 4, maxG: 6 }
  ];

  for (const mg of multigoalRanges) {
    const pMg = sumMatrix((i, j) => {
      const tot = i + j;
      return tot >= mg.minG && tot <= mg.maxG;
    });
    resultMarkets.push({
      marketKey: `multigoal_${mg.minG}_${mg.maxG}`,
      marketName: 'Multigoal Totale',
      outcomes: buildBinaryOutcomePair(mg.label, pMg, 1.065)
    });
  }

  // 1.10 Multigoal Squadra Casa / Squadra Ospite
  const teamMgSpecs: Array<{
    key: string;
    marketName: string;
    label: string;
    pred: (i: number, j: number) => boolean;
  }> = [
    {
      key: 'mg_home_1_2',
      marketName: 'Multigoal Squadra Casa',
      label: `Multigoal Casa 1-2 (${homeTeam})`,
      pred: (i) => i >= 1 && i <= 2
    },
    {
      key: 'mg_home_1_3',
      marketName: 'Multigoal Squadra Casa',
      label: `Multigoal Casa 1-3 (${homeTeam})`,
      pred: (i) => i >= 1 && i <= 3
    },
    {
      key: 'mg_home_2_3',
      marketName: 'Multigoal Squadra Casa',
      label: `Multigoal Casa 2-3 (${homeTeam})`,
      pred: (i) => i >= 2 && i <= 3
    },
    {
      key: 'mg_home_2_4',
      marketName: 'Multigoal Squadra Casa',
      label: `Multigoal Casa 2-4 (${homeTeam})`,
      pred: (i) => i >= 2 && i <= 4
    },
    {
      key: 'mg_away_1_2',
      marketName: 'Multigoal Squadra Ospite',
      label: `Multigoal Ospite 1-2 (${awayTeam})`,
      pred: (_i, j) => j >= 1 && j <= 2
    },
    {
      key: 'mg_away_1_3',
      marketName: 'Multigoal Squadra Ospite',
      label: `Multigoal Ospite 1-3 (${awayTeam})`,
      pred: (_i, j) => j >= 1 && j <= 3
    },
    {
      key: 'mg_away_2_3',
      marketName: 'Multigoal Squadra Ospite',
      label: `Multigoal Ospite 2-3 (${awayTeam})`,
      pred: (_i, j) => j >= 2 && j <= 3
    },
    {
      key: 'mg_away_2_4',
      marketName: 'Multigoal Squadra Ospite',
      label: `Multigoal Ospite 2-4 (${awayTeam})`,
      pred: (_i, j) => j >= 2 && j <= 4
    }
  ];

  for (const spec of teamMgSpecs) {
    resultMarkets.push({
      marketKey: spec.key,
      marketName: spec.marketName,
      outcomes: buildBinaryOutcomePair(spec.label, sumMatrix(spec.pred), 1.065)
    });
  }

  // 1.11 Handicap Classico (1X2 Handicap -1, +1, -2)
  const pHcapM1_1 = sumMatrix((i, j) => i - j >= 2);
  const pHcapM1_X = sumMatrix((i, j) => i - j === 1);
  const pHcapM1_2 = sumMatrix((i, j) => i <= j);
  resultMarkets.push({
    marketKey: 'handicap_1x2_minus1',
    marketName: 'Handicap Classico 1X2 (0:1)',
    outcomes: buildTernaryOutcomes([
      { label: `1 Handicap -1 (${homeTeam} vince di 2+)`, prob: pHcapM1_1 },
      { label: `X Handicap -1 (${homeTeam} vince di 1)`, prob: pHcapM1_X },
      { label: `2 Handicap +1 (${awayTeam} o Pareggio)`, prob: pHcapM1_2 }
    ])
  });

  const pHcapP1_1 = sumMatrix((i, j) => i >= j);
  const pHcapP1_X = sumMatrix((i, j) => j - i === 1);
  const pHcapP1_2 = sumMatrix((i, j) => j - i >= 2);
  resultMarkets.push({
    marketKey: 'handicap_1x2_plus1',
    marketName: 'Handicap Classico 1X2 (1:0)',
    outcomes: buildTernaryOutcomes([
      { label: `1 Handicap +1 (${homeTeam} o Pareggio)`, prob: pHcapP1_1 },
      { label: `X Handicap +1 (${awayTeam} vince di 1)`, prob: pHcapP1_X },
      { label: `2 Handicap -1 (${awayTeam} vince di 2+)`, prob: pHcapP1_2 }
    ])
  });

  // 1.12 Home No Bet & Away No Bet
  const pXGivenNoHome = pX / Math.max(0.05, pX + p2);
  resultMarkets.push({
    marketKey: 'home_no_bet',
    marketName: 'Home No Bet (Rimborso se vince Casa)',
    outcomes: buildExplicitYesNoOutcomes(
      'X (Home No Bet)',
      `2 (${awayTeam} - Home No Bet)`,
      pXGivenNoHome,
      1.06
    )
  });

  const p1GivenNoAway = p1 / Math.max(0.05, p1 + pX);
  resultMarkets.push({
    marketKey: 'away_no_bet',
    marketName: 'Away No Bet (Rimborso se vince Ospite)',
    outcomes: buildExplicitYesNoOutcomes(
      `1 (${homeTeam} - Away No Bet)`,
      'X (Away No Bet)',
      p1GivenNoAway,
      1.06
    )
  });

  // 1.13 Pari / Dispari (Totale, 1° Tempo, 2° Tempo)
  const pPari = sumMatrix((i, j) => (i + j) % 2 === 0);
  resultMarkets.push({
    marketKey: 'odd_even_full',
    marketName: 'Pari / Dispari',
    outcomes: buildExplicitYesNoOutcomes('Gol Pari', 'Gol Dispari', pPari, 1.055)
  });

  const pPari1 = sumHalf(matrixHT, (i, j) => (i + j) % 2 === 0);
  resultMarkets.push({
    marketKey: 'odd_even_1st_half',
    marketName: 'Pari / Dispari 1° Tempo',
    outcomes: buildExplicitYesNoOutcomes('Pari 1° Tempo', 'Dispari 1° Tempo', pPari1, 1.06)
  });

  const pPari2 = sumHalf(matrix2HT, (i, j) => (i + j) % 2 === 0);
  resultMarkets.push({
    marketKey: 'odd_even_2nd_half',
    marketName: 'Pari / Dispari 2° Tempo',
    outcomes: buildExplicitYesNoOutcomes('Pari 2° Tempo', 'Dispari 2° Tempo', pPari2, 1.06)
  });

  // 1.14 Segna Gol 1 / Ultimo Gol
  const pNoGoalMatch = matrix[0][0];
  const pAnyGoal = 1 - pNoGoalMatch;
  const homeGoalShare = lambdaHome / Math.max(0.1, totalLambda);
  const pFirstHome = pAnyGoal * homeGoalShare;
  const pFirstAway = pAnyGoal * (1 - homeGoalShare);
  resultMarkets.push({
    marketKey: 'first_team_to_score',
    marketName: 'Segna 1° Gol',
    outcomes: buildTernaryOutcomes([
      { label: `Segna Gol 1: ${homeTeam}`, prob: pFirstHome },
      { label: `Segna Gol 1: ${awayTeam}`, prob: pFirstAway },
      { label: 'Nessun Gol (0-0)', prob: pNoGoalMatch }
    ])
  });

  resultMarkets.push({
    marketKey: 'last_team_to_score',
    marketName: 'Segna Ultimo Gol',
    outcomes: buildTernaryOutcomes([
      { label: `Segna Ultimo Gol: ${homeTeam}`, prob: pFirstHome },
      { label: `Segna Ultimo Gol: ${awayTeam}`, prob: pFirstAway },
      { label: 'Nessun Gol (0-0)', prob: pNoGoalMatch }
    ])
  });

  // 1.15 Ribaltone, Squadra Segna Sì/No, Segna nei due tempi, Vince entrambi i tempi, Vince a zero
  const pRibaltoneTot = Math.min(0.22, Math.max(0.04, pRibaltoneHome + pRibaltoneAway + 0.025));
  resultMarkets.push({
    marketKey: 'ribaltone_match',
    marketName: 'Ribaltone (Rimonta Vincente)',
    outcomes: buildExplicitYesNoOutcomes('Ribaltone: Sì', 'Ribaltone: No', pRibaltoneTot, 1.075)
  });

  const pHomeScores = sumMatrix((i) => i >= 1);
  resultMarkets.push({
    marketKey: 'home_team_to_score',
    marketName: 'Squadra Casa Segna Sì/No',
    outcomes: buildExplicitYesNoOutcomes(
      `Casa Segna: Sì (${homeTeam})`,
      `Casa Segna: No (Porta Inviolata ${awayTeam})`,
      pHomeScores,
      1.06
    )
  });

  const pAwayScores = sumMatrix((_i, j) => j >= 1);
  resultMarkets.push({
    marketKey: 'away_team_to_score',
    marketName: 'Squadra Ospite Segna Sì/No',
    outcomes: buildExplicitYesNoOutcomes(
      `Ospite Segna: Sì (${awayTeam})`,
      `Ospite Segna: No (Porta Inviolata ${homeTeam})`,
      pAwayScores,
      1.06
    )
  });

  const pHomeScoresBothHalves = (1 - Math.exp(-lH1)) * (1 - Math.exp(-lH2));
  resultMarkets.push({
    marketKey: 'home_scores_both_halves',
    marketName: 'Squadra Segna in Entrambi i Tempi',
    outcomes: buildExplicitYesNoOutcomes(
      `${homeTeam} Segna in Entrambi i Tempi: Sì`,
      `${homeTeam} Segna in Entrambi i Tempi: No`,
      pHomeScoresBothHalves,
      1.07
    )
  });

  const pAwayScoresBothHalves = (1 - Math.exp(-lA1)) * (1 - Math.exp(-lA2));
  resultMarkets.push({
    marketKey: 'away_scores_both_halves',
    marketName: 'Squadra Segna in Entrambi i Tempi',
    outcomes: buildExplicitYesNoOutcomes(
      `${awayTeam} Segna in Entrambi i Tempi: Sì`,
      `${awayTeam} Segna in Entrambi i Tempi: No`,
      pAwayScoresBothHalves,
      1.07
    )
  });

  const pHomeWinsBothHalves = Math.max(0.02, p1HT * p1_2T);
  resultMarkets.push({
    marketKey: 'home_wins_both_halves',
    marketName: 'Squadra Vince Entrambi i Tempi',
    outcomes: buildBinaryOutcomePair(`${homeTeam} Vince Entrambi i Tempi: Sì`, pHomeWinsBothHalves, 1.075)
  });

  const pAwayWinsBothHalves = Math.max(0.015, p2HT * p2_2T);
  resultMarkets.push({
    marketKey: 'away_wins_both_halves',
    marketName: 'Squadra Vince Entrambi i Tempi',
    outcomes: buildBinaryOutcomePair(`${awayTeam} Vince Entrambi i Tempi: Sì`, pAwayWinsBothHalves, 1.075)
  });

  const pHomeWinToNil = sumMatrix((i, j) => i > 0 && j === 0);
  resultMarkets.push({
    marketKey: 'home_win_to_nil',
    marketName: 'Squadra Vince a Zero',
    outcomes: buildExplicitYesNoOutcomes(
      `${homeTeam} Vince a Zero: Sì`,
      `${homeTeam} Vince a Zero: No`,
      pHomeWinToNil,
      1.07
    )
  });

  const pAwayWinToNil = sumMatrix((i, j) => j > 0 && i === 0);
  resultMarkets.push({
    marketKey: 'away_win_to_nil',
    marketName: 'Squadra Vince a Zero',
    outcomes: buildExplicitYesNoOutcomes(
      `${awayTeam} Vince a Zero: Sì`,
      `${awayTeam} Vince a Zero: No`,
      pAwayWinToNil,
      1.07
    )
  });

  // ============================================================================
  // SEZIONE 2: COMBO (COMBINAZIONI DI MERCATI SNAI)
  // ============================================================================
  const comboSpecs: Array<{
    key: string;
    marketName: string;
    label: string;
    prob: number;
  }> = [
    // 2.1 1X2 + Under/Over
    { key: 'combo_1_ov15', marketName: 'Combo 1X2 + Under/Over', label: '1 + Over 1.5', prob: sumMatrix((i, j) => i > j && i + j >= 2) },
    { key: 'combo_2_ov15', marketName: 'Combo 1X2 + Under/Over', label: '2 + Over 1.5', prob: sumMatrix((i, j) => i < j && i + j >= 2) },
    { key: 'combo_1_ov25', marketName: 'Combo 1X2 + Under/Over', label: '1 + Over 2.5', prob: sumMatrix((i, j) => i > j && i + j >= 3) },
    { key: 'combo_2_ov25', marketName: 'Combo 1X2 + Under/Over', label: '2 + Over 2.5', prob: sumMatrix((i, j) => i < j && i + j >= 3) },
    { key: 'combo_1_un25', marketName: 'Combo 1X2 + Under/Over', label: '1 + Under 2.5', prob: sumMatrix((i, j) => i > j && i + j <= 2) },
    { key: 'combo_2_un25', marketName: 'Combo 1X2 + Under/Over', label: '2 + Under 2.5', prob: sumMatrix((i, j) => i < j && i + j <= 2) },
    { key: 'combo_x_un25', marketName: 'Combo 1X2 + Under/Over', label: 'X + Under 2.5', prob: sumMatrix((i, j) => i === j && i + j <= 2) },
    { key: 'combo_x_ov15', marketName: 'Combo 1X2 + Under/Over', label: 'X + Over 1.5', prob: sumMatrix((i, j) => i === j && i + j >= 2) },
    { key: 'combo_1_un35', marketName: 'Combo 1X2 + Under/Over', label: '1 + Under 3.5', prob: sumMatrix((i, j) => i > j && i + j <= 3) },
    { key: 'combo_2_un35', marketName: 'Combo 1X2 + Under/Over', label: '2 + Under 3.5', prob: sumMatrix((i, j) => i < j && i + j <= 3) },
    { key: 'combo_1_un45', marketName: 'Combo 1X2 + Under/Over', label: '1 + Under 4.5', prob: sumMatrix((i, j) => i > j && i + j <= 4) },
    { key: 'combo_2_un45', marketName: 'Combo 1X2 + Under/Over', label: '2 + Under 4.5', prob: sumMatrix((i, j) => i < j && i + j <= 4) },

    // 2.2 1X2 + Goal/No Goal
    { key: 'combo_1_gg', marketName: 'Combo 1X2 + Goal/No Goal', label: '1 + Goal', prob: sumMatrix((i, j) => i > j && i >= 1 && j >= 1) },
    { key: 'combo_2_gg', marketName: 'Combo 1X2 + Goal/No Goal', label: '2 + Goal', prob: sumMatrix((i, j) => i < j && i >= 1 && j >= 1) },
    { key: 'combo_x_gg', marketName: 'Combo 1X2 + Goal/No Goal', label: 'X + Goal', prob: sumMatrix((i, j) => i === j && i >= 1 && j >= 1) },
    { key: 'combo_1_ng', marketName: 'Combo 1X2 + Goal/No Goal', label: '1 + No Goal', prob: sumMatrix((i, j) => i > j && j === 0) },
    { key: 'combo_2_ng', marketName: 'Combo 1X2 + Goal/No Goal', label: '2 + No Goal', prob: sumMatrix((i, j) => i < j && i === 0) },

    // 2.3 1X2 + Multigoal
    { key: 'combo_1_mg13', marketName: 'Combo 1X2 + Multigoal', label: '1 + Multigoal 1-3', prob: sumMatrix((i, j) => i > j && i + j >= 1 && i + j <= 3) },
    { key: 'combo_1_mg14', marketName: 'Combo 1X2 + Multigoal', label: '1 + Multigoal 1-4', prob: sumMatrix((i, j) => i > j && i + j >= 1 && i + j <= 4) },
    { key: 'combo_1_mg24', marketName: 'Combo 1X2 + Multigoal', label: '1 + Multigoal 2-4', prob: sumMatrix((i, j) => i > j && i + j >= 2 && i + j <= 4) },
    { key: 'combo_1_mg25', marketName: 'Combo 1X2 + Multigoal', label: '1 + Multigoal 2-5', prob: sumMatrix((i, j) => i > j && i + j >= 2 && i + j <= 5) },
    { key: 'combo_2_mg13', marketName: 'Combo 1X2 + Multigoal', label: '2 + Multigoal 1-3', prob: sumMatrix((i, j) => i < j && i + j >= 1 && i + j <= 3) },
    { key: 'combo_2_mg14', marketName: 'Combo 1X2 + Multigoal', label: '2 + Multigoal 1-4', prob: sumMatrix((i, j) => i < j && i + j >= 1 && i + j <= 4) },
    { key: 'combo_2_mg24', marketName: 'Combo 1X2 + Multigoal', label: '2 + Multigoal 2-4', prob: sumMatrix((i, j) => i < j && i + j >= 2 && i + j <= 4) },
    { key: 'combo_2_mg25', marketName: 'Combo 1X2 + Multigoal', label: '2 + Multigoal 2-5', prob: sumMatrix((i, j) => i < j && i + j >= 2 && i + j <= 5) },

    // 2.4 Doppia Chance + Under/Over
    { key: 'combo_1x_ov15', marketName: 'Combo Doppia Chance + U/O', label: '1X + Over 1.5', prob: sumMatrix((i, j) => i >= j && i + j >= 2) },
    { key: 'combo_x2_ov15', marketName: 'Combo Doppia Chance + U/O', label: 'X2 + Over 1.5', prob: sumMatrix((i, j) => i <= j && i + j >= 2) },
    { key: 'combo_12_ov15', marketName: 'Combo Doppia Chance + U/O', label: '12 + Over 1.5', prob: sumMatrix((i, j) => i !== j && i + j >= 2) },
    { key: 'combo_1x_ov25', marketName: 'Combo Doppia Chance + U/O', label: '1X + Over 2.5', prob: sumMatrix((i, j) => i >= j && i + j >= 3) },
    { key: 'combo_x2_ov25', marketName: 'Combo Doppia Chance + U/O', label: 'X2 + Over 2.5', prob: sumMatrix((i, j) => i <= j && i + j >= 3) },
    { key: 'combo_12_ov25', marketName: 'Combo Doppia Chance + U/O', label: '12 + Over 2.5', prob: sumMatrix((i, j) => i !== j && i + j >= 3) },
    { key: 'combo_1x_un25', marketName: 'Combo Doppia Chance + U/O', label: '1X + Under 2.5', prob: sumMatrix((i, j) => i >= j && i + j <= 2) },
    { key: 'combo_x2_un25', marketName: 'Combo Doppia Chance + U/O', label: 'X2 + Under 2.5', prob: sumMatrix((i, j) => i <= j && i + j <= 2) },
    { key: 'combo_1x_un35', marketName: 'Combo Doppia Chance + U/O', label: '1X + Under 3.5', prob: sumMatrix((i, j) => i >= j && i + j <= 3) },
    { key: 'combo_x2_un35', marketName: 'Combo Doppia Chance + U/O', label: 'X2 + Under 3.5', prob: sumMatrix((i, j) => i <= j && i + j <= 3) },
    { key: 'combo_12_un35', marketName: 'Combo Doppia Chance + U/O', label: '12 + Under 3.5', prob: sumMatrix((i, j) => i !== j && i + j <= 3) },
    { key: 'combo_1x_un45', marketName: 'Combo Doppia Chance + U/O', label: '1X + Under 4.5', prob: sumMatrix((i, j) => i >= j && i + j <= 4) },
    { key: 'combo_x2_un45', marketName: 'Combo Doppia Chance + U/O', label: 'X2 + Under 4.5', prob: sumMatrix((i, j) => i <= j && i + j <= 4) },

    // 2.5 Doppia Chance + Goal/No Goal
    { key: 'combo_1x_gg', marketName: 'Combo Doppia Chance + Goal/No Goal', label: '1X + Goal', prob: sumMatrix((i, j) => i >= j && i >= 1 && j >= 1) },
    { key: 'combo_x2_gg', marketName: 'Combo Doppia Chance + Goal/No Goal', label: 'X2 + Goal', prob: sumMatrix((i, j) => i <= j && i >= 1 && j >= 1) },
    { key: 'combo_12_gg', marketName: 'Combo Doppia Chance + Goal/No Goal', label: '12 + Goal', prob: sumMatrix((i, j) => i !== j && i >= 1 && j >= 1) },
    { key: 'combo_1x_ng', marketName: 'Combo Doppia Chance + Goal/No Goal', label: '1X + No Goal', prob: sumMatrix((i, j) => i >= j && (i === 0 || j === 0)) },
    { key: 'combo_x2_ng', marketName: 'Combo Doppia Chance + Goal/No Goal', label: 'X2 + No Goal', prob: sumMatrix((i, j) => i <= j && (i === 0 || j === 0)) },

    // 2.6 Doppia Chance + Multigoal
    { key: 'combo_1x_mg13', marketName: 'Combo Doppia Chance + Multigoal', label: '1X + Multigoal 1-3', prob: sumMatrix((i, j) => i >= j && i + j >= 1 && i + j <= 3) },
    { key: 'combo_1x_mg14', marketName: 'Combo Doppia Chance + Multigoal', label: '1X + Multigoal 1-4', prob: sumMatrix((i, j) => i >= j && i + j >= 1 && i + j <= 4) },
    { key: 'combo_1x_mg24', marketName: 'Combo Doppia Chance + Multigoal', label: '1X + Multigoal 2-4', prob: sumMatrix((i, j) => i >= j && i + j >= 2 && i + j <= 4) },
    { key: 'combo_1x_mg25', marketName: 'Combo Doppia Chance + Multigoal', label: '1X + Multigoal 2-5', prob: sumMatrix((i, j) => i >= j && i + j >= 2 && i + j <= 5) },
    { key: 'combo_x2_mg13', marketName: 'Combo Doppia Chance + Multigoal', label: 'X2 + Multigoal 1-3', prob: sumMatrix((i, j) => i <= j && i + j >= 1 && i + j <= 3) },
    { key: 'combo_x2_mg14', marketName: 'Combo Doppia Chance + Multigoal', label: 'X2 + Multigoal 1-4', prob: sumMatrix((i, j) => i <= j && i + j >= 1 && i + j <= 4) },
    { key: 'combo_x2_mg24', marketName: 'Combo Doppia Chance + Multigoal', label: 'X2 + Multigoal 2-4', prob: sumMatrix((i, j) => i <= j && i + j >= 2 && i + j <= 4) },
    { key: 'combo_x2_mg25', marketName: 'Combo Doppia Chance + Multigoal', label: 'X2 + Multigoal 2-5', prob: sumMatrix((i, j) => i <= j && i + j >= 2 && i + j <= 5) },
    { key: 'combo_12_mg14', marketName: 'Combo Doppia Chance + Multigoal', label: '12 + Multigoal 1-4', prob: sumMatrix((i, j) => i !== j && i + j >= 1 && i + j <= 4) },
    { key: 'combo_12_mg24', marketName: 'Combo Doppia Chance + Multigoal', label: '12 + Multigoal 2-4', prob: sumMatrix((i, j) => i !== j && i + j >= 2 && i + j <= 4) },

    // 2.7 Goal/No Goal + Under/Over
    { key: 'combo_gg_ov25', marketName: 'Combo Goal/No Goal + U/O', label: 'Goal + Over 2.5', prob: sumMatrix((i, j) => i >= 1 && j >= 1 && i + j >= 3) },
    { key: 'combo_gg_un35', marketName: 'Combo Goal/No Goal + U/O', label: 'Goal + Under 3.5', prob: sumMatrix((i, j) => i >= 1 && j >= 1 && i + j <= 3) },
    { key: 'combo_ng_un25', marketName: 'Combo Goal/No Goal + U/O', label: 'No Goal + Under 2.5', prob: sumMatrix((i, j) => (i === 0 || j === 0) && i + j <= 2) },
    { key: 'combo_gg_ov35', marketName: 'Combo Goal/No Goal + U/O', label: 'Goal + Over 3.5', prob: sumMatrix((i, j) => i >= 1 && j >= 1 && i + j >= 4) },

    // 2.8 1X2 Primo Tempo + 1X2 Secondo Tempo
    { key: 'combo_ht1_2h1', marketName: 'Combo 1X2 1°T + 1X2 2°T', label: '1°T: 1 + 2°T: 1', prob: p1HT * p1_2T },
    { key: 'combo_htx_2h1', marketName: 'Combo 1X2 1°T + 1X2 2°T', label: '1°T: X + 2°T: 1', prob: pXHT * p1_2T },
    { key: 'combo_ht1_2hx', marketName: 'Combo 1X2 1°T + 1X2 2°T', label: '1°T: 1 + 2°T: X', prob: p1HT * pX_2T },
    { key: 'combo_htx_2hx', marketName: 'Combo 1X2 1°T + 1X2 2°T', label: '1°T: X + 2°T: X', prob: pXHT * pX_2T },
    { key: 'combo_htx_2h2', marketName: 'Combo 1X2 1°T + 1X2 2°T', label: '1°T: X + 2°T: 2', prob: pXHT * p2_2T },
    { key: 'combo_ht2_2h2', marketName: 'Combo 1X2 1°T + 1X2 2°T', label: '1°T: 2 + 2°T: 2', prob: p2HT * p2_2T },

    // 2.9 Parziale/Finale + Under/Over
    { key: 'combo_htft11_ov15', marketName: 'Combo Parziale/Finale + U/O', label: '1/1 + Over 1.5', prob: p1HT * sumMatrix((i, j) => i > j && i + j >= 2) * 1.25 },
    { key: 'combo_htft11_ov25', marketName: 'Combo Parziale/Finale + U/O', label: '1/1 + Over 2.5', prob: p1HT * sumMatrix((i, j) => i > j && i + j >= 3) * 1.25 },
    { key: 'combo_htftx1_ov15', marketName: 'Combo Parziale/Finale + U/O', label: 'X/1 + Over 1.5', prob: pXHT * sumMatrix((i, j) => i > j && i + j >= 2) * 1.1 },
    { key: 'combo_htft22_ov15', marketName: 'Combo Parziale/Finale + U/O', label: '2/2 + Over 1.5', prob: p2HT * sumMatrix((i, j) => i < j && i + j >= 2) * 1.25 },
    { key: 'combo_htft22_ov25', marketName: 'Combo Parziale/Finale + U/O', label: '2/2 + Over 2.5', prob: p2HT * sumMatrix((i, j) => i < j && i + j >= 3) * 1.25 },

    // 2.10 Tricombo (1X2 / DC + Goal/No Goal + Under/Over)
    { key: 'tricombo_1_gg_ov25', marketName: 'Tricombo (Esito + GG/NG + U/O)', label: '1 + Goal + Over 2.5', prob: sumMatrix((i, j) => i > j && i >= 1 && j >= 1 && i + j >= 3) },
    { key: 'tricombo_2_gg_ov25', marketName: 'Tricombo (Esito + GG/NG + U/O)', label: '2 + Goal + Over 2.5', prob: sumMatrix((i, j) => i < j && i >= 1 && j >= 1 && i + j >= 3) },
    { key: 'tricombo_1x_gg_ov25', marketName: 'Tricombo (Esito + GG/NG + U/O)', label: '1X + Goal + Over 2.5', prob: sumMatrix((i, j) => i >= j && i >= 1 && j >= 1 && i + j >= 3) },
    { key: 'tricombo_x2_gg_ov25', marketName: 'Tricombo (Esito + GG/NG + U/O)', label: 'X2 + Goal + Over 2.5', prob: sumMatrix((i, j) => i <= j && i >= 1 && j >= 1 && i + j >= 3) },
    { key: 'tricombo_12_gg_ov25', marketName: 'Tricombo (Esito + GG/NG + U/O)', label: '12 + Goal + Over 2.5', prob: sumMatrix((i, j) => i !== j && i >= 1 && j >= 1 && i + j >= 3) },
    { key: 'tricombo_1_ng_un25', marketName: 'Tricombo (Esito + GG/NG + U/O)', label: '1 + No Goal + Under 2.5', prob: sumMatrix((i, j) => i > j && j === 0 && i <= 2) },
    { key: 'tricombo_2_ng_un25', marketName: 'Tricombo (Esito + GG/NG + U/O)', label: '2 + No Goal + Under 2.5', prob: sumMatrix((i, j) => i < j && i === 0 && j <= 2) },
    { key: 'tricombo_1x_gg_un35', marketName: 'Tricombo (Esito + GG/NG + U/O)', label: '1X + Goal + Under 3.5', prob: sumMatrix((i, j) => i >= j && i >= 1 && j >= 1 && i + j <= 3) },
    { key: 'tricombo_x2_gg_un35', marketName: 'Tricombo (Esito + GG/NG + U/O)', label: 'X2 + Goal + Under 3.5', prob: sumMatrix((i, j) => i <= j && i >= 1 && j >= 1 && i + j <= 3) }
  ];

  for (const combo of comboSpecs) {
    resultMarkets.push({
      marketKey: combo.key,
      marketName: combo.marketName,
      outcomes: buildBinaryOutcomePair(combo.label, combo.prob, 1.075)
    });
  }

  // ============================================================================
  // SEZIONE 3: GIOCATORI E PRESTAZIONI (SNAI SPECIALI)
  // ============================================================================
  const homePlayers = resolveTeamPlayers(homeTeam);
  const awayPlayers = resolveTeamPlayers(awayTeam);

  const lStrikerH = lambdaHome * 0.36;
  const lSecondH = lambdaHome * 0.24;
  const lStrikerA = lambdaAway * 0.36;
  const lSecondA = lambdaAway * 0.24;

  const pScorerH1 = 1 - Math.exp(-lStrikerH);
  const pScorerH2 = 1 - Math.exp(-lSecondH);
  const pScorerA1 = 1 - Math.exp(-lStrikerA);
  const pScorerA2 = 1 - Math.exp(-lSecondA);

  // 3.1 Marcatore Tempo Regolamentare (Sì/No)
  resultMarkets.push({
    marketKey: 'player_scorer_h1',
    marketName: 'Marcatore Sì/No (90 min)',
    outcomes: buildExplicitYesNoOutcomes(
      `Marcatore: ${homePlayers.striker} — Sì`,
      `Marcatore: ${homePlayers.striker} — No`,
      pScorerH1,
      1.075
    )
  });
  resultMarkets.push({
    marketKey: 'player_scorer_h2',
    marketName: 'Marcatore Sì/No (90 min)',
    outcomes: buildExplicitYesNoOutcomes(
      `Marcatore: ${homePlayers.secondAttacker} — Sì`,
      `Marcatore: ${homePlayers.secondAttacker} — No`,
      pScorerH2,
      1.075
    )
  });
  resultMarkets.push({
    marketKey: 'player_scorer_a1',
    marketName: 'Marcatore Sì/No (90 min)',
    outcomes: buildExplicitYesNoOutcomes(
      `Marcatore: ${awayPlayers.striker} — Sì`,
      `Marcatore: ${awayPlayers.striker} — No`,
      pScorerA1,
      1.075
    )
  });
  resultMarkets.push({
    marketKey: 'player_scorer_a2',
    marketName: 'Marcatore Sì/No (90 min)',
    outcomes: buildExplicitYesNoOutcomes(
      `Marcatore: ${awayPlayers.secondAttacker} — Sì`,
      `Marcatore: ${awayPlayers.secondAttacker} — No`,
      pScorerA2,
      1.075
    )
  });

  // 3.2 Primo / Ultimo Marcatore
  const pFirstScorerH1 = pAnyGoal * (lStrikerH / Math.max(0.2, totalLambda));
  const pFirstScorerA1 = pAnyGoal * (lStrikerA / Math.max(0.2, totalLambda));
  resultMarkets.push({
    marketKey: 'player_first_scorer_h1',
    marketName: 'Primo / Ultimo Marcatore',
    outcomes: buildBinaryOutcomePair(`Primo Marcatore: ${homePlayers.striker}`, pFirstScorerH1, 1.085)
  });
  resultMarkets.push({
    marketKey: 'player_first_scorer_a1',
    marketName: 'Primo / Ultimo Marcatore',
    outcomes: buildBinaryOutcomePair(`Primo Marcatore: ${awayPlayers.striker}`, pFirstScorerA1, 1.085)
  });
  resultMarkets.push({
    marketKey: 'player_last_scorer_h1',
    marketName: 'Primo / Ultimo Marcatore',
    outcomes: buildBinaryOutcomePair(`Ultimo Marcatore: ${homePlayers.striker}`, pFirstScorerH1, 1.085)
  });
  resultMarkets.push({
    marketKey: 'player_last_scorer_a1',
    marketName: 'Primo / Ultimo Marcatore',
    outcomes: buildBinaryOutcomePair(`Ultimo Marcatore: ${awayPlayers.striker}`, pFirstScorerA1, 1.085)
  });

  // 3.3 Doppietta / Tripletta
  const pBraceH1 = Math.max(0.025, 1 - Math.exp(-lStrikerH) * (1 + lStrikerH));
  const pBraceA1 = Math.max(0.02, 1 - Math.exp(-lStrikerA) * (1 + lStrikerA));
  resultMarkets.push({
    marketKey: 'player_brace_h1',
    marketName: 'Doppietta / Tripletta Giocatore',
    outcomes: buildBinaryOutcomePair(`Doppietta Sì: ${homePlayers.striker}`, pBraceH1, 1.085)
  });
  resultMarkets.push({
    marketKey: 'player_brace_a1',
    marketName: 'Doppietta / Tripletta Giocatore',
    outcomes: buildBinaryOutcomePair(`Doppietta Sì: ${awayPlayers.striker}`, pBraceA1, 1.085)
  });

  // 3.4 Marcatore + Esito Finale (1X2) & Marcatore + Risultato Esatto
  const pScorerAndHomeWin = Math.min(p1 * 0.9, pScorerH1 * (p1 / Math.max(0.15, pHomeScores)));
  const pScorerAndAwayWin = Math.min(p2 * 0.9, pScorerA1 * (p2 / Math.max(0.15, pAwayScores)));
  resultMarkets.push({
    marketKey: 'player_scorer_win_h1',
    marketName: 'Combo Marcatore + Esito Finale 1X2',
    outcomes: buildBinaryOutcomePair(`${homePlayers.striker} Segna + 1 (${homeTeam})`, pScorerAndHomeWin, 1.08)
  });
  resultMarkets.push({
    marketKey: 'player_scorer_win_a1',
    marketName: 'Combo Marcatore + Esito Finale 1X2',
    outcomes: buildBinaryOutcomePair(`${awayPlayers.striker} Segna + 2 (${awayTeam})`, pScorerAndAwayWin, 1.08)
  });

  const pScorerAndExact21 = Math.max(0.02, (matrix[2][0] + matrix[2][1]) * 0.52);
  resultMarkets.push({
    marketKey: 'player_scorer_exact_h1',
    marketName: 'Combo Marcatore + Risultato Multiplo',
    outcomes: buildBinaryOutcomePair(`${homePlayers.striker} Segna + Casa Vince 2-0 o 2-1`, pScorerAndExact21, 1.085)
  });

  // 3.5 Tiri / Tiri in Porta Giocatore (Over/Under)
  const pShotsOnTargetH1 = Math.min(0.78, Math.max(0.32, 0.35 + lStrikerH * 0.42));
  const pShotsOnTargetA1 = Math.min(0.75, Math.max(0.28, 0.32 + lStrikerA * 0.42));
  resultMarkets.push({
    marketKey: 'player_sot_h1',
    marketName: 'Tiri in Porta Giocatore U/O',
    outcomes: buildExplicitYesNoOutcomes(
      `${homePlayers.striker} Over 1.5 Tiri in Porta`,
      `${homePlayers.striker} Under 1.5 Tiri in Porta`,
      pShotsOnTargetH1,
      1.07
    )
  });
  resultMarkets.push({
    marketKey: 'player_sot_a1',
    marketName: 'Tiri in Porta Giocatore U/O',
    outcomes: buildExplicitYesNoOutcomes(
      `${awayPlayers.striker} Over 1.5 Tiri in Porta`,
      `${awayPlayers.striker} Under 1.5 Tiri in Porta`,
      pShotsOnTargetA1,
      1.07
    )
  });

  // 3.6 Assist Giocatore (Sì/No)
  const pAssistH = Math.min(0.45, Math.max(0.14, 1 - Math.exp(-lambdaHome * 0.22)));
  const pAssistA = Math.min(0.42, Math.max(0.12, 1 - Math.exp(-lambdaAway * 0.22)));
  resultMarkets.push({
    marketKey: 'player_assist_h',
    marketName: 'Assist Giocatore Sì/No',
    outcomes: buildExplicitYesNoOutcomes(
      `Assist: ${homePlayers.playmaker} — Sì`,
      `Assist: ${homePlayers.playmaker} — No`,
      pAssistH,
      1.075
    )
  });
  resultMarkets.push({
    marketKey: 'player_assist_a',
    marketName: 'Assist Giocatore Sì/No',
    outcomes: buildExplicitYesNoOutcomes(
      `Assist: ${awayPlayers.playmaker} — Sì`,
      `Assist: ${awayPlayers.playmaker} — No`,
      pAssistA,
      1.075
    )
  });

  // 3.7 Cartellino Giocatore (Ammonito/Espulso Sì/No), Tackle/Contrasti, Passaggi
  const competitiveness = 1 - Math.abs(p1 - p2);
  const pCardMidH = Math.min(0.42, Math.max(0.22, 0.25 + competitiveness * 0.12));
  const pCardMidA = Math.min(0.44, Math.max(0.24, 0.27 + competitiveness * 0.12));
  resultMarkets.push({
    marketKey: 'player_card_h',
    marketName: 'Cartellino Giocatore Sì/No',
    outcomes: buildExplicitYesNoOutcomes(
      `Cartellino: ${homePlayers.midfielder} — Sì`,
      `Cartellino: ${homePlayers.midfielder} — No`,
      pCardMidH,
      1.075
    )
  });
  resultMarkets.push({
    marketKey: 'player_card_a',
    marketName: 'Cartellino Giocatore Sì/No',
    outcomes: buildExplicitYesNoOutcomes(
      `Cartellino: ${awayPlayers.midfielder} — Sì`,
      `Cartellino: ${awayPlayers.midfielder} — No`,
      pCardMidA,
      1.075
    )
  });

  resultMarkets.push({
    marketKey: 'player_tackles_h',
    marketName: 'Tackle / Contrasti Giocatore U/O',
    outcomes: buildExplicitYesNoOutcomes(
      `${homePlayers.midfielder} Over 2.5 Contrasti`,
      `${homePlayers.midfielder} Under 2.5 Contrasti`,
      0.54,
      1.07
    )
  });

  const pPassesPlaymaker = Math.min(0.68, Math.max(0.45, 0.48 + (p1 - p2) * 0.2));
  resultMarkets.push({
    marketKey: 'player_passes_h',
    marketName: 'Passaggi Giocatore U/O',
    outcomes: buildExplicitYesNoOutcomes(
      `${homePlayers.playmaker} Over 48.5 Passaggi`,
      `${homePlayers.playmaker} Under 48.5 Passaggi`,
      pPassesPlaymaker,
      1.07
    )
  });

  // ============================================================================
  // SEZIONE 4: SANZIONI, CALCI D'ANGOLO E SPECIALI MATCH
  // ============================================================================

  // 4.1 Under / Over Calci d'Angolo (8.5, 9.5, 10.5, 11.5) & 1X2 Calci d'Angolo
  const lambdaCorners = 8.1 + 0.78 * totalLambda;
  for (const cLine of [8.5, 9.5, 10.5, 11.5]) {
    const minC = Math.ceil(cLine);
    let pUnderC = 0;
    for (let k = 0; k < minC; k++) {
      pUnderC += poissonPmf(lambdaCorners, k);
    }
    const pOverC = Math.max(0.12, Math.min(0.88, 1 - pUnderC));
    resultMarkets.push({
      marketKey: `corners_totals_${cLine}`,
      marketName: `Under/Over ${cLine} Calci d'Angolo`,
      line: cLine,
      outcomes: buildExplicitYesNoOutcomes(
        `Over ${cLine} Angoli`,
        `Under ${cLine} Angoli`,
        pOverC,
        1.065,
        cLine
      )
    });
  }

  const pCorners1 = Math.max(0.20, Math.min(0.75, 0.46 + (p1 - p2) * 0.38));
  const pCornersX = 0.09;
  const pCorners2 = Math.max(0.15, 1 - pCorners1 - pCornersX);
  resultMarkets.push({
    marketKey: 'corners_1x2',
    marketName: "1X2 Calci d'Angolo",
    outcomes: buildTernaryOutcomes([
      { label: `1 Angoli (${homeTeam})`, prob: pCorners1 },
      { label: 'X Angoli (Pareggio Angoli)', prob: pCornersX },
      { label: `2 Angoli (${awayTeam})`, prob: pCorners2 }
    ])
  });

  // 4.2 Under / Over Cartellini (3.5, 4.5, 5.5), Punti Cartellino & 1X2 Cartellini
  const lambdaCards = 3.65 + 1.05 * competitiveness;
  for (const cardLine of [3.5, 4.5, 5.5]) {
    const minCards = Math.ceil(cardLine);
    let pUnCards = 0;
    for (let k = 0; k < minCards; k++) {
      pUnCards += poissonPmf(lambdaCards, k);
    }
    const pOvCards = Math.max(0.15, Math.min(0.85, 1 - pUnCards));
    resultMarkets.push({
      marketKey: `cards_totals_${cardLine}`,
      marketName: `Under/Over ${cardLine} Cartellini`,
      line: cardLine,
      outcomes: buildExplicitYesNoOutcomes(
        `Over ${cardLine} Cartellini`,
        `Under ${cardLine} Cartellini`,
        pOvCards,
        1.065,
        cardLine
      )
    });
  }

  const pOver45CardPoints = Math.max(0.25, Math.min(0.75, 0.44 + 0.16 * competitiveness));
  resultMarkets.push({
    marketKey: 'card_points_45.5',
    marketName: 'Under/Over 45.5 Punti Cartellino',
    line: 45.5,
    outcomes: buildExplicitYesNoOutcomes(
      'Over 45.5 Punti Cartellino',
      'Under 45.5 Punti Cartellino',
      pOver45CardPoints,
      1.065,
      45.5
    )
  });

  // La squadra sfavorita tende a subire la pressione e ricevere più cartellini
  const pCards1 = Math.max(0.22, Math.min(0.62, 0.41 - (p1 - p2) * 0.22));
  const pCardsX = 0.16;
  const pCards2 = Math.max(0.22, 1 - pCards1 - pCardsX);
  resultMarkets.push({
    marketKey: 'cards_1x2',
    marketName: '1X2 Cartellini (Più Ammonizioni)',
    outcomes: buildTernaryOutcomes([
      { label: `1 Cartellini (${homeTeam})`, prob: pCards1 },
      { label: 'X Cartellini (Stesso Numero)', prob: pCardsX },
      { label: `2 Cartellini (${awayTeam})`, prob: pCards2 }
    ])
  });

  // 4.3 Espulsione Sì/No, Rigore Sì/No, Rigore + Espulsione, Autorete Sì/No, Sostituzione 1°T
  const pRedCard = Math.min(0.22, Math.max(0.13, 0.14 + competitiveness * 0.05));
  resultMarkets.push({
    marketKey: 'red_card_yes_no',
    marketName: 'Espulsione Sì/No',
    outcomes: buildExplicitYesNoOutcomes('Espulsione: Sì', 'Espulsione: No', pRedCard, 1.065)
  });

  const pPenalty = Math.min(0.36, Math.max(0.22, 0.21 + totalLambda * 0.035));
  resultMarkets.push({
    marketKey: 'penalty_yes_no',
    marketName: 'Rigore Sì/No',
    outcomes: buildExplicitYesNoOutcomes('Calcio di Rigore: Sì', 'Calcio di Rigore: No', pPenalty, 1.065)
  });

  const pPenAndRed = Math.max(0.035, Math.min(0.12, pPenalty * pRedCard * 1.4));
  resultMarkets.push({
    marketKey: 'penalty_and_red_card',
    marketName: 'Combo Rigore + Espulsione',
    outcomes: buildExplicitYesNoOutcomes(
      'Rigore + Espulsione: Sì',
      'Rigore + Espulsione: No',
      pPenAndRed,
      1.075
    )
  });

  const pOwnGoal = Math.min(0.10, Math.max(0.04, 0.045 + totalLambda * 0.008));
  resultMarkets.push({
    marketKey: 'own_goal_yes_no',
    marketName: 'Autorete Sì/No',
    outcomes: buildExplicitYesNoOutcomes('Autorete: Sì', 'Autorete: No', pOwnGoal, 1.075)
  });

  resultMarkets.push({
    marketKey: 'sub_1st_half_yes_no',
    marketName: 'Sostituzione 1° Tempo Sì/No',
    outcomes: buildExplicitYesNoOutcomes(
      'Sostituzione 1° Tempo: Sì',
      'Sostituzione 1° Tempo: No',
      0.23,
      1.07
    )
  });

  // 4.4 Metodo del 1° Gol (Tiro, Colpo di testa, Rigore, Punizione)
  resultMarkets.push({
    marketKey: 'first_goal_method_shot',
    marketName: 'Metodo del 1° Gol',
    outcomes: buildBinaryOutcomePair('Metodo 1° Gol: Tiro', pAnyGoal * 0.66, 1.075)
  });
  resultMarkets.push({
    marketKey: 'first_goal_method_header',
    marketName: 'Metodo del 1° Gol',
    outcomes: buildBinaryOutcomePair('Metodo 1° Gol: Colpo di Testa', pAnyGoal * 0.17, 1.075)
  });
  resultMarkets.push({
    marketKey: 'first_goal_method_penalty',
    marketName: 'Metodo del 1° Gol',
    outcomes: buildBinaryOutcomePair('Metodo 1° Gol: Calcio di Rigore', pAnyGoal * 0.09, 1.08)
  });
  resultMarkets.push({
    marketKey: 'first_goal_method_freekick',
    marketName: 'Metodo del 1° Gol',
    outcomes: buildBinaryOutcomePair('Metodo 1° Gol: Calcio di Punizione', pAnyGoal * 0.05, 1.08)
  });

  // 4.5 Minuto del Primo Gol (Fasce di 15 minuti SNAI)
  const timeBands15: Array<{ key: string; label: string; tStart: number; tEnd: number }> = [
    { key: '1_15', label: 'Minuto 1° Gol: 1-15 min', tStart: 0, tEnd: 15 },
    { key: '16_30', label: 'Minuto 1° Gol: 16-30 min', tStart: 15, tEnd: 30 },
    { key: '31_45', label: 'Minuto 1° Gol: 31-Fine 1°T', tStart: 30, tEnd: 46 },
    { key: '46_60', label: 'Minuto 1° Gol: 46-60 min', tStart: 46, tEnd: 60 },
    { key: '61_75', label: 'Minuto 1° Gol: 61-75 min', tStart: 60, tEnd: 75 },
    { key: '76_90', label: 'Minuto 1° Gol: 76-Fine Partita', tStart: 75, tEnd: 90 }
  ];

  for (const band of timeBands15) {
    const pBand = Math.max(
      0.04,
      Math.exp(-(totalLambda * band.tStart) / 90) - Math.exp(-(totalLambda * band.tEnd) / 90)
    );
    resultMarkets.push({
      marketKey: `first_goal_min_${band.key}`,
      marketName: 'Minuto del 1° Gol (Fasce 15 min)',
      outcomes: buildBinaryOutcomePair(band.label, pBand, 1.075)
    });
  }

  return resultMarkets;
}

/**
 * Arricchisce una partita di Tennis con Set Betting (2-0, 2-1, 0-2, 1-2),
 * Vincente 1° Set e Under/Over 21.5 Giochi se non già presenti.
 */
export function generateTennisSnaiMarkets(
  player1: string,
  player2: string,
  existingMarkets: RawMarketOdds[]
): RawMarketOdds[] {
  const h2hMarket = existingMarkets.find((m) => m.marketKey === 'h2h');
  if (!h2hMarket || h2hMarket.outcomes.length < 2) {
    return existingMarkets;
  }

  const q1 = calculateMedian(h2hMarket.outcomes[0].bookmakerOdds);
  const q2 = calculateMedian(h2hMarket.outcomes[1].bookmakerOdds);
  const [pMatch1] = removeBookmakerMarginShin([q1, q2]);

  let sLow = 0.05;
  let sHigh = 0.95;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (sLow + sHigh) / 2;
    const pm = mid * mid * (3 - 2 * mid);
    if (pm < pMatch1) sLow = mid;
    else sHigh = mid;
  }
  const s1 = (sLow + sHigh) / 2;
  const s2 = 1 - s1;

  const p20 = s1 * s1;
  const p21 = 2 * s1 * s1 * s2;
  const p02 = s2 * s2;
  const p12 = 2 * s2 * s2 * s1;

  const resultMarkets: RawMarketOdds[] = [...existingMarkets];
  const existingKeys = new Set(existingMarkets.map((m) => m.marketKey));

  if (!existingKeys.has('first_set')) {
    resultMarkets.push({
      marketKey: 'first_set',
      marketName: 'Vincente 1° Set',
      outcomes: [
        {
          selection: `1° Set: ${player1}`,
          bookmakerOdds: [Number(Math.max(1.05, 1 / (s1 * 1.06)).toFixed(2))]
        },
        {
          selection: `1° Set: ${player2}`,
          bookmakerOdds: [Number(Math.max(1.05, 1 / (s2 * 1.06)).toFixed(2))]
        }
      ]
    });
  }

  if (!existingKeys.has('set_betting')) {
    resultMarkets.push({
      marketKey: 'set_betting',
      marketName: 'Set Betting (Risultato Esatto Set)',
      outcomes: [
        {
          selection: `Set 2-0 (${player1})`,
          bookmakerOdds: [Number(Math.max(1.10, 1 / (p20 * 1.07)).toFixed(2))]
        },
        {
          selection: `Set 2-1 (${player1})`,
          bookmakerOdds: [Number(Math.max(1.15, 1 / (p21 * 1.07)).toFixed(2))]
        },
        {
          selection: `Set 0-2 (${player2})`,
          bookmakerOdds: [Number(Math.max(1.10, 1 / (p02 * 1.07)).toFixed(2))]
        },
        {
          selection: `Set 1-2 (${player2})`,
          bookmakerOdds: [Number(Math.max(1.15, 1 / (p12 * 1.07)).toFixed(2))]
        }
      ]
    });
  }

  if (!existingKeys.has('totals_21.5')) {
    const pThreeSets = p21 + p12;
    const pOver215 = Math.min(0.72, Math.max(0.32, pThreeSets + 0.16));
    resultMarkets.push({
      marketKey: 'totals_21.5',
      marketName: 'Under/Over 21.5 Giochi',
      line: 21.5,
      outcomes: [
        {
          selection: 'Over 21.5 Giochi',
          line: 21.5,
          bookmakerOdds: [Number((1 / (pOver215 * 1.06)).toFixed(2))]
        },
        {
          selection: 'Under 21.5 Giochi',
          line: 21.5,
          bookmakerOdds: [Number((1 / ((1 - pOver215) * 1.06)).toFixed(2))]
        }
      ]
    });
  }

  return resultMarkets;
}
