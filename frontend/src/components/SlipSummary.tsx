import React, { useState } from 'react';
import {
  AlertTriangle,
  Info,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  Check,
  Sparkles,
  ShieldAlert,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { BettingSlipResult } from '../config/riskConfig';
import { downloadSlipAsImage } from '../utils/slipImageGenerator';

interface SlipSummaryProps {
  slip: BettingSlipResult;
  generatedAt: string;
}

export const SlipSummary: React.FC<SlipSummaryProps> = ({ slip, generatedAt }) => {
  const [showDistribution, setShowDistribution] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await downloadSlipAsImage(slip, generatedAt);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2500);
    } catch (err) {
      console.error('Errore durante il download della schedina:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const combProbPct = (slip.combinedProbability * 100).toFixed(1);
  const combEvPct = (slip.combinedEv * 100).toFixed(1);

  const progressPct = Math.min(
    100,
    Math.max(8, Math.round((slip.totalOdds / Math.max(1.1, slip.targetOdds)) * 100))
  );

  const formattedTime = new Date(generatedAt).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  });

  let runningProb = 1.0;
  const stepDistribution = slip.selections.map((sel, idx) => {
    runningProb *= sel.pFinal;
    return {
      step: idx + 1,
      shortName:
        sel.eventName.length > 22 ? sel.eventName.slice(0, 20).trim() + '…' : sel.eventName,
      singleProbPct: Math.round(sel.pFinal * 100),
      cumulativeProbPct: Math.round(runningProb * 1000) / 10
    };
  });

  const review = slip.slipReview;

  return (
    <section className="clean-slip-summary" aria-label="Riepilogo schedina">
      <div className="css-top-row">
        <div>
          <span className="css-eyebrow">
            {slip.selections.length === 1
              ? 'SCHEDINA SINGOLA (1 PARTITA)'
              : `SCHEDINA MULTIPLA (${slip.selections.length} PARTITE)`}
          </span>
          <h3 className="css-headline">
            {slip.withinTolerance
              ? 'Quota obiettivo centrata'
              : 'Combinazione più vicina disponibile'}
          </h3>
        </div>
        <div className="css-top-actions">
          <button
            type="button"
            className={`css-download-btn ${downloadSuccess ? 'success' : ''}`}
            onClick={handleDownload}
            disabled={isDownloading}
            title="Scarica la schedina come immagine HD per WhatsApp, Telegram o stampa"
          >
            {downloadSuccess ? (
              <>
                <Check size={16} />
                <span>Scaricata!</span>
              </>
            ) : isDownloading ? (
              <>
                <Download size={16} className="spin-pulse" />
                <span>Creazione immagine...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Scarica Schedina (PNG HD)</span>
              </>
            )}
          </button>
          <span className="css-diff-pill">
            Difficoltà: <strong>{slip.difficultyLabel}</strong>
          </span>
        </div>
      </div>

      {/* Avviso obbligatorio se P_comb < 5% */}
      {slip.lowProbabilityWarning && (
        <div className="css-low-prob-banner" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <strong>Probabilità di vincita molto bassa ({combProbPct}%)</strong> — Moltiplicatore
            elevato: gioca sempre con moderazione.
          </span>
        </div>
      )}

      {/* Avviso stime che condividono lo stesso modello (Sezione 6.5) */}
      {slip.sameModelWarning && (
        <div className="same-model-alert" role="alert">
          <ShieldAlert size={16} />
          <span>{slip.sameModelWarning}</span>
        </div>
      )}

      {/* Info varietà applicata */}
      {slip.diversityApplied && (
        <div className="diversity-applied-badge">
          <Sliders size={14} />
          <span>
            Varietà mercati ({slip.diversityApplied.mode}): max{' '}
            <strong>{slip.diversityApplied.limit}</strong> selezioni dello stesso mercato
          </span>
        </div>
      )}

      {/* 3 KPI Principali */}
      <div className="css-kpi-row">
        <div className="css-kpi-cell primary">
          <span className="css-kpi-label">Quota Totale</span>
          <strong className="css-kpi-big tabular-nums">{slip.totalOdds.toFixed(2)}</strong>
          <span className="css-kpi-sub tabular-nums">Target: {slip.targetOdds.toFixed(2)}</span>
        </div>

        <div className="css-kpi-cell">
          <span className="css-kpi-label">Probabilità Combinata</span>
          <strong className="css-kpi-big tabular-nums">{combProbPct}%</strong>
          <span className="css-kpi-sub tabular-nums">
            1 su {Math.max(1, Math.round(1 / Math.max(0.0001, slip.combinedProbability)))}
          </span>
        </div>

        <div className="css-kpi-cell">
          <span className="css-kpi-label">EV Combinato</span>
          <strong
            className={`css-kpi-big tabular-nums ${
              slip.combinedEv >= 0 ? 'ev-pos' : 'ev-neg'
            }`}
          >
            {slip.combinedEv >= 0 ? `+${combEvPct}%` : `${combEvPct}%`}
          </strong>
          <span className="css-kpi-sub">Valore atteso</span>
        </div>
      </div>

      {/* PARERE AI (STADIO B REVIEW) */}
      {review && (
        <div className="ai-review-card">
          <div className="ai-review-header">
            <div className="ai-review-title">
              <Sparkles size={16} />
              <span>Parere AI sulla Schedina</span>
            </div>
            <span className={`ai-review-verdict-badge ${review.verdict}`}>
              Giudizio: {review.verdict}
            </span>
          </div>

          <p className="ai-review-summary">
            {review.summary}
          </p>

          {review.warnings && review.warnings.length > 0 && (
            <div className="ai-review-warnings">
              {review.warnings.map((w, idx) => (
                <div key={idx} className="ai-review-warning-item">
                  <AlertTriangle size={14} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="ai-review-footer">
            <span>
              Confidenza complessiva AI:{' '}
              <strong className="ai-review-confidence-val">
                {Math.round(review.overallConfidence * 100)}%
              </strong>
            </span>
            <span>Analisi qualitativa d&apos;insieme (senza alterazione probabilità)</span>
          </div>
        </div>
      )}

      {/* Barra lineare di completamento quota */}
      <div className="css-progress-block">
        <div className="css-progress-labels">
          <span>Raggiungimento quota desiderata</span>
          <span className="tabular-nums">
            {slip.totalOdds.toFixed(2)} / {slip.targetOdds.toFixed(2)}
          </span>
        </div>
        <div className="css-progress-track">
          <div
            className={`css-progress-fill ${slip.withinTolerance ? 'ok' : 'near'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {slip.negativeEvNotice && (
        <div className="css-ev-note">
          <Info size={14} aria-hidden="true" />
          <span>{slip.negativeEvNotice}</span>
        </div>
      )}

      {/* Distribuzione probabilità espandibile */}
      {slip.selections.length > 1 && (
        <>
          <button
            type="button"
            className="csc-details-toggle"
            onClick={() => setShowDistribution(!showDistribution)}
            aria-expanded={showDistribution}
          >
            <span>Andamento probabilità partita per partita</span>
            {showDistribution ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showDistribution && (
            <div className="css-dist-drawer">
              {stepDistribution.map((item) => (
                <div key={item.step} className="css-dist-row">
                  <span className="css-dist-name">
                    <strong className="tabular-nums">#{item.step}</strong> {item.shortName}
                  </span>
                  <div className="css-dist-bar-wrap">
                    <div
                      className="css-dist-bar"
                      style={{ width: `${Math.max(4, item.cumulativeProbPct)}%` }}
                    />
                  </div>
                  <span className="css-dist-val tabular-nums">{item.cumulativeProbPct}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="css-footer-time">
        <Clock size={13} aria-hidden="true" />
        <span>
          Quote aggiornate alle <strong>{formattedTime}</strong>. Verifica sempre la quota reale
          sull&apos;app SNAI prima di giocare.
        </span>
      </div>
    </section>
  );
};
