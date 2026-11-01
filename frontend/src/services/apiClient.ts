import {
  BetTypeKey,
  BettingSlipResult,
  CandidateSelection,
  CompetitionCoverageInfo,
  EventAIContextPayload,
  FeasibilityCheckResult,
  MarketGroupKey,
  MultiSportPromptInfo,
  SportKey,
  TimeWindowKey
} from '../config/riskConfig';

export interface BackendEnvKeyStatus {
  keyName: string;
  configured: boolean;
  requiredFor: string;
  impactIfMissing: string;
}

export interface BackendStatusResponse {
  status: string;
  envReport: {
    timestamp: string;
    environment: string;
    demoModeActive: boolean;
    demoModeBlockedInProd: boolean;
    keys: BackendEnvKeyStatus[];
    warnings: string[];
  };
  quota: {
    day: string;
    dailyCallsUsed: number;
    dailyCallsLimit: number;
    dailyQuotaExhausted: boolean;
    oddsApiRemainingCredits: number | null;
    oddsApiUsedCredits: number | null;
    cacheEntriesCount: number;
  };
  serverTime: string;
}

export interface AnalyzeApiResponse {
  generatedAt: string;
  betType: BetTypeKey;
  feasibility: FeasibilityCheckResult;
  multiSportPrompt: MultiSportPromptInfo | null;
  recommendedSingles: CandidateSelection[];
  bestSlip: BettingSlipResult | null;
  allCandidateSelections: CandidateSelection[];
  aiCandidateEvents: EventAIContextPayload[];
  coveredCompetitions: CompetitionCoverageInfo[];
  providerWarnings: string[];
  isDemoData: boolean;
  noEventsMessage?: string;
  quotaStatus: BackendStatusResponse['quota'];
}

import {
  getStaticBackendStatus,
  runStaticPagesAnalysis
} from '../engine/staticPagesEngine';

export async function fetchBackendStatus(): Promise<BackendStatusResponse | null> {
  try {
    const res = await fetch('./api/status');
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return getStaticBackendStatus();
    }
    return (await res.json()) as BackendStatusResponse;
  } catch {
    return getStaticBackendStatus();
  }
}

export async function runBackendAnalysis(params: {
  betType: BetTypeKey;
  sports: SportKey[];
  allowMultiSportExpansion?: boolean;
  targetOdds: number;
  riskLevel: number;
  timeWindow: TimeWindowKey;
  allowedMarketGroups?: MarketGroupKey[];
}): Promise<AnalyzeApiResponse> {
  try {
    const res = await fetch('./api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
      return runStaticPagesAnalysis(params);
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Errore server (${res.status})`);
    }
    return data as AnalyzeApiResponse;
  } catch (err) {
    // Se siamo su GitHub Pages o senza server Node attivo, usa il motore autonomo integrato
    return runStaticPagesAnalysis(params);
  }
}

