export interface RiskLevelRule {
  level: number;
  minProb: number;
  maxOdds: number;
  label: string;
  description: string;
}

export const MIN_SELECTION_ODDS = 1.05;
export const MAX_TARGET_ODDS = 3000;
export const MAX_MULTIPLE_EVENTS = 50;
export const DEFAULT_TARGET_TOLERANCE = 0.08; // ±8% di Q
export const MAX_CANDIDATE_POOL = 240;
export const DEFAULT_MAX_AI_EVENTS = 12;

export const RISK_CONFIG: Record<number, RiskLevelRule> = {
  1: {
    level: 1,
    minProb: 0.80,
    maxOdds: 1.30,
    label: 'Molto prudente',
    description: 'Esiti ad altissima probabilità stimata (≥ 80%) e quota contenuta (≤ 1.30).'
  },
  2: {
    level: 2,
    minProb: 0.72,
    maxOdds: 1.45,
    label: 'Prudente',
    description: 'Selezioni favorite con probabilità ≥ 72% e quota massima 1.45.'
  },
  3: {
    level: 3,
    minProb: 0.65,
    maxOdds: 1.65,
    label: 'Conservativo',
    description: 'Buon equilibrio verso la stabilità: probabilità ≥ 65% e quota ≤ 1.65.'
  },
  4: {
    level: 4,
    minProb: 0.58,
    maxOdds: 1.90,
    label: 'Moderato-basso',
    description: 'Favorite solide ma con quote più interessanti: probabilità ≥ 58%, quota ≤ 1.90.'
  },
  5: {
    level: 5,
    minProb: 0.50,
    maxOdds: 2.30,
    label: 'Bilanciato',
    description: 'Equilibrio tra probabilità di riuscita (≥ 50%) e valore atteso (quota ≤ 2.30).'
  },
  6: {
    level: 6,
    minProb: 0.42,
    maxOdds: 2.80,
    label: 'Moderato-alto',
    description: 'Accetta esiti combattuti (probabilità ≥ 42%) con quote fino a 2.80.'
  },
  7: {
    level: 7,
    minProb: 0.35,
    maxOdds: 3.50,
    label: 'Dinamico',
    description: 'Cerca quote di valore fino a 3.50 con probabilità minima del 35%.'
  },
  8: {
    level: 8,
    minProb: 0.28,
    maxOdds: 4.50,
    label: 'Aggressivo',
    description: 'Privilegia il moltiplicatore e il valore atteso: probabilità ≥ 28%, quota ≤ 4.50.'
  },
  9: {
    level: 9,
    minProb: 0.20,
    maxOdds: 6.50,
    label: 'Molto rischioso',
    description: 'Esiti difficili ad alta quota (fino a 6.50) con probabilità minima del 20%.'
  },
  10: {
    level: 10,
    minProb: 0.12,
    maxOdds: 10.00,
    label: 'Estremo',
    description: 'Massima esposizione al rischio: quote fino a 10.00 e probabilità minima del 12%.'
  },
  11: {
    level: 11,
    minProb: 0.01,
    maxOdds: 1000.00,
    label: 'ULTRA (100% IA)',
    description: 'Nessun limite di quota o probabilità minima: ti affidi totalmente al giudizio dell\'IA per raggiungere la quota desiderata.'
  }
};

export function getRiskRule(level: number): RiskLevelRule {
  const clamped = Math.max(1, Math.min(11, Math.round(level)));
  return RISK_CONFIG[clamped];
}

