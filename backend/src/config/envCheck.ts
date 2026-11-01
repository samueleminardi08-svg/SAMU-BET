export interface ServiceKeyStatus {
  keyName: string;
  configured: boolean;
  requiredFor: string;
  impactIfMissing: string;
}

export interface StartupHealthReport {
  timestamp: string;
  environment: string;
  demoModeActive: boolean;
  demoModeBlockedInProd: boolean;
  keys: ServiceKeyStatus[];
  warnings: string[];
}

export function checkEnvironmentStatus(): StartupHealthReport {
  const isProd = process.env.NODE_ENV === 'production';
  const rawDemo = process.env.DEMO_MODE === 'true';
  // In produzione i dati finti sono severamente vietati (Sezione 4 & 13)
  const demoModeActive = !isProd && rawDemo;
  const demoModeBlockedInProd = isProd && rawDemo;

  const hasOddsKey = Boolean(process.env.THE_ODDS_API_KEY && process.env.THE_ODDS_API_KEY.trim().length > 5);
  const hasFootballDataKey = Boolean(process.env.FOOTBALL_DATA_API_KEY && process.env.FOOTBALL_DATA_API_KEY.trim().length > 5);
  const hasApiFootballKey = Boolean(process.env.API_FOOTBALL_KEY && process.env.API_FOOTBALL_KEY.trim().length > 5);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5);

  const keys: ServiceKeyStatus[] = [
    {
      keyName: 'THE_ODDS_API_KEY',
      configured: hasOddsKey,
      requiredFor: 'Quote reali Calcio e Tennis (The Odds API - 500 crediti/mese)',
      impactIfMissing: demoModeActive
        ? 'Assente: il sistema usa i dati dimostrativi perché DEMO_MODE=true.'
        : 'Assente: impossibile recuperare le quote automatiche di Calcio e Tennis. Restano attivi solo il calendario F1 (Jolpica-F1) e le notizie RSS.'
    },
    {
      keyName: 'FOOTBALL_DATA_API_KEY',
      configured: hasFootballDataKey,
      requiredFor: 'Classifiche e forma recente per i 12 campionati top di Calcio (football-data.org)',
      impactIfMissing: 'Assente: le analisi sul Calcio useranno solo le quote di mercato e le notizie dei feed RSS, senza dati di classifica ufficiale.'
    },
    {
      keyName: 'API_FOOTBALL_KEY',
      configured: hasApiFootballKey,
      requiredFor: 'Integrazione opzionale infortuni Calcio (api-sports.io - 100 req/giorno)',
      impactIfMissing: 'Opzionale non configurata: per gli infortuni vengono utilizzati i feed RSS sportivi.'
    },
    {
      keyName: 'GEMINI_API_KEY',
      configured: hasGeminiKey,
      requiredFor: 'Provider AI secondario opzionale (Gemini)',
      impactIfMissing: 'Opzionale non configurata: SAMU BET utilizza di default il modello locale tramite local-ai-bridge sul tuo PC (o la modalità "solo mercato").'
    }
  ];

  const warnings: string[] = [];
  if (demoModeBlockedInProd) {
    warnings.push('DEMO_MODE=true è stato ignorato perché NODE_ENV=production (i dati di prova sono vietati in produzione).');
  }
  if (!hasOddsKey && !demoModeActive) {
    warnings.push('THE_ODDS_API_KEY mancante: registra una chiave gratuita su https://the-odds-api.com per ottenere le quote di Calcio e Tennis.');
  }
  if (!hasFootballDataKey) {
    warnings.push('FOOTBALL_DATA_API_KEY mancante: registra una chiave gratuita su https://www.football-data.org per le classifiche dei 12 campionati principali.');
  }

  return {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    demoModeActive,
    demoModeBlockedInProd,
    keys,
    warnings
  };
}

export function logStartupCheck(): StartupHealthReport {
  const report = checkEnvironmentStatus();
  console.log('============================================================');
  console.log(`[SAMU BET] Controllo Configurazione Avvio (${report.environment})`);
  console.log('============================================================');
  for (const k of report.keys) {
    const badge = k.configured ? '[OK]' : '[MANCANTE]';
    console.log(`${badge} ${k.keyName} -> ${k.configured ? 'Configurata' : k.impactIfMissing}`);
  }
  if (report.demoModeActive) {
    console.warn('[AVVISO] DEMO_MODE=true attivo (SOLO SVILUPPO): verranno mostrati dati di prova.');
  }
  for (const w of report.warnings) {
    console.warn(`[NOTA] ${w}`);
  }
  console.log('============================================================');
  return report;
}

