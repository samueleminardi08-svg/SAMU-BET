import { sharedCache, TTL_ODDS_MS } from '../cache/cacheManager.js';
import {
  generateFootballSnaiMarkets,
  generateTennisSnaiMarkets
} from '../engine/snaiMarketsGenerator.js';
import { getActiveRssSourcesBySport } from '../rss/rssService.js';
import {
  CompetitionCoverageInfo,
  RawMarketOdds,
  RawOutcomeOdds,
  RawSportEvent,
  SportKey,
  TimeWindowKey
} from '../types/models.js';
import { fetchF1CurrentSchedule, fetchF1DriverStandings } from './f1StatsProvider.js';
import { FOOTBALL_DATA_FREE_COMPETITIONS } from './footballStatsProvider.js';

export interface OddsFetchResult {
  events: RawSportEvent[];
  providerWarnings: string[];
  coveredCompetitions: CompetitionCoverageInfo[];
  isDemoData: boolean;
}

/**
 * Interfaccia astratta OddsProvider con implementazioni intercambiabili (Sezione 4)
 */
export interface OddsProvider {
  readonly name: string;
  fetchEvents(sports: SportKey[], timeWindow: TimeWindowKey): Promise<OddsFetchResult>;
}

export function getWindowEndTimestamp(timeWindow: TimeWindowKey, now = new Date()): Date {
  const end = new Date(now.getTime());
  if (timeWindow === 'today') {
    end.setHours(23, 59, 59, 999);
    // Se sono già le ultime ore della sera, estende a 24h per non restituire finestra vuota
    if (end.getTime() - now.getTime() < 6 * 3600 * 1000) {
      return new Date(now.getTime() + 24 * 3600 * 1000);
    }
    return end;
  }
  if (timeWindow === 'hours48') {
    return new Date(now.getTime() + 48 * 3600 * 1000);
  }
  return new Date(now.getTime() + 7 * 24 * 3600 * 1000);
}

/**
 * Priorità campionati di calcio per massimizzare il numero di partite rilevanti
 * restando nei limiti di 500 crediti/mese del piano gratuito di The Odds API.
 */
const PRIORITY_FOOTBALL_KEYS = [
  'soccer_italy_serie_a',
  'soccer_italy_serie_b',
  'soccer_italy_coppa_italia',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league',
  'soccer_uefa_nations_league',
  'soccer_fifa_world_cup',
  'soccer_fifa_world_cup_qualifiers_europe',
  'soccer_fifa_world_cup_qualifiers_south_america',
  'soccer_conmebol_copa_libertadores',
  'soccer_conmebol_copa_sudamericana',
  'soccer_epl',
  'soccer_fa_cup',
  'soccer_england_efl_cup',
  'soccer_efl_champ',
  'soccer_spain_la_liga',
  'soccer_spain_segunda_division',
  'soccer_spain_copa_del_rey',
  'soccer_germany_bundesliga',
  'soccer_germany_bundesliga2',
  'soccer_germany_dfb_pokal',
  'soccer_france_ligue_one',
  'soccer_france_ligue_two',
  'soccer_netherlands_eredivisie',
  'soccer_portugal_primeira_liga',
  'soccer_brazil_campeonato',
  'soccer_argentina_primera_division',
  'soccer_turkey_super_league',
  'soccer_belgium_first_div',
  'soccer_spl',
  'soccer_switzerland_superleague',
  'soccer_austria_bundesliga',
  'soccer_greece_super_league',
  'soccer_denmark_superliga',
  'soccer_norway_eliteserien',
  'soccer_sweden_allsvenskan',
  'soccer_usa_mls',
  'soccer_mexico_ligamx',
  'soccer_japan_j_league',
  'soccer_saudi_arabia_pro_league',
  'soccer_australia_aleague'
];

interface OddsApiSportItem {
  key: string;
  group: string;
  title: string;
  active: boolean;
  has_outrights: boolean;
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: Array<{
    key: string;
    outcomes: Array<{
      name: string;
      price: number;
      point?: number;
    }>;
  }>;
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

/**
 * Costruisce i mercati standard + mercati derivati (Doppia Chance, Draw No Bet)
 * a partire dalle quote dei bookmaker europei di The Odds API.
 */
function parseOddsApiMarkets(
  ev: OddsApiEvent,
  sport: SportKey
): RawMarketOdds[] {
  const marketsMap = new Map<string, RawMarketOdds>();

  // Per derivare Doppia Chance e Draw No Bet nel calcio raccogliamo le terne 1X2 per bookmaker
  const dc1XOdds: number[] = [];
  const dcX2Odds: number[] = [];
  const dc12Odds: number[] = [];
  const dnb1Odds: number[] = [];
  const dnb2Odds: number[] = [];

  for (const book of ev.bookmakers || []) {
    for (const m of book.markets || []) {
      if (m.key === 'h2h') {
        const marketKey = 'h2h';
        const marketName = sport === 'football' ? 'Esito Finale 1X2' : 'Vincente Incontro';
        if (!marketsMap.has(marketKey)) {
          marketsMap.set(marketKey, { marketKey, marketName, outcomes: [] });
        }
        const mObj = marketsMap.get(marketKey)!;

        const homeOut = m.outcomes.find((o) => o.name === ev.home_team);
        const awayOut = m.outcomes.find((o) => o.name === ev.away_team);
        const drawOut = m.outcomes.find((o) => o.name.toLowerCase() === 'draw');

        const addPrice = (label: string, price?: number) => {
          if (!price || price <= 1.0) return;
          let existing = mObj.outcomes.find((o) => o.selection === label);
          if (!existing) {
            existing = { selection: label, bookmakerOdds: [] };
            mObj.outcomes.push(existing);
          }
          existing.bookmakerOdds.push(price);
        };

        if (sport === 'football') {
          addPrice(`1 (${ev.home_team})`, homeOut?.price);
          addPrice('X (Pareggio)', drawOut?.price);
          addPrice(`2 (${ev.away_team})`, awayOut?.price);

          // Derivazione Doppia Chance e Draw No Bet da ciascun bookmaker se ha tutti e 3 gli esiti
          if (homeOut?.price && drawOut?.price && awayOut?.price) {
            const p1 = 1 / homeOut.price;
            const pX = 1 / drawOut.price;
            const p2 = 1 / awayOut.price;
            const overround = p1 + pX + p2;

            // Doppia Chance con conservazione proporzionale del margine del bookmaker
            const q1X = Number((1 / ((p1 + pX) / Math.pow(overround, 0.45))).toFixed(2));
            const qX2 = Number((1 / ((pX + p2) / Math.pow(overround, 0.45))).toFixed(2));
            const q12 = Number((1 / ((p1 + p2) / Math.pow(overround, 0.45))).toFixed(2));

            if (q1X >= 1.03) dc1XOdds.push(q1X);
            if (qX2 >= 1.03) dcX2Odds.push(qX2);
            if (q12 >= 1.03) dc12Odds.push(q12);

            // Draw No Bet (Rimborso in caso di pareggio)
            const p1Clean = p1 / overround;
            const p2Clean = p2 / overround;
            const sumNoDraw = p1Clean + p2Clean;
            if (sumNoDraw > 0) {
              const qDnb1 = Number(((sumNoDraw / p1Clean) * 0.95).toFixed(2));
              const qDnb2 = Number(((sumNoDraw / p2Clean) * 0.95).toFixed(2));
              if (qDnb1 >= 1.04) dnb1Odds.push(qDnb1);
              if (qDnb2 >= 1.04) dnb2Odds.push(qDnb2);
            }
          }
        } else {
          // Tennis o altri sport testa a testa
          for (const out of m.outcomes) {
            addPrice(`Vincente: ${out.name}`, out.price);
          }
        }
      } else if (m.key === 'totals') {
        // Raggruppiamo gli Under/Over per linea (point) mantenendo per il calcio solo le linee standard SNAI (.5)
        for (const out of m.outcomes) {
          if (out.point === undefined || out.price <= 1.0) continue;
          const line = Number(out.point);
          if (sport === 'football' && Math.abs((line % 1) - 0.5) > 0.01) {
            continue;
          }
          const marketKey = `totals_${line}`;
          const unitLabel = sport === 'tennis' ? 'Giochi' : 'Gol';
          const marketName = `Under/Over ${line} ${unitLabel}`;
          if (!marketsMap.has(marketKey)) {
            marketsMap.set(marketKey, { marketKey, marketName, line, outcomes: [] });
          }
          const mObj = marketsMap.get(marketKey)!;
          const isOver = out.name.toLowerCase().includes('over');
          const selLabel = `${isOver ? 'Over' : 'Under'} ${line}`;
          let existing = mObj.outcomes.find((o) => o.selection === selLabel);
          if (!existing) {
            existing = { selection: selLabel, line, bookmakerOdds: [] };
            mObj.outcomes.push(existing);
          }
          existing.bookmakerOdds.push(out.price);
        }
      } else if (m.key === 'spreads' && sport !== 'football') {
        // Raggruppiamo gli Handicap per valore assoluto della linea (per il calcio usiamo l'Handicap Classico 1X2 SNAI)
        for (const out of m.outcomes) {
          if (out.point === undefined || out.price <= 1.0) continue;
          const absLine = Math.abs(Number(out.point));
          const marketKey = `spreads_${absLine}`;
          const marketName = `Handicap (${absLine})`;
          if (!marketsMap.has(marketKey)) {
            marketsMap.set(marketKey, { marketKey, marketName, line: absLine, outcomes: [] });
          }
          const mObj = marketsMap.get(marketKey)!;
          const signedPoint = out.point > 0 ? `+${out.point}` : `${out.point}`;
          const selLabel = `${out.name} (${signedPoint})`;
          let existing = mObj.outcomes.find((o) => o.selection === selLabel);
          if (!existing) {
            existing = { selection: selLabel, line: Number(out.point), bookmakerOdds: [] };
            mObj.outcomes.push(existing);
          }
          existing.bookmakerOdds.push(out.price);
        }
      }
    }
  }

  if (sport === 'football' && dc1XOdds.length > 0 && dcX2Odds.length > 0 && dc12Odds.length > 0) {
    marketsMap.set('double_chance', {
      marketKey: 'double_chance',
      marketName: 'Doppia Chance',
      outcomes: [
        { selection: '1X', bookmakerOdds: dc1XOdds },
        { selection: 'X2', bookmakerOdds: dcX2Odds },
        { selection: '12', bookmakerOdds: dc12Odds }
      ]
    });
  }

  if (sport === 'football' && dnb1Odds.length > 0 && dnb2Odds.length > 0) {
    marketsMap.set('draw_no_bet', {
      marketKey: 'draw_no_bet',
      marketName: 'Draw No Bet (Rimborso Pareggio)',
      outcomes: [
        { selection: `1 DNB (${ev.home_team})`, bookmakerOdds: dnb1Odds },
        { selection: `2 DNB (${ev.away_team})`, bookmakerOdds: dnb2Odds }
      ]
    });
  }

  const baseMarkets = Array.from(marketsMap.values()).filter((m) => m.outcomes.length > 0);
  if (sport === 'football') {
    return generateFootballSnaiMarkets(ev.home_team, ev.away_team, baseMarkets);
  }
  if (sport === 'tennis') {
    return generateTennisSnaiMarkets(ev.home_team, ev.away_team, baseMarkets);
  }
  return baseMarkets;
}

/**
 * Implementazione Primaria: The Odds API (Piano Gratuito 500 crediti/mese) + Calendario Jolpica-F1
 */
export class TheOddsApiProvider implements OddsProvider {
  public readonly name = 'The Odds API (EU Median)';

  private async fetchActiveSportsList(apiKey: string): Promise<OddsApiSportItem[]> {
    const cacheKey = 'oddsapi:sports_list';
    const cached = sharedCache.get<OddsApiSportItem[]>(cacheKey);
    if (cached) return cached;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      // L'endpoint /v4/sports è gratuito (0 crediti)
      const res = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${encodeURIComponent(apiKey)}`, {
        signal: controller.signal
      });
      if (!res.ok) return [];
      const data = (await res.json()) as OddsApiSportItem[];
      sharedCache.set(cacheKey, data, TTL_ODDS_MS);
      return data;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchCompetitionOdds(
    apiKey: string,
    sportKey: string,
    regions: string,
    markets: string
  ): Promise<OddsApiEvent[]> {
    const cacheKey = `oddsapi:events:${sportKey}:${regions}:${markets}`;
    const cached = sharedCache.get<OddsApiEvent[]>(cacheKey);
    if (cached) return cached;

    if (!sharedCache.canMakeExternalApiCall()) {
      return [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const marketCount = markets.split(',').length;
      sharedCache.recordExternalApiCall(marketCount);

      const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds?apiKey=${encodeURIComponent(
        apiKey
      )}&regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(markets)}&oddsFormat=decimal`;

      const res = await fetch(url, { signal: controller.signal });
      sharedCache.updateOddsApiHeaders(
        res.headers.get('x-requests-remaining'),
        res.headers.get('x-requests-used')
      );

      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as OddsApiEvent[];
      sharedCache.set(cacheKey, data, TTL_ODDS_MS);
      return data;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  public async fetchEvents(sports: SportKey[], timeWindow: TimeWindowKey): Promise<OddsFetchResult> {
    const apiKey = process.env.THE_ODDS_API_KEY?.trim() || '';
    const regions = process.env.THE_ODDS_API_REGIONS?.trim() || 'eu';
    const now = new Date();
    const endWindow = getWindowEndTimestamp(timeWindow, now);

    const events: RawSportEvent[] = [];
    const providerWarnings: string[] = [];
    const coveredCompetitions: CompetitionCoverageInfo[] = [];

    const activeSports = apiKey ? await this.fetchActiveSportsList(apiKey) : [];

    // 1. CALCIO
    if (sports.includes('football')) {
      const activeSoccer = activeSports.filter(
        (s) => s.active && s.key.startsWith('soccer_') && !s.has_outrights
      );

      // Ordina per priorità in modo da interrogare i campionati principali per primi
      activeSoccer.sort((a, b) => {
        const idxA = PRIORITY_FOOTBALL_KEYS.indexOf(a.key);
        const idxB = PRIORITY_FOOTBALL_KEYS.indexOf(b.key);
        const scoreA = idxA === -1 ? 999 : idxA;
        const scoreB = idxB === -1 ? 999 : idxB;
        return scoreA - scoreB;
      });

      // Interroghiamo in parallelo fino a 15 campionati e coppe del mondo attive (con cache 15m)
      const selectedSoccer = activeSoccer.slice(0, 15);

      if (!apiKey) {
        providerWarnings.push(
          'Calcio: chiave THE_ODDS_API_KEY non configurata nel backend. Impossibile scaricare le quote live di Calcio.'
        );
      } else if (!sharedCache.canMakeExternalApiCall()) {
        providerWarnings.push(
          'Limite giornaliero richieste API raggiunto: utilizzo solo dati già presenti in cache.'
        );
      }

      const compResults = await Promise.all(
        selectedSoccer.map(async (comp) => {
          const compEvents = await this.fetchCompetitionOdds(apiKey, comp.key, regions, 'h2h,totals');
          return { comp, compEvents };
        })
      );

      for (const { comp, compEvents } of compResults) {
        for (const ev of compEvents) {
          const dt = new Date(ev.commence_time);
          if (dt >= new Date(now.getTime() - 15 * 60 * 1000) && dt <= endWindow) {
            const markets = parseOddsApiMarkets(ev, 'football');
            if (markets.length > 0) {
              events.push({
                id: `fb-${ev.id}`,
                sport: 'football',
                competitionId: comp.key,
                competitionName: comp.title,
                homeTeam: ev.home_team,
                awayTeam: ev.away_team,
                eventName: `${ev.home_team} - ${ev.away_team}`,
                commenceTime: ev.commence_time,
                participants: [ev.home_team, ev.away_team],
                markets
              });
            }
          }
        }
      }

      const statsCoveredNames = Object.values(FOOTBALL_DATA_FREE_COMPETITIONS).map((c) => c.label);
      coveredCompetitions.push({
        sport: 'football',
        sportLabel: 'Calcio',
        oddsSource: apiKey
          ? 'The Odds API (Regione EU — Mediana Bookmaker Europei; SNAI non presente nel feed API gratuito, usa il campo "Quota SNAI reale" per override)'
          : 'Non attiva (THE_ODDS_API_KEY mancante)',
        statsSource: process.env.FOOTBALL_DATA_API_KEY
          ? 'football-data.org (Piano Free: 12 campionati principali)'
          : 'Solo Quote + RSS (FOOTBALL_DATA_API_KEY non configurata)',
        rssSources: getActiveRssSourcesBySport('football'),
        coveredCompetitions:
          selectedSoccer.length > 0
            ? selectedSoccer.map((s) => s.title)
            : statsCoveredNames,
        uncoveredNote:
          'Per preservare i 500 crediti/mese del piano gratuito di The Odds API vengono interrogate le 6 competizioni attive principali per finestra; le classifiche ufficiali su piano gratuito (football-data.org) coprono 12 competizioni top (Serie A, Premier League, La Liga, Bundesliga, Ligue 1, Champions League, Eredivisie, Primeira Liga, Championship, Brasileirão). Mercati Goal/NoGoal e Combo non sono inclusi nel piano gratuito di The Odds API.',
        dailyRequestsLimitInfo: 'The Odds API: 500 crediti/mese (~16 crediti/giorno) | football-data.org: 10 richieste/minuto'
      });
    }

    // 2. TENNIS
    if (sports.includes('tennis')) {
      const activeTennis = activeSports
        .filter((s) => s.active && s.key.startsWith('tennis_') && !s.has_outrights)
        .slice(0, 4);

      if (!apiKey) {
        providerWarnings.push(
          'Tennis: chiave THE_ODDS_API_KEY non configurata. Impossibile scaricare le quote dei tornei ATP/WTA.'
        );
      }

      for (const comp of activeTennis) {
        const compEvents = await this.fetchCompetitionOdds(apiKey, comp.key, regions, 'h2h,totals');
        for (const ev of compEvents) {
          const dt = new Date(ev.commence_time);
          if (dt >= new Date(now.getTime() - 15 * 60 * 1000) && dt <= endWindow) {
            const markets = parseOddsApiMarkets(ev, 'tennis');
            if (markets.length > 0) {
              events.push({
                id: `tn-${ev.id}`,
                sport: 'tennis',
                competitionId: comp.key,
                competitionName: comp.title,
                homeTeam: ev.home_team,
                awayTeam: ev.away_team,
                eventName: `${ev.home_team} - ${ev.away_team}`,
                commenceTime: ev.commence_time,
                participants: [ev.home_team, ev.away_team],
                markets
              });
            }
          }
        }
      }

      coveredCompetitions.push({
        sport: 'tennis',
        sportLabel: 'Tennis',
        oddsSource: apiKey
          ? 'The Odds API (Tornei ATP/WTA in corso — Regione EU)'
          : 'Non attiva (THE_ODDS_API_KEY mancante)',
        statsSource: 'Nessun provider statistico gratuito affidabile per H2H/superficie live (usate quote + RSS)',
        rssSources: getActiveRssSourcesBySport('tennis'),
        coveredCompetitions:
          activeTennis.length > 0
            ? activeTennis.map((t) => t.title)
            : ['Tornei ATP / WTA e Grand Slam attivi nella settimana'],
        uncoveredNote:
          'Non esiste una API gratuita senza carta di credito per statistiche ATP/WTA (head-to-head e superficie in tempo reale); come previsto dalle specifiche, il motore usa le quote bookmaker depurate dal margine e i feed RSS specializzati (Ubitennis, Gazzetta Tennis, BBC Tennis, OA Sport).',
        dailyRequestsLimitInfo: 'The Odds API: condiviso nel pool da 500 crediti/mese | Feed RSS: illimitati con cache 2h'
      });
    }

    // 3. FORMULA 1
    if (sports.includes('f1')) {
      const f1Schedule = await fetchF1CurrentSchedule();
      const upcomingRaces = f1Schedule.filter((r) => {
        const dt = new Date(r.isoDateTime);
        return dt >= new Date(now.getTime() - 6 * 3600 * 1000) && dt <= endWindow;
      });

      const nextRace = f1Schedule.find((r) => new Date(r.isoDateTime) >= now);
      if (upcomingRaces.length === 0 && nextRace) {
        providerWarnings.push(
          `Formula 1: nessun Gran Premio in programma nella finestra selezionata. Prossimo GP in calendario (Jolpica-F1): ${nextRace.raceName} (${nextRace.locality}) il ${nextRace.date}. Inoltre, il piano gratuito di The Odds API non fornisce quote bookmaker per la Formula 1.`
        );
      } else if (upcomingRaces.length > 0) {
        providerWarnings.push(
          `Formula 1: Gran Premio in calendario trovato (${upcomingRaces[0].raceName}), ma The Odds API non supporta le quote di Formula 1 sul piano gratuito. Nessuna quota inventata viene mostrata in produzione.`
        );
      } else {
        providerWarnings.push(
          'Formula 1: il piano gratuito di The Odds API non include quote per i motori/F1. Calendario e classifiche reali sono forniti da Jolpica-F1.'
        );
      }

      coveredCompetitions.push({
        sport: 'f1',
        sportLabel: 'Formula 1',
        oddsSource: 'Non coperta da The Odds API (nessun aggregatore gratuito espone quote F1 live senza piano a pagamento)',
        statsSource: 'Jolpica-F1 (api.jolpi.ca — Calendario GP, Classifica Piloti e Costruttori, Risultati)',
        rssSources: getActiveRssSourcesBySport('f1'),
        coveredCompetitions: ['Campionato Mondiale FIA Formula 1 (Calendario e Classifiche via Jolpica-F1)'],
        uncoveredNote:
          'Limitazione verificata: The Odds API non copre la Formula 1 e OpenF1 blocca con HTTP 401 le richieste non autenticate durante le sessioni live. Pertanto in modalità reale non vengono mai inventate quote F1.',
        dailyRequestsLimitInfo: 'Jolpica-F1: gratuito senza API key (cache 6 ore)'
      });
    }

    return {
      events,
      providerWarnings,
      coveredCompetitions,
      isDemoData: false
    };
  }
}

/**
 * Implementazione Dimostrativa SOLO per sviluppo locale (DEMO_MODE=true e NODE_ENV !== 'production').
 * Utile per testare l'interfaccia, l'override SNAI, la Beam Search e il local-ai-bridge senza consumare quote API.
 */
export class DemoOddsProvider implements OddsProvider {
  public readonly name = 'DemoOddsProvider (SOLO SVILUPPO - DATI DI PROVA)';

  public async fetchEvents(sports: SportKey[], timeWindow: TimeWindowKey): Promise<OddsFetchResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DemoOddsProvider è vietato in produzione.');
    }

    const now = Date.now();
    const hour = 3600 * 1000;
    const endWindow = getWindowEndTimestamp(timeWindow, new Date(now)).getTime();

    const allDemoEvents: RawSportEvent[] = [
      // --- CALCIO ---
      {
        id: 'serieA-demo-INT-NAP',
        sport: 'football',
        competitionId: 'soccer_italy_serie_a',
        competitionName: 'Serie A (Italia)',
        homeTeam: 'Inter',
        awayTeam: 'Napoli',
        eventName: 'Inter - Napoli',
        commenceTime: new Date(now + 5 * hour).toISOString(),
        participants: ['Inter', 'Napoli'],
        isDemo: true,
        markets: [
          {
            marketKey: 'h2h',
            marketName: 'Esito Finale 1X2',
            outcomes: [
              { selection: '1 (Inter)', bookmakerOdds: [1.85, 1.88, 1.83] },
              { selection: 'X (Pareggio)', bookmakerOdds: [3.50, 3.60, 3.45] },
              { selection: '2 (Napoli)', bookmakerOdds: [4.20, 4.35, 4.10] }
            ]
          },
          {
            marketKey: 'double_chance',
            marketName: 'Doppia Chance',
            outcomes: [
              { selection: '1X', bookmakerOdds: [1.22, 1.24, 1.21] },
              { selection: 'X2', bookmakerOdds: [1.92, 1.95, 1.90] },
              { selection: '12', bookmakerOdds: [1.28, 1.30, 1.27] }
            ]
          },
          {
            marketKey: 'totals_2.5',
            marketName: 'Under/Over 2.5 Gol',
            line: 2.5,
            outcomes: [
              { selection: 'Over 2.5', line: 2.5, bookmakerOdds: [1.78, 1.80, 1.75] },
              { selection: 'Under 2.5', line: 2.5, bookmakerOdds: [2.02, 2.05, 1.98] }
            ]
          },
          {
            marketKey: 'btts',
            marketName: 'Goal / NoGoal',
            outcomes: [
              { selection: 'Goal (Entrambe segnano)', bookmakerOdds: [1.72, 1.75, 1.70] },
              { selection: 'NoGoal', bookmakerOdds: [2.05, 2.10, 2.00] }
            ]
          }
        ]
      },
      {
        id: 'serieA-demo-JUV-MIL',
        sport: 'football',
        competitionId: 'soccer_italy_serie_a',
        competitionName: 'Serie A (Italia)',
        homeTeam: 'Juventus',
        awayTeam: 'Milan',
        eventName: 'Juventus - Milan',
        commenceTime: new Date(now + 8 * hour).toISOString(),
        participants: ['Juventus', 'Milan'],
        isDemo: true,
        markets: [
          {
            marketKey: 'h2h',
            marketName: 'Esito Finale 1X2',
            outcomes: [
              { selection: '1 (Juventus)', bookmakerOdds: [2.10, 2.15, 2.08] },
              { selection: 'X (Pareggio)', bookmakerOdds: [3.25, 3.30, 3.20] },
              { selection: '2 (Milan)', bookmakerOdds: [3.60, 3.65, 3.55] }
            ]
          },
          {
            marketKey: 'double_chance',
            marketName: 'Doppia Chance',
            outcomes: [
              { selection: '1X', bookmakerOdds: [1.29, 1.31, 1.28] },
              { selection: 'X2', bookmakerOdds: [1.70, 1.73, 1.68] },
              { selection: '12', bookmakerOdds: [1.33, 1.35, 1.32] }
            ]
          },
          {
            marketKey: 'draw_no_bet',
            marketName: 'Draw No Bet (Rimborso Pareggio)',
            outcomes: [
              { selection: '1 DNB (Juventus)', bookmakerOdds: [1.50, 1.52, 1.48] },
              { selection: '2 DNB (Milan)', bookmakerOdds: [2.50, 2.55, 2.45] }
            ]
          },
          {
            marketKey: 'totals_2.5',
            marketName: 'Under/Over 2.5 Gol',
            line: 2.5,
            outcomes: [
              { selection: 'Over 2.5', line: 2.5, bookmakerOdds: [2.05, 2.08, 2.02] },
              { selection: 'Under 2.5', line: 2.5, bookmakerOdds: [1.75, 1.77, 1.73] }
            ]
          }
        ]
      },
      {
        id: 'epl-demo-ARS-LIV',
        sport: 'football',
        competitionId: 'soccer_epl',
        competitionName: 'Premier League (Inghilterra)',
        homeTeam: 'Arsenal',
        awayTeam: 'Liverpool',
        eventName: 'Arsenal - Liverpool',
        commenceTime: new Date(now + 18 * hour).toISOString(),
        participants: ['Arsenal', 'Liverpool'],
        isDemo: true,
        markets: [
          {
            marketKey: 'h2h',
            marketName: 'Esito Finale 1X2',
            outcomes: [
              { selection: '1 (Arsenal)', bookmakerOdds: [2.25, 2.28, 2.22] },
              { selection: 'X (Pareggio)', bookmakerOdds: [3.40, 3.45, 3.35] },
              { selection: '2 (Liverpool)', bookmakerOdds: [3.10, 3.15, 3.05] }
            ]
          },
          {
            marketKey: 'double_chance',
            marketName: 'Doppia Chance',
            outcomes: [
              { selection: '1X', bookmakerOdds: [1.36, 1.38, 1.35] },
              { selection: 'X2', bookmakerOdds: [1.62, 1.65, 1.60] },
              { selection: '12', bookmakerOdds: [1.30, 1.32, 1.29] }
            ]
          },
          {
            marketKey: 'totals_2.5',
            marketName: 'Under/Over 2.5 Gol',
            line: 2.5,
            outcomes: [
              { selection: 'Over 2.5', line: 2.5, bookmakerOdds: [1.65, 1.68, 1.63] },
              { selection: 'Under 2.5', line: 2.5, bookmakerOdds: [2.20, 2.25, 2.15] }
            ]
          }
        ]
      },
      {
        id: 'laliga-demo-RMA-BAR',
        sport: 'football',
        competitionId: 'soccer_spain_la_liga',
        competitionName: 'La Liga (Spagna)',
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        eventName: 'Real Madrid - Barcelona',
        commenceTime: new Date(now + 26 * hour).toISOString(),
        participants: ['Real Madrid', 'Barcelona'],
        isDemo: true,
        markets: [
          {
            marketKey: 'h2h',
            marketName: 'Esito Finale 1X2',
            outcomes: [
              { selection: '1 (Real Madrid)', bookmakerOdds: [1.95, 1.98, 1.92] },
              { selection: 'X (Pareggio)', bookmakerOdds: [3.80, 3.85, 3.75] },
              { selection: '2 (Barcelona)', bookmakerOdds: [3.50, 3.55, 3.45] }
            ]
          },
          {
            marketKey: 'double_chance',
            marketName: 'Doppia Chance',
            outcomes: [
              { selection: '1X', bookmakerOdds: [1.30, 1.32, 1.28] },
              { selection: 'X2', bookmakerOdds: [1.82, 1.85, 1.80] },
              { selection: '12', bookmakerOdds: [1.24, 1.26, 1.23] }
            ]
          },
          {
            marketKey: 'totals_2.5',
            marketName: 'Under/Over 2.5 Gol',
            line: 2.5,
            outcomes: [
              { selection: 'Over 2.5', line: 2.5, bookmakerOdds: [1.45, 1.48, 1.43] },
              { selection: 'Under 2.5', line: 2.5, bookmakerOdds: [2.65, 2.70, 2.60] }
            ]
          }
        ]
      },
      {
        id: 'bundes-demo-BAY-BVB',
        sport: 'football',
        competitionId: 'soccer_germany_bundesliga',
        competitionName: 'Bundesliga (Germania)',
        homeTeam: 'Bayern Munich',
        awayTeam: 'Borussia Dortmund',
        eventName: 'Bayern Munich - Borussia Dortmund',
        commenceTime: new Date(now + 32 * hour).toISOString(),
        participants: ['Bayern Munich', 'Borussia Dortmund'],
        isDemo: true,
        markets: [
          {
            marketKey: 'h2h',
            marketName: 'Esito Finale 1X2',
            outcomes: [
              { selection: '1 (Bayern Munich)', bookmakerOdds: [1.48, 1.50, 1.46] },
              { selection: 'X (Pareggio)', bookmakerOdds: [4.60, 4.70, 4.50] },
              { selection: '2 (Borussia Dortmund)', bookmakerOdds: [5.75, 5.90, 5.60] }
            ]
          },
          {
            marketKey: 'double_chance',
            marketName: 'Doppia Chance',
            outcomes: [
              { selection: '1X', bookmakerOdds: [1.14, 1.15, 1.13] },
              { selection: '12', bookmakerOdds: [1.18, 1.20, 1.17] },
              { selection: 'X2', bookmakerOdds: [2.55, 2.60, 2.50] }
            ]
          }
        ]
      },
      {
        id: 'serieA-demo-ATA-ROM',
        sport: 'football',
        competitionId: 'soccer_italy_serie_a',
        competitionName: 'Serie A (Italia)',
        homeTeam: 'Atalanta',
        awayTeam: 'Roma',
        eventName: 'Atalanta - Roma',
        commenceTime: new Date(now + 40 * hour).toISOString(),
        participants: ['Atalanta', 'Roma'],
        isDemo: true,
        markets: [
          {
            marketKey: 'h2h',
            marketName: 'Esito Finale 1X2',
            outcomes: [
              { selection: '1 (Atalanta)', bookmakerOdds: [1.80, 1.82, 1.78] },
              { selection: 'X (Pareggio)', bookmakerOdds: [3.60, 3.65, 3.55] },
              { selection: '2 (Roma)', bookmakerOdds: [4.40, 4.50, 4.30] }
            ]
          },
          {
            marketKey: 'double_chance',
            marketName: 'Doppia Chance',
            outcomes: [
              { selection: '1X', bookmakerOdds: [1.21, 1.22, 1.20] },
              { selection: 'X2', bookmakerOdds: [1.98, 2.02, 1.95] },
              { selection: '12', bookmakerOdds: [1.28, 1.29, 1.27] }
            ]
          }
        ]
      },

      // --- FORMULA 1 ---
      {
        id: 'f1-demo-GP-BRASILE',
        sport: 'f1',
        competitionId: 'f1_world_championship',
        competitionName: 'Mondiale Formula 1',
        eventName: 'GP del Brasile (Interlagos)',
        commenceTime: new Date(now + 22 * hour).toISOString(),
        participants: ['Lando Norris', 'Max Verstappen', 'Charles Leclerc', 'Oscar Piastri', 'Lewis Hamilton'],
        isDemo: true,
        markets: [
          {
            marketKey: 'f1_winner',
            marketName: 'Vincente del GP',
            outcomes: [
              { selection: 'Lando Norris', bookmakerOdds: [2.40, 2.45, 2.35] },
              { selection: 'Max Verstappen', bookmakerOdds: [2.85, 2.90, 2.80] },
              { selection: 'Charles Leclerc', bookmakerOdds: [4.50, 4.60, 4.40] },
              { selection: 'Oscar Piastri', bookmakerOdds: [6.50, 6.75, 6.25] },
              { selection: 'Lewis Hamilton', bookmakerOdds: [12.00, 13.00, 11.50] }
            ]
          },
          {
            marketKey: 'f1_h2h_nor_ver',
            marketName: 'Testa a Testa Gara (Norris vs Verstappen)',
            outcomes: [
              { selection: 'Lando Norris davanti a Verstappen', bookmakerOdds: [1.72, 1.75, 1.70] },
              { selection: 'Max Verstappen davanti a Norris', bookmakerOdds: [2.05, 2.10, 2.00] }
            ]
          },
          {
            marketKey: 'f1_h2h_lec_pia',
            marketName: 'Testa a Testa Gara (Leclerc vs Piastri)',
            outcomes: [
              { selection: 'Charles Leclerc davanti a Piastri', bookmakerOdds: [1.62, 1.65, 1.60] },
              { selection: 'Oscar Piastri davanti a Leclerc', bookmakerOdds: [2.20, 2.25, 2.15] }
            ]
          },
          {
            marketKey: 'f1_podium_norris',
            marketName: 'Podio GP (Sì/No)',
            outcomes: [
              { selection: 'Lando Norris a Podio - Sì', bookmakerOdds: [1.28, 1.30, 1.26] },
              { selection: 'Lando Norris a Podio - No', bookmakerOdds: [3.40, 3.50, 3.30] }
            ]
          }
        ]
      },

      // --- TENNIS ---
      {
        id: 'tennis-demo-SIN-ALC',
        sport: 'tennis',
        competitionId: 'tennis_atp_masters',
        competitionName: 'ATP Masters 1000 Indoor',
        homeTeam: 'Jannik Sinner',
        awayTeam: 'Carlos Alcaraz',
        eventName: 'Jannik Sinner - Carlos Alcaraz',
        commenceTime: new Date(now + 10 * hour).toISOString(),
        participants: ['Jannik Sinner', 'Carlos Alcaraz'],
        isDemo: true,
        markets: [
          {
            marketKey: 'h2h',
            marketName: 'Vincente del Match',
            outcomes: [
              { selection: 'Vincente: Jannik Sinner', bookmakerOdds: [1.65, 1.68, 1.62] },
              { selection: 'Vincente: Carlos Alcaraz', bookmakerOdds: [2.22, 2.26, 2.18] }
            ]
          },
          {
            marketKey: 'totals_22.5',
            marketName: 'Under/Over 22.5 Giochi',
            line: 22.5,
            outcomes: [
              { selection: 'Over 22.5', line: 22.5, bookmakerOdds: [1.85, 1.88, 1.82] },
              { selection: 'Under 22.5', line: 22.5, bookmakerOdds: [1.92, 1.95, 1.90] }
            ]
          }
        ]
      },
      {
        id: 'tennis-demo-ZVE-MED',
        sport: 'tennis',
        competitionId: 'tennis_atp_masters',
        competitionName: 'ATP Masters 1000 Indoor',
        homeTeam: 'Alexander Zverev',
        awayTeam: 'Daniil Medvedev',
        eventName: 'Alexander Zverev - Daniil Medvedev',
        commenceTime: new Date(now + 14 * hour).toISOString(),
        participants: ['Alexander Zverev', 'Daniil Medvedev'],
        isDemo: true,
        markets: [
          {
            marketKey: 'h2h',
            marketName: 'Vincente del Match',
            outcomes: [
              { selection: 'Vincente: Alexander Zverev', bookmakerOdds: [1.55, 1.57, 1.53] },
              { selection: 'Vincente: Daniil Medvedev', bookmakerOdds: [2.42, 2.46, 2.38] }
            ]
          },
          {
            marketKey: 'totals_21.5',
            marketName: 'Under/Over 21.5 Giochi',
            line: 21.5,
            outcomes: [
              { selection: 'Over 21.5', line: 21.5, bookmakerOdds: [1.72, 1.75, 1.70] },
              { selection: 'Under 21.5', line: 21.5, bookmakerOdds: [2.05, 2.10, 2.00] }
            ]
          }
        ]
      },
      {
        id: 'tennis-demo-MUS-BER',
        sport: 'tennis',
        competitionId: 'tennis_atp_masters',
        competitionName: 'ATP Masters 1000 Indoor',
        homeTeam: 'Lorenzo Musetti',
        awayTeam: 'Matteo Berrettini',
        eventName: 'Lorenzo Musetti - Matteo Berrettini',
        commenceTime: new Date(now + 30 * hour).toISOString(),
        participants: ['Lorenzo Musetti', 'Matteo Berrettini'],
        isDemo: true,
        markets: [
          {
            marketKey: 'h2h',
            marketName: 'Vincente del Match',
            outcomes: [
              { selection: 'Vincente: Matteo Berrettini', bookmakerOdds: [1.75, 1.78, 1.72] },
              { selection: 'Vincente: Lorenzo Musetti', bookmakerOdds: [2.05, 2.08, 2.02] }
            ]
          }
        ]
      }
    ];

    const filtered = allDemoEvents.filter(
      (ev) => sports.includes(ev.sport) && new Date(ev.commenceTime).getTime() <= endWindow
    );

    const allDemoCovered: CompetitionCoverageInfo[] = [
      {
        sport: 'football',
        sportLabel: 'Calcio (DEMO_MODE)',
        oddsSource: 'Dati di prova (DEMO_MODE=true attivo in sviluppo)',
        statsSource: 'football-data.org + Contesto Demo',
        rssSources: getActiveRssSourcesBySport('football'),
        coveredCompetitions: ['Serie A (Italia)', 'Premier League (Inghilterra)', 'La Liga (Spagna)', 'Bundesliga (Germania)'],
        uncoveredNote: 'Modalità DEMO_MODE=true attiva: disattiva DEMO_MODE e inserisci THE_ODDS_API_KEY per usare le quote reali.',
        dailyRequestsLimitInfo: 'DEMO_MODE: 0 crediti consumati'
      },
      {
        sport: 'f1',
        sportLabel: 'Formula 1 (DEMO_MODE)',
        oddsSource: 'Dati di prova (DEMO_MODE=true; in produzione The Odds API non copre F1)',
        statsSource: 'Jolpica-F1 (api.jolpi.ca)',
        rssSources: getActiveRssSourcesBySport('f1'),
        coveredCompetitions: ['Mondiale Formula 1'],
        uncoveredNote: 'In produzione The Odds API non fornisce quote F1 sul piano gratuito; restano attivi calendario e classifiche Jolpica-F1.',
        dailyRequestsLimitInfo: 'Jolpica-F1: gratuito'
      },
      {
        sport: 'tennis',
        sportLabel: 'Tennis (DEMO_MODE)',
        oddsSource: 'Dati di prova (DEMO_MODE=true attivo in sviluppo)',
        statsSource: 'Solo Quote + Feed RSS Tennis',
        rssSources: getActiveRssSourcesBySport('tennis'),
        coveredCompetitions: ['ATP Masters 1000 Indoor'],
        uncoveredNote: 'Per il Tennis non esistono API gratuite affidabili per statistiche H2H/superficie live.',
        dailyRequestsLimitInfo: 'DEMO_MODE: 0 crediti consumati'
      }
    ];
    const coveredCompetitions = allDemoCovered.filter((c) => sports.includes(c.sport));

    return {
      events: filtered,
      providerWarnings: [
        'MODALITÀ SVILUPPO (DEMO_MODE=true): Stai visualizzando dati e quote di prova. In produzione questa modalità è disattivata.'
      ],
      coveredCompetitions,
      isDemoData: true
    };
  }
}

export function getActiveOddsProvider(): OddsProvider {
  const isProd = process.env.NODE_ENV === 'production';
  const isDemo = !isProd && process.env.DEMO_MODE === 'true';
  if (isDemo) {
    return new DemoOddsProvider();
  }
  return new TheOddsApiProvider();
}

