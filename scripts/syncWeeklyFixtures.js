const fs = require('fs');
const path = require('path');

const LEAGUES = [
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

function americanToDecimal(str) {
  if (!str) return null;
  const num = parseInt(str, 10);
  if (isNaN(num)) return null;
  if (num > 0) return Number((1 + num / 100).toFixed(2));
  return Number((1 + 100 / Math.abs(num)).toFixed(2));
}

async function syncFixtures() {
  const now = Date.now();
  const dateStrings = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now + i * 24 * 3600 * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    dateStrings.push(`${y}${m}${day}`);
  }

  console.log('Fetching live fixtures for dates:', dateStrings);
  const allMatches = [];

  for (const lg of LEAGUES) {
    for (const ds of dateStrings) {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg.espnSlug}/scoreboard?dates=${ds}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.events || !Array.isArray(data.events)) continue;

        for (const ev of data.events) {
          const comp = ev.competitions && ev.competitions[0];
          if (!comp) continue;
          const home = comp.competitors && comp.competitors.find(c => c.homeAway === 'home');
          const away = comp.competitors && comp.competitors.find(c => c.homeAway === 'away');
          if (!home || !away) continue;

          const homeName = home.team.displayName || home.team.name || 'Casa';
          const awayName = away.team.displayName || away.team.name || 'Trasferta';
          const kickoff = ev.date || new Date(now + 12 * 3600 * 1000).toISOString();

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

          allMatches.push({
            id: `espn-${ev.id || `${homeName}-${awayName}`.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            competitionId: lg.competitionId,
            competitionName: lg.competitionName,
            country: lg.country,
            type: lg.type,
            homeTeam: homeName,
            awayTeam: awayName,
            kickoffTimeUTC: kickoff,
            hoursFromNow: Math.max(0, Math.round((new Date(kickoff).getTime() - now) / (3600 * 1000))),
            odds1,
            oddsX,
            odds2,
            oddsOver25: oddsOv25,
            oddsGoal,
            homeRoster: {
              striker: `Punta #${homeName}`,
              winger: `Esterno #${homeName}`,
              midfielder: `Regista #${homeName}`,
              defender: `Difensore #${homeName}`,
              formation: '4-3-3',
              coachNote: `Formazione tipo di ${homeName} per ${lg.competitionName}.`
            },
            awayRoster: {
              striker: `Punta #${awayName}`,
              winger: `Esterno #${awayName}`,
              midfielder: `Regista #${awayName}`,
              defender: `Difensore #${awayName}`,
              formation: '4-3-3',
              coachNote: `Formazione tipo di ${awayName} per ${lg.competitionName}.`
            },
            tacticalContext: `Incontro ufficiale di ${lg.competitionName} tra ${homeName} e ${awayName}.`
          });
        }
      } catch (e) {
        // continue
      }
    }
  }

  console.log(`Fetched ${allMatches.length} raw matches from ESPN.`);
  if (allMatches.length < 5) {
    console.log('Not enough matches found. Keeping existing static blueprint.');
    return;
  }

  // Deduplica
  const uniqueMap = new Map();
  for (const m of allMatches) {
    const key = `${m.competitionId}-${m.homeTeam}-${m.awayTeam}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, m);
    }
  }
  const cleanMatches = Array.from(uniqueMap.values());
  console.log(`Unique clean matches: ${cleanMatches.length}`);

  const targetPath = path.join(__dirname, '../frontend/src/engine/staticPagesEngine.ts');
  let code = fs.readFileSync(targetPath, 'utf8');

  const p1 = code.indexOf('export const STATIC_MATCHES: StaticMatchBlueprint[] = [');
  const p2 = code.indexOf('function classifyMarketGroup(marketName: string): MarketGroupKey {');

  if (p1 !== -1 && p2 !== -1) {
    const newCode = 'export const STATIC_MATCHES: StaticMatchBlueprint[] = ' + JSON.stringify(cleanMatches, null, 2) + ';\n\n';
    code = code.slice(0, p1) + newCode + code.slice(p2);
    fs.writeFileSync(targetPath, code, 'utf8');
    console.log('staticPagesEngine.ts successfully updated with upcoming weekly fixtures!');
  } else {
    console.warn('Could not find STATIC_MATCHES boundaries in staticPagesEngine.ts');
  }
}

syncFixtures();
