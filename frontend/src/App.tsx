import React, { useEffect, useRef, useState } from 'react';
import {
  BetTypeKey,
  BettingSlipResult,
  CandidateSelection,
  CompetitionCoverageInfo,
  FeasibilityCheckResult,
  MarketGroupKey,
  MultiSportPromptInfo,
  SportKey,
  TimeWindowKey
} from './config/riskConfig';
import {
  recalculateSelectionWithOddsOrAI,
  recomputeRecommendationsAndSlip
} from './engine/clientEngine';
import {
  BackendStatusResponse,
  fetchBackendStatus,
  runBackendAnalysis
} from './services/apiClient';
import {
  BridgeHealthStatus,
  BridgeSettings,
  estimateSingleEventOnBridge,
  loadBridgeSettings,
  testBridgeConnection
} from './services/aiBridgeClient';
import {
  ResponsibleGamingFooter,
  ResponsibleGamingTopBanner
} from './components/ResponsibleGaming';
import { Header } from './components/Header';
import { SearchForm } from './components/SearchForm';
import { ResultsView } from './components/ResultsView';
import { LocalAISettings } from './components/LocalAISettings';
import { CoveredCompetitionsModal } from './components/CoveredCompetitions';

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<'form' | 'results' | 'settings'>('form');
  const [competitionsModalOpen, setCompetitionsModalOpen] = useState(false);

  // Parametri Form (Singola/Multipla all'inizio + Sport + Quota max 3000 + Rischio 1-10 + Mercati SNAI)
  const [betType, setBetType] = useState<BetTypeKey>('multiple');
  const [sports, setSports] = useState<SportKey[]>(['football']);
  const [targetOdds, setTargetOdds] = useState<number>(5.0);
  const [riskLevel, setRiskLevel] = useState<number>(5);
  const [timeWindow, setTimeWindow] = useState<TimeWindowKey>('hours48');
  const [allowedMarketGroups, setAllowedMarketGroups] = useState<MarketGroupKey[]>([]);

  // Stato Backend & Risultati
  const [backendStatus, setBackendStatus] = useState<BackendStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [generatedAt, setGeneratedAt] = useState<string>(new Date().toISOString());
  const [feasibility, setFeasibility] = useState<FeasibilityCheckResult | null>(null);
  const [multiSportPrompt, setMultiSportPrompt] = useState<MultiSportPromptInfo | null>(null);
  const [allSelections, setAllSelections] = useState<CandidateSelection[]>([]);
  const [recommendedSingles, setRecommendedSingles] = useState<CandidateSelection[]>([]);
  const [bestSlip, setBestSlip] = useState<BettingSlipResult | null>(null);
  const [coveredCompetitions, setCoveredCompetitions] = useState<CompetitionCoverageInfo[]>([]);
  const [providerWarnings, setProviderWarnings] = useState<string[]>([]);
  const [noEventsMessage, setNoEventsMessage] = useState<string | undefined>(undefined);
  const [isDemoData, setIsDemoData] = useState<boolean>(false);

  // Stato AI Locale (Unsloth Bridge)
  const [bridgeSettings, setBridgeSettings] = useState<BridgeSettings>(() => loadBridgeSettings());
  const [aiStatus, setAiStatus] = useState<BridgeHealthStatus>({
    reachable: false,
    unslothReachable: false,
    detail: 'Modalità solo mercato attiva.'
  });
  const [aiProgress, setAiProgress] = useState<{
    running: boolean;
    completed: number;
    total: number;
    cancelled: boolean;
    statusMessage?: string;
  }>({
    running: false,
    completed: 0,
    total: 0,
    cancelled: false
  });

  const aiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchBackendStatus().then((st) => {
      if (st) {
        setBackendStatus(st);
        setIsDemoData(Boolean(st.envReport.demoModeActive));
      }
    });

    const saved = loadBridgeSettings();
    if (saved.url && saved.token) {
      testBridgeConnection(saved).then((health) => {
        setAiStatus(health);
      });
    }
  }, []);

  const cancelOngoingAI = () => {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }
    setAiProgress((prev) => ({
      ...prev,
      running: false,
      cancelled: true,
      statusMessage: `Analisi AI interrotta (${prev.completed}/${prev.total} eventi completati con AI, il resto usa il mercato).`
    }));
  };

  const executeAnalysis = async (overrideParams?: {
    betType?: BetTypeKey;
    sports?: SportKey[];
    allowMultiSportExpansion?: boolean;
    riskLevel?: number;
  }) => {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }

    const effBetType = overrideParams?.betType ?? betType;
    const effSports = overrideParams?.sports ?? sports;
    const effAllowMulti = overrideParams?.allowMultiSportExpansion ?? false;
    const effRiskLevel = overrideParams?.riskLevel ?? riskLevel;

    setLoading(true);
    setErrorBanner(null);
    setAiProgress({ running: false, completed: 0, total: 0, cancelled: false });

    try {
      const res = await runBackendAnalysis({
        betType: effBetType,
        sports: effSports,
        allowMultiSportExpansion: effAllowMulti,
        targetOdds,
        riskLevel: effRiskLevel,
        timeWindow,
        allowedMarketGroups: allowedMarketGroups.length > 0 ? allowedMarketGroups : undefined
      });

      setGeneratedAt(res.generatedAt);
      setFeasibility(res.feasibility);
      setMultiSportPrompt(res.multiSportPrompt);
      setAllSelections(res.allCandidateSelections);
      setRecommendedSingles(res.recommendedSingles);
      setBestSlip(res.bestSlip);
      setCoveredCompetitions(res.coveredCompetitions);
      setProviderWarnings(res.providerWarnings);
      setNoEventsMessage(res.noEventsMessage);
      setIsDemoData(res.isDemoData);
      setActiveScreen('results');

      fetchBackendStatus().then((st) => st && setBackendStatus(st));

      const currentHealth = await testBridgeConnection();
      setAiStatus(currentHealth);
      if (
        res.feasibility.feasible &&
        res.aiCandidateEvents.length > 0 &&
        currentHealth.reachable &&
        currentHealth.unslothReachable
      ) {
        const controller = new AbortController();
        aiAbortRef.current = controller;

        const eventsToAnalyze = res.aiCandidateEvents;
        setAiProgress({
          running: true,
          completed: 0,
          total: eventsToAnalyze.length,
          cancelled: false
        });

        let workingSelections = [...res.allCandidateSelections];
        let successCount = 0;

        for (let i = 0; i < eventsToAnalyze.length; i++) {
          if (controller.signal.aborted) break;
          const evCtx = eventsToAnalyze[i];

          try {
            const estimates = await estimateSingleEventOnBridge(evCtx, controller.signal);
            if (controller.signal.aborted) break;

            successCount++;
            setAiStatus((prev) => ({
              ...prev,
              reachable: true,
              unslothReachable: true
            }));

            workingSelections = workingSelections.map((sel) => {
              if (sel.eventId !== evCtx.eventId) return sel;
              const matchEst = estimates.find(
                (e) =>
                  e.selection.toLowerCase() === sel.selection.toLowerCase() ||
                  e.market.toLowerCase() === sel.market.toLowerCase()
              );
              if (!matchEst) return sel;
              return recalculateSelectionWithOddsOrAI(sel, sel.snaiRealOdds, matchEst);
            });

            const recomputed = recomputeRecommendationsAndSlip(
              workingSelections,
              targetOdds,
              effBetType,
              effRiskLevel
            );

            setAllSelections([...workingSelections]);
            setRecommendedSingles(recomputed.recommendedSingles);
            setBestSlip(recomputed.bestSlip);
            setAiProgress({
              running: i + 1 < eventsToAnalyze.length,
              completed: i + 1,
              total: eventsToAnalyze.length,
              cancelled: false,
              statusMessage:
                i + 1 === eventsToAnalyze.length
                  ? `Analisi AI completata (${successCount}/${eventsToAnalyze.length} eventi arricchiti con AI locale).`
                  : undefined
            });
          } catch {
            if (controller.signal.aborted) break;
            setAiStatus({
              reachable: false,
              unslothReachable: false,
              detail:
                'Bridge locale non raggiungibile o timeout del modello: uso solo le probabilità di mercato.'
            });
            setAiProgress({
              running: false,
              completed: successCount,
              total: eventsToAnalyze.length,
              cancelled: false,
              statusMessage:
                successCount > 0
                  ? `AI locale interrotta dopo ${successCount} eventi: mantenuti i risultati parziali, il resto usa il mercato.`
                  : 'AI locale non raggiungibile: utilizzo modalità "solo mercato".'
            });
            break;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore di comunicazione col backend';
      setErrorBanner(msg);
    } finally {
      setLoading(false);
    }
  };

  // Override manuale "Quota SNAI reale" con ricalcolo istantaneo
  const handleUpdateSnaiOdds = (selectionId: string, newSnaiOdds?: number) => {
    const updatedAll = allSelections.map((sel) => {
      if (sel.id !== selectionId) return sel;
      return recalculateSelectionWithOddsOrAI(sel, newSnaiOdds);
    });

    setAllSelections(updatedAll);
    const recomputed = recomputeRecommendationsAndSlip(
      updatedAll,
      targetOdds,
      betType,
      riskLevel
    );
    setRecommendedSingles(recomputed.recommendedSingles);
    setBestSlip(recomputed.bestSlip);
  };

  // Autorizzazione dell'utente a comporre una schedina con più sport
  const handleAuthorizeMultiSport = () => {
    const allThree: SportKey[] = ['football', 'tennis', 'f1'];
    setSports(allThree);
    executeAnalysis({ sports: allThree, allowMultiSportExpansion: true });
  };

  const handleApplySuggestedParams = (opts: {
    newBetType?: BetTypeKey;
    newRiskLevel?: number;
  }) => {
    if (opts.newBetType) setBetType(opts.newBetType);
    if (opts.newRiskLevel !== undefined) setRiskLevel(opts.newRiskLevel);
    executeAnalysis({
      betType: opts.newBetType,
      riskLevel: opts.newRiskLevel
    });
  };

  const missingRequiredKeysCount =
    backendStatus?.envReport.keys.filter(
      (k) =>
        !k.configured &&
        (k.keyName === 'THE_ODDS_API_KEY' || k.keyName === 'FOOTBALL_DATA_API_KEY')
    ).length || 0;

  return (
    <div className="app-shell">
      <ResponsibleGamingTopBanner />

      <Header
        activeScreen={activeScreen}
        onNavigate={setActiveScreen}
        onOpenCompetitionsModal={() => setCompetitionsModalOpen(true)}
        aiStatus={aiStatus}
        hasResults={feasibility !== null}
        isDemoData={isDemoData}
        missingRequiredKeysCount={missingRequiredKeysCount}
      />

      <main className="app-main-content">
        {errorBanner && (
          <div className="error-alert-banner" role="alert">
            <span>{errorBanner}</span>
          </div>
        )}

        {backendStatus &&
          !backendStatus.envReport.demoModeActive &&
          missingRequiredKeysCount > 0 && (
            <div className="startup-keys-alert">
              <div>
                <strong>Alcune chiavi API non sono configurate</strong>
                <p>
                  Mancano{' '}
                  {backendStatus.envReport.keys
                    .filter(
                      (k) =>
                        !k.configured &&
                        k.keyName !== 'GEMINI_API_KEY' &&
                        k.keyName !== 'API_FOOTBALL_KEY'
                    )
                    .map((k) => k.keyName)
                    .join(', ')}
                  .
                </p>
              </div>
              <button
                type="button"
                className="small-outline-btn"
                onClick={() => setCompetitionsModalOpen(true)}
              >
                Dettagli
              </button>
            </div>
          )}

        {activeScreen === 'form' && (
          <SearchForm
            betType={betType}
            sports={sports}
            targetOdds={targetOdds}
            riskLevel={riskLevel}
            timeWindow={timeWindow}
            allowedMarketGroups={allowedMarketGroups}
            loading={loading}
            onChangeBetType={setBetType}
            onChangeSports={setSports}
            onChangeTargetOdds={setTargetOdds}
            onChangeRiskLevel={setRiskLevel}
            onChangeTimeWindow={setTimeWindow}
            onChangeAllowedMarketGroups={setAllowedMarketGroups}
            onSubmit={() => executeAnalysis()}
          />
        )}

        {activeScreen === 'results' && feasibility && (
          <ResultsView
            generatedAt={generatedAt}
            betType={betType}
            feasibility={feasibility}
            multiSportPrompt={multiSportPrompt}
            recommendedSingles={recommendedSingles}
            bestSlip={bestSlip}
            providerWarnings={providerWarnings}
            noEventsMessage={noEventsMessage}
            aiProgress={aiProgress}
            onCancelAI={cancelOngoingAI}
            onUpdateSnaiOdds={handleUpdateSnaiOdds}
            onBackToForm={() => setActiveScreen('form')}
            onAuthorizeMultiSport={handleAuthorizeMultiSport}
            onApplySuggestedParams={handleApplySuggestedParams}
          />
        )}

        {activeScreen === 'settings' && (
          <LocalAISettings
            initialSettings={bridgeSettings}
            currentHealth={aiStatus}
            onSettingsUpdated={(newSettings, newHealth) => {
              setBridgeSettings(newSettings);
              setAiStatus(newHealth);
            }}
          />
        )}
      </main>

      <CoveredCompetitionsModal
        open={competitionsModalOpen}
        onClose={() => setCompetitionsModalOpen(false)}
        backendStatus={backendStatus}
        coveredCompetitions={coveredCompetitions}
      />

      <ResponsibleGamingFooter />
    </div>
  );
};
