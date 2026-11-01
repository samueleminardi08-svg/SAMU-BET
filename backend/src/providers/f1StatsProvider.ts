import { sharedCache, TTL_STATS_MS } from '../cache/cacheManager.js';
import { EventStatsContext } from '../types/models.js';

export interface F1RaceScheduleItem {
  round: string;
  raceName: string;
  circuitName: string;
  locality: string;
  country: string;
  date: string;
  time: string;
  isoDateTime: string;
}

export interface F1DriverStandingItem {
  position: number;
  driverId: string;
  fullName: string;
  code: string;
  constructorName: string;
  points: number;
  wins: number;
}

const JOLPICA_BASE = process.env.JOLPICA_F1_BASE_URL || 'https://api.jolpi.ca/ergast/f1';

export async function fetchF1CurrentSchedule(): Promise<F1RaceScheduleItem[]> {
  const cacheKey = 'f1:schedule:current';
  const cached = sharedCache.get<F1RaceScheduleItem[]>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${JOLPICA_BASE}/current.json`, {
      headers: { 'User-Agent': 'SamuBet/1.0' },
      signal: controller.signal
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      MRData?: {
        RaceTable?: {
          Races?: Array<{
            round: string;
            raceName: string;
            Circuit: { circuitName: string; Location: { locality: string; country: string } };
            date: string;
            time?: string;
          }>;
        };
      };
    };

    const races = data.MRData?.RaceTable?.Races || [];
    const parsed: F1RaceScheduleItem[] = races.map((r) => {
      const timeStr = r.time || '14:00:00Z';
      return {
        round: r.round,
        raceName: r.raceName,
        circuitName: r.Circuit.circuitName,
        locality: r.Circuit.Location.locality,
        country: r.Circuit.Location.country,
        date: r.date,
        time: timeStr,
        isoDateTime: `${r.date}T${timeStr}`
      };
    });

    sharedCache.set(cacheKey, parsed, TTL_STATS_MS);
    return parsed;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchF1DriverStandings(): Promise<F1DriverStandingItem[]> {
  const cacheKey = 'f1:driverStandings:current';
  const cached = sharedCache.get<F1DriverStandingItem[]>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${JOLPICA_BASE}/current/driverStandings.json`, {
      headers: { 'User-Agent': 'SamuBet/1.0' },
      signal: controller.signal
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      MRData?: {
        StandingsTable?: {
          StandingsLists?: Array<{
            DriverStandings?: Array<{
              position: string;
              points: string;
              wins: string;
              Driver: { driverId: string; code?: string; givenName: string; familyName: string };
              Constructors?: Array<{ name: string }>;
            }>;
          }>;
        };
      };
    };

    const list = data.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
    const standings: F1DriverStandingItem[] = list.map((d) => ({
      position: Number(d.position),
      driverId: d.Driver.driverId,
      fullName: `${d.Driver.givenName} ${d.Driver.familyName}`,
      code: d.Driver.code || d.Driver.familyName.slice(0, 3).toUpperCase(),
      constructorName: d.Constructors?.[0]?.name || 'Team F1',
      points: Number(d.points),
      wins: Number(d.wins)
    }));

    sharedCache.set(cacheKey, standings, TTL_STATS_MS);
    return standings;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function getF1EventStats(): Promise<EventStatsContext> {
  const standings = await fetchF1DriverStandings();
  if (standings.length === 0) {
    return {
      competitionCovered: true,
      summaryLines: ['Classifica Mondiale F1 (Jolpica-F1) temporaneamente non raggiungibile.'],
      injuriesOrAbsences: [],
      sourceName: 'Jolpica-F1 (Ergast API)'
    };
  }

  const top6 = standings
    .slice(0, 6)
    .map((d) => `${d.position}. ${d.fullName} (${d.constructorName}) ${d.points} pt (${d.wins} vittorie)`)
    .join(' | ');

  return {
    competitionCovered: true,
    summaryLines: [`Classifica Piloti F1 Top 6: ${top6}`],
    injuriesOrAbsences: [],
    sourceName: 'Jolpica-F1 (api.jolpi.ca)'
  };
}

