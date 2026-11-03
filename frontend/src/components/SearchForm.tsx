import React, { useState } from 'react';
import {
  Flame,
  Calendar,
  Target,
  Layers,
  ArrowRight,
  Globe,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Check,
  RotateCcw,
  Trophy,
  Sliders,
  AlertCircle
} from 'lucide-react';
import {
  BetTypeKey,
  CompetitionItem,
  DiversityModeKey,
  MARKET_GROUP_OPTIONS,
  MAX_MULTIPLE_EVENTS,
  MAX_TARGET_ODDS,
  MarketGroupKey,
  RISK_CONFIG_UI,
  SportKey,
  TimeWindowKey
} from '../config/riskConfig';

interface SearchFormProps {
  betType: BetTypeKey;
  sports: SportKey[];
  targetOdds: number;
  riskLevel: number;
  timeWindow: TimeWindowKey;
  allowedMarketGroups: MarketGroupKey[];
  loading: boolean;
  selectedCompetitionIds: string[];
  competitions: CompetitionItem[];
  diversityMode: DiversityModeKey;
  onChangeBetType: (bt: BetTypeKey) => void;
  onChangeSports: (sports: SportKey[]) => void;
  onChangeTargetOdds: (q: number) => void;
  onChangeRiskLevel: (r: number) => void;
  onChangeTimeWindow: (w: TimeWindowKey) => void;
  onChangeAllowedMarketGroups: (groups: MarketGroupKey[]) => void;
  onChangeDiversityMode: (mode: DiversityModeKey) => void;
  onOpenCompetitionsModal: () => void;
  onSubmit: () => void;
}

const WINDOW_OPTIONS: Array<{ key: TimeWindowKey; label: string }> = [
  { key: 'today', label: 'Oggi' },
  { key: 'hours48', label: '48 ore' },
  { key: 'days7', label: '7 giorni' },
  { key: 'days14', label: '14 giorni' }
];

const DIVERSITY_OPTIONS: Array<{ key: DiversityModeKey; label: string; sub: string }> = [
  { key: 'auto', label: 'Auto', sub: 'Decide l\'AI' },
  { key: 'high', label: 'Alta', sub: 'Max 2 uguali' },
  { key: 'normal', label: 'Normale', sub: 'Max 3 uguali' },
  { key: 'none', label: 'Nessun limite', sub: 'Libera' }
];

export const SearchForm: React.FC<SearchFormProps> = ({
  betType,
  targetOdds,
  riskLevel,
  timeWindow,
  allowedMarketGroups,
  loading,
  selectedCompetitionIds,
  competitions,
  diversityMode,
  onChangeBetType,
  onChangeTargetOdds,
  onChangeRiskLevel,
  onChangeTimeWindow,
  onChangeAllowedMarketGroups,
  onChangeDiversityMode,
  onOpenCompetitionsModal,
  onSubmit
}) => {
  const [marketsMenuOpen, setMarketsMenuOpen] = useState(false);
  const currentRisk = RISK_CONFIG_UI[riskLevel] || RISK_CONFIG_UI[5];

  const toggleMarketGroup = (key: MarketGroupKey) => {
    if (allowedMarketGroups.includes(key)) {
      onChangeAllowedMarketGroups(allowedMarketGroups.filter((k) => k !== key));
    } else {
      onChangeAllowedMarketGroups([...allowedMarketGroups, key]);
    }
  };

  const selectedMarketSummary =
    allowedMarketGroups.length === 0
      ? 'Tutti i mercati SNAI (Scelta automatica AI)'
      : allowedMarketGroups.length <= 2
      ? MARKET_GROUP_OPTIONS.filter((o) => allowedMarketGroups.includes(o.key))
          .map((o) => o.shortBadge)
          .join(' + ')
      : `${allowedMarketGroups.length} tipi di bet selezionati`;

  const maxAllowedTarget = betType === 'single' ? 30 : MAX_TARGET_ODDS;

  const presets =
    betType === 'single'
      ? [1.45, 1.85, 2.25, 3.5, 5.0, 10.0]
      : [2.5, 5.0, 10.0, 25.0, 100.0, 500.0];

  const estimatedEventsMin =
    betType === 'single'
      ? 1
      : riskLevel === 11
      ? Math.min(
          MAX_MULTIPLE_EVENTS,
          Math.max(2, Math.ceil(Math.log(Math.max(1.1, targetOdds)) / Math.log(2.6)))
        )
      : Math.min(
          MAX_MULTIPLE_EVENTS,
          Math.max(2, Math.ceil(Math.log(Math.max(1.1, targetOdds)) / Math.log(currentRisk.maxOdds)))
        );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form className="clean-form-card" onSubmit={handleFormSubmit}>
      {/* Intestazione Calcio Mondiale + Pill rapida */}
      <div className="clean-field-block" style={{ paddingBottom: '4px' }}>
        <div className="field-header-inline">
          <span className="clean-step-label">
            <Globe size={15} aria-hidden="true" />
            Calcio Mondiale — Gemini AI
          </span>
          <button
            type="button"
            onClick={onOpenCompetitionsModal}
            className="clean-competitions-pill"
          >
            <Trophy size={14} />
            <span>
              {selectedCompetitionIds.includes('__none__')
                ? 'Nessuna'
                : selectedCompetitionIds.length === 0
                ? 'Tutte le Competizioni'
                : `${selectedCompetitionIds.length} competizioni`}
            </span>
          </button>
        </div>
      </div>

      {/* SELETTORE PROMINENTE CAMPIONATI & COPPE */}
      <div className="clean-field-block">
        <div className="field-header-inline">
          <span className="clean-step-label">
            <Trophy size={15} aria-hidden="true" />
            Campionati &amp; Coppe
          </span>
          <span className="field-hint-pill">
            {competitions.length > 0
              ? `${competitions.reduce((acc, c) => acc + c.eventsCount, 0)} partite in calendario`
              : 'Filtro competizioni'}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenCompetitionsModal}
          className="competitions-selector-btn"
          aria-label="Apri filtro campionati e coppe"
        >
          <div className="csb-left">
            <div className="csb-icon-wrap">
              <Trophy size={18} />
            </div>
            <div className="csb-text">
              <strong className="csb-title">
                {selectedCompetitionIds.includes('__none__')
                  ? 'Nessuna competizione selezionata'
                  : selectedCompetitionIds.length === 0
                  ? 'Tutte le Competizioni & Coppe mondiali'
                  : `${selectedCompetitionIds.length} competizioni selezionate`}
              </strong>
              <span className="csb-sub">
                {selectedCompetitionIds.includes('__none__')
                  ? 'Clicca per selezionare almeno una competizione'
                  : selectedCompetitionIds.length === 0
                  ? 'Champions League, Serie A, Coppe europee, Premier e altri tornei (Clicca per filtrare)'
                  : competitions
                      .filter((c) => selectedCompetitionIds.includes(c.id))
                      .map((c) => c.name)
                      .slice(0, 3)
                      .join(', ') +
                    (selectedCompetitionIds.length > 3
                      ? ` + altre ${selectedCompetitionIds.length - 3}`
                      : '')}
              </span>
            </div>
          </div>
          <div className="csb-right">
            <span className="csb-badge">
              {selectedCompetitionIds.includes('__none__')
                ? '0 attive'
                : selectedCompetitionIds.length === 0
                ? 'Tutte attive'
                : `${selectedCompetitionIds.length}/${competitions.length}`}
            </span>
            <ChevronDown size={18} />
          </div>
        </button>
      </div>

      {/* 1. TIPO DI SCHEDINA */}
      <div className="clean-field-block">
        <span className="clean-step-label">
          <Layers size={15} aria-hidden="true" />
          1. Tipo di giocata
        </span>
        <div className="bet-type-toggle" role="radiogroup" aria-label="Tipo di giocata">
          <button
            type="button"
            role="radio"
            aria-checked={betType === 'single'}
            className={`bet-type-option ${betType === 'single' ? 'active' : ''}`}
            onClick={() => {
              onChangeBetType('single');
              if (targetOdds > 30) {
                onChangeTargetOdds(2.0);
              }
            }}
          >
            <div className="bt-title-row">
              <strong>Singola</strong>
              <span className="bt-badge">1 partita</span>
            </div>
            <span className="bt-desc">
              Scegli solo la quota desiderata (senza vincoli di rischio)
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={betType === 'multiple'}
            className={`bet-type-option ${betType === 'multiple' ? 'active' : ''}`}
            onClick={() => onChangeBetType('multiple')}
          >
            <div className="bt-title-row">
              <strong>Multipla</strong>
              <span className="bt-badge">Max {MAX_MULTIPLE_EVENTS} partite</span>
            </div>
            <span className="bt-desc">
              Numero di partite calcolato dall&apos;IA in base a quota e rischio
            </span>
          </button>
        </div>
      </div>

      {/* 2. QUOTA DESIDERATA */}
      <div className="clean-field-block">
        <div className="field-header-inline">
          <label className="clean-step-label" htmlFor="target-odds-input">
            <Target size={15} aria-hidden="true" />
            2. Quota desiderata
          </label>
          <span className="field-hint-pill tabular-nums">
            Min 1.10 · Max {maxAllowedTarget}
          </span>
        </div>

        <div className="clean-odds-input-row">
          <input
            id="target-odds-input"
            type="number"
            step="0.05"
            min="1.10"
            max={maxAllowedTarget}
            value={targetOdds}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isNaN(v)) {
                onChangeTargetOdds(1.1);
              } else {
                onChangeTargetOdds(Math.min(maxAllowedTarget, v));
              }
            }}
            className="clean-odds-input tabular-nums"
            required
          />
          <div className="odds-auto-info">
            {betType === 'single' ? (
              <span>1 partita (Tutti i mercati SNAI)</span>
            ) : (
              <span>
                Circa <strong className="tabular-nums">{estimatedEventsMin}</strong>{' '}
                {estimatedEventsMin === 1 ? 'partita' : 'partite'} stimate
              </span>
            )}
          </div>
        </div>

        <div className="clean-presets-row">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={`clean-preset-chip tabular-nums ${
                Math.abs(targetOdds - p) < 0.01 ? 'active' : ''
              }`}
              onClick={() => onChangeTargetOdds(p)}
            >
              {p >= 10 ? `${p.toFixed(0)}x` : `${p.toFixed(2)}x`}
            </button>
          ))}
        </div>
      </div>

      {/* 3. LIVELLO DI RISCHIO — SOLO PER LE MULTIPLE */}
      {betType === 'multiple' && (
        <div className="clean-field-block">
          <div className="field-header-inline">
            <label className="clean-step-label" htmlFor="risk-slider-input">
              <Flame size={15} style={{ color: currentRisk.colorHex }} aria-hidden="true" />
              3. Livello di rischio
            </label>
            <span
              className="clean-risk-badge tabular-nums"
              style={{
                color: currentRisk.colorHex,
                borderColor: currentRisk.colorHex,
                backgroundColor: currentRisk.bgTint
              }}
            >
              {riskLevel === 11 ? `⚡ ${currentRisk.label}` : `${riskLevel}/10 · ${currentRisk.label}`}
            </span>
          </div>

          <div className="clean-risk-box">
            <input
              id="risk-slider-input"
              type="range"
              min={1}
              max={11}
              step={1}
              value={riskLevel}
              onChange={(e) => onChangeRiskLevel(Number(e.target.value))}
              className="clean-range-slider"
              style={{ accentColor: currentRisk.colorHex }}
            />

            <div className="ultra-risk-row">
              <button
                type="button"
                className={`ultra-risk-btn ${riskLevel === 11 ? 'active' : ''}`}
                onClick={() => onChangeRiskLevel(riskLevel === 11 ? 5 : 11)}
              >
                <span className="ultra-risk-icon">⚡</span>
                <span>
                  {riskLevel === 11
                    ? 'Modalità ULTRA attiva (Senza limiti · 100% Giudizio IA)'
                    : 'Attiva Rischio ULTRA (Senza limiti di quote · 100% Giudizio IA)'}
                </span>
              </button>
            </div>

            <p className="clean-risk-desc">{currentRisk.description}</p>
            <div className="clean-risk-Constant-row">
              {riskLevel === 11 ? (
                <>
                  <span>
                    Probabilità min: <strong>Nessun limite (Scelta IA)</strong>
                  </span>
                  <span>
                    Quota max singola selezione: <strong>Illimitata (100% IA)</strong>
                  </span>
                </>
              ) : (
                <>
                  <span>
                    Probabilità min:{' '}
                    <strong className="tabular-nums">
                      ≥ {Math.round(currentRisk.minProb * 100)}%
                    </strong>
                  </span>
                  <span>
                    Quota max singola selezione:{' '}
                    <strong className="tabular-nums">≤ {currentRisk.maxOdds.toFixed(2)}</strong>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. VARIETÀ MERCATI SCHEDINA (SOLO MULTIPLE) */}
      {betType === 'multiple' && (
        <div className="clean-field-block">
          <div className="field-header-inline">
            <span className="clean-step-label">
              <Sliders size={15} aria-hidden="true" />
              4. Varietà mercati schedina
            </span>
            <span className="field-hint-pill">Diversificazione mercati</span>
          </div>
          <div className="diversity-grid">
            {DIVERSITY_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onChangeDiversityMode(opt.key)}
                className={`diversity-option-btn ${diversityMode === opt.key ? 'active' : ''}`}
              >
                <span className="diversity-btn-title">{opt.label}</span>
                <span className="diversity-btn-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TIPI DI BET SNAI */}
      <div className="clean-field-block">
        <div className="field-header-inline">
          <span className="clean-step-label">
            <SlidersHorizontal size={15} aria-hidden="true" />
            {betType === 'single' ? '3. Tipi di bet nella schedina' : '5. Tipi di bet nella schedina'}
          </span>
          {allowedMarketGroups.length > 0 && (
            <button
              type="button"
              className="market-reset-inline-btn"
              onClick={() => onChangeAllowedMarketGroups([])}
            >
              <RotateCcw size={12} /> Ripristina tutti
            </button>
          )}
        </div>

        <div className="market-dropdown-wrapper">
          <button
            type="button"
            className={`market-dropdown-trigger ${marketsMenuOpen ? 'open' : ''}`}
            onClick={() => setMarketsMenuOpen(!marketsMenuOpen)}
            aria-expanded={marketsMenuOpen}
          >
            <div className="mdt-left">
              <span className="mdt-summary">{selectedMarketSummary}</span>
              <span className="mdt-badge">
                {allowedMarketGroups.length === 0
                  ? 'Tutti i mercati'
                  : `${allowedMarketGroups.length}/${MARKET_GROUP_OPTIONS.length}`}
              </span>
            </div>
            {marketsMenuOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>

          {marketsMenuOpen && (
            <div className="market-dropdown-panel" role="group" aria-label="Seleziona i tipi di bet">
              <button
                type="button"
                className={`market-dropdown-item all-option ${
                  allowedMarketGroups.length === 0 ? 'selected' : ''
                }`}
                onClick={() => onChangeAllowedMarketGroups([])}
              >
                <div className="mdi-check">
                  {allowedMarketGroups.length === 0 && <Check size={14} />}
                </div>
                <div className="mdi-text">
                  <div className="mdi-title-row">
                    <strong>Tutti i mercati SNAI (Consigliato)</strong>
                    <span className="mdi-pill">Automatico AI</span>
                  </div>
                  <span className="mdi-desc">
                    L&apos;IA sceglie liberamente tra tutti i mercati SNAI quelli con il miglior rapporto probabilità/quota
                  </span>
                </div>
              </button>

              <div className="market-dropdown-divider" />

              <div className="market-dropdown-grid">
                {MARKET_GROUP_OPTIONS.map((opt) => {
                  const isSelected = allowedMarketGroups.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={`market-dropdown-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleMarketGroup(opt.key)}
                    >
                      <div className="mdi-check">{isSelected && <Check size={14} />}</div>
                      <div className="mdi-text">
                        <div className="mdi-title-row">
                          <strong>{opt.label}</strong>
                          <span className="mdi-pill">{opt.shortBadge}</span>
                        </div>
                        <span className="mdi-desc">{opt.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FINESTRA TEMPORALE */}
      <div className="clean-field-block">
        <span className="clean-step-label">
          <Calendar size={15} aria-hidden="true" />
          {betType === 'single' ? '4. Finestra temporale' : '6. Finestra temporale'}
        </span>
        <div className="clean-segmented" role="radiogroup" aria-label="Finestra temporale">
          {WINDOW_OPTIONS.map((w) => (
            <button
              key={w.key}
              type="button"
              role="radio"
              aria-checked={timeWindow === w.key}
              className={`clean-seg-btn ${timeWindow === w.key ? 'active' : ''}`}
              onClick={() => onChangeTimeWindow(w.key)}
            >
              {w.label}
            </button>
          ))}
        </div>

        {timeWindow === 'days14' && (
          <div className="clean-window-alert" role="alert">
            <AlertCircle size={15} />
            <span>
              Attenzione: quote ed eventi oltre i 7 giorni possono subire forti variazioni di mercato e rotazioni di formazione prima del calcio d&apos;inizio.
            </span>
          </div>
        )}
      </div>

      <button
        type="submit"
        className="clean-submit-cta"
        disabled={loading || targetOdds < 1.1 || targetOdds > maxAllowedTarget}
      >
        <span>{loading ? 'Analisi AI Gemini in corso...' : 'Genera pronostici AI'}</span>
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </form>
  );
};
