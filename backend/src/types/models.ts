import { z } from 'zod';

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

export const MARKET_GROUP_KEYS = [
  '1x2_dc',
  'under_over',
  'gg_ng',
  'multigoal',
  'combo',
  'halves_htft',
  'players',
  'corners_cards',
  'exact_specials'
] as const;

export const AnalyzeRequestSchema = z.object({
  betType: z.enum(['single', 'multiple']).default('multiple'),
  sports: z.array(z.enum(['football', 'f1', 'tennis'])).min(1).default(['football']),
  allowMultiSportExpansion: z.boolean().optional().default(false),
  targetOdds: z.number().min(1.10).max(3000),
  riskLevel: z.number().int().min(1).max(11),
  numEvents: z.number().int().min(1).max(50).optional(),
  timeWindow: z.enum(['today', 'hours48', 'days7']).default('hours48'),
  tolerance: z.number().min(0.01).max(0.30).optional(),
  allowedMarketGroups: z.array(z.enum(MARKET_GROUP_KEYS)).optional()
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

// Schema rigoroso della Sezione 11 per l'output della stima AI
export const AIEstimateSchema = z.object({
  event_id: z.string(),
  market: z.string(),
  selection: z.string(),
  p_ai: z.number().min(0.01).max(0.99),
  confidence: z.number().min(0).max(1),
  key_factors: z.array(z.string()).max(6),
  red_flags: z.array(z.string()).max(6)
});

export type AIEstimate = z.infer<typeof AIEstimateSchema>;

export const AIBatchEventEstimateSchema = z.object({
  event_id: z.string(),
  estimates: z.array(AIEstimateSchema)
});

export type AIBatchEventEstimate = z.infer<typeof AIBatchEventEstimateSchema>;

export interface RawOutcomeOdds {
  selection: string;
  line?: number;
  bookmakerOdds: number[];
}

export interface RawMarketOdds {
  marketKey: string;
  marketName: string;
  line?: number;
  outcomes: RawOutcomeOdds[];
}

export interface RawSportEvent {
  id: string;
  sport: SportKey;
  competitionId: string;
  competitionName: string;
  homeTeam?: string;
  awayTeam?: string;
  eventName: string;
  commenceTime: string;
  participants: string[];
  markets: RawMarketOdds[];
  isDemo?: boolean;
  oddsUnavailableReason?: string;
}

export interface RssNewsItem {
  title: string;
  pubDate: string;
  excerpt: string;
  link: string;
  source: string;
}

export interface EventStatsContext {
  competitionCovered: boolean;
  summaryLines: string[];
  injuriesOrAbsences: string[];
  sourceName: string;
}

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
