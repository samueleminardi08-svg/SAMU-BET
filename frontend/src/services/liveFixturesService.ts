import {
  BetTypeKey,
  CandidateSelection,
  CompetitionItem,
  CompetitionType,
  DEFAULT_TARGET_TOLERANCE,
  MarketGroupKey,
  SportKey,
  TimeWindowKey
} from '../config/riskConfig';
import { AnalyzeApiResponse, BackendStatusResponse } from './apiClient';
import {
  STATIC_MATCHES,
  StaticMatchBlueprint,
  getMatchCommenceTime,
  getMatchHoursFromNow,
  getStaticBackendStatus,
  runStaticPagesAnalysis
} from '../engine/staticPagesEngine';
import { recomputeRecommendationsAndSlip } from '../engine/clientEngine';
import { getRosterForTeam } from '../engine/teamRosters';

export interface EspnLeagueConfig {
  competitionId: string;
  competitionName: string;
  country: string;
  type: CompetitionType;
  espnSlug: string;
}

export const LIVE_SUPPORTED_LEAGUES: EspnLeagueConfig[] = [
  {
    competitionId: 'soccer_uefa_champs_league',
    competitionName: 'UEFA Champions League',
    country: 'Europa',
    type: 'cup',
    espnSlug: 'uefa.champions'
  },
  {
    competitionId: 'soccer_uefa_europa_league',
    competitionName: 'UEFA Europa League',
    country: 'Europa',
    type: 'cup',
    espnSlug: 'uefa.europa'
  },
  {
    competitionId: 'soccer_uefa_europa_conference_league',
    competitionName: 'UEFA Conference League',
    country: 'Europa',
    type: 'cup',
    espnSlug: 'uefa.europa.conf'
  },
  {
    competitionId: 'soccer_italy_serie_a',
    competitionName: 'Serie A',
    country: 'Italia',
    type: 'league',
    espnSlug: 'ita.1'
  },
  {
    competitionId: 'soccer_italy_serie_b',
    competitionName: 'Serie B',
    country: 'Italia',
    type: 'league',
    espnSlug: 'ita.2'
  },
  {
    competitionId: 'soccer_epl',
    competitionName: 'Premier League',
    country: 'Inghilterra',
    type: 'league',
    espnSlug: 'eng.1'
  },
  {
    competitionId: 'soccer_spain_la_liga',
    competitionName: 'La Liga',
    country: 'Spagna',
    type: 'league',
    espnSlug: 'esp.1'
  },
  {
    competitionId: 'soccer_germany_bundesliga',
    competitionName: 'Bundesliga',
    country: 'Germania',
    type: 'league',
    espnSlug: 'ger.1'
  },
  {
    competitionId: 'soccer_france_ligue_one',
    competitionName: 'Ligue 1',
    country: 'Francia',
    type: 'league',
    espnSlug: 'fra.1'
  }
];

function americanToDecimal(str?: string): number | null {
  if (!str) return null;
  const num = parseInt(str, 10);
  if (isNaN(num)) return null;
  if (num > 0) return Number((1 + num / 100).toFixed(2));
  return Number((1 + 100 / Math.abs(num)).toFixed(2));
}

function formatRomeTimestamp(date: Date = new Date()): string {
  try {
    return (
      new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date) + ' (Live ESPN Scoreboard)'
    );
  } catch {
    return date.toLocaleDateString('it-IT') + ' (Live ESPN Scoreboard)';
  }
}

// In-memory cache per sessione per non bombardare le API se si cambia tab
let liveMatchesCache: {
  timestamp: number;
  timeWindow: string;
  matches: StaticMatchBlueprint[];
} | null = null;

const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minuti

/**
 * Recupera in tempo reale le partite ufficiali in programma su ESPN per la data corrente
 * dell'utente e per le prossime giornate, convertendo quote e formazioni.
 */
export async function fetchLiveEspnMatches(timeWindow: TimeWindowKey = 'hours48'): Promise<StaticMatchBlueprint[]> {
  const now = Date.now();

  if (liveMatchesCache && liveMatchesCache.timeWindow === timeWindow && now - liveMatchesCache.timestamp < CACHE_TTL_MS) {
    return liveMatchesCache.matches;
  }

  // Assicura sempre la copertura dell'intero turno settimanale (minimo 7 giorni per includere coppe + weekend)
  const daysCount = timeWindow === 'days14' ? 14 : 7;
  const dateStrings: string[] = [];

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(now + i * 24 * 3600 * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    dateStrings.push(`${y}${m}${day}`);
  }

  const fetchTasks: Promise<StaticMatchBlueprint[]>[] = [];

  for (const league of LIVE_SUPPORTED_LEAGUES) {
    for (const ds of dateStrings) {
      const task = async (): Promise<StaticMatchBlueprint[]> => {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnSlug}/scoreboard?dates=${ds}`;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) return [];
          const data = await res.json();
          if (!data.events || !Array.isArray(data.events)) return [];

          const leagueMatches: StaticMatchBlueprint[] = [];

          for (const ev of data.events) {
            const comp = ev.competitions && ev.competitions[0];
            if (!comp) continue;
            const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
            const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
            if (!home || !away) continue;

            const homeName = home.team?.displayName || home.team?.name || 'Casa';
            const awayName = away.team?.displayName || away.team?.name || 'Trasferta';
            const kickoff = ev.date || new Date(now + 12 * 3600 * 1000).toISOString();

            // Estrazione quote bookmaker se disponibili (es. DraftKings via ESPN)
            let odds1 = 2.05;
            let oddsX = 3.35;
            let odds2 = 3.50;
            let oddsOv25 = 1.78;
            let oddsGoal = 1.72;

            if (comp.odds && comp.odds[0]) {
              const primaryOdds = comp.odds[0];
              const ml = primaryOdds.moneyline;
              if (ml) {
                const dec1 = americanToDecimal(ml.home?.close?.odds || ml.home?.open?.odds);
                const decX = americanToDecimal(ml.draw?.close?.odds || ml.draw?.open?.odds);
                const dec2 = americanToDecimal(ml.away?.close?.odds || ml.away?.open?.odds);
                if (dec1 && dec1 > 1.05) odds1 = dec1;
                if (decX && decX > 1.05) oddsX = decX;
                if (dec2 && dec2 > 1.05) odds2 = dec2;
              }
              const total = primaryOdds.total;
              if (total && total.over) {
                const decOv = americanToDecimal(total.over.close?.odds || total.over.open?.odds);
                if (decOv && decOv > 1.05) oddsOv25 = decOv;
              }
            }

            const homeRoster = getRosterForTeam(homeName);
            const awayRoster = getRosterForTeam(awayName);

            leagueMatches.push({
              id: `espn-${ev.id || `${homeName}-${awayName}`.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
              competitionId: league.competitionId,
              competitionName: league.competitionName,
              country: league.country,
              type: league.type,
              homeTeam: homeName,
              awayTeam: awayName,
              kickoffTimeUTC: kickoff,
              hoursFromNow: Math.max(0, Math.round((new Date(kickoff).getTime() - now) / (3600 * 1000))),
              odds1,
              oddsX,
              odds2,
              oddsOver25: oddsOv25,
              oddsGoal,
              homeRoster,
              awayRoster,
              tacticalContext: `Incontro ufficiale di ${league.competitionName} tra ${homeName} e ${awayName}. Dati e calendario estratti in diretta.`
            });
          }

          return leagueMatches;
        } catch {
          return [];
        }
      };

      fetchTasks.push(task());
    }
  }

  try {
    const results = await Promise.all(fetchTasks);
    const flat = results.flat();

    // Deduplica per ID o squadre
    const uniqueMap = new Map<string, StaticMatchBlueprint>();
    for (const m of flat) {
      const key = `${m.competitionId}-${m.homeTeam}-${m.awayTeam}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, m);
      }
    }

    // Unisci con STATIC_MATCHES per garantire la presenza sia dei campionati sia delle coppe
    for (const sm of STATIC_MATCHES) {
      const key = `${sm.competitionId}-${sm.homeTeam}-${sm.awayTeam}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, sm);
      }
    }

    const fetchedMatches = Array.from(uniqueMap.values());

    if (fetchedMatches.length >= 4) {
      liveMatchesCache = {
        timestamp: now,
        timeWindow,
        matches: fetchedMatches
      };
      return fetchedMatches;
    }
  } catch {
    // Continua col fallback
  }

  // Se la rete è offline o ESPN restituisce meno di 4 partite, usa il database statico integrato
  return STATIC_MATCHES;
}

/**
 * Restituisce le competizioni disponibili per la finestra temporale selezionata,
 * interrogando il calendario live ESPN se online, con fallback istantaneo.
 */
export async function getLiveOrStaticCompetitions(timeWindow: TimeWindowKey = 'hours48'): Promise<{
  competitions: CompetitionItem[];
  calendarUpdatedTimestamp: string;
  timeWindow: TimeWindowKey;
}> {
  const matches = await fetchLiveEspnMatches(timeWindow);
  // Nel catalogo mostriamo sempre tutte le competizioni disponibili nel turno (campionati e coppe)
  const effective = matches.length >= 4 ? matches : STATIC_MATCHES;

  const compMap = new Map<
    string,
    {
      id: string;
      name: string;
      country: string;
      type: CompetitionType;
      count: number;
    }
  >();

  for (const m of effective) {
    const existing = compMap.get(m.competitionId);
    if (existing) {
      existing.count++;
    } else {
      compMap.set(m.competitionId, {
        id: m.competitionId,
        name: m.competitionName,
        country: m.country,
        type: m.type,
        count: 1
      });
    }
  }

  const competitions: CompetitionItem[] = Array.from(compMap.values())
    .map((c) => ({
      id: c.id,
      name: c.name,
      country: c.country,
      type: c.type,
      eventsCount: c.count,
      sport: 'football' as const
    }))
    .sort((a, b) => {
      if (a.country === 'Italia' && b.country !== 'Italia') return -1;
      if (b.country === 'Italia' && a.country !== 'Italia') return 1;
      if (a.country === 'Europa' && b.country !== 'Europa' && b.country !== 'Italia') return -1;
      if (b.country === 'Europa' && a.country !== 'Europa' && a.country !== 'Italia') return 1;
      if (b.eventsCount !== a.eventsCount) return b.eventsCount - a.eventsCount;
      return a.name.localeCompare(b.name);
    });

  return {
    competitions,
    calendarUpdatedTimestamp: formatRomeTimestamp(new Date()),
    timeWindow
  };
}

/**
 * Esegue l'analisi schedine combinando mercati SNAI, quote bookmaker in diretta
 * e AI Gemini/Local Bridge sulle partite scaricate in tempo reale da ESPN.
 */
export async function runLivePagesAnalysis(
  params: Parameters<typeof runStaticPagesAnalysis>[0]
): Promise<AnalyzeApiResponse> {
  try {
    const liveMatches = await fetchLiveEspnMatches(params.timeWindow);
    return runStaticPagesAnalysis(params, liveMatches);
  } catch {
    return runStaticPagesAnalysis(params);
  }
}

