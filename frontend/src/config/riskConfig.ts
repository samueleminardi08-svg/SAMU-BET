export type SportKey = 'football' | 'f1' | 'tennis';
export type TimeWindowKey = 'today' | 'hours48' | 'days7';
export type BetTypeKey = 'single' | 'multiple';
export type MarketGroupKey =
  | '1x2_dc'
  | 'under_over'
  | 'gg_ng'
  | 'multigoal'
  | 'combo'
  | 'halves_htft'
  | 'players'
  | 'corners_cards'
  | 'exact_specials';

export interface MarketGroupOptionUI {
  key: MarketGroupKey;
  label: string;
  shortBadge: string;
  description: string;
}

export const MARKET_GROUP_OPTIONS: MarketGroupOptionUI[] = [
  {
    key: '1x2_dc',
    label: '1X2, Doppia Chance & Handicap',
    shortBadge: '1X2 / DC / H',
    description: 'Esito Finale 1X2, Doppia Chance (1X, X2, 12), Draw No Bet e Handicap Classico'
  },
  {
    key: 'under_over',
    label: 'Under / Over Gol (0.5 – 7.5)',
    shortBadge: 'Under / Over',
    description: 'Linee gol totali regolamentari da Under/Over 0.5 fino a 7.5 gol'
  },
  {
    key: 'gg_ng',
    label: 'Goal / No Goal & Squadra Segna',
    shortBadge: 'Goal / No Goal',
    description: 'Goal/No Goal, Squadra Casa/Ospite Segna, Segna nei 2 tempi e Vince a Zero'
  },
  {
    key: 'multigoal',
    label: 'Multigoal (Totale, Casa, Ospite)',
    shortBadge: 'Multigoal',
    description: 'Fasce Multigoal Totale (1-2, 1-3, 1-4, 2-3, 2-4, 2-5...) e Multigoal Casa/Ospite'
  },
  {
    key: 'combo',
    label: 'Combo & Tricombo SNAI',
    shortBadge: 'Combo / Tricombo',
    description: '1X2 o Doppia Chance + Under/Over, Goal/No Goal, Multigoal e Tricombo'
  },
  {
    key: 'halves_htft',
    label: '1° Tempo, 2° Tempo & Parziale/Finale',
    shortBadge: '1°T / 2°T / P-F',
    description: 'Esiti, Doppia Chance, Under/Over, Goal/No Goal di 1°/2° Tempo e Parziale/Finale'
  },
  {
    key: 'players',
    label: 'Marcatori & Prestazioni Giocatori',
    shortBadge: 'Marcatori / Giocatori',
    description: 'Marcatore, 1°/Ultimo Marcatore, Doppietta, Tiri in Porta, Assist, Ammonito, Tackle, Passaggi'
  },
  {
    key: 'corners_cards',
    label: 'Calci d\'Angolo & Cartellini',
    shortBadge: 'Angoli / Cartellini',
    description: 'Under/Over e 1X2 Calci d\'Angolo, Under/Over Cartellini, Punti Cartellino'
  },
  {
    key: 'exact_specials',
    label: 'Risultato Esatto, Ribaltone & Speciali',
    shortBadge: 'R. Esatto / Speciali',
    description: 'Risultato Esatto (26 esiti + multipli), Ribaltone, Rigore, Espulsione, Pari/Dispari, Minuto 1° Gol'
  }
];

export interface RiskLevelUI {
  level: number;
  minProb: number;
  maxOdds: number;
  label: string;
  description: string;
  colorHex: string;
  bgTint: string;
}

export const MIN_SELECTION_ODDS = 1.05;
export const MAX_TARGET_ODDS = 3000;
export const MAX_MULTIPLE_EVENTS = 50;
export const DEFAULT_TARGET_TOLERANCE = 0.08;

export const RISK_CONFIG_UI: Record<number, RiskLevelUI> = {
  1: {
    level: 1,
    minProb: 0.80,
    maxOdds: 1.30,
    label: 'Molto prudente',
    description: 'Esiti ad altissima probabilità stimata (≥ 80%) e quota contenuta (≤ 1.30).',
    colorHex: '#22c55e',
    bgTint: 'rgba(34, 197, 94, 0.12)'
  },
  2: {
    level: 2,
    minProb: 0.72,
    maxOdds: 1.45,
    label: 'Prudente',
    description: 'Selezioni favorite con probabilità ≥ 72% e quota massima 1.45.',
    colorHex: '#10b981',
    bgTint: 'rgba(16, 185, 129, 0.12)'
  },
  3: {
    level: 3,
    minProb: 0.65,
    maxOdds: 1.65,
    label: 'Conservativo',
    description: 'Buon equilibrio verso la stabilità: probabilità ≥ 65% e quota ≤ 1.65.',
    colorHex: '#14b8a6',
    bgTint: 'rgba(20, 184, 166, 0.12)'
  },
  4: {
    level: 4,
    minProb: 0.58,
    maxOdds: 1.90,
    label: 'Moderato-basso',
    description: 'Favorite solide ma con quote più interessanti: probabilità ≥ 58%, quota ≤ 1.90.',
    colorHex: '#06b6d4',
    bgTint: 'rgba(6, 182, 212, 0.12)'
  },
  5: {
    level: 5,
    minProb: 0.50,
    maxOdds: 2.30,
    label: 'Bilanciato',
    description: 'Equilibrio tra probabilità di riuscita (≥ 50%) e valore atteso (quota ≤ 2.30).',
    colorHex: '#3b82f6',
    bgTint: 'rgba(59, 130, 246, 0.12)'
  },
  6: {
    level: 6,
    minProb: 0.42,
    maxOdds: 2.80,
    label: 'Moderato-alto',
    description: 'Accetta esiti combattuti (probabilità ≥ 42%) con quote fino a 2.80.',
    colorHex: '#eab308',
    bgTint: 'rgba(234, 179, 8, 0.12)'
  },
  7: {
    level: 7,
    minProb: 0.35,
    maxOdds: 3.50,
    label: 'Dinamico',
    description: 'Cerca quote di valore fino a 3.50 con probabilità minima del 35%.',
    colorHex: '#f59e0b',
    bgTint: 'rgba(245, 158, 11, 0.12)'
  },
  8: {
    level: 8,
    minProb: 0.28,
    maxOdds: 4.50,
    label: 'Aggressivo',
    description: 'Privilegia il moltiplicatore e il valore atteso: probabilità ≥ 28%, quota ≤ 4.50.',
    colorHex: '#f97316',
    bgTint: 'rgba(249, 115, 22, 0.12)'
  },
  9: {
    level: 9,
    minProb: 0.20,
    maxOdds: 6.50,
    label: 'Molto rischioso',
    description: 'Esiti difficili ad alta quota (fino a 6.50) con probabilità minima del 20%.',
    colorHex: '#ef4444',
    bgTint: 'rgba(239, 68, 68, 0.12)'
  },
  10: {
    level: 10,
    minProb: 0.12,
    maxOdds: 10.00,
    label: 'Estremo',
    description: 'Massima esposizione al rischio: quote fino a 10.00 e probabilità minima del 12%.',
    colorHex: '#e11d48',
    bgTint: 'rgba(225, 29, 72, 0.14)'
  },
  11: {
    level: 11,
    minProb: 0.01,
    maxOdds: 1000.00,
    label: 'ULTRA (100% IA)',
    description: 'Nessun limite di quota o probabilità: ti affidi totalmente al giudizio dell\'IA per centrare la quota desiderata.',
    colorHex: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.18)'
  }
};

export interface CandidateSelection {
  id: string;
  eventId: string;
  sport: SportKey;
  competitionName: string;
  eventName: string;
  commenceTime: string;
  market: string;
  selection: string;
  line?: number;
  bookmakerOdds: number;
  snaiRealOdds?: number;
  effectiveOdds: number;
  pMarket: number;
  marginUnadjusted: boolean;
  pAi?: number;
  aiConfidence?: number;
  pFinal: number;
  ev: number;
  edge: number;
  score: number;
  estimationMode: 'ai_plus_market' | 'market_only';
  keyFactors: string[];
  redFlags: string[];
}

export interface FeasibilityCheckResult {
  feasible: boolean;
  status: 'ok' | 'target_too_high' | 'target_too_low' | 'single_exceeds_risk';
  geometricMeanOdds: number;
  maxAllowedOddsForRisk: number;
  minAllowedOdds: number;
  message?: string;
  suggestedMinEvents?: number;
  suggestedMaxEvents?: number;
  suggestedMinRiskLevel?: number;
  suggestSwitchToMultiple?: boolean;
}

export interface MultiSportPromptInfo {
  required: boolean;
  reason: string;
  currentSportMaxOdds: number;
  availableEventsInSelectedSport: number;
  minimumEventsNeeded: number;
}

export interface BettingSlipResult {
  selections: CandidateSelection[];
  totalOdds: number;
  targetOdds: number;
  combinedProbability: number;
  combinedEv: number;
  withinTolerance: boolean;
  toleranceUsed: number;
  difficultyLabel: 'Bassa' | 'Media' | 'Alta' | 'Molto Alta' | 'Estrema';
  lowProbabilityWarning: boolean;
  negativeEvNotice: string | null;
  explanation?: string;
}

export interface RssNewsItem {
  title: string;
  pubDate: string;
  excerpt: string;
  link: string;
  source: string;
}

export interface EventAIContextPayload {
  eventId: string;
  sport: SportKey;
  competitionName: string;
  eventName: string;
  commenceTime: string;
  statsSummary: string[];
  news: RssNewsItem[];
  candidateSelections: Array<{
    selectionId: string;
    market: string;
    selection: string;
    line?: number;
    effectiveOdds: number;
    pMarket: number;
  }>;
}

export interface CompetitionCoverageInfo {
  sport: SportKey;
  sportLabel: string;
  oddsSource: string;
  statsSource: string;
  rssSources: string[];
  coveredCompetitions: string[];
  uncoveredNote: string;
  dailyRequestsLimitInfo: string;
}
