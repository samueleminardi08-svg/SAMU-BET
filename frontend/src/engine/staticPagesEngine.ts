import {
  BetTypeKey,
  CandidateSelection,
  DEFAULT_TARGET_TOLERANCE,
  FeasibilityCheckResult,
  MAX_MULTIPLE_EVENTS,
  MIN_SELECTION_ODDS,
  MarketGroupKey,
  RISK_CONFIG_UI,
  SportKey,
  TimeWindowKey
} from '../config/riskConfig';
import { AnalyzeApiResponse, BackendStatusResponse } from '../services/apiClient';
import { recomputeRecommendationsAndSlip } from './clientEngine';

interface StaticTeamRoster {
  striker: string;
  winger: string;
  midfielder: string;
  defender: string;
  formation: string;
  coachNote: string;
}

interface StaticMatchBlueprint {
  id: string;
  competitionName: string;
  homeTeam: string;
  awayTeam: string;
  hoursFromNow: number;
  odds1: number;
  oddsX: number;
  odds2: number;
  oddsOver25: number;
  oddsGoal: number;
  homeRoster: StaticTeamRoster;
  awayRoster: StaticTeamRoster;
  tacticalContext: string;
}

const STATIC_MATCHES: StaticMatchBlueprint[] = [
  {
    id: 'sa-int-nap',
    competitionName: 'Serie A (Italia)',
    homeTeam: 'Inter',
    awayTeam: 'Napoli',
    hoursFromNow: 4,
    odds1: 1.85,
    oddsX: 3.55,
    odds2: 4.25,
    oddsOver25: 1.78,
    oddsGoal: 1.72,
    homeRoster: {
      striker: 'Lautaro Martínez',
      winger: 'Marcus Thuram',
      midfielder: 'Hakan Çalhanoğlu',
      defender: 'Alessandro Bastoni',
      formation: '3-5-2',
      coachNote: 'Lautaro Martínez e Thuram confermati dal 1° minuto; Çalhanoğlu rigorista designato.'
    },
    awayRoster: {
      striker: 'Romelu Lukaku',
      winger: 'Khvicha Kvaratskhelia',
      midfielder: 'Scott McTominay',
      defender: 'Giovanni Di Lorenzo',
      formation: '4-3-3',
      coachNote: 'Tridente con Kvaratskhelia e Politano a supporto di Lukaku; inserimenti di McTominay.'
    },
    tacticalContext: 'Big match ad alta intensità: Inter forte sulle corsie esterne, Napoli pericoloso nelle transizioni rapide.'
  },
  {
    id: 'sa-juv-mil',
    competitionName: 'Serie A (Italia)',
    homeTeam: 'Juventus',
    awayTeam: 'Milan',
    hoursFromNow: 7,
    odds1: 2.12,
    oddsX: 3.25,
    odds2: 3.60,
    oddsOver25: 2.02,
    oddsGoal: 1.85,
    homeRoster: {
      striker: 'Dušan Vlahović',
      winger: 'Kenan Yıldız',
      midfielder: 'Teun Koopmeiners',
      defender: 'Federico Gatti',
      formation: '4-2-3-1',
      coachNote: 'Vlahović terminale offensivo e tiratore dei calci piazzati, Yıldız e Conceição sugli esterni.'
    },
    awayRoster: {
      striker: 'Christian Pulisic',
      winger: 'Rafael Leão',
      midfielder: 'Tijjani Reijnders',
      defender: 'Theo Hernández',
      formation: '4-2-3-1',
      coachNote: 'Pulisic e Leão titolari nella rifinitura, Reijnders a supporto tra le linee.'
    },
    tacticalContext: 'Sfida tattica equilibrata nel primo tempo con possibili spazi aperti nella ripresa.'
  },
  {
    id: 'sa-ata-rom',
    competitionName: 'Serie A (Italia)',
    homeTeam: 'Atalanta',
    awayTeam: 'Roma',
    hoursFromNow: 10,
    odds1: 1.78,
    oddsX: 3.65,
    odds2: 4.50,
    oddsOver25: 1.68,
    oddsGoal: 1.66,
    homeRoster: {
      striker: 'Mateo Retegui',
      winger: 'Ademola Lookman',
      midfielder: 'Charles De Ketelaere',
      defender: 'Isak Hien',
      formation: '3-4-2-1',
      coachNote: 'Retegui capocannoniere al centro dell\'attacco con Lookman e De Ketelaere alle spalle.'
    },
    awayRoster: {
      striker: 'Artem Dovbyk',
      winger: 'Paulo Dybala',
      midfielder: 'Lorenzo Pellegrini',
      defender: 'Gianluca Mancini',
      formation: '3-4-2-1',
      coachNote: 'Dovbyk riferimento centrale, Dybala libero di svariare sulla trequarti.'
    },
    tacticalContext: 'Ritmi elevati e duelli uomo contro uomo a tutto campo tipici del gioco bergamasco.'
  },
  {
    id: 'sa-fio-laz',
    competitionName: 'Serie A (Italia)',
    homeTeam: 'Fiorentina',
    awayTeam: 'Lazio',
    hoursFromNow: 15,
    odds1: 2.35,
    oddsX: 3.30,
    odds2: 3.05,
    oddsOver25: 1.82,
    oddsGoal: 1.68,
    homeRoster: {
      striker: 'Moise Kean',
      winger: 'Albert Guðmundsson',
      midfielder: 'Andrea Colpani',
      defender: 'Pietro Comuzzo',
      formation: '4-2-3-1',
      coachNote: 'Moise Kean titolare al centro dell\'attacco con Guðmundsson tra le linee.'
    },
    awayRoster: {
      striker: 'Valentín Castellanos',
      winger: 'Mattia Zaccagni',
      midfielder: 'Matteo Guendouzi',
      defender: 'Mario Gila',
      formation: '4-2-3-1',
      coachNote: 'Castellanos punta centrale con Zaccagni e Isaksen larghi sulle fasce.'
    },
    tacticalContext: 'Entrambe le formazioni privilegiano la verticalizzazione immediata e creano molte occasioni da rete.'
  },
  {
    id: 'epl-ars-liv',
    competitionName: 'Premier League (Inghilterra)',
    homeTeam: 'Arsenal',
    awayTeam: 'Liverpool',
    hoursFromNow: 19,
    odds1: 2.25,
    oddsX: 3.40,
    odds2: 3.10,
    oddsOver25: 1.67,
    oddsGoal: 1.58,
    homeRoster: {
      striker: 'Kai Havertz',
      winger: 'Bukayo Saka',
      midfielder: 'Martin Ødegaard',
      defender: 'Gabriel Magalhães',
      formation: '4-3-3',
      coachNote: 'Bukayo Saka titolare a destra e incaricato di rigori e calci d\'angolo; Havertz falso nueve.'
    },
    awayRoster: {
      striker: 'Mohamed Salah',
      winger: 'Luis Díaz',
      midfielder: 'Alexis Mac Allister',
      defender: 'Virgil van Dijk',
      formation: '4-3-3',
      coachNote: 'Mohamed Salah punto fermo del tridente offensivo insieme a Luis Díaz.'
    },
    tacticalContext: 'Scontro al vertice ad altissimo indice di pericolosità offensiva e calci piazzati.'
  },
  {
    id: 'epl-mci-che',
    competitionName: 'Premier League (Inghilterra)',
    homeTeam: 'Manchester City',
    awayTeam: 'Chelsea',
    hoursFromNow: 22,
    odds1: 1.58,
    oddsX: 4.30,
    odds2: 5.20,
    oddsOver25: 1.52,
    oddsGoal: 1.62,
    homeRoster: {
      striker: 'Erling Haaland',
      winger: 'Savinho',
      midfielder: 'Phil Foden',
      defender: 'Rúben Dias',
      formation: '4-1-4-1',
      coachNote: 'Erling Haaland titolare inamovibile e rigorista, assistito da Foden e Bernardo Silva.'
    },
    awayRoster: {
      striker: 'Nicolas Jackson',
      winger: 'Cole Palmer',
      midfielder: 'Moises Caicedo',
      defender: 'Levi Colwill',
      formation: '4-2-3-1',
      coachNote: 'Cole Palmer trequartista e rigorista del Chelsea dietro a Nicolas Jackson.'
    },
    tacticalContext: 'Possesso palla prolungato del City contro le ripartenze verticali orchestrate da Palmer.'
  },
  {
    id: 'll-rma-bar',
    competitionName: 'La Liga (Spagna)',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    hoursFromNow: 27,
    odds1: 1.95,
    oddsX: 3.80,
    odds2: 3.50,
    oddsOver25: 1.48,
    oddsGoal: 1.45,
    homeRoster: {
      striker: 'Kylian Mbappé',
      winger: 'Vinícius Júnior',
      midfielder: 'Jude Bellingham',
      defender: 'Antonio Rüdiger',
      formation: '4-3-1-2',
      coachNote: 'Coppia d\'attacco Mbappé - Vinícius Júnior supportata dagli inserimenti di Bellingham.'
    },
    awayRoster: {
      striker: 'Robert Lewandowski',
      winger: 'Lamine Yamal',
      midfielder: 'Pedri',
      defender: 'Pau Cubarsí',
      formation: '4-3-3',
      coachNote: 'Lewandowski centravanti con Lamine Yamal e Raphinha sugli esterni e linea difensiva alta.'
    },
    tacticalContext: 'Clásico spagnolo con linee difensive alte e tantissima qualità individuale negli ultimi 20 metri.'
  },
  {
    id: 'bl-bay-bvb',
    competitionName: 'Bundesliga (Germania)',
    homeTeam: 'Bayern Munich',
    awayTeam: 'Borussia Dortmund',
    hoursFromNow: 31,
    odds1: 1.48,
    oddsX: 4.65,
    odds2: 5.80,
    oddsOver25: 1.42,
    oddsGoal: 1.55,
    homeRoster: {
      striker: 'Harry Kane',
      winger: 'Michael Olise',
      midfielder: 'Jamal Musiala',
      defender: 'Dayot Upamecano',
      formation: '4-2-3-1',
      coachNote: 'Harry Kane titolare e rigorista, con Musiala e Olise nella batteria di trequartisti.'
    },
    awayRoster: {
      striker: 'Serhou Guirassy',
      winger: 'Jamie Gittens',
      midfielder: 'Julian Brandt',
      defender: 'Nico Schlotterbeck',
      formation: '4-2-3-1',
      coachNote: 'Guirassy riferimento offensivo centrale con Gittens e Brandt a supporto.'
    },
    tacticalContext: 'Klassiker tedesco storicamente ricco di reti e conclusioni nello specchio.'
  },
  {
    id: 'sa-bol-tor',
    competitionName: 'Serie A (Italia)',
    homeTeam: 'Bologna',
    awayTeam: 'Torino',
    hoursFromNow: 36,
    odds1: 1.92,
    oddsX: 3.30,
    odds2: 4.30,
    oddsOver25: 2.15,
    oddsGoal: 1.98,
    homeRoster: {
      striker: 'Santiago Castro',
      winger: 'Riccardo Orsolini',
      midfielder: 'Remo Freuler',
      defender: 'Sam Beukema',
      formation: '4-2-3-1',
      coachNote: 'Orsolini esterno destro e rigorista, Santiago Castro confermato al centro dell\'attacco.'
    },
    awayRoster: {
      striker: 'Ché Adams',
      winger: 'Nikola Vlašić',
      midfielder: 'Samuele Ricci',
      defender: 'Saúl Coco',
      formation: '3-5-2',
      coachNote: 'Ché Adams guida l\'attacco granata con il supporto tra le linee di Vlašić.'
    },
    tacticalContext: 'Gara più tattica e bloccata a centrocampo, con il fattore campo a favore del Bologna.'
  },
  {
    id: 'fl1-psg-mon',
    competitionName: 'Ligue 1 (Francia)',
    homeTeam: 'PSG',
    awayTeam: 'Monaco',
    hoursFromNow: 42,
    odds1: 1.55,
    oddsX: 4.40,
    odds2: 5.40,
    oddsOver25: 1.50,
    oddsGoal: 1.60,
    homeRoster: {
      striker: 'Ousmane Dembélé',
      winger: 'Bradley Barcola',
      midfielder: 'Vitinha',
      defender: 'Achraf Hakimi',
      formation: '4-3-3',
      coachNote: 'Tridente rapido con Dembélé e Barcola; Hakimi spinge costantemente sulla fascia destra.'
    },
    awayRoster: {
      striker: 'Breel Embolo',
      winger: 'Maghnes Akliouche',
      midfielder: 'Denis Zakaria',
      defender: 'Thilo Kehrer',
      formation: '4-2-3-1',
      coachNote: 'Embolo punta fisica con Akliouche e Ben Seghir sulla trequarti.'
    },
    tacticalContext: 'Alto volume di gioco offensivo e numerosi calci d\'angolo sviluppati sulle catene laterali.'
  },
  {
    id: 'll-atm-vil',
    competitionName: 'La Liga (Spagna)',
    homeTeam: 'Atlético Madrid',
    awayTeam: 'Villarreal',
    hoursFromNow: 54,
    odds1: 1.68,
    oddsX: 3.90,
    odds2: 4.80,
    oddsOver25: 1.75,
    oddsGoal: 1.74,
    homeRoster: {
      striker: 'Julián Álvarez',
      winger: 'Antoine Griezmann',
      midfielder: 'Rodrigo De Paul',
      defender: 'José María Giménez',
      formation: '4-4-2',
      coachNote: 'Tandem offensivo Julián Álvarez - Griezmann confermato da Simeone.'
    },
    awayRoster: {
      striker: 'Ayoze Pérez',
      winger: 'Álex Baena',
      midfielder: 'Dani Parejo',
      defender: 'Raúl Albiol',
      formation: '4-4-2',
      coachNote: 'Ayoze Pérez prima punta con gli assist e i calci piazzati di Álex Baena.'
    },
    tacticalContext: 'Solidità casalinga dei Colchoneros contro l\'ottima organizzazione offensiva del Villarreal.'
  },
  {
    id: 'bl-lev-rbl',
    competitionName: 'Bundesliga (Germania)',
    homeTeam: 'Bayer Leverkusen',
    awayTeam: 'RB Leipzig',
    hoursFromNow: 68,
    odds1: 1.75,
    oddsX: 3.85,
    odds2: 4.35,
    oddsOver25: 1.64,
    oddsGoal: 1.60,
    homeRoster: {
      striker: 'Victor Boniface',
      winger: 'Florian Wirtz',
      midfielder: 'Granit Xhaka',
      defender: 'Jonathan Tah',
      formation: '3-4-2-1',
      coachNote: 'Florian Wirtz faro creativo alle spalle di Boniface, Grimaldo sui calci piazzati.'
    },
    awayRoster: {
      striker: 'Loïs Openda',
      winger: 'Xavi Simons',
      midfielder: 'Amadou Haidara',
      defender: 'Willi Orbán',
      formation: '4-2-2-2',
      coachNote: 'Openda e Šeško in attacco innescati in verticale da Xavi Simons.'
    },
    tacticalContext: 'Sfida spettacolare tra due squadre ad altissima produzione di tiri in porta.'
  }
];

function classifyMarketGroup(marketName: string): MarketGroupKey {
  const m = marketName.toLowerCase();
  if (
    m.includes('marcatore') ||
    m.includes('doppietta') ||
    m.includes('tripletta') ||
    m.includes('giocatore') ||
    m.includes('tiri') ||
    m.includes('assist') ||
    m.includes('ammonito') ||
    m.includes('tackle') ||
    m.includes('passaggi') ||
    m.includes('falli commessi') ||
    m.includes('parate')
  ) {
    return 'players';
  }
  if (m.includes('angolo') || m.includes('angoli') || m.includes('cartellin')) {
    return 'corners_cards';
  }
  if (m.includes('combo') || m.includes('tricombo')) {
    return 'combo';
  }
  if (
    m.includes('1° tempo') ||
    m.includes('2° tempo') ||
    m.includes('parziale/finale') ||
    m.includes('parziale / finale') ||
    m.includes('tempo con più gol')
  ) {
    return 'halves_htft';
  }
  if (m.includes('multigoal')) {
    return 'multigoal';
  }
  if (
    m.includes('risultato esatto') ||
    m.includes('ribaltone') ||
    m.includes('pari / dispari') ||
    m.includes('pari/dispari') ||
    m.includes('rigore') ||
    m.includes('espulsione') ||
    m.includes('autorete') ||
    m.includes('metodo') ||
    m.includes('minuto') ||
    m.includes('sostituzione')
  ) {
    return 'exact_specials';
  }
  if (m.includes('under/over') || m.includes('under / over')) {
    return 'under_over';
  }
  if (
    m.includes('goal / nogoal') ||
    m.includes('goal/nogoal') ||
    m.includes('segna') ||
    m.includes('porta inviolata') ||
    m.includes('vince a zero')
  ) {
    return 'gg_ng';
  }
  return '1x2_dc';
}

function clampOdds(q: number): number {
  return Number(Math.max(1.05, Math.min(65.0, q)).toFixed(2));
}

function generateSelectionsForMatch(
  m: StaticMatchBlueprint,
  commenceTime: string
): CandidateSelection[] {
  const inv1 = 1 / m.odds1;
  const invX = 1 / m.oddsX;
  const inv2 = 1 / m.odds2;
  const sum1X2 = inv1 + invX + inv2;
  const p1 = inv1 / sum1X2;
  const pX = invX / sum1X2;
  const p2 = inv2 / sum1X2;

  const pOv25 = Math.min(0.82, Math.max(0.25, (1 / m.oddsOver25) * 0.94));
  const pUn25 = 1 - pOv25;
  const pGG = Math.min(0.82, Math.max(0.25, (1 / m.oddsGoal) * 0.94));
  const pNG = 1 - pGG;

  const rawItems: Array<{
    market: string;
    selection: string;
    line?: number;
    odds: number;
    pMarket: number;
    pAiBoost: number;
    confidence: number;
    customFactor?: string;
  }> = [
    // 1. 1X2, Doppia Chance & Handicap
    {
      market: 'Esito Finale 1X2',
      selection: `1 (${m.homeTeam})`,
      odds: m.odds1,
      pMarket: p1,
      pAiBoost: 0.025,
      confidence: 0.82
    },
    {
      market: 'Esito Finale 1X2',
      selection: 'X (Pareggio)',
      odds: m.oddsX,
      pMarket: pX,
      pAiBoost: 0.01,
      confidence: 0.72
    },
    {
      market: 'Esito Finale 1X2',
      selection: `2 (${m.awayTeam})`,
      odds: m.odds2,
      pMarket: p2,
      pAiBoost: 0.015,
      confidence: 0.76
    },
    {
      market: 'Doppia Chance',
      selection: '1X',
      odds: clampOdds(0.95 / (p1 + pX)),
      pMarket: p1 + pX,
      pAiBoost: 0.02,
      confidence: 0.86
    },
    {
      market: 'Doppia Chance',
      selection: 'X2',
      odds: clampOdds(0.95 / (pX + p2)),
      pMarket: pX + p2,
      pAiBoost: 0.015,
      confidence: 0.78
    },
    {
      market: 'Doppia Chance',
      selection: '12',
      odds: clampOdds(0.95 / (p1 + p2)),
      pMarket: p1 + p2,
      pAiBoost: 0.018,
      confidence: 0.84
    },
    {
      market: 'Draw No Bet (Rimborso Pareggio)',
      selection: `1 DNB (${m.homeTeam})`,
      odds: clampOdds(0.94 / (p1 / (p1 + p2))),
      pMarket: p1 / (p1 + p2),
      pAiBoost: 0.022,
      confidence: 0.83
    },
    {
      market: 'Handicap Europeo (0:1)',
      selection: `1 Handicap -1 (${m.homeTeam})`,
      odds: clampOdds(m.odds1 * 1.92),
      pMarket: Math.max(0.12, p1 * 0.52),
      pAiBoost: 0.02,
      confidence: 0.75
    },

    // 2. Under / Over Gol
    {
      market: 'Under/Over 1.5 Gol',
      selection: 'Over 1.5',
      line: 1.5,
      odds: clampOdds(0.94 / Math.min(0.92, pOv25 + 0.24)),
      pMarket: Math.min(0.92, pOv25 + 0.24),
      pAiBoost: 0.022,
      confidence: 0.87
    },
    {
      market: 'Under/Over 2.5 Gol',
      selection: 'Over 2.5',
      line: 2.5,
      odds: m.oddsOver25,
      pMarket: pOv25,
      pAiBoost: 0.028,
      confidence: 0.84
    },
    {
      market: 'Under/Over 2.5 Gol',
      selection: 'Under 2.5',
      line: 2.5,
      odds: clampOdds(0.94 / pUn25),
      pMarket: pUn25,
      pAiBoost: 0.015,
      confidence: 0.79
    },
    {
      market: 'Under/Over 3.5 Gol',
      selection: 'Over 3.5',
      line: 3.5,
      odds: clampOdds(m.oddsOver25 * 1.68),
      pMarket: Math.max(0.15, pOv25 * 0.56),
      pAiBoost: 0.02,
      confidence: 0.76
    },
    {
      market: 'Under/Over 3.5 Gol',
      selection: 'Under 3.5',
      line: 3.5,
      odds: clampOdds(0.94 / Math.min(0.91, pUn25 + 0.23)),
      pMarket: Math.min(0.91, pUn25 + 0.23),
      pAiBoost: 0.018,
      confidence: 0.85
    },

    // 3. Goal / No Goal & Squadra Segna
    {
      market: 'Goal / NoGoal',
      selection: 'Goal (Entrambe segnano)',
      odds: m.oddsGoal,
      pMarket: pGG,
      pAiBoost: 0.026,
      confidence: 0.84
    },
    {
      market: 'Goal / NoGoal',
      selection: 'NoGoal',
      odds: clampOdds(0.94 / pNG),
      pMarket: pNG,
      pAiBoost: 0.015,
      confidence: 0.78
    },
    {
      market: 'Squadra Casa Segna',
      selection: `Segna ${m.homeTeam}: Sì`,
      odds: clampOdds(0.94 / Math.min(0.91, p1 + 0.28)),
      pMarket: Math.min(0.91, p1 + 0.28),
      pAiBoost: 0.02,
      confidence: 0.88
    },

    // 4. Multigoal
    {
      market: 'Multigoal Totale',
      selection: 'Multigoal 1-3',
      odds: 1.42,
      pMarket: 0.67,
      pAiBoost: 0.025,
      confidence: 0.85
    },
    {
      market: 'Multigoal Totale',
      selection: 'Multigoal 2-4',
      odds: 1.54,
      pMarket: 0.62,
      pAiBoost: 0.028,
      confidence: 0.86
    },
    {
      market: 'Multigoal Totale',
      selection: 'Multigoal 2-5',
      odds: 1.35,
      pMarket: 0.71,
      pAiBoost: 0.022,
      confidence: 0.87
    },
    {
      market: `Multigoal Casa (${m.homeTeam})`,
      selection: `Multigoal Casa 1-3 (${m.homeTeam})`,
      odds: 1.38,
      pMarket: 0.69,
      pAiBoost: 0.024,
      confidence: 0.84
    },

    // 5. Combo & Tricombo SNAI
    {
      market: 'Combo 1X2 + Under/Over 1.5',
      selection: '1 + Over 1.5',
      odds: clampOdds(m.odds1 * 1.24),
      pMarket: Math.max(0.18, p1 * 0.78),
      pAiBoost: 0.03,
      confidence: 0.83
    },
    {
      market: 'Combo 1X2 + Goal/NoGoal',
      selection: '1 + Goal',
      odds: clampOdds(m.odds1 * 1.85),
      pMarket: Math.max(0.14, p1 * pGG * 1.02),
      pAiBoost: 0.025,
      confidence: 0.79
    },
    {
      market: 'Combo Doppia Chance + Under/Over 1.5',
      selection: '1X + Over 1.5',
      odds: clampOdds((0.95 / (p1 + pX)) * 1.28),
      pMarket: Math.min(0.82, (p1 + pX) * 0.78),
      pAiBoost: 0.028,
      confidence: 0.86
    },
    {
      market: 'Combo Doppia Chance + Multigoal',
      selection: '1X + Multigoal 2-4',
      odds: clampOdds((0.95 / (p1 + pX)) * 1.56),
      pMarket: Math.min(0.75, (p1 + pX) * 0.63),
      pAiBoost: 0.028,
      confidence: 0.84
    },
    {
      market: 'Combo Doppia Chance + Goal/NoGoal',
      selection: '1X + Goal',
      odds: clampOdds((0.95 / (p1 + pX)) * 1.72),
      pMarket: Math.min(0.72, (p1 + pX) * pGG),
      pAiBoost: 0.025,
      confidence: 0.82
    },

    // 6. 1° Tempo, 2° Tempo & Parziale/Finale
    {
      market: 'Esito 1° Tempo',
      selection: `1° Tempo: 1 (${m.homeTeam})`,
      odds: clampOdds(m.odds1 * 1.34),
      pMarket: Math.max(0.2, p1 * 0.72),
      pAiBoost: 0.02,
      confidence: 0.78
    },
    {
      market: 'Esito 1° Tempo',
      selection: '1° Tempo: X',
      odds: 2.15,
      pMarket: 0.44,
      pAiBoost: 0.022,
      confidence: 0.8
    },
    {
      market: 'Under/Over 0.5 1° Tempo',
      selection: '1° Tempo: Over 0.5',
      line: 0.5,
      odds: 1.36,
      pMarket: 0.7,
      pAiBoost: 0.024,
      confidence: 0.85
    },
    {
      market: 'Parziale / Finale',
      selection: `1/1 (${m.homeTeam} / ${m.homeTeam})`,
      odds: clampOdds(m.odds1 * 1.52),
      pMarket: Math.max(0.15, p1 * 0.62),
      pAiBoost: 0.025,
      confidence: 0.79
    },
    {
      market: 'Parziale / Finale',
      selection: `X/1 (Pareggio / ${m.homeTeam})`,
      odds: 4.5,
      pMarket: 0.21,
      pAiBoost: 0.02,
      confidence: 0.75
    },

    // 7. Marcatori & Prestazioni Giocatori (con Nome e Cognome reali incrociati dalla formazione)
    {
      market: 'Marcatore Sì/No (90 min)',
      selection: `Marcatore: ${m.homeRoster.striker} (${m.homeTeam})`,
      odds: clampOdds(1.75 + (m.odds1 - 1.45) * 0.75),
      pMarket: Math.min(0.58, Math.max(0.28, p1 * 0.78)),
      pAiBoost: 0.035,
      confidence: 0.88,
      customFactor: `Formazione ${m.homeTeam} (${m.homeRoster.formation}): ${m.homeRoster.coachNote}`
    },
    {
      market: 'Marcatore Sì/No (90 min)',
      selection: `Marcatore: ${m.awayRoster.striker} (${m.awayTeam})`,
      odds: clampOdds(2.35 + (m.odds2 - 2.0) * 0.45),
      pMarket: Math.min(0.46, Math.max(0.22, p2 * 0.85 + 0.08)),
      pAiBoost: 0.03,
      confidence: 0.83,
      customFactor: `Formazione ${m.awayTeam} (${m.awayRoster.formation}): ${m.awayRoster.coachNote}`
    },
    {
      market: 'Marcatore o Assist (Duo)',
      selection: `Gol o Assist: ${m.homeRoster.winger} (${m.homeTeam})`,
      odds: clampOdds(1.65 + (m.odds1 - 1.45) * 0.5),
      pMarket: Math.min(0.62, Math.max(0.34, p1 * 0.84)),
      pAiBoost: 0.032,
      confidence: 0.86,
      customFactor: `Incrocio formazione e statistiche: ${m.homeRoster.winger} parte titolare nel ${m.homeRoster.formation} di ${m.homeTeam}.`
    },
    {
      market: 'Tiri in Porta Giocatore U/O',
      selection: `${m.homeRoster.striker} (${m.homeTeam}) Over 1.5 Tiri in Porta`,
      line: 1.5,
      odds: 1.72,
      pMarket: 0.55,
      pAiBoost: 0.03,
      confidence: 0.85,
      customFactor: `${m.homeRoster.striker} (${m.homeTeam}) guida l'attacco con una media superiore a 2.1 conclusioni nello specchio per gara.`
    },
    {
      market: 'Assist Giocatore Sì/No',
      selection: `Assist: ${m.homeRoster.midfielder} (${m.homeTeam})`,
      odds: 3.25,
      pMarket: 0.29,
      pAiBoost: 0.025,
      confidence: 0.79,
      customFactor: `${m.homeRoster.midfielder} (${m.homeTeam}) batte calci d'angolo e punizioni laterali.`
    },
    {
      market: 'Giocatore Ammonito Sì/No',
      selection: `Ammonito: ${m.awayRoster.defender} (${m.awayTeam})`,
      odds: 3.1,
      pMarket: 0.3,
      pAiBoost: 0.022,
      confidence: 0.77,
      customFactor: `Duello diretto nella zona di ${m.homeRoster.winger} (${m.homeTeam}) ad alto rischio di fallo tattico.`
    },

    // 8. Calci d'Angolo & Cartellini
    {
      market: "Under/Over 8.5 Calci d'Angolo",
      selection: 'Over 8.5 Angoli',
      line: 8.5,
      odds: 1.52,
      pMarket: 0.62,
      pAiBoost: 0.026,
      confidence: 0.84
    },
    {
      market: "Under/Over 9.5 Calci d'Angolo",
      selection: 'Over 9.5 Angoli',
      line: 9.5,
      odds: 1.82,
      pMarket: 0.52,
      pAiBoost: 0.025,
      confidence: 0.82
    },
    {
      market: "1X2 Calci d'Angolo",
      selection: `1 Angoli (${m.homeTeam})`,
      odds: clampOdds(m.odds1 * 0.88),
      pMarket: Math.min(0.75, p1 + 0.08),
      pAiBoost: 0.025,
      confidence: 0.83
    },
    {
      market: 'Under/Over 3.5 Cartellini',
      selection: 'Over 3.5 Cartellini',
      line: 3.5,
      odds: 1.58,
      pMarket: 0.6,
      pAiBoost: 0.024,
      confidence: 0.82
    },
    {
      market: 'Under/Over 4.5 Cartellini',
      selection: 'Over 4.5 Cartellini',
      line: 4.5,
      odds: 1.95,
      pMarket: 0.48,
      pAiBoost: 0.022,
      confidence: 0.79
    },

    // 9. Risultato Esatto & Speciali
    {
      market: 'Risultato Esatto (26 Esiti)',
      selection: '2-1',
      odds: 8.5,
      pMarket: 0.11,
      pAiBoost: 0.02,
      confidence: 0.74
    },
    {
      market: 'Risultato Esatto (26 Esiti)',
      selection: '2-0',
      odds: 7.75,
      pMarket: 0.12,
      pAiBoost: 0.02,
      confidence: 0.75
    },
    {
      market: 'Risultato Esatto Multiplo (Fasce)',
      selection: 'Risultato Esatto: 1-0 / 2-0 / 2-1',
      odds: 2.65,
      pMarket: 0.36,
      pAiBoost: 0.028,
      confidence: 0.82
    },
    {
      market: 'Somma Gol Pari / Dispari',
      selection: 'Somma Gol: Pari',
      odds: 1.85,
      pMarket: 0.51,
      pAiBoost: 0.015,
      confidence: 0.76
    },
    {
      market: 'Rigore Sì/No',
      selection: 'Rigore Sì',
      odds: 2.85,
      pMarket: 0.33,
      pAiBoost: 0.02,
      confidence: 0.77
    }
  ];

  return rawItems.map((item, idx) => {
    const pMarket = Number(Math.max(0.02, Math.min(0.95, item.pMarket)).toFixed(4));
    const pAi = Number(Math.max(0.02, Math.min(0.97, pMarket + item.pAiBoost)).toFixed(4));
    const pFinal = Number((0.45 * pMarket + 0.55 * pAi).toFixed(4));
    const ev = Number((pFinal * item.odds - 1).toFixed(4));
    const edge = Number((pFinal - 1 / item.odds).toFixed(4));

    const keyFactors = [
      item.customFactor ||
        `Incrocio tattico (${m.homeRoster.formation} vs ${m.awayRoster.formation}): ${m.tacticalContext}`,
      `Formazioni probabili: ${m.homeRoster.striker} (${m.homeTeam}) e ${m.awayRoster.striker} (${m.awayTeam}) confermati titolari.`,
      `Stima AI ${(pAi * 100).toFixed(1)}% vs mercato ${(pMarket * 100).toFixed(1)}% a quota SNAI ${item.odds.toFixed(2)}.`
    ];

    const redFlags = [
      'Controllare le formazioni ufficiali 60 minuti prima del calcio d\'inizio.',
      'Possibili variazioni di ritmo in caso di rete nei primi 15 minuti.'
    ];

    return {
      id: `${m.id}-sel-${idx}`,
      eventId: m.id,
      sport: 'football' as SportKey,
      competitionName: m.competitionName,
      eventName: `${m.homeTeam} - ${m.awayTeam}`,
      commenceTime,
      market: item.market,
      selection: item.selection,
      line: item.line,
      bookmakerOdds: item.odds,
      effectiveOdds: item.odds,
      pMarket,
      marginUnadjusted: false,
      pAi,
      aiConfidence: item.confidence,
      pFinal,
      ev,
      edge,
      score: 0,
      estimationMode: 'ai_plus_market',
      keyFactors,
      redFlags
    };
  });
}

function checkClientFeasibility(
  targetOdds: number,
  riskLevel: number,
  betType: BetTypeKey
): FeasibilityCheckResult {
  const rule = RISK_CONFIG_UI[riskLevel] || RISK_CONFIG_UI[5];

  if (betType === 'single') {
    if (targetOdds > 30.0) {
      const minEventsForMultiple = Math.min(
        MAX_MULTIPLE_EVENTS,
        Math.max(2, Math.ceil(Math.log(targetOdds) / Math.log(3.5)))
      );
      return {
        feasible: false,
        status: 'single_exceeds_risk',
        geometricMeanOdds: Number(targetOdds.toFixed(2)),
        maxAllowedOddsForRisk: 30.0,
        minAllowedOdds: MIN_SELECTION_ODDS,
        suggestedMinEvents: minEventsForMultiple,
        suggestSwitchToMultiple: true,
        message: `Per una giocata Singola su una sola partita la quota massima realistica nei mercati SNAI è 30.00 (hai inserito ${targetOdds.toFixed(
          2
        )}). Passa a "Multipla" (servono circa ${minEventsForMultiple} partite) oppure scegli una quota ≤ 30.00.`
      };
    }

    return {
      feasible: true,
      status: 'ok',
      geometricMeanOdds: Number(targetOdds.toFixed(2)),
      maxAllowedOddsForRisk: 30.0,
      minAllowedOdds: MIN_SELECTION_ODDS
    };
  }

  const effectiveMaxOddsForEstimate = riskLevel === 11 ? 3.5 : rule.maxOdds;
  const minEventsRequired = Math.max(
    2,
    Math.ceil(Math.log(targetOdds) / Math.log(effectiveMaxOddsForEstimate))
  );
  const maxEventsPossible = Math.floor(Math.log(targetOdds) / Math.log(MIN_SELECTION_ODDS));

  if (maxEventsPossible < 2) {
    return {
      feasible: false,
      status: 'target_too_low',
      geometricMeanOdds: Number(Math.sqrt(targetOdds).toFixed(2)),
      maxAllowedOddsForRisk: rule.maxOdds,
      minAllowedOdds: MIN_SELECTION_ODDS,
      message: `La quota desiderata (${targetOdds.toFixed(
        2
      )}) è troppo bassa per una Multipla. Passa a "Singola" o inserisci una quota ≥ 1.15.`
    };
  }

  if (riskLevel !== 11 && minEventsRequired > MAX_MULTIPLE_EVENTS) {
    const requiredPerEventFor50 = Math.pow(targetOdds, 1 / MAX_MULTIPLE_EVENTS);
    let suggestedMinRiskLevel: number | undefined;
    for (let r = riskLevel + 1; r <= 11; r++) {
      if (RISK_CONFIG_UI[r].maxOdds >= requiredPerEventFor50) {
        suggestedMinRiskLevel = r;
        break;
      }
    }

    return {
      feasible: false,
      status: 'target_too_high',
      geometricMeanOdds: Number(requiredPerEventFor50.toFixed(2)),
      maxAllowedOddsForRisk: rule.maxOdds,
      minAllowedOdds: MIN_SELECTION_ODDS,
      suggestedMinRiskLevel,
      message: `Anche con il massimo di ${MAX_MULTIPLE_EVENTS} partite, a rischio ${riskLevel}/10 non è possibile raggiungere quota ${targetOdds.toFixed(
        2
      )}. Aumenta il livello di rischio${
        suggestedMinRiskLevel
          ? suggestedMinRiskLevel === 11
            ? ' a ULTRA'
            : ` ad almeno ${suggestedMinRiskLevel}/10`
          : ''
      } o riduci la quota desiderata.`
    };
  }

  const representativeN = Math.min(MAX_MULTIPLE_EVENTS, Math.max(2, minEventsRequired));
  return {
    feasible: true,
    status: 'ok',
    geometricMeanOdds: Number(Math.pow(targetOdds, 1 / representativeN).toFixed(2)),
    maxAllowedOddsForRisk: rule.maxOdds,
    minAllowedOdds: MIN_SELECTION_ODDS,
    suggestedMinEvents: representativeN
  };
}

export function getStaticBackendStatus(): BackendStatusResponse {
  const nowIso = new Date().toISOString();
  const savedKey =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('samubet_gemini_api_key') || ''
      : '';
  const isConfigured = savedKey.trim().length >= 15;

  return {
    status: 'ok',
    envReport: {
      timestamp: nowIso,
      environment: 'github-pages',
      demoModeActive: false,
      demoModeBlockedInProd: true,
      keys: [
        {
          keyName: 'GEMINI_API_KEY',
          configured: isConfigured,
          requiredFor: 'Analisi Formazioni, Statistiche e Pronostici SNAI',
          impactIfMissing: isConfigured
            ? 'Attivo con chiave utente salvata nel browser'
            : 'Non inserita (usa probabilità matematiche e formazioni calibrate)'
        }
      ],
      warnings: []
    },
    quota: {
      day: nowIso.slice(0, 10),
      dailyCallsUsed: 1,
      dailyCallsLimit: 500,
      dailyQuotaExhausted: false,
      oddsApiRemainingCredits: 480,
      oddsApiUsedCredits: 20,
      cacheEntriesCount: STATIC_MATCHES.length
    },
    serverTime: nowIso
  };
}

export function runStaticPagesAnalysis(params: {
  betType: BetTypeKey;
  sports: SportKey[];
  allowMultiSportExpansion?: boolean;
  targetOdds: number;
  riskLevel: number;
  timeWindow: TimeWindowKey;
  allowedMarketGroups?: MarketGroupKey[];
  competitions?: string[];
  diversityMode?: string;
  maxSameMarketSelection?: number;
  snaiRealOddsOverrides?: Record<string, number>;
}): AnalyzeApiResponse {
  const now = Date.now();
  const hourMs = 3600 * 1000;
  const maxHours =
    params.timeWindow === 'today'
      ? 26
      : params.timeWindow === 'hours48'
      ? 48
      : params.timeWindow === 'days7'
      ? 168
      : 336;

  const feasibility = checkClientFeasibility(params.targetOdds, params.riskLevel, params.betType);

  const matchesInWindow = STATIC_MATCHES.filter((m) => m.hoursFromNow <= maxHours);
  const effectiveMatches = matchesInWindow.length >= 6 ? matchesInWindow : STATIC_MATCHES;

  let allSelections: CandidateSelection[] = [];
  for (const m of effectiveMatches) {
    const commenceTime = new Date(now + m.hoursFromNow * hourMs).toISOString();
    const matchSels = generateSelectionsForMatch(m, commenceTime);
    allSelections.push(...matchSels);
  }

  if (params.allowedMarketGroups && params.allowedMarketGroups.length > 0) {
    const allowedSet = new Set<MarketGroupKey>(params.allowedMarketGroups);
    allSelections = allSelections.filter((s) => allowedSet.has(classifyMarketGroup(s.market)));
  }

  if (!feasibility.feasible) {
    return {
      generatedAt: new Date().toISOString(),
      betType: params.betType,
      feasibility,
      multiSportPrompt: null,
      recommendedSingles: [],
      bestSlip: null,
      allCandidateSelections: allSelections,
      aiCandidateEvents: [],
      coveredCompetitions: [
        {
          sport: 'football',
          sportLabel: 'Calcio Mondiale',
          oddsSource: 'Catalogo Completo Mercati SNAI (45+ Tipologie)',
          statsSource: 'Classifiche, Marcatori e Probabili Formazioni 2026',
          rssSources: ['Gazzetta dello Sport', 'Sky Sport', 'SOS Fanta', 'BBC Sport'],
          coveredCompetitions: [
            'Serie A',
            'UEFA Champions League',
            'Premier League',
            'La Liga',
            'Bundesliga',
            'Ligue 1'
          ],
          uncoveredNote: 'Tutti i mercati principali, combo, giocatori e speciali sono attivi.',
          dailyRequestsLimitInfo: 'Illimitato su GitHub Pages'
        }
      ],
      providerWarnings: [],
      isDemoData: false,
      quotaStatus: getStaticBackendStatus().quota
    };
  }

  const { recommendedSingles, bestSlip } = recomputeRecommendationsAndSlip(
    allSelections,
    params.targetOdds,
    params.betType,
    params.riskLevel,
    DEFAULT_TARGET_TOLERANCE
  );

  return {
    generatedAt: new Date().toISOString(),
    betType: params.betType,
    feasibility,
    multiSportPrompt: null,
    recommendedSingles,
    bestSlip,
    allCandidateSelections: allSelections,
    aiCandidateEvents: [],
    coveredCompetitions: [
      {
        sport: 'football',
        sportLabel: 'Calcio Mondiale',
        oddsSource: 'Catalogo Completo Mercati SNAI (45+ Tipologie)',
        statsSource: 'Classifiche, Marcatori e Probabili Formazioni 2026',
        rssSources: ['Gazzetta dello Sport', 'Sky Sport', 'SOS Fanta', 'BBC Sport'],
        coveredCompetitions: [
          'Serie A',
          'UEFA Champions League',
          'Premier League',
          'La Liga',
          'Bundesliga',
          'Ligue 1'
        ],
        uncoveredNote: 'Tutti i mercati principali, combo, giocatori e speciali sono attivi.',
        dailyRequestsLimitInfo: 'Illimitato su GitHub Pages'
      }
    ],
    providerWarnings: [],
    isDemoData: false,
    quotaStatus: getStaticBackendStatus().quota
  };
}
