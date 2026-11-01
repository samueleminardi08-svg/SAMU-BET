import React, { useState } from 'react';
import {
  Cpu,
  KeyRound,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  Sparkles
} from 'lucide-react';
import {
  BridgeHealthStatus,
  BridgeSettings,
  saveAndTestGeminiKey
} from '../services/aiBridgeClient';

interface LocalAISettingsProps {
  initialSettings: BridgeSettings;
  currentHealth: BridgeHealthStatus;
  onSettingsUpdated: (settings: BridgeSettings, newHealth: BridgeHealthStatus) => void;
}

export const LocalAISettings: React.FC<LocalAISettingsProps> = ({
  initialSettings,
  currentHealth,
  onSettingsUpdated
}) => {
  const [apiKey, setApiKey] = useState(
    initialSettings.apiKey ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('samubet_gemini_api_key') : '') ||
      ''
  );
  const [model, setModel] = useState(
    initialSettings.model ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('samubet_gemini_model') : '') ||
      'gemini-2.5-flash'
  );
  const [testing, setTesting] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    const status = await saveAndTestGeminiKey(apiKey, model);
    setTesting(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 4000);
    onSettingsUpdated(
      { url: '/api/ai', token: 'gemini-backend', model, apiKey },
      status
    );
  };

  const isFullyConnected = currentHealth.reachable && currentHealth.unslothReachable;

  return (
    <section className="settings-screen-card">
      <div className="form-section-header">
        <div>
          <h2 className="section-title">Impostazioni AI (Google Gemini API)</h2>
          <p className="section-subtitle">
            Collega SAMU BET alle API ufficiali di <strong>Google Gemini</strong> per analizzare
            statistiche, formazioni, marcatori e notizie sportive di ogni partita. La chiave viene salvata
            in modo protetto nel tuo browser (e nel backend se presente).
          </p>
        </div>
      </div>

      {/* Stato attuale */}
      <div className={`health-status-box ${isFullyConnected ? 'ok' : 'warn'}`}>
        <div className="health-icon-col">
          {isFullyConnected ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
        </div>
        <div className="health-text-col">
          <strong>
            {isFullyConnected
              ? 'Google Gemini AI connesso e operativo'
              : 'Gemini AI non attivo: uso solo il mercato'}
          </strong>
          {currentHealth.configuredModel && (
            <span className="health-model-tag">
              Modello attivo: <code>{currentHealth.configuredModel}</code>
            </span>
          )}
          {currentHealth.detail && <p className="health-detail-p">{currentHealth.detail}</p>}
        </div>
      </div>

      <form onSubmit={handleSaveAndTest} className="bridge-settings-form">
        <div className="form-group">
          <label className="form-label" htmlFor="gemini-key-input">
            <KeyRound size={16} className="label-icon" />
            <span>Google Gemini API Key (GEMINI_API_KEY)</span>
          </label>
          <input
            id="gemini-key-input"
            type="password"
            placeholder="AIzaSy... (incolla qui la tua chiave Google AI Studio)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="settings-text-input"
            autoComplete="off"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="gemini-model-select">
            <Cpu size={16} className="label-icon" />
            <span>Modello Google Gemini</span>
          </label>
          <select
            id="gemini-model-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="settings-text-input"
          >
            <option value="gemini-2.5-flash">gemini-2.5-flash (Consigliato — Rapido, affidabile e quota gratuita)</option>
            <option value="gemini-2.5-pro">gemini-2.5-pro (Massima precisione e ragionamento avanzato)</option>
            <option value="gemini-2.0-flash">gemini-2.0-flash (Ultra veloce)</option>
            <option value="gemini-1.5-flash">gemini-1.5-flash (Standard stabile)</option>
          </select>
        </div>

        <div className="settings-actions-row">
          <button type="submit" className="primary-generate-btn" disabled={testing}>
            {testing ? (
              <>
                <RefreshCw size={17} className="spin-pulse" />
                <span>Verifica connessione a Google Gemini...</span>
              </>
            ) : (
              <>
                <Save size={17} />
                <span>Salva e Attiva Gemini AI</span>
              </>
            )}
          </button>
        </div>

        {savedNotice && (
          <p className="saved-feedback-msg">
            {isFullyConnected
              ? '✓ Configurazione Google Gemini salvata e verificata con successo!'
              : 'Verifica completata.'}
          </p>
        )}
      </form>

      <div className="unsloth-help-panel">
        <div className="help-panel-title">
          <Sparkles size={16} />
          <strong>Come ottenere gratuitamente la chiave API di Google Gemini</strong>
        </div>

        <ol className="help-steps-list">
          <li>
            <strong>1. Accedi a Google AI Studio:</strong> apri{' '}
            <code>https://aistudio.google.com/apikey</code> e clicca su{' '}
            <strong>&quot;Create API Key&quot;</strong>.
          </li>
          <li>
            <strong>2. Incolla la chiave qui sopra:</strong> inizia con <code>AIzaSy...</code>.
            Premi <strong>&quot;Salva e Attiva Gemini AI&quot;</strong> (oppure inviala in chat).
          </li>
          <li>
            <strong>3. Palinsesto SNAI Completo (4 Macro-Categorie):</strong> il motore quantitativo
            calcola e valuta tutti i mercati SNAI: <code>1X2 Finale / 1°T / 2°T</code>,{' '}
            <code>Doppia Chance (Finale, 1°T, 2°T)</code>, <code>Under/Over 0.5–7.5+ (Finale, 1°T, 2°T)</code>,{' '}
            <code>Goal/No Goal (Finale, 1°T, 2°T)</code>, <code>Risultato Esatto (26 esiti + multipli, 1°T, 2°T)</code>,{' '}
            <code>Parziale/Finale (9 esiti)</code>, <code>Multigoal Totale / Casa / Ospite</code>,{' '}
            <code>Handicap Classico</code>, <code>Draw/Home/Away No Bet</code>, <code>Pari/Dispari</code>,{' '}
            <code>Ribaltone</code>, <code>Vince a Zero / Entrambi i Tempi</code>,{' '}
            <code>Combo &amp; Tricombo (1X2/DC + U/O + Goal/No Goal + Multigoal + 1°T/2°T)</code>,{' '}
            <code>Giocatori (Marcatori, Doppietta, Tiri in Porta, Assist, Ammonito, Tackle, Passaggi)</code>,{' '}
            <code>Calci d&apos;Angolo</code>, <code>Cartellini / Punti Cartellino</code>,{' '}
            <code>Rigore, Espulsione, Autorete, Metodo e Minuto del 1° Gol</code>.
          </li>
        </ol>
      </div>
    </section>
  );
};
