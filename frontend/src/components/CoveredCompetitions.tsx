import React from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Database,
  Rss,
  Activity,
  Key
} from 'lucide-react';
import { CompetitionCoverageInfo } from '../config/riskConfig';
import { BackendStatusResponse } from '../services/apiClient';

interface CoveredCompetitionsModalProps {
  open: boolean;
  onClose: () => void;
  backendStatus: BackendStatusResponse | null;
  coveredCompetitions: CompetitionCoverageInfo[];
}

export const CoveredCompetitionsModal: React.FC<CoveredCompetitionsModalProps> = ({
  open,
  onClose,
  backendStatus,
  coveredCompetitions
}) => {
  if (!open) return null;

  const quota = backendStatus?.quota;
  const envReport = backendStatus?.envReport;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Competizioni coperte e stato API">
      <div className="modal-panel">
        <div className="modal-header">
          <div>
            <h3>Trasparenza Fonti Dati, Competizioni Coperte &amp; Quote API</h3>
            <p className="modal-sub">
              Stato in tempo reale delle chiavi API gratuite, limiti giornalieri e copertura campionati.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* 1. Consumo Quote API Giornaliere */}
          {quota && (
            <div className="quota-status-card">
              <div className="quota-title-row">
                <Activity size={16} />
                <strong>Consumo Quote API Esterne ({quota.day})</strong>
              </div>
              <div className="quota-stats-grid">
                <div>
                  <span>Chiamate esterne oggi:</span>
                  <strong className="tabular-nums">
                    {quota.dailyCallsUsed} / {quota.dailyCallsLimit}
                  </strong>
                </div>
                <div>
                  <span>Crediti residui The Odds API:</span>
                  <strong className="tabular-nums">
                    {quota.oddsApiRemainingCredits !== null
                      ? `${quota.oddsApiRemainingCredits} / 500 mensili`
                      : 'Non ancora interrogata'}
                  </strong>
                </div>
                <div>
                  <span>Elementi in Cache condivisa:</span>
                  <strong className="tabular-nums">{quota.cacheEntriesCount}</strong>
                </div>
              </div>
              {quota.dailyQuotaExhausted && (
                <p className="quota-exhausted-msg">
                  Limite giornaliero raggiunto: l&apos;app utilizza i dati in cache fino al reset di domani.
                </p>
              )}
            </div>
          )}

          {/* 2. Controllo Chiavi API all'avvio (Sez. 14) */}
          {envReport && (
            <div className="keys-status-section">
              <h4 className="modal-sec-title">
                <Key size={15} /> Stato Chiavi API nel Backend
              </h4>
              <div className="keys-list">
                {envReport.keys.map((k) => (
                  <div key={k.keyName} className={`key-status-row ${k.configured ? 'ok' : 'missing'}`}>
                    <div className="key-row-top">
                      {k.configured ? (
                        <CheckCircle2 size={15} className="text-accent" />
                      ) : (
                        <AlertTriangle size={15} className="text-warning" />
                      )}
                      <code>{k.keyName}</code>
                      <span className="key-purpose">— {k.requiredFor}</span>
                    </div>
                    <p className="key-impact-text">{k.impactIfMissing}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Elenco Competizioni Coperte e Limitazioni Dichiarate (Sez. 4) */}
          <div className="competitions-coverage-section">
            <h4 className="modal-sec-title">
              <Database size={15} /> Competizioni Coperte e Limitazioni Piani Gratuiti
            </h4>

            {coveredCompetitions.length === 0 ? (
              <p className="modal-empty-note">
                Avvia una ricerca con &quot;Genera consigli&quot; per visualizzare il dettaglio
                delle competizioni interrogate nella finestra temporale scelta, oppure verifica
                qui sotto la copertura standard dei provider gratuiti:
                <br />• <strong>Calcio</strong>: Quote da The Odds API (60+ campionati mondiali, top 6 attivi per finestra per restare nei 500 crediti/mese). Classifiche da football-data.org per 12 campionati (Serie A, Premier League, La Liga, Bundesliga, Ligue 1, Champions League, Eredivisie, Primeira Liga, Championship, Brasileirão).
                <br />• <strong>Formula 1</strong>: Calendario GP e classifiche piloti/costruttori da Jolpica-F1 (gratuito senza chiave). The Odds API non fornisce quote F1 sul piano gratuito.
                <br />• <strong>Tennis</strong>: Tornei ATP/WTA attivi da The Odds API + Feed RSS specializzati (nessun provider gratuito affidabile offre statistiche H2H/superficie live).
              </p>
            ) : (
              <div className="coverage-cards-list">
                {coveredCompetitions.map((c) => (
                  <div key={c.sport} className="coverage-sport-card">
                    <h5>{c.sportLabel}</h5>
                    <div className="cov-meta-line">
                      <strong>Fonte Quote:</strong> <span>{c.oddsSource}</span>
                    </div>
                    <div className="cov-meta-line">
                      <strong>Fonte Statistiche:</strong> <span>{c.statsSource}</span>
                    </div>
                    <div className="cov-meta-line">
                      <strong>Limiti Piano Free:</strong> <span>{c.dailyRequestsLimitInfo}</span>
                    </div>
                    <div className="cov-chips-wrap">
                      {c.coveredCompetitions.map((compName, i) => (
                        <span key={i} className="cov-comp-chip">
                          {compName}
                        </span>
                      ))}
                    </div>
                    <div className="cov-rss-line">
                      <Rss size={13} />
                      <span>Feed RSS: {c.rssSources.join(' • ')}</span>
                    </div>
                    <p className="cov-uncovered-note">{c.uncoveredNote}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

