import { sharedCache, TTL_STATS_MS } from '../cache/cacheManager.js';
import { normalizeText } from '../rss/rssService.js';
import { EventStatsContext } from '../types/models.js';

/**
 * Mappatura tra i campionati e i 12 codici gratuiti di football-data.org (Tier One Free Plan)
 */
export const FOOTBALL_DATA_FREE_COMPETITIONS: Record<string, { code: string; label: string }> = {
  soccer_italy_serie_a: { code: 'SA', label: 'Serie A (Italia)' },
  soccer_epl: { code: 'PL', label: 'Premier League (Inghilterra)' },
  soccer_spain_la_liga: { code: 'PD', label: 'La Liga (Spagna)' },
  soccer_germany_bundesliga: { code: 'BL1', label: 'Bundesliga (Germania)' },
  soccer_france_ligue_one: { code: 'FL1', label: 'Ligue 1 (Francia)' },
  soccer_uefa_champs_league: { code: 'CL', label: 'UEFA Champions League' },
  soccer_netherlands_eredivisie: { code: 'DED', label: 'Eredivisie (Paesi Bassi)' },
  soccer_portugal_primeira_liga: { code: 'PPL', label: 'Primeira Liga (Portogallo)' },
  soccer_efl_champ: { code: 'ELC', label: 'Championship (Inghilterra)' },
  soccer_brazil_campeonato: { code: 'BSA', label: 'Série A (Brasile)' }
};

interface StandingRow {
  position: number;
  teamName: string;
  playedGames: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  form?: string;
}

async function fetchLeagueStandings(competitionCode: string): Promise<StandingRow[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) return [];

  const cacheKey = `fb_standings:${competitionCode}`;
  const cached = sharedCache.get<StandingRow[]>(cacheKey);
  if (cached) return cached;

  if (!sharedCache.canMakeExternalApiCall()) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    sharedCache.recordExternalApiCall(1);
    const res = await fetch(`https://api.football-data.org/v4/competitions/${competitionCode}/standings`, {
      headers: { 'X-Auth-Token': apiKey },
      signal: controller.signal
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      standings?: Array<{
        type?: string;
        table?: Array<{
          position: number;
          team: { name: string; shortName?: string };
          playedGames: number;
          points: number;
          goalsFor: number;
          goalsAgainst: number;
          form?: string;
        }>;
      }>;
    };

    const totalTable = data.standings?.find((s) => s.type === 'TOTAL')?.table || data.standings?.[0]?.table || [];
    const rows: StandingRow[] = totalTable.map((r) => ({
      position: r.position,
      teamName: r.team.shortName || r.team.name,
      playedGames: r.playedGames,
      points: r.points,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      form: r.form || undefined
    }));

    sharedCache.set(cacheKey, rows, TTL_STATS_MS);
    return rows;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

interface ScorerRow {
  playerName: string;
  teamName: string;
  goals: number;
  assists: number;
  penalties: number;
  playedMatches: number;
}

async function fetchLeagueScorers(competitionCode: string): Promise<ScorerRow[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) return [];

  const cacheKey = `fb_scorers:${competitionCode}`;
  const cached = sharedCache.get<ScorerRow[]>(cacheKey);
  if (cached) return cached;

  if (!sharedCache.canMakeExternalApiCall()) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    sharedCache.recordExternalApiCall(1);
    const res = await fetch(
      `https://api.football-data.org/v4/competitions/${competitionCode}/scorers?limit=50`,
      {
        headers: { 'X-Auth-Token': apiKey },
        signal: controller.signal
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      scorers?: Array<{
        player?: { name?: string };
        team?: { name?: string; shortName?: string };
        goals?: number;
        assists?: number;
        penalties?: number;
        playedMatches?: number;
      }>;
    };

    const rows: ScorerRow[] = (data.scorers || [])
      .filter((s) => s.player?.name && (s.team?.shortName || s.team?.name))
      .map((s) => ({
        playerName: s.player!.name!,
        teamName: s.team!.shortName || s.team!.name!,
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        penalties: s.penalties ?? 0,
        playedMatches: s.playedMatches ?? 0
      }));

    sharedCache.set(cacheKey, rows, TTL_STATS_MS);
    return rows;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function findTeamInStandings(rows: StandingRow[], teamName: string): StandingRow | undefined {
  const target = normalizeText(teamName);
  return rows.find((r) => {
    const candidate = normalizeText(r.teamName);
    return candidate.includes(target) || target.includes(candidate);
  });
}

function findTeamScorers(rows: ScorerRow[], teamName: string): ScorerRow[] {
  const target = normalizeText(teamName);
  return rows.filter((r) => {
    const candidate = normalizeText(r.teamName);
    return candidate.includes(target) || target.includes(candidate);
  });
}

export async function getFootballEventStats(
  competitionId: string,
  homeTeam?: string,
  awayTeam?: string
): Promise<EventStatsContext> {
  const mapped = FOOTBALL_DATA_FREE_COMPETITIONS[competitionId];
  if (!mapped) {
    return {
      competitionCovered: false,
      summaryLines: [
        'Classifica ufficiale non coperta dal piano gratuito di football-data.org per questa competizione (coperti 12 campionati principali). Analisi basata su quote bookmaker, probabili formazioni e feed RSS.'
      ],
      injuriesOrAbsences: [],
      sourceName: 'Quote + RSS + Ricerca Formazioni AI'
    };
  }

  const hasKey = Boolean(process.env.FOOTBALL_DATA_API_KEY?.trim());
  if (!hasKey) {
    return {
      competitionCovered: true,
      summaryLines: [
        `Competizione ${mapped.label} supportata da football-data.org, ma FOOTBALL_DATA_API_KEY non è configurata nel backend.`
      ],
      injuriesOrAbsences: [],
      sourceName: 'football-data.org (chiave non configurata)'
    };
  }

  const [rows, scorers] = await Promise.all([
    fetchLeagueStandings(mapped.code),
    fetchLeagueScorers(mapped.code)
  ]);

  if (rows.length === 0) {
    return {
      competitionCovered: true,
      summaryLines: [`Dati classifica ${mapped.label} temporaneamente non disponibili.`],
      injuriesOrAbsences: [],
      sourceName: 'football-data.org'
    };
  }

  const summaryLines: string[] = [];
  if (homeTeam) {
    const h = findTeamInStandings(rows, homeTeam);
    if (h) {
      summaryLines.push(
        `${homeTeam}: ${h.position}° posto (${h.points} pt in ${h.playedGames} gare, GF:${h.goalsFor} GS:${h.goalsAgainst}${h.form ? `, forma: ${h.form}` : ''})`
      );
    }
    const hScorers = findTeamScorers(scorers, homeTeam);
    if (hScorers.length > 0) {
      const topList = hScorers
        .slice(0, 4)
        .map(
          (s) =>
            `${s.playerName} (${s.goals} gol${s.assists ? `, ${s.assists} assist` : ''}${
              s.playedMatches ? ` in ${s.playedMatches} pres.` : ''
            })`
        )
        .join(', ');
      summaryLines.push(`Marcatori/Titolari offensivi ${homeTeam}: ${topList}`);
    }
  }
  if (awayTeam) {
    const a = findTeamInStandings(rows, awayTeam);
    if (a) {
      summaryLines.push(
        `${awayTeam}: ${a.position}° posto (${a.points} pt in ${a.playedGames} gare, GF:${a.goalsFor} GS:${a.goalsAgainst}${a.form ? `, forma: ${a.form}` : ''})`
      );
    }
    const aScorers = findTeamScorers(scorers, awayTeam);
    if (aScorers.length > 0) {
      const topList = aScorers
        .slice(0, 4)
        .map(
          (s) =>
            `${s.playerName} (${s.goals} gol${s.assists ? `, ${s.assists} assist` : ''}${
              s.playedMatches ? ` in ${s.playedMatches} pres.` : ''
            })`
        )
        .join(', ');
      summaryLines.push(`Marcatori/Titolari offensivi ${awayTeam}: ${topList}`);
    }
  }

  return {
    competitionCovered: true,
    summaryLines: summaryLines.length > 0 ? summaryLines : [`Classifica ${mapped.label} caricata.`],
    injuriesOrAbsences: [],
    sourceName: 'football-data.org (v4 Standings + Scorers)'
  };
}

