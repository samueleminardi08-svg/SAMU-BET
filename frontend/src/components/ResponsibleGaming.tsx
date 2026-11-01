import React from 'react';
import { ShieldAlert, PhoneCall } from 'lucide-react';

export const ResponsibleGamingTopBanner: React.FC = () => {
  return (
    <div className="rg-top-banner" role="region" aria-label="Avviso gioco responsabile">
      <div className="rg-top-inner">
        <span className="rg-badge-18">18+</span>
        <span className="rg-banner-text">
          Solo per maggiorenni (18+). Il gioco può causare dipendenza. Gioca responsabilmente.
        </span>
        <a href="tel:800558822" className="rg-phone-pill" title="Chiama il Telefono Verde Nazionale">
          <PhoneCall size={12} />
          <span>TVNGA: 800 558 822</span>
        </a>
      </div>
    </div>
  );
};

export const ResponsibleGamingFooter: React.FC = () => {
  return (
    <footer className="rg-footer">
      <div className="rg-footer-inner">
        <div className="rg-footer-header">
          <ShieldAlert size={18} className="rg-icon" />
          <strong>Gioco Responsabile — Solo per maggiorenni (18+)</strong>
        </div>
        <p className="rg-footer-p">
          Solo per maggiorenni (18+). Il gioco può causare dipendenza. Gioca responsabilmente.
          SAMU BET è esclusivamente uno strumento di analisi statistica e quantitativa: non piazza scommesse,
          non si collega a conti di gioco e non gestisce denaro. Nessun esito sportivo è privo di rischio.
        </p>
        <div className="rg-footer-helpline">
          <span>Telefono Verde Nazionale per le problematiche legate al Gioco d&apos;Azzardo (ISS):</span>
          <a href="tel:800558822" className="rg-helpline-number">
            <PhoneCall size={14} /> 800 558 822
          </a>
          <span className="rg-helpline-sub">(Gratuito, anonimo, attivo dal lunedì al venerdì)</span>
        </div>
      </div>
    </footer>
  );
};

