import React, { useState } from 'react';
import {
  AlertTriangle,
  Info,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  Check,
  Share2
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

      {/* Avviso obbligatorio se P_comb < 5% (Sez. 8) */}
      {slip.lowProbabilityWarning && (
        <div className="css-low-prob-banner" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <strong>Probabilità di vincita molto bassa ({combProbPct}%)</strong> — Moltiplicatore
            elevato: gioca sempre con moderazione.
          </span>
        </div>
      )}

      {/* 3 KPI Principali Puliti */}
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

      {/* Distribuzione probabilità espandibile (Progressive Disclosure) */}
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
