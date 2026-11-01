import React, { useState } from 'react';
import {
  Clock,
  Cpu,
  BarChart3,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  CircleDot,
  Flag,
  Activity
} from 'lucide-react';
import { CandidateSelection } from '../config/riskConfig';

interface SelectionCardProps {
  selection: CandidateSelection;
  indexNumber?: number;
  onUpdateSnaiOdds: (selectionId: string, newSnaiOdds?: number) => void;
}

const SPORT_META: Record<
  string,
  { label: string; accent: string; Icon: React.FC<{ size?: number }> }
> = {
  football: { label: 'Calcio', accent: '#22c55e', Icon: CircleDot },
  f1: { label: 'Formula 1', accent: '#f43f5e', Icon: Flag },
  tennis: { label: 'Tennis', accent: '#eab308', Icon: Activity }
};

export const SelectionCard: React.FC<SelectionCardProps> = ({
  selection,
  indexNumber,
  onUpdateSnaiOdds
}) => {
  const [inputVal, setInputVal] = useState<string>(
    selection.snaiRealOdds !== undefined ? selection.snaiRealOdds.toString() : ''
  );
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);

  const sportInfo = SPORT_META[selection.sport] || SPORT_META.football;
  const SportIcon = sportInfo.Icon;

  const probPct = Math.round(selection.pFinal * 1000) / 10;
  const marketPct = Math.round(selection.pMarket * 1000) / 10;
  const evPct = Math.round(selection.ev * 1000) / 10;

  const formattedDate = new Date(selection.commenceTime).toLocaleString('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handleSnaiInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputVal(raw);
    if (raw.trim() === '') {
      onUpdateSnaiOdds(selection.id, undefined);
      return;
    }
    const parsed = parseFloat(raw.replace(',', '.'));
    if (!Number.isNaN(parsed) && parsed >= 1.01 && parsed <= 500) {
      onUpdateSnaiOdds(selection.id, Number(parsed.toFixed(2)));
    }
  };

  const resetSnaiOverride = () => {
    setInputVal('');
    onUpdateSnaiOdds(selection.id, undefined);
  };

  return (
    <article className="clean-selection-card">
      {/* Header minimale: Sport, Competizione, Orario e Fonte Stima */}
      <div className="csc-header">
        <div className="csc-meta-left">
          {indexNumber !== undefined && (
            <span className="csc-index tabular-nums">{indexNumber}</span>
          )}
          <span className="csc-sport-badge" style={{ color: sportInfo.accent }}>
            <SportIcon size={13} />
            <span>{sportInfo.label}</span>
          </span>
          <span className="csc-comp">{selection.competitionName}</span>
        </div>

        <div className="csc-meta-right">
          <span className="csc-time">
            <Clock size={12} aria-hidden="true" />
            <span>{formattedDate}</span>
          </span>
          <span
            className={`csc-mode-tag ${
              selection.estimationMode === 'ai_plus_market' ? 'ai' : 'mkt'
            }`}
          >
            {selection.estimationMode === 'ai_plus_market' ? (
              <>
                <Cpu size={11} aria-hidden="true" /> AI + Mercato
              </>
            ) : (
              <>
                <BarChart3 size={11} aria-hidden="true" /> Mercato
              </>
            )}
          </span>
        </div>
      </div>

      {/* Riga Centrale: Partita e Pronostico Consigliato */}
      <div className="csc-main-row">
        <div className="csc-match-col">
          <h3 className="csc-event-name">{selection.eventName}</h3>
          <div className="csc-pick-inline">
            <span className="csc-market-name">{selection.market}:</span>
            <strong className="csc-pick-value">{selection.selection}</strong>
            {selection.marginUnadjusted && (
              <span className="csc-unadjusted-pill">margine non depurato</span>
            )}
          </div>
        </div>

        <div className="csc-prob-pill-box">
          <span className="csc-prob-num tabular-nums">{probPct.toFixed(0)}%</span>
          <span className="csc-prob-label">Prob.</span>
        </div>
      </div>

      {/* Riga Valori: Quota Mercato, Quota SNAI Reale (override), EV */}
      <div className="csc-metrics-bar">
        <div className="csc-metric-item">
          <span className="csc-metric-label">Quota stimata</span>
          <strong className="csc-metric-val tabular-nums">
            {selection.bookmakerOdds.toFixed(2)}
          </strong>
        </div>

        <div className="csc-metric-item snai-box">
          <label className="csc-metric-label snai-accent" htmlFor={`snai-${selection.id}`}>
            Quota SNAI reale
          </label>
          <div className="csc-snai-input-wrap">
            <input
              id={`snai-${selection.id}`}
              type="number"
              step="0.01"
              min="1.01"
              max="500"
              placeholder={selection.bookmakerOdds.toFixed(2)}
              value={inputVal}
              onChange={handleSnaiInputChange}
              className={`csc-snai-input tabular-nums ${
                selection.snaiRealOdds !== undefined ? 'overridden' : ''
              }`}
            />
            {selection.snaiRealOdds !== undefined && (
              <button
                type="button"
                className="csc-reset-btn"
                onClick={resetSnaiOverride}
                aria-label="Ripristina quota stimata"
                title="Ripristina quota stimata"
              >
                <RotateCcw size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="csc-metric-item">
          <span className="csc-metric-label">Valore (EV)</span>
          <strong
            className={`csc-metric-val tabular-nums ${
              selection.ev >= 0 ? 'ev-pos' : 'ev-neg'
            }`}
          >
            {evPct >= 0 ? `+${evPct.toFixed(1)}%` : `${evPct.toFixed(1)}%`}
          </strong>
        </div>
      </div>

      {/* Progressive Disclosure: pulsante per espandere/chiudere l'analisi dettagliata */}
      <button
        type="button"
        className="csc-details-toggle"
        onClick={() => setDetailsOpen(!detailsOpen)}
        aria-expanded={detailsOpen}
      >
        <span>Perché questa scelta ({selection.keyFactors.length} fattori)</span>
        {detailsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {detailsOpen && (
        <div className="csc-details-drawer">
          <div className="csc-prob-compare">
            <div className="csc-compare-row">
              <span>Probabilità mercato depurato:</span>
              <strong className="tabular-nums">{marketPct.toFixed(1)}%</strong>
            </div>
            <div className="csc-compare-bar">
              <div
                className="csc-compare-fill"
                style={{ width: `${Math.min(100, Math.max(4, probPct))}%` }}
              />
            </div>
          </div>

          <div className="csc-why-cols">
            <div>
              <span className="csc-why-title pos">Fattori a favore</span>
              <ul className="csc-why-ul">
                {selection.keyFactors.slice(0, 3).map((kf, i) => (
                  <li key={i}>{kf}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="csc-why-title warn">Note di rischio</span>
              <ul className="csc-why-ul">
                {selection.redFlags.slice(0, 3).map((rf, i) => (
                  <li key={i}>{rf}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};
