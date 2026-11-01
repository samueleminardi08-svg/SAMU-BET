import React, { useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  XCircle,
  ArrowLeft,
  ListChecks,
  Layers,
  Info,
  Sparkles
} from 'lucide-react';
import {
  BetTypeKey,
  BettingSlipResult,
  CandidateSelection,
  FeasibilityCheckResult,
  MultiSportPromptInfo
} from '../config/riskConfig';
import { SelectionCard } from './SelectionCard';
import { SlipSummary } from './SlipSummary';

interface ResultsViewProps {
  generatedAt: string;
  betType: BetTypeKey;
  feasibility: FeasibilityCheckResult;
  multiSportPrompt: MultiSportPromptInfo | null;
  recommendedSingles: CandidateSelection[];
  bestSlip: BettingSlipResult | null;
  providerWarnings: string[];
  noEventsMessage?: string;
  aiProgress: {
    running: boolean;
    completed: number;
    total: number;
    cancelled: boolean;
    statusMessage?: string;
  };
  onCancelAI: () => void;
  onUpdateSnaiOdds: (selectionId: string, newOdds?: number) => void;
  onBackToForm: () => void;
  onAuthorizeMultiSport: () => void;
  onApplySuggestedParams: (opts: { newBetType?: BetTypeKey; newRiskLevel?: number }) => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  generatedAt,
  betType,
  feasibility,
  multiSportPrompt,
  recommendedSingles,
  bestSlip,
  providerWarnings,
  noEventsMessage,
  aiProgress,
  onCancelAI,
  onUpdateSnaiOdds,
  onBackToForm,
  onAuthorizeMultiSport,
  onApplySuggestedParams
}) => {
  const [activeTab, setActiveTab] = useState<'schedina' | 'pronostici'>('schedina');
  const [dismissedMultiSportPrompt, setDismissedMultiSportPrompt] = useState(false);

  // Caso 1: Richiesta matematicamente incoerente (es. Singola con quota > maxOdds del rischio, o Multipla oltre 50 partite)
  if (!feasibility.feasible) {
    return (
      <div className="results-container">
        <button type="button" className="clean-back-btn" onClick={onBackToForm}>
          <ArrowLeft size={16} aria-hidden="true" /> Modifica parametri
        </button>

        <div className="clean-alert-card" role="alert">
          <div className="clean-alert-header">
            <AlertTriangle size={20} className="text-warning" aria-hidden="true" />
            <h3>Quota troppo alta per il rischio impostato</h3>
          </div>
          <p className="clean-alert-body">{feasibility.message}</p>

          <div className="clean-alert-actions">
            {feasibility.suggestSwitchToMultiple && (
              <button
                type="button"
                className="clean-action-btn primary"
                onClick={() => onApplySuggestedParams({ newBetType: 'multiple' })}
              >
                Passa a Schedina Multipla e ricalcola
              </button>
            )}
            {feasibility.suggestedMinRiskLevel !== undefined && (
              <button
                type="button"
                className="clean-action-btn secondary"
                onClick={() =>
                  onApplySuggestedParams({ newRiskLevel: feasibility.suggestedMinRiskLevel })
                }
              >
                Alza Rischio a {feasibility.suggestedMinRiskLevel}/10 e ricalcola
              </button>
            )}
            <button type="button" className="clean-action-btn ghost" onClick={onBackToForm}>
              Cambia quota manualmente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="results-container">
      <div className="results-top-bar">
        <button type="button" className="clean-back-btn" onClick={onBackToForm}>
          <ArrowLeft size={16} aria-hidden="true" /> Modifica parametri
        </button>
      </div>

      {/* Richiesta di permesso per espandere la schedina a più sport */}
      {multiSportPrompt && multiSportPrompt.required && !dismissedMultiSportPrompt && (
        <div className="multisport-permission-card" role="region" aria-label="Richiesta permesso schedina multi-sport">
          <div className="msp-header">
            <Sparkles size={18} className="text-accent" aria-hidden="true" />
            <strong>Vuoi autorizzare una schedina con più sport?</strong>
          </div>
          <p className="msp-text">{multiSportPrompt.reason}</p>
          <div className="msp-actions">
            <button
              type="button"
              className="clean-action-btn primary"
              onClick={onAuthorizeMultiSport}
            >
              Sì, componi schedina con più sport
            </button>
            <button
              type="button"
              className="clean-action-btn ghost"
              onClick={() => setDismissedMultiSportPrompt(true)}
            >
              No, mantieni solo questo sport
            </button>
          </div>
        </div>
      )}

      {/* Avanzamento AI locale */}
      {(aiProgress.running || aiProgress.statusMessage) && (
        <div className={`clean-ai-banner ${aiProgress.running ? 'running' : 'done'}`}>
          <div className="cab-left">
            <Cpu size={15} className={aiProgress.running ? 'spin-pulse' : ''} aria-hidden="true" />
            <span>
              {aiProgress.running
                ? `Analisi AI ${aiProgress.completed}/${aiProgress.total} in corso...`
                : aiProgress.statusMessage}
            </span>
          </div>
          {aiProgress.running && (
            <button type="button" className="cab-cancel-btn" onClick={onCancelAI}>
              <XCircle size={14} aria-hidden="true" /> Annulla
            </button>
          )}
        </div>
      )}

      {/* Avvisi sintetici provider */}
      {providerWarnings.length > 0 && (
        <div className="clean-warnings-stack">
          {providerWarnings.map((w, idx) => (
            <div key={idx} className="clean-warning-row">
              <Info size={14} aria-hidden="true" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {noEventsMessage || recommendedSingles.length === 0 ? (
        <div className="clean-alert-card">
          <div className="clean-alert-header">
            <AlertTriangle size={20} className="text-warning" aria-hidden="true" />
            <h3>Nessuna partita idonea trovata</h3>
          </div>
          <p className="clean-alert-body">
            {noEventsMessage ||
              'Non ci sono partite nella finestra scelta che rispettano contemporaneamente la probabilità minima e la quota massima del rischio impostato.'}
          </p>
          <div className="clean-alert-actions">
            {multiSportPrompt?.required && (
              <button
                type="button"
                className="clean-action-btn primary"
                onClick={onAuthorizeMultiSport}
              >
                Cerca su tutti gli sport
              </button>
            )}
            <button type="button" className="clean-action-btn secondary" onClick={onBackToForm}>
              Modifica parametri
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="clean-tabs-bar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'schedina'}
              className={`clean-tab-btn ${activeTab === 'schedina' ? 'active' : ''}`}
              onClick={() => setActiveTab('schedina')}
            >
              <Layers size={15} aria-hidden="true" />
              <span>{betType === 'single' ? 'Miglior Singola' : 'Miglior Schedina'}</span>
              {bestSlip && (
                <span className="clean-tab-badge tabular-nums">
                  {bestSlip.totalOdds.toFixed(2)}x
                </span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'pronostici'}
              className={`clean-tab-btn ${activeTab === 'pronostici' ? 'active' : ''}`}
              onClick={() => setActiveTab('pronostici')}
            >
              <ListChecks size={15} aria-hidden="true" />
              <span>Tutti i pronostici</span>
              <span className="clean-tab-badge tabular-nums">{recommendedSingles.length}</span>
            </button>
          </div>

          {activeTab === 'schedina' ? (
            <div className="tab-panel">
              {bestSlip ? (
                <>
                  <SlipSummary slip={bestSlip} generatedAt={generatedAt} />
                  <div className="clean-cards-stack">
                    {bestSlip.selections.map((sel, i) => (
                      <SelectionCard
                        key={sel.id}
                        selection={sel}
                        indexNumber={i + 1}
                        onUpdateSnaiOdds={onUpdateSnaiOdds}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="clean-alert-card">
                  <p className="clean-alert-body">
                    Non ci sono abbastanza eventi distinti per comporre la schedina richiesta.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="tab-panel">
              <div className="clean-cards-stack">
                {recommendedSingles.map((sel, i) => (
                  <SelectionCard
                    key={sel.id}
                    selection={sel}
                    indexNumber={i + 1}
                    onUpdateSnaiOdds={onUpdateSnaiOdds}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
