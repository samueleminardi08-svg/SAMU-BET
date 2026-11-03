import React from 'react';
import { Cpu, SlidersHorizontal, Layers, Info, AlertTriangle } from 'lucide-react';
import { BridgeHealthStatus } from '../services/aiBridgeClient';

interface HeaderProps {
  activeScreen: 'form' | 'results' | 'settings';
  onNavigate: (screen: 'form' | 'results' | 'settings') => void;
  onOpenCompetitionsModal: () => void;
  aiStatus: BridgeHealthStatus;
  hasResults: boolean;
  isDemoData: boolean;
  missingRequiredKeysCount: number;
  activeAiModel?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeScreen,
  onNavigate,
  onOpenCompetitionsModal,
  aiStatus,
  hasResults,
  isDemoData,
  missingRequiredKeysCount,
  activeAiModel
}) => {
  const aiConnected = aiStatus.reachable && aiStatus.unslothReachable;

  return (
    <header className="app-header">
      {isDemoData && (
        <div className="demo-mode-banner" role="alert">
          <AlertTriangle size={16} />
          <span>
            <strong>DATI DI PROVA (DEMO_MODE=true)</strong> — Stai visualizzando dati dimostrativi di sviluppo.
          </span>
        </div>
      )}

      <div className="header-main-row">
        <div
          className="brand-block"
          onClick={() => onNavigate('form')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onNavigate('form')}
        >
          <div className="brand-monogram">SB</div>
          <div>
            <h1 className="brand-title">SAMU BET</h1>
            <span className="brand-subtitle">Analisi Quantitativa Pronostici</span>
          </div>
        </div>

        <button
          type="button"
          className={`ai-status-pill ${aiConnected ? 'ai-online' : 'ai-offline'}`}
          onClick={() => onNavigate('settings')}
          title="Clicca per configurare Google Gemini AI"
        >
          <span className="status-dot" />
          <Cpu size={14} />
          <span className="ai-status-text">
            {aiConnected
              ? `AI: ${activeAiModel || 'Gemini 3.8 Flash'}`
              : 'Solo Mercato (AI non attiva)'}
          </span>
        </button>
      </div>

      <nav className="header-nav" aria-label="Navigazione principale">
        <button
          type="button"
          className={`nav-tab-btn ${activeScreen === 'form' ? 'active' : ''}`}
          onClick={() => onNavigate('form')}
        >
          <SlidersHorizontal size={15} />
          <span>Parametri</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeScreen === 'results' ? 'active' : ''}`}
          onClick={() => onNavigate('results')}
          disabled={!hasResults}
        >
          <Layers size={15} />
          <span>Risultati</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeScreen === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <Cpu size={15} />
          <span>AI Gemini</span>
        </button>

        <button
          type="button"
          className="nav-tab-btn nav-info-btn"
          onClick={onOpenCompetitionsModal}
        >
          <Info size={15} />
          <span>Fonti &amp; API</span>
          {missingRequiredKeysCount > 0 && (
            <span className="key-warn-badge">{missingRequiredKeysCount}</span>
          )}
        </button>
      </nav>
    </header>
  );
};
