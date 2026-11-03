import { TTL_FIXTURES_MS, sharedCache } from '../cache/cacheManager.js';
import { PRIORITY_FOOTBALL_KEYS, classifyCompetition } from '../config/competitionsCatalog.js';
import { FOOTBALL_DATA_FREE_COMPETITIONS } from './footballStatsProvider.js';
import { NormalizedFixture } from '../types/models.js';

export interface FixturesQueryOptions {
  from: Date;
  to: Date;
  competitions?: string[];
}

export interface FixturesProvider {
  readonly name: string;
  getFixtures(opts: FixturesQueryOptions): Promise<NormalizedFixture[]>;
}

export function formatRomeDateTime(d: Date = new Date()): string {
  return d.toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|ac|as|ssc|afc|sc|us|calcio|club|de|la|el)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function areTeamsMatching(a: string, b: string): boolean {
  const normA = normalizeTeamName(a);
  const normB = normalizeTeamName(b);
  if (!normA || !normB) return false;
  return normA === normB || normA.includes(normB) || normB.includes(normA);
}

/**
 * Deduplica partite provenienti da fonti diverse (es. The Odds API + football-data.org).
 * Se due partite hanno le stesse squadre e orario entro ±3 ore, vengono unite.
 * La fonte canonica (The Odds API) ha la precedenza sull'orario di kickoff.
 */
export function deduplicateFixtures(fixtures: NormalizedFixture[]): NormalizedFixture[] {
  const result: NormalizedFixture[] = [];

  for (const fix of fixtures) {
    const fixTime = new Date(fix.kickoffUTC).getTime();

    const existingIdx = result.findIndex((existing) => {
      const existingTime = new Date(existing.kickoffUTC).getTime();
      const timeDiffHours = Math.abs(fixTime - existingTime) / (3600 * 1000);
      if (timeDiffHours > 3.5) return false;

      const homeMatch = areTeamsMatching(existing.homeTeam, fix.homeTeam);
      const awayMatch = areTeamsMatching(existing.awayTeam, fix.awayTeam);
      return homeMatch && awayMatch;
    });

    if (existingIdx === -1) {
      result.push({ ...fix });
    } else {
      const existing = result[existingIdx];
      const mergedSources = Array.from(new Set([...existing.sources, ...fix.sources]));

      // Se la nuova fonte è The Odds API, considerala canonica per kickoff e nomi
      if (fix.sources.some((s) => s.toLowerCase().includes('the odds api'))) {
        result[existingIdx] = {
          ...fix,
          sources: mergedSources
        };
      } else {
        existing.sources = mergedSources;
      }
    }
  }

  // Ordina per kickoff crescente
  return result.sort((a, b) => new Date(a.kickoffUTC).getTime() - new Date(b.kickoffUTC).getTime());
}

/**
 * The Odds API /v4/sports/{sport}/events (Fonte canonica del calendario: 0 crediti).
 */
export class TheOddsApiFixturesProvider implements FixturesProvider {
  public readonly name = 'The Odds API (Events - 0 Crediti)';

  public async getFixtures(opts: FixturesQueryOptions): Promise<NormalizedFixture[]> {
    const apiKey = process.env.THE_ODDS_API_KEY?.trim();
    if (!apiKey) return [];

    const cacheKey = `fixtures:oddsapi:${opts.from.toISOString().slice(0, 13)}:${opts.to.toISOString().slice(0, 13)}:${(opts.competitions || []).join(',')}`;
    const cached = sharedCache.get<NormalizedFixture[]>(cacheKey);
    if (cached) return cached;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      // 1. Prendi la lista degli sport attivi (gratuita, 0 crediti)
      const sportsUrl = `https://api.the-odds-api.com/v4/sports?apiKey=${encodeURIComponent(apiKey)}`;
      const sportsRes = await fetch(sportsUrl, { signal: controller.signal });
      if (!sportsRes.ok) return [];

      const allSports = (await sportsRes.json()) as Array<{ key: string; title: string; active: boolean; has_outrights: boolean }>;
      const soccerSports = allSports.filter((s) => s.active && s.key.startsWith('soccer_') && !s.has_outrights);

      // Ordina per priorità (Serie A, Coppe Europee, Premier, La Liga, ecc.)
      soccerSports.sort((a, b) => {
        const idxA = PRIORITY_FOOTBALL_KEYS.indexOf(a.key);
        const idxB = PRIORITY_FOOTBALL_KEYS.indexOf(b.key);
        const scoreA = idxA === -1 ? 999 : idxA;
        const scoreB = idxB === -1 ? 999 : idxB;
        return scoreA - scoreB;
      });

      const targetSports = opts.competitions && opts.competitions.length > 0
        ? soccerSports.filter((s) => opts.competitions!.includes(s.key))
        : soccerSports.slice(0, 35);

      const fixtures: NormalizedFixture[] = [];
      const nowMs = Date.now() - 15 * 60 * 1000; // Escludi eventi già terminati

      await Promise.all(
        targetSports.map(async (sport) => {
          try {
            // L'endpoint /events non consuma crediti sul piano free
            const evUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport.key)}/events?apiKey=${encodeURIComponent(apiKey)}`;
            const evRes = await fetch(evUrl, { signal: controller.signal });
            if (!evRes.ok) return;

            const events = (await evRes.json()) as Array<{
              id: string;
              sport_key: string;
              sport_title: string;
              commence_time: string;
              home_team: string;
              away_team: string;
            }>;

            const meta = classifyCompetition(sport.key, sport.title);

            for (const ev of events) {
              const commence = new Date(ev.commence_time);
              const commenceMs = commence.getTime();
              if (commenceMs >= nowMs && commenceMs >= opts.from.getTime() && commenceMs <= opts.to.getTime()) {
                fixtures.push({
                  id: `ev-${ev.id}`,
                  competitionId: sport.key,
                  competitionName: meta.name,
                  country: meta.country,
                  type: meta.type,
                  homeTeam: ev.home_team,
                  awayTeam: ev.away_team,
                  kickoffUTC: ev.commence_time,
                  status: 'scheduled',
                  sources: ['The Odds API'],
                  fetchedAt: new Date().toISOString()
                });
              }
            }
          } catch {
            // Continua con le altre
          }
        })
      );

      sharedCache.set(cacheKey, fixtures, TTL_FIXTURES_MS);
      return fixtures;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * football-data.org (Piano Free: 12 competizioni).
 */
export class FootballDataFixturesProvider implements FixturesProvider {
  public readonly name = 'football-data.org';

  public async getFixtures(opts: FixturesQueryOptions): Promise<NormalizedFixture[]> {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
    if (!apiKey) return [];

    const cacheKey = `fixtures:fbdata:${opts.from.toISOString().slice(0, 10)}:${opts.to.toISOString().slice(0, 10)}`;
    const cached = sharedCache.get<NormalizedFixture[]>(cacheKey);
    if (cached) return cached;

    const fixtures: NormalizedFixture[] = [];
    const dateFrom = opts.from.toISOString().slice(0, 10);
    const dateTo = opts.to.toISOString().slice(0, 10);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      // 1 sola richiesta consolidata a football-data.org per tutte le 12 competizioni
      const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
      const res = await fetch(url, {
        headers: { 'X-Auth-Token': apiKey },
        signal: controller.signal
      });

      if (res.ok) {
        const data = (await res.json()) as {
          matches?: Array<{
            id: number;
            utcDate: string;
            status: string;
            competition?: { code: string; name: string };
            homeTeam: { name: string };
            awayTeam: { name: string };
          }>;
        };

        const codeToSportKey: Record<string, string> = {};
        for (const [sportKey, compInfo] of Object.entries(FOOTBALL_DATA_FREE_COMPETITIONS)) {
          codeToSportKey[compInfo.code] = sportKey;
        }

        for (const m of data.matches || []) {
          if (m.status !== 'FINISHED' && m.competition?.code) {
            const sportKey = codeToSportKey[m.competition.code] || `soccer_${m.competition.code.toLowerCase()}`;
            if (opts.competitions && opts.competitions.length > 0 && !opts.competitions.includes(sportKey)) {
              continue;
            }

            const meta = classifyCompetition(sportKey, m.competition.name);
            fixtures.push({
              id: `fbdata-${m.id}`,
              competitionId: sportKey,
              competitionName: meta.name,
              country: meta.country,
              type: meta.type,
              homeTeam: m.homeTeam.name,
              awayTeam: m.awayTeam.name,
              kickoffUTC: m.utcDate,
              status: m.status === 'IN_PLAY' ? 'live' : 'scheduled',
              sources: ['football-data.org'],
              fetchedAt: new Date().toISOString()
            });
          }
        }
      }
    } catch {
      // Ignora e continua
    } finally {
      clearTimeout(timeout);
    }

    sharedCache.set(cacheKey, fixtures, TTL_FIXTURES_MS);
    return fixtures;
  }
}

/**
 * Provider aggregatore multi-fonte con priorità configurabile da .env (FIXTURES_PROVIDER_ORDER).
 */
export class CompositeFixturesProvider implements FixturesProvider {
  public readonly name = 'CompositeFixturesProvider';

  private providers: FixturesProvider[];

  constructor(providers?: FixturesProvider[]) {
    this.providers =
      providers && providers.length > 0
        ? providers
        : [new TheOddsApiFixturesProvider(), new FootballDataFixturesProvider()];
  }

  public async getFixtures(opts: FixturesQueryOptions): Promise<NormalizedFixture[]> {
    const rawAll: NormalizedFixture[] = [];

    for (const p of this.providers) {
      try {
        const found = await p.getFixtures(opts);
        rawAll.push(...found);
      } catch {
        // Continua
      }
    }

    return deduplicateFixtures(rawAll);
  }
}

export const defaultFixturesProvider = new CompositeFixturesProvider();
