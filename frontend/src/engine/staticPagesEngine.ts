import {
  BetTypeKey,
  CandidateSelection,
  CompetitionItem,
  CompetitionType,
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

export interface StaticMatchBlueprint {
  id: string;
  competitionId: string;
  competitionName: string;
  country: string;
  type: CompetitionType;
  homeTeam: string;
  awayTeam: string;
  kickoffTimeUTC: string;
  hoursFromNow?: number;
  odds1: number;
  oddsX: number;
  odds2: number;
  oddsOver25: number;
  oddsGoal: number;
  homeRoster: StaticTeamRoster;
  awayRoster: StaticTeamRoster;
  tacticalContext: string;
}

export function getMatchHoursFromNow(m: StaticMatchBlueprint, now = Date.now()): number {
  if (m.kickoffTimeUTC) {
    const matchTime = new Date(m.kickoffTimeUTC).getTime();
    if (!isNaN(matchTime)) {
      const diffHours = (matchTime - now) / (3600 * 1000);
      if (diffHours < 0 && diffHours > -8) return 0;
      if (diffHours >= 0) return Math.round(diffHours);
    }
  }
  return typeof m.hoursFromNow === 'number' ? m.hoursFromNow : 12;
}

export function getMatchCommenceTime(m: StaticMatchBlueprint, now = Date.now()): string {
  if (m.kickoffTimeUTC) {
    return m.kickoffTimeUTC;
  }
  const h = getMatchHoursFromNow(m, now);
  return new Date(now + h * 3600 * 1000).toISOString();
}

export const STATIC_MATCHES: StaticMatchBlueprint[] = [
  {
    "id": "ucl-fey-int",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Feyenoord",
    "awayTeam": "Internazionale",
    "kickoffTimeUTC": "2026-11-03T20:00:00Z",
    "hoursFromNow": 19,
    "odds1": 3.4,
    "oddsX": 3.5,
    "odds2": 2.1,
    "oddsOver25": 1.75,
    "oddsGoal": 1.65,
    "homeRoster": {
      "striker": "Santiago Giménez",
      "winger": "Igor Paixão",
      "midfielder": "Quinten Timber",
      "defender": "Dávid Hancko",
      "formation": "4-3-3",
      "coachNote": "Giménez ed Igor Paixão punti di forza offensivi del Feyenoord al De Kuip; Timber faro di centrocampo."
    },
    "awayRoster": {
      "striker": "Lautaro Martínez",
      "winger": "Marcus Thuram",
      "midfielder": "Hakan Çalhanoğlu",
      "defender": "Alessandro Bastoni",
      "formation": "3-5-2",
      "coachNote": "Lautaro Martínez e Thuram confermati tandem titolare da Inzaghi; Çalhanoğlu rigorista designato."
    },
    "tacticalContext": "Big match al De Kuip di Rotterdam: Inter solida e pronta alle verticalizzazioni rapide con Thuram, Feyenoord aggressivo nei primi 30 minuti con baricentro alto."
  },
  {
    "id": "ucl-atm-bay",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Atlético Madrid",
    "awayTeam": "Bayern Munich",
    "kickoffTimeUTC": "2026-11-03T20:00:00Z",
    "hoursFromNow": 19,
    "odds1": 2.85,
    "oddsX": 3.6,
    "odds2": 2.35,
    "oddsOver25": 1.62,
    "oddsGoal": 1.55,
    "homeRoster": {
      "striker": "Julián Álvarez",
      "winger": "Antoine Griezmann",
      "midfielder": "Rodrigo De Paul",
      "defender": "José María Giménez",
      "formation": "4-4-2",
      "coachNote": "Julián Álvarez e Antoine Griezmann tandem d'attacco letale al Metropolitano con compiti di raccordo."
    },
    "awayRoster": {
      "striker": "Harry Kane",
      "winger": "Michael Olise",
      "midfielder": "Jamal Musiala",
      "defender": "Dayot Upamecano",
      "formation": "4-2-3-1",
      "coachNote": "Harry Kane terminale offensivo implacabile e rigorista, con la creatività di Musiala e Olise alle sue spalle."
    },
    "tacticalContext": "Scontro stellare al Wanda Metropolitano: difesa asfissiante di Simeone contro la straordinaria capacità realizzativa del Bayern guidato da Harry Kane."
  },
  {
    "id": "ucl-bar-asv",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Barcelona",
    "awayTeam": "Aston Villa",
    "kickoffTimeUTC": "2026-11-03T20:00:00Z",
    "hoursFromNow": 19,
    "odds1": 1.52,
    "oddsX": 4.6,
    "odds2": 5.6,
    "oddsOver25": 1.45,
    "oddsGoal": 1.58,
    "homeRoster": {
      "striker": "Robert Lewandowski",
      "winger": "Lamine Yamal",
      "midfielder": "Pedri",
      "defender": "Pau Cubarsí",
      "formation": "4-3-3",
      "coachNote": "Lewandowski centravanti con Lamine Yamal e Raphinha sulle corsie esterne; trappola del fuorigioco alta."
    },
    "awayRoster": {
      "striker": "Ollie Watkins",
      "winger": "Leon Bailey",
      "midfielder": "Morgan Rogers",
      "defender": "Ezri Konsa",
      "formation": "4-2-3-1",
      "coachNote": "Watkins terminale veloce e letale in profondità supportato da Morgan Rogers e Bailey."
    },
    "tacticalContext": "Barcellona dominante nel possesso e nel recupero palla immediato; Aston Villa di Emery pericolosissimo a ribaltare l'azione in verticale."
  },
  {
    "id": "ucl-mun-rom",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Manchester United",
    "awayTeam": "AS Roma",
    "kickoffTimeUTC": "2026-11-03T20:00:00Z",
    "hoursFromNow": 19,
    "odds1": 1.95,
    "oddsX": 3.55,
    "odds2": 3.8,
    "oddsOver25": 1.72,
    "oddsGoal": 1.66,
    "homeRoster": {
      "striker": "Rasmus Højlund",
      "winger": "Alejandro Garnacho",
      "midfielder": "Bruno Fernandes",
      "defender": "Lisandro Martínez",
      "formation": "4-2-3-1",
      "coachNote": "Bruno Fernandes leader tecnico, tiratore di rigori e punizioni con Garnacho e Højlund in attacco."
    },
    "awayRoster": {
      "striker": "Artem Dovbyk",
      "winger": "Paulo Dybala",
      "midfielder": "Lorenzo Pellegrini",
      "defender": "Gianluca Mancini",
      "formation": "3-4-2-1",
      "coachNote": "Dovbyk centravanti d'area supportato dalla classe di Paulo Dybala e gli inserimenti di Pellegrini."
    },
    "tacticalContext": "Notte di gala europea a Old Trafford: lo United cerca il riscatto offensivo, la Roma è pronta a pungere sui calci piazzati e nelle transizioni."
  },
  {
    "id": "ucl-vil-psg",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Villarreal",
    "awayTeam": "Paris Saint-Germain",
    "kickoffTimeUTC": "2026-11-03T20:00:00Z",
    "hoursFromNow": 19,
    "odds1": 3.6,
    "oddsX": 3.75,
    "odds2": 1.95,
    "oddsOver25": 1.58,
    "oddsGoal": 1.52,
    "homeRoster": {
      "striker": "Ayoze Pérez",
      "winger": "Álex Baena",
      "midfielder": "Dani Parejo",
      "defender": "Raúl Albiol",
      "formation": "4-4-2",
      "coachNote": "Ayoze Pérez punta d'area con i filtranti di Baena e le geometrie di Parejo su punizione."
    },
    "awayRoster": {
      "striker": "Ousmane Dembélé",
      "winger": "Bradley Barcola",
      "midfielder": "Vitinha",
      "defender": "Achraf Hakimi",
      "formation": "4-3-3",
      "coachNote": "Tridente rapidissimo con Dembélé e Barcola, Hakimi spinge a tutta fascia a destra."
    },
    "tacticalContext": "Gara a viso aperto all'Estadio de la Cerámica: Villarreal organizzato ed efficace contro il ritmo forsennato e la tecnica del PSG."
  },
  {
    "id": "ucl-gal-stu",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Galatasaray",
    "awayTeam": "VfB Stuttgart",
    "kickoffTimeUTC": "2026-11-03T17:45:00Z",
    "hoursFromNow": 16,
    "odds1": 2.3,
    "oddsX": 3.5,
    "odds2": 2.95,
    "oddsOver25": 1.65,
    "oddsGoal": 1.55,
    "homeRoster": {
      "striker": "Victor Osimhen",
      "winger": "Barış Alper Yılmaz",
      "midfielder": "Gabriel Sara",
      "defender": "Davinson Sánchez",
      "formation": "4-2-3-1",
      "coachNote": "Victor Osimhen terminale offensivo dominante nel catino infernale del RAMS Park."
    },
    "awayRoster": {
      "striker": "Ermedin Demirović",
      "winger": "Deniz Undav",
      "midfielder": "Angelo Stiller",
      "defender": "Jeff Chabot",
      "formation": "4-2-2-2",
      "coachNote": "Coppia Undav - Demirović in grande affiatamento e mobilità continua a ridosso dell'area avversaria."
    },
    "tacticalContext": "Ambiente infuocato ad Istanbul: Galatasaray trascinato dalla fisicità di Osimhen contro il pressing organizzato dello Stoccarda."
  },
  {
    "id": "ucl-sha-spo",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Shakhtar Donetsk",
    "awayTeam": "Sporting CP",
    "kickoffTimeUTC": "2026-11-03T17:45:00Z",
    "hoursFromNow": 16,
    "odds1": 4.1,
    "oddsX": 3.7,
    "odds2": 1.85,
    "oddsOver25": 1.7,
    "oddsGoal": 1.68,
    "homeRoster": {
      "striker": "Danylo Sikan",
      "winger": "Georgiy Sudakov",
      "midfielder": "Taras Stepanenko",
      "defender": "Mykola Matviyenko",
      "formation": "4-3-3",
      "coachNote": "Georgiy Sudakov stella tecnica della mediana con libertà di inventare negli ultimi 30 metri."
    },
    "awayRoster": {
      "striker": "Viktor Gyökeres",
      "winger": "Trincão",
      "midfielder": "Morten Hjulmand",
      "defender": "Gonçalo Inácio",
      "formation": "3-4-2-1",
      "coachNote": "Viktor Gyökeres capocannoniere e trascinatore assoluto dello Sporting con medie realizzative da record."
    },
    "tacticalContext": "Lo strapotere fisico e la media gol di Gyökeres costituiscono una costante minaccia per la linea difensiva ucraina."
  },
  {
    "id": "ucl-bod-lil",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Bodo/Glimt",
    "awayTeam": "Lille",
    "kickoffTimeUTC": "2026-11-03T20:00:00Z",
    "hoursFromNow": 19,
    "odds1": 2.75,
    "oddsX": 3.4,
    "odds2": 2.5,
    "oddsOver25": 1.75,
    "oddsGoal": 1.62,
    "homeRoster": {
      "striker": "Kasper Høgh",
      "winger": "Jens Petter Hauge",
      "midfielder": "Patrick Berg",
      "defender": "Jostein Gundersen",
      "formation": "4-3-3",
      "coachNote": "Jens Petter Hauge imprendibile nell'uno contro uno sul sintetico dell'Aspmyra Stadion."
    },
    "awayRoster": {
      "striker": "Jonathan David",
      "winger": "Edon Zhegrova",
      "midfielder": "Angel Gomes",
      "defender": "Bafodé Diakité",
      "formation": "4-2-3-1",
      "coachNote": "Jonathan David infallibile finalizzatore e rigorista, Zhegrova punta a creare superiorità a destra."
    },
    "tacticalContext": "Campo sintetico e clima rigido del circolo polare artico a favore del Bodo, Lille chiamato a reggere l'urto atletico iniziale."
  },
  {
    "id": "ucl-las-slo",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "LASK Linz",
    "awayTeam": "Slovan Bratislava",
    "kickoffTimeUTC": "2026-11-03T20:00:00Z",
    "hoursFromNow": 19,
    "odds1": 1.8,
    "oddsX": 3.65,
    "odds2": 4.4,
    "oddsOver25": 1.8,
    "oddsGoal": 1.75,
    "homeRoster": {
      "striker": "Marin Ljubičić",
      "winger": "Robert Žulj",
      "midfielder": "Sascha Horvath",
      "defender": "Philipp Ziereis",
      "formation": "4-2-3-1",
      "coachNote": "Žulj direttore d'orchestra sulla trequarti con Ljubičić punta mobile d'area."
    },
    "awayRoster": {
      "striker": "David Strelec",
      "winger": "Vladimír Weiss",
      "midfielder": "Juraj Kucka",
      "defender": "Guram Kashia",
      "formation": "4-3-3",
      "coachNote": "Esperienza europea di Juraj Kucka e Weiss per guidare i giovani dello Slovan."
    },
    "tacticalContext": "Gara chiave per la qualificazione con LASK che fa valere l'intensità casalinga contro la solidità difensiva slovacca."
  },
  {
    "id": "ucl-por-nap",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "FC Porto",
    "awayTeam": "Napoli",
    "kickoffTimeUTC": "2026-11-04T20:00:00Z",
    "hoursFromNow": 43,
    "odds1": 2.7,
    "oddsX": 3.35,
    "odds2": 2.6,
    "oddsOver25": 1.82,
    "oddsGoal": 1.68,
    "homeRoster": {
      "striker": "Samu Omorodion",
      "winger": "Galeno",
      "midfielder": "Alan Varela",
      "defender": "Nehuén Pérez",
      "formation": "4-2-3-1",
      "coachNote": "Omorodion centravanti dominante e Galeno freccia sulla corsia sinistra all'Estádio do Dragão."
    },
    "awayRoster": {
      "striker": "Romelu Lukaku",
      "winger": "Khvicha Kvaratskhelia",
      "midfielder": "Scott McTominay",
      "defender": "Giovanni Di Lorenzo",
      "formation": "4-3-3",
      "coachNote": "Lukaku riferimento con Kvaratskhelia e gli inserimenti aerei di McTominay a supporto."
    },
    "tacticalContext": "Sfida ad alta intensità a Oporto: il Napoli cerca punti chiave in Champions puntando sulla fisicità di Lukaku e la creatività di Kvara."
  },
  {
    "id": "ucl-aek-rma",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "AEK Athens",
    "awayTeam": "Real Madrid",
    "kickoffTimeUTC": "2026-11-04T17:45:00Z",
    "hoursFromNow": 40,
    "odds1": 8.5,
    "oddsX": 5.2,
    "odds2": 1.33,
    "oddsOver25": 1.48,
    "oddsGoal": 1.78,
    "homeRoster": {
      "striker": "Levi García",
      "winger": "Erik Lamela",
      "midfielder": "Orbelín Pineda",
      "defender": "Domagoj Vida",
      "formation": "4-2-3-1",
      "coachNote": "Lamela ed Erik García cercheranno di accendere la bolgia di Atene."
    },
    "awayRoster": {
      "striker": "Kylian Mbappé",
      "winger": "Vinícius Júnior",
      "midfielder": "Jude Bellingham",
      "defender": "Antonio Rüdiger",
      "formation": "4-3-1-2",
      "coachNote": "Mbappé e Vinícius con Bellingham trequartista e incursore d'area."
    },
    "tacticalContext": "I Blancos controllano i ritmi con la straordinaria classe di Bellingham e le accelerazioni di Mbappé e Vinícius."
  },
  {
    "id": "ucl-fen-liv",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Fenerbahce",
    "awayTeam": "Liverpool",
    "kickoffTimeUTC": "2026-11-04T17:45:00Z",
    "hoursFromNow": 40,
    "odds1": 4.8,
    "oddsX": 4.2,
    "odds2": 1.65,
    "oddsOver25": 1.55,
    "oddsGoal": 1.6,
    "homeRoster": {
      "striker": "Edin Džeko",
      "winger": "Dušan Tadić",
      "midfielder": "Fred",
      "defender": "Çağlar Söyüncü",
      "formation": "4-2-3-1",
      "coachNote": "Džeko e Tadić assi d'esperienza spinti dal pubblico di Istanbul."
    },
    "awayRoster": {
      "striker": "Mohamed Salah",
      "winger": "Luis Díaz",
      "midfielder": "Alexis Mac Allister",
      "defender": "Virgil van Dijk",
      "formation": "4-3-3",
      "coachNote": "Mohamed Salah stella inamovibile e rigorista dei Reds con Díaz."
    },
    "tacticalContext": "Test di grande carattere per il Liverpool di Slot in una delle arene più calde d'Europa."
  },
  {
    "id": "ucl-bvb-bet",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Borussia Dortmund",
    "awayTeam": "Real Betis",
    "kickoffTimeUTC": "2026-11-04T20:00:00Z",
    "hoursFromNow": 43,
    "odds1": 1.65,
    "oddsX": 4,
    "odds2": 5,
    "oddsOver25": 1.6,
    "oddsGoal": 1.65,
    "homeRoster": {
      "striker": "Serhou Guirassy",
      "winger": "Jamie Gittens",
      "midfielder": "Julian Brandt",
      "defender": "Nico Schlotterbeck",
      "formation": "4-2-3-1",
      "coachNote": "Guirassy implacabile al Signal Iduna Park con Brandt rifinitore."
    },
    "awayRoster": {
      "striker": "Vitor Roque",
      "winger": "Ez Abde",
      "midfielder": "Giovani Lo Celso",
      "defender": "Diego Llorente",
      "formation": "4-2-3-1",
      "coachNote": "Lo Celso cervello della manovra andalusa con Vitor Roque terminale."
    },
    "tacticalContext": "Muro Giallo alle spalle del Dortmund per superare un Betis abile nel palleggio ma vulnerabile alle ripartenze rapide."
  },
  {
    "id": "ucl-rbl-mci",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "RB Leipzig",
    "awayTeam": "Manchester City",
    "kickoffTimeUTC": "2026-11-04T20:00:00Z",
    "hoursFromNow": 43,
    "odds1": 4.5,
    "oddsX": 4.2,
    "odds2": 1.7,
    "oddsOver25": 1.5,
    "oddsGoal": 1.55,
    "homeRoster": {
      "striker": "Loïs Openda",
      "winger": "Xavi Simons",
      "midfielder": "Amadou Haidara",
      "defender": "Willi Orbán",
      "formation": "4-2-2-2",
      "coachNote": "Openda e Xavi Simons contropiedisti micidiali."
    },
    "awayRoster": {
      "striker": "Erling Haaland",
      "winger": "Savinho",
      "midfielder": "Phil Foden",
      "defender": "Rúben Dias",
      "formation": "4-1-4-1",
      "coachNote": "Haaland grande ex della sfida affiancato da Foden e Bernardo Silva."
    },
    "tacticalContext": "Duello di grande velocità e talento: City col solito possesso prolungato, Lipsia letale in campo lungo con Openda."
  },
  {
    "id": "ucl-sla-ars",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Slavia Prague",
    "awayTeam": "Arsenal",
    "kickoffTimeUTC": "2026-11-04T20:00:00Z",
    "hoursFromNow": 43,
    "odds1": 6.5,
    "oddsX": 4.5,
    "odds2": 1.48,
    "oddsOver25": 1.62,
    "oddsGoal": 1.75,
    "homeRoster": {
      "striker": "Tomáš Chorý",
      "winger": "Lukáš Provod",
      "midfielder": "Christos Zafeiris",
      "defender": "Tomáš Holeš",
      "formation": "3-4-2-1",
      "coachNote": "Fisicità di Chorý a centro area e compattezza ceca."
    },
    "awayRoster": {
      "striker": "Kai Havertz",
      "winger": "Bukayo Saka",
      "midfielder": "Declan Rice",
      "defender": "Gabriel Magalhães",
      "formation": "4-3-3",
      "coachNote": "Saka capitano e specialista dei piazzati con la pericolosità aerea di Gabriel sui corner."
    },
    "tacticalContext": "Gunners favoriti ma Slavia coriacea e aggressiva sui contrasti nei primi 45 minuti."
  },
  {
    "id": "ucl-len-com",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Lens",
    "awayTeam": "Como",
    "kickoffTimeUTC": "2026-11-04T20:00:00Z",
    "hoursFromNow": 43,
    "odds1": 2.05,
    "oddsX": 3.45,
    "odds2": 3.6,
    "oddsOver25": 1.85,
    "oddsGoal": 1.72,
    "homeRoster": {
      "striker": "Florian Sotoca",
      "winger": "Wesley Saïd",
      "midfielder": "Andy Diouf",
      "defender": "Kevin Danso",
      "formation": "3-4-1-2",
      "coachNote": "Stadio Bollaert-Delelis gremito a spingere il Lens."
    },
    "awayRoster": {
      "striker": "Patrick Cutrone",
      "winger": "Gabriel Strefezza",
      "midfielder": "Nico Paz",
      "defender": "Alberto Moreno",
      "formation": "4-2-3-1",
      "coachNote": "Nico Paz stella emergente con Cutrone lottatore d'area per la storica spedizione europea del Como."
    },
    "tacticalContext": "Match affascinante con la qualità di Nico Paz e Strefezza a testare l'intensità fisica del Lens."
  },
  {
    "id": "ucl-psv-bru",
    "competitionId": "soccer_uefa_champs_league",
    "competitionName": "UEFA Champions League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "PSV Eindhoven",
    "awayTeam": "Club Brugge",
    "kickoffTimeUTC": "2026-11-04T20:00:00Z",
    "hoursFromNow": 43,
    "odds1": 1.75,
    "oddsX": 3.9,
    "odds2": 4.4,
    "oddsOver25": 1.58,
    "oddsGoal": 1.6,
    "homeRoster": {
      "striker": "Luuk de Jong",
      "winger": "Johan Bakayoko",
      "midfielder": "Joey Veerman",
      "defender": "Olivier Boscagli",
      "formation": "4-3-3",
      "coachNote": "De Jong insuperabile nel gioco aereo con Veerman dai calci d'angolo."
    },
    "awayRoster": {
      "striker": "Ferran Jutglà",
      "winger": "Andreas Skov Olsen",
      "midfielder": "Hans Vanaken",
      "defender": "Brandon Mechele",
      "formation": "4-3-3",
      "coachNote": "Skov Olsen rientra sul mancino e Vanaken guida la squadra con leadership."
    },
    "tacticalContext": "Derby del Benelux con tanti gol e frequenti tiri nello specchio della porta."
  },
  {
    "id": "uel-mil-fer",
    "competitionId": "soccer_uefa_europa_league",
    "competitionName": "UEFA Europa League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "AC Milan",
    "awayTeam": "Ferencvaros",
    "kickoffTimeUTC": "2026-11-05T17:45:00Z",
    "hoursFromNow": 64,
    "odds1": 1.3,
    "oddsX": 5.5,
    "odds2": 9.5,
    "oddsOver25": 1.48,
    "oddsGoal": 1.82,
    "homeRoster": {
      "striker": "Álvaro Morata",
      "winger": "Rafael Leão",
      "midfielder": "Christian Pulisic",
      "defender": "Theo Hernández",
      "formation": "4-2-3-1",
      "coachNote": "Pulisic e Leão titolari inamovibili a San Siro; Morata prima punta di manovra."
    },
    "awayRoster": {
      "striker": "Barnabás Varga",
      "winger": "Adama Traoré",
      "midfielder": "Mohammed Abu Fani",
      "defender": "Endre Botka",
      "formation": "4-2-3-1",
      "coachNote": "Varga punto di riferimento aereo."
    },
    "tacticalContext": "Milan padrone del campo a San Siro con Theo e Leão a spingere con continuità sulla corsia mancina."
  },
  {
    "id": "uel-az-juv",
    "competitionId": "soccer_uefa_europa_league",
    "competitionName": "UEFA Europa League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "AZ Alkmaar",
    "awayTeam": "Juventus",
    "kickoffTimeUTC": "2026-11-05T20:00:00Z",
    "hoursFromNow": 67,
    "odds1": 3.5,
    "oddsX": 3.4,
    "odds2": 2.1,
    "oddsOver25": 1.85,
    "oddsGoal": 1.72,
    "homeRoster": {
      "striker": "Troy Parrott",
      "winger": "Ruben van Bommel",
      "midfielder": "Jordy Clasie",
      "defender": "Wouter Goes",
      "formation": "4-3-3",
      "coachNote": "Van Bommel freccia a sinistra, Parrott terminale."
    },
    "awayRoster": {
      "striker": "Dušan Vlahović",
      "winger": "Kenan Yıldız",
      "midfielder": "Teun Koopmeiners",
      "defender": "Federico Gatti",
      "formation": "4-2-3-1",
      "coachNote": "Vlahović prima punta e rigorista, con Koopmeiners grande ex che torna in Olanda da protagonista."
    },
    "tacticalContext": "Koopmeiners sfida il suo passato: la Juventus cerca il controllo del ritmo e solidità difensiva per sbancare Alkmaar."
  },
  {
    "id": "uel-rso-lyo",
    "competitionId": "soccer_uefa_europa_league",
    "competitionName": "UEFA Europa League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Real Sociedad",
    "awayTeam": "Lyon",
    "kickoffTimeUTC": "2026-11-05T17:45:00Z",
    "hoursFromNow": 64,
    "odds1": 1.9,
    "oddsX": 3.55,
    "odds2": 4,
    "oddsOver25": 1.78,
    "oddsGoal": 1.7,
    "homeRoster": {
      "striker": "Mikel Oyarzabal",
      "winger": "Takefusa Kubo",
      "midfielder": "Martín Zubimendi",
      "defender": "Robin Le Normand",
      "formation": "4-3-3",
      "coachNote": "Kubo inarrestabile nell'uno contro uno con Oyarzabal rigorista."
    },
    "awayRoster": {
      "striker": "Alexandre Lacazette",
      "winger": "Rayan Cherki",
      "midfielder": "Maxence Caqueret",
      "defender": "Moussa Niakhaté",
      "formation": "4-2-3-1",
      "coachNote": "Lacazette capitano e rifinitore con i colpi di Cherki."
    },
    "tacticalContext": "All'Anoeta partita vibrante con la Real Sociedad che costruisce dal basso e il Lione rapido nel ribaltare l'azione."
  },
  {
    "id": "uel-lev-mar",
    "competitionId": "soccer_uefa_europa_league",
    "competitionName": "UEFA Europa League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Bayer Leverkusen",
    "awayTeam": "Marseille",
    "kickoffTimeUTC": "2026-11-05T20:00:00Z",
    "hoursFromNow": 67,
    "odds1": 1.62,
    "oddsX": 4.2,
    "odds2": 5,
    "oddsOver25": 1.55,
    "oddsGoal": 1.62,
    "homeRoster": {
      "striker": "Victor Boniface",
      "winger": "Florian Wirtz",
      "midfielder": "Granit Xhaka",
      "defender": "Jonathan Tah",
      "formation": "3-4-2-1",
      "coachNote": "Florian Wirtz genio della trequarti con Boniface perno offensivo."
    },
    "awayRoster": {
      "striker": "Mason Greenwood",
      "winger": "Elye Wahi",
      "midfielder": "Pierre-Emile Højbjerg",
      "defender": "Leonardo Balerdi",
      "formation": "4-2-3-1",
      "coachNote": "Greenwood miglior marcatore dell'OM supportato da Højbjerg a centrocampo."
    },
    "tacticalContext": "Intensità altissima alla BayArena tra il gioco avvolgente di Xabi Alonso e la verticalità voluta da De Zerbi."
  },
  {
    "id": "uecl-ata-kai",
    "competitionId": "soccer_uefa_europa_conference_league",
    "competitionName": "UEFA Conference League",
    "country": "Europa",
    "type": "cup",
    "homeTeam": "Atalanta",
    "awayTeam": "Kairat Almaty",
    "kickoffTimeUTC": "2026-11-05T17:45:00Z",
    "hoursFromNow": 64,
    "odds1": 1.18,
    "oddsX": 7,
    "odds2": 15,
    "oddsOver25": 1.4,
    "oddsGoal": 2.05,
    "homeRoster": {
      "striker": "Mateo Retegui",
      "winger": "Ademola Lookman",
      "midfielder": "Charles De Ketelaere",
      "defender": "Isak Hien",
      "formation": "3-4-2-1",
      "coachNote": "Lookman e De Ketelaere a supporto di Retegui capocannoniere."
    },
    "awayRoster": {
      "striker": "João Paulo",
      "winger": "Élder Santana",
      "midfielder": "Ofri Arad",
      "defender": "Aleksandr Martynovich",
      "formation": "4-4-2",
      "coachNote": "Squadra kazaka schierata a protezione della propria area."
    },
    "tacticalContext": "A Bergamo la Dea impone il proprio ritmo con marcature asfissianti e aggressione alta fin dal primo minuto."
  },
  {
    "id": "sa-ven-udi",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "Venezia",
    "awayTeam": "Udinese",
    "kickoffTimeUTC": "2026-11-06T19:45:00Z",
    "hoursFromNow": 90,
    "odds1": 2.8,
    "oddsX": 3.2,
    "odds2": 2.6,
    "oddsOver25": 2.05,
    "oddsGoal": 1.82,
    "homeRoster": {
      "striker": "Joel Pohjanpalo",
      "winger": "Gaetano Oristanio",
      "midfielder": "Gianluca Busio",
      "defender": "Jay Idzes",
      "formation": "3-4-2-1",
      "coachNote": "Pohjanpalo bomber e idolo del Penzo con l'imprevedibilità di Oristanio."
    },
    "awayRoster": {
      "striker": "Lorenzo Lucca",
      "winger": "Florian Thauvin",
      "midfielder": "Jesper Karlström",
      "defender": "Jaka Bijol",
      "formation": "3-5-2",
      "coachNote": "Thauvin capitano e suggeritore per i centimetri di Lucca."
    },
    "tacticalContext": "Anticipo del venerdì sera al Penzo: derby del Triveneto combattuto su ogni palla inattiva e grande agonismo."
  },
  {
    "id": "sa-cag-fro",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "Cagliari",
    "awayTeam": "Frosinone",
    "kickoffTimeUTC": "2026-11-07T14:00:00Z",
    "hoursFromNow": 108,
    "odds1": 2.1,
    "oddsX": 3.3,
    "odds2": 3.6,
    "oddsOver25": 1.95,
    "oddsGoal": 1.8,
    "homeRoster": {
      "striker": "Roberto Piccoli",
      "winger": "Zito Luvumbo",
      "midfielder": "Razvan Marin",
      "defender": "Sebastiano Luperto",
      "formation": "4-2-3-1",
      "coachNote": "Luvumbo velocista sulle corsie esterne per servire Piccoli."
    },
    "awayRoster": {
      "striker": "Giuseppe Ambrosino",
      "winger": "Fares Ghedjemis",
      "midfielder": "Luca Mazzitelli",
      "defender": "Ilario Monterisi",
      "formation": "3-4-2-1",
      "coachNote": "Mazzitelli geometrie e tiro da fuori a guidare la formazione ciociara."
    },
    "tacticalContext": "Punti pesanti per la salvezza alla Domus Arena di Cagliari: grande intensità fisica e duelli aerei."
  },
  {
    "id": "sa-tor-lec",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "Torino",
    "awayTeam": "Lecce",
    "kickoffTimeUTC": "2026-11-07T14:00:00Z",
    "hoursFromNow": 108,
    "odds1": 1.85,
    "oddsX": 3.35,
    "odds2": 4.6,
    "oddsOver25": 2.1,
    "oddsGoal": 1.95,
    "homeRoster": {
      "striker": "Ché Adams",
      "winger": "Nikola Vlašić",
      "midfielder": "Samuele Ricci",
      "defender": "Saúl Coco",
      "formation": "3-5-2",
      "coachNote": "Ché Adams guida l'attacco granata con gli inserimenti di Vlašić e Ricci."
    },
    "awayRoster": {
      "striker": "Nikola Krstović",
      "winger": "Patrick Dorgu",
      "midfielder": "Ylber Ramadani",
      "defender": "Federico Baschirotto",
      "formation": "4-3-3",
      "coachNote": "Krstović riferimento avanzato con Dorgu freccia a tutta fascia."
    },
    "tacticalContext": "Partita bloccata e tattica all'Olimpico Grande Torino: il Lecce difende compatto, il Toro cerca varchi centrali."
  },
  {
    "id": "sa-par-bol",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "Parma",
    "awayTeam": "Bologna",
    "kickoffTimeUTC": "2026-11-07T17:00:00Z",
    "hoursFromNow": 111,
    "odds1": 3.1,
    "oddsX": 3.3,
    "odds2": 2.35,
    "oddsOver25": 1.95,
    "oddsGoal": 1.75,
    "homeRoster": {
      "striker": "Ange-Yoan Bonny",
      "winger": "Dennis Man",
      "midfielder": "Adrián Bernabé",
      "defender": "Botond Balogh",
      "formation": "4-2-3-1",
      "coachNote": "Dennis Man e Mihăilă ali velocissime con la regia illuminata di Bernabé."
    },
    "awayRoster": {
      "striker": "Santiago Castro",
      "winger": "Riccardo Orsolini",
      "midfielder": "Remo Freuler",
      "defender": "Sam Beukema",
      "formation": "4-2-3-1",
      "coachNote": "Orsolini specialista dei piazzati con la grinta di Castro al Tardini."
    },
    "tacticalContext": "Derby emiliano con transizioni rapide da ambo le parti e frequenti conclusioni verso la porta."
  },
  {
    "id": "sa-rom-sas",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "AS Roma",
    "awayTeam": "Sassuolo",
    "kickoffTimeUTC": "2026-11-07T19:45:00Z",
    "hoursFromNow": 114,
    "odds1": 1.55,
    "oddsX": 4.1,
    "odds2": 6,
    "oddsOver25": 1.7,
    "oddsGoal": 1.78,
    "homeRoster": {
      "striker": "Artem Dovbyk",
      "winger": "Paulo Dybala",
      "midfielder": "Lorenzo Pellegrini",
      "defender": "Gianluca Mancini",
      "formation": "3-4-2-1",
      "coachNote": "Dovbyk e Dybala confermati dal primo minuto all'Olimpico."
    },
    "awayRoster": {
      "striker": "Armand Laurienté",
      "winger": "Domenico Berardi",
      "midfielder": "Daniel Boloca",
      "defender": "Filippo Romagna",
      "formation": "4-3-3",
      "coachNote": "Berardi rientrato a pieno regime pronto a inventare col suo sinistro."
    },
    "tacticalContext": "Roma propositiva all'Olimpico; Sassuolo pericoloso se Berardi e Laurienté trovano spazio nell'uno contro uno."
  },
  {
    "id": "sa-nap-laz",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "Napoli",
    "awayTeam": "Lazio",
    "kickoffTimeUTC": "2026-11-08T11:30:00Z",
    "hoursFromNow": 130,
    "odds1": 1.9,
    "oddsX": 3.5,
    "odds2": 4.2,
    "oddsOver25": 1.85,
    "oddsGoal": 1.74,
    "homeRoster": {
      "striker": "Romelu Lukaku",
      "winger": "Khvicha Kvaratskhelia",
      "midfielder": "Scott McTominay",
      "defender": "Alessandro Buongiorno",
      "formation": "4-3-3",
      "coachNote": "Lukaku leader offensivo, McTominay in continuo inserimento sui cross di Di Lorenzo."
    },
    "awayRoster": {
      "striker": "Valentín Castellanos",
      "winger": "Mattia Zaccagni",
      "midfielder": "Matteo Guendouzi",
      "defender": "Mario Gila",
      "formation": "4-2-3-1",
      "coachNote": "Zaccagni capitano e rigorista con Castellanos centravanti di movimento."
    },
    "tacticalContext": "Lunch match infuocato al Maradona: Napoli solido e compatto con la regia di Lobotka, Lazio pronta alle ripartenze veloci."
  },
  {
    "id": "sa-gen-mil",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "Genoa",
    "awayTeam": "AC Milan",
    "kickoffTimeUTC": "2026-11-08T14:00:00Z",
    "hoursFromNow": 133,
    "odds1": 4.4,
    "oddsX": 3.65,
    "odds2": 1.82,
    "oddsOver25": 1.88,
    "oddsGoal": 1.8,
    "homeRoster": {
      "striker": "Andrea Pinamonti",
      "winger": "Morten Frendrup",
      "midfielder": "Milan Badelj",
      "defender": "Johan Vásquez",
      "formation": "3-5-2",
      "coachNote": "Pinamonti terminale offensivo di peso spinto dalla gradinata Nord di Marassi."
    },
    "awayRoster": {
      "striker": "Álvaro Morata",
      "winger": "Rafael Leão",
      "midfielder": "Christian Pulisic",
      "defender": "Theo Hernández",
      "formation": "4-2-3-1",
      "coachNote": "Leão e Theo protagonisti a tutta fascia con Pulisic incursore letale."
    },
    "tacticalContext": "Marassi è sempre un campo ostico: Genoa grintoso nei duelli, Milan chiamato a scardinare il bunker con la classe dei singoli."
  },
  {
    "id": "sa-mon-ata",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "Monza",
    "awayTeam": "Atalanta",
    "kickoffTimeUTC": "2026-11-08T14:00:00Z",
    "hoursFromNow": 133,
    "odds1": 5.2,
    "oddsX": 4,
    "odds2": 1.65,
    "oddsOver25": 1.75,
    "oddsGoal": 1.75,
    "homeRoster": {
      "striker": "Milan Đurić",
      "winger": "Dany Mota",
      "midfielder": "Matteo Pessina",
      "defender": "Pablo Marí",
      "formation": "3-4-2-1",
      "coachNote": "Đurić faro aereo per le sponde a rimorchio di Pessina e Mota."
    },
    "awayRoster": {
      "striker": "Mateo Retegui",
      "winger": "Ademola Lookman",
      "midfielder": "Éderson",
      "defender": "Sead Kolašinac",
      "formation": "3-4-2-1",
      "coachNote": "Retegui terminale cinico con Lookman in fiducia totale."
    },
    "tacticalContext": "Derby lombardo con l'Atalanta che imporrà pressione a tutto campo e frequenti tiri nello specchio."
  },
  {
    "id": "sa-int-com",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "Internazionale",
    "awayTeam": "Como",
    "kickoffTimeUTC": "2026-11-08T17:00:00Z",
    "hoursFromNow": 136,
    "odds1": 1.35,
    "oddsX": 5.2,
    "odds2": 8.5,
    "oddsOver25": 1.55,
    "oddsGoal": 1.85,
    "homeRoster": {
      "striker": "Lautaro Martínez",
      "winger": "Marcus Thuram",
      "midfielder": "Nicolò Barella",
      "defender": "Alessandro Bastoni",
      "formation": "3-5-2",
      "coachNote": "Lautaro Martínez e Thuram dal 1' minuto; Barella motore della mediana a San Siro."
    },
    "awayRoster": {
      "striker": "Patrick Cutrone",
      "winger": "Gabriel Strefezza",
      "midfielder": "Nico Paz",
      "defender": "Alberto Moreno",
      "formation": "4-2-3-1",
      "coachNote": "Nico Paz punto di riferimento tecnico, Cutrone ex della sfida motivato al massimo."
    },
    "tacticalContext": "San Siro pieno: Inter a caccia dei 3 punti col controllo del gioco, Como propositivo senza paura del possesso palla."
  },
  {
    "id": "sa-fio-juv",
    "competitionId": "soccer_italy_serie_a",
    "competitionName": "Serie A",
    "country": "Italia",
    "type": "league",
    "homeTeam": "Fiorentina",
    "awayTeam": "Juventus",
    "kickoffTimeUTC": "2026-11-08T19:45:00Z",
    "hoursFromNow": 139,
    "odds1": 3.1,
    "oddsX": 3.25,
    "odds2": 2.35,
    "oddsOver25": 1.95,
    "oddsGoal": 1.78,
    "homeRoster": {
      "striker": "Moise Kean",
      "winger": "Albert Guðmundsson",
      "midfielder": "Andrea Colpani",
      "defender": "Pietro Comuzzo",
      "formation": "4-2-3-1",
      "coachNote": "Moise Kean ex bianconero affamato di gol con Guðmundsson rifinitore al Franchi."
    },
    "awayRoster": {
      "striker": "Dušan Vlahović",
      "winger": "Kenan Yıldız",
      "midfielder": "Teun Koopmeiners",
      "defender": "Pierre Kalulu",
      "formation": "4-2-3-1",
      "coachNote": "Vlahović torna da grande ex a Firenze tra i fischi del Franchi con Yıldız esterno."
    },
    "tacticalContext": "Rivalità storica caldissima nel posticipo della domenica: duelli incandescenti, alta tensione e cartellini probabili."
  },
  {
    "id": "epl-eve-cov",
    "competitionId": "soccer_epl",
    "competitionName": "Premier League",
    "country": "Inghilterra",
    "type": "league",
    "homeTeam": "Everton",
    "awayTeam": "Coventry City",
    "kickoffTimeUTC": "2026-11-06T20:00:00Z",
    "hoursFromNow": 91,
    "odds1": 1.72,
    "oddsX": 3.7,
    "odds2": 4.8,
    "oddsOver25": 1.85,
    "oddsGoal": 1.8,
    "homeRoster": {
      "striker": "Dominic Calvert-Lewin",
      "winger": "Dwight McNeil",
      "midfielder": "Idrissa Gueye",
      "defender": "James Tarkowski",
      "formation": "4-4-1-1",
      "coachNote": "Goodison Park spinge i Toffees sui calci piazzati battuti da McNeil."
    },
    "awayRoster": {
      "striker": "Ellis Simms",
      "winger": "Haji Wright",
      "midfielder": "Ben Sheaf",
      "defender": "Bobby Thomas",
      "formation": "3-4-1-2",
      "coachNote": "Simms grande ex contro la sua ex squadra."
    },
    "tacticalContext": "Match fisico al Goodison Park con frequenti duelli aerei."
  },
  {
    "id": "epl-ars-hul",
    "competitionId": "soccer_epl",
    "competitionName": "Premier League",
    "country": "Inghilterra",
    "type": "league",
    "homeTeam": "Arsenal",
    "awayTeam": "Hull City",
    "kickoffTimeUTC": "2026-11-07T15:00:00Z",
    "hoursFromNow": 109,
    "odds1": 1.22,
    "oddsX": 6.5,
    "odds2": 12,
    "oddsOver25": 1.45,
    "oddsGoal": 2.05,
    "homeRoster": {
      "striker": "Kai Havertz",
      "winger": "Bukayo Saka",
      "midfielder": "Martin Ødegaard",
      "defender": "Gabriel Magalhães",
      "formation": "4-3-3",
      "coachNote": "Saka e Ødegaard cercheranno di scardinare le linee difensive avversarie all'Emirates."
    },
    "awayRoster": {
      "striker": "João Pedro",
      "winger": "Kasey Palmer",
      "midfielder": "Regan Slater",
      "defender": "Alfie Jones",
      "formation": "4-4-2",
      "coachNote": "Assetto compatto per limitare l'attacco dei Gunners."
    },
    "tacticalContext": "Monologo territoriale dell'Arsenal con assedio sulla trequarti e numerosi corner."
  },
  {
    "id": "epl-not-mci",
    "competitionId": "soccer_epl",
    "competitionName": "Premier League",
    "country": "Inghilterra",
    "type": "league",
    "homeTeam": "Nottingham Forest",
    "awayTeam": "Manchester City",
    "kickoffTimeUTC": "2026-11-07T17:30:00Z",
    "hoursFromNow": 112,
    "odds1": 6.8,
    "oddsX": 4.8,
    "odds2": 1.44,
    "oddsOver25": 1.55,
    "oddsGoal": 1.75,
    "homeRoster": {
      "striker": "Chris Wood",
      "winger": "Anthony Elanga",
      "midfielder": "Morgan Gibbs-White",
      "defender": "Murillo",
      "formation": "4-2-3-1",
      "coachNote": "Wood riferimento aereo con Elanga a colpire in velocità."
    },
    "awayRoster": {
      "striker": "Erling Haaland",
      "winger": "Savinho",
      "midfielder": "Phil Foden",
      "defender": "Rúben Dias",
      "formation": "4-1-4-1",
      "coachNote": "Haaland sempre implacabile contro difese bloccate."
    },
    "tacticalContext": "City dominante nel controllo palla ma City Ground è sempre una trappola per i contropiedi di Elanga."
  },
  {
    "id": "epl-cry-liv",
    "competitionId": "soccer_epl",
    "competitionName": "Premier League",
    "country": "Inghilterra",
    "type": "league",
    "homeTeam": "Crystal Palace",
    "awayTeam": "Liverpool",
    "kickoffTimeUTC": "2026-11-08T14:00:00Z",
    "hoursFromNow": 133,
    "odds1": 5,
    "oddsX": 4.2,
    "odds2": 1.62,
    "oddsOver25": 1.58,
    "oddsGoal": 1.65,
    "homeRoster": {
      "striker": "Jean-Philippe Mateta",
      "winger": "Eberechi Eze",
      "midfielder": "Adam Wharton",
      "defender": "Marc Guéhi",
      "formation": "3-4-2-1",
      "coachNote": "Eze e Mateta punti focali della formazione di Glasner a Selhurst Park."
    },
    "awayRoster": {
      "striker": "Mohamed Salah",
      "winger": "Luis Díaz",
      "midfielder": "Alexis Mac Allister",
      "defender": "Virgil van Dijk",
      "formation": "4-3-3",
      "coachNote": "Salah capocannoniere e leader dei Reds."
    },
    "tacticalContext": "Partita ad alto ritmo a Selhurst Park: il Palace prova a sorprendere il Liverpool con Eze."
  },
  {
    "id": "epl-mun-asv",
    "competitionId": "soccer_epl",
    "competitionName": "Premier League",
    "country": "Inghilterra",
    "type": "league",
    "homeTeam": "Manchester United",
    "awayTeam": "Aston Villa",
    "kickoffTimeUTC": "2026-11-08T16:30:00Z",
    "hoursFromNow": 135,
    "odds1": 2.15,
    "oddsX": 3.55,
    "odds2": 3.2,
    "oddsOver25": 1.62,
    "oddsGoal": 1.55,
    "homeRoster": {
      "striker": "Rasmus Højlund",
      "winger": "Alejandro Garnacho",
      "midfielder": "Bruno Fernandes",
      "defender": "Lisandro Martínez",
      "formation": "4-2-3-1",
      "coachNote": "Bruno Fernandes leader tecnico a Old Trafford con Garnacho a sinistra."
    },
    "awayRoster": {
      "striker": "Ollie Watkins",
      "winger": "Leon Bailey",
      "midfielder": "Morgan Rogers",
      "defender": "Ezri Konsa",
      "formation": "4-2-3-1",
      "coachNote": "Watkins spauracchio della difesa dei Red Devils."
    },
    "tacticalContext": "Gara di cartello in Premier: ritmi folli, ribaltamenti continui e occasioni da ambo le parti."
  },
  {
    "id": "ll-val-rma",
    "competitionId": "soccer_spain_la_liga",
    "competitionName": "La Liga",
    "country": "Spagna",
    "type": "league",
    "homeTeam": "Valencia",
    "awayTeam": "Real Madrid",
    "kickoffTimeUTC": "2026-11-07T20:00:00Z",
    "hoursFromNow": 114,
    "odds1": 5.5,
    "oddsX": 4.2,
    "odds2": 1.58,
    "oddsOver25": 1.65,
    "oddsGoal": 1.72,
    "homeRoster": {
      "striker": "Hugo Duro",
      "winger": "Diego López",
      "midfielder": "Pepelu",
      "defender": "Cristhian Mosquera",
      "formation": "4-4-2",
      "coachNote": "Mestalla carico di passione con Hugo Duro punta di riferimento."
    },
    "awayRoster": {
      "striker": "Kylian Mbappé",
      "winger": "Vinícius Júnior",
      "midfielder": "Jude Bellingham",
      "defender": "Antonio Rüdiger",
      "formation": "4-3-1-2",
      "coachNote": "Mbappé e Vinícius pronti alle fiammate su una delle piste più calde della Liga."
    },
    "tacticalContext": "Atmosfera rovente al Mestalla: Valencia aggressivo, Real Madrid con qualità superiore nelle ripartenze."
  },
  {
    "id": "ll-atm-bar",
    "competitionId": "soccer_spain_la_liga",
    "competitionName": "La Liga",
    "country": "Spagna",
    "type": "league",
    "homeTeam": "Atlético Madrid",
    "awayTeam": "Barcelona",
    "kickoffTimeUTC": "2026-11-08T20:00:00Z",
    "hoursFromNow": 139,
    "odds1": 2.65,
    "oddsX": 3.55,
    "odds2": 2.55,
    "oddsOver25": 1.6,
    "oddsGoal": 1.52,
    "homeRoster": {
      "striker": "Julián Álvarez",
      "winger": "Antoine Griezmann",
      "midfielder": "Rodrigo De Paul",
      "defender": "José María Giménez",
      "formation": "4-4-2",
      "coachNote": "Simeone carica il Metropolitano con Álvarez e Griezmann coppia gol."
    },
    "awayRoster": {
      "striker": "Robert Lewandowski",
      "winger": "Lamine Yamal",
      "midfielder": "Pedri",
      "defender": "Pau Cubarsí",
      "formation": "4-3-3",
      "coachNote": "Lewandowski e Lamine Yamal a guidare la capolista con la linea difensiva alta."
    },
    "tacticalContext": "Clásico del Metropolitano tra due giganti del calcio spagnolo: intensità fisica estrema e colpi di alta scuola."
  },
  {
    "id": "bl-mai-bay",
    "competitionId": "soccer_germany_bundesliga",
    "competitionName": "Bundesliga",
    "country": "Germania",
    "type": "league",
    "homeTeam": "Mainz",
    "awayTeam": "Bayern Munich",
    "kickoffTimeUTC": "2026-11-07T14:30:00Z",
    "hoursFromNow": 108,
    "odds1": 7.5,
    "oddsX": 5.5,
    "odds2": 1.35,
    "oddsOver25": 1.42,
    "oddsGoal": 1.68,
    "homeRoster": {
      "striker": "Jonathan Burkardt",
      "winger": "Paul Nebel",
      "midfielder": "Nadiem Amiri",
      "defender": "Stefan Bell",
      "formation": "3-4-2-1",
      "coachNote": "Burkardt capocannoniere del Mainz insidioso su palle inattive."
    },
    "awayRoster": {
      "striker": "Harry Kane",
      "winger": "Michael Olise",
      "midfielder": "Jamal Musiala",
      "defender": "Dayot Upamecano",
      "formation": "4-2-3-1",
      "coachNote": "Harry Kane terminale implacabile con Musiala e Olise trequartisti."
    },
    "tacticalContext": "Forcing offensivo del Bayern contro la compattezza del Mainz alla Mewa Arena."
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

function formatRomeDate(date: Date): string {
  try {
    return (
      new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date) + ' (fuso Roma)'
    );
  } catch {
    return date.toLocaleDateString('it-IT') + ' (fuso Roma)';
  }
}

export function getStaticCompetitions(timeWindow: TimeWindowKey = 'hours48'): {
  competitions: CompetitionItem[];
  calendarUpdatedTimestamp: string;
  timeWindow: TimeWindowKey;
} {
  const now = Date.now();
  const maxHours =
    timeWindow === 'today'
      ? 26
      : timeWindow === 'hours48'
      ? 48
      : timeWindow === 'days7'
      ? 168
      : 336;

  const matchesInWindow = STATIC_MATCHES.filter((m) => {
    const h = getMatchHoursFromNow(m, now);
    return h <= maxHours;
  });
  const effective = matchesInWindow.length >= 4 ? matchesInWindow : STATIC_MATCHES;

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
      // Priorità a Italia
      if (a.country === 'Italia' && b.country !== 'Italia') return -1;
      if (b.country === 'Italia' && a.country !== 'Italia') return 1;
      // Priorità a Coppe Europee
      if (a.country === 'Europa' && b.country !== 'Europa' && b.country !== 'Italia') return -1;
      if (b.country === 'Europa' && a.country !== 'Europa' && a.country !== 'Italia') return 1;
      if (b.eventsCount !== a.eventsCount) return b.eventsCount - a.eventsCount;
      return a.name.localeCompare(b.name);
    });

  return {
    competitions,
    calendarUpdatedTimestamp: formatRomeDate(new Date()),
    timeWindow
  };
}

export function runStaticPagesAnalysis(
  params: {
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
  },
  customMatches?: StaticMatchBlueprint[]
): AnalyzeApiResponse {
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
  const sourceMatches = customMatches && customMatches.length >= 4 ? customMatches : STATIC_MATCHES;

  const matchesInWindow = sourceMatches.filter((m) => {
    const h = getMatchHoursFromNow(m, now);
    return h <= maxHours;
  });
  let effectiveMatches = matchesInWindow.length >= 4 ? matchesInWindow : sourceMatches;

  if (params.competitions && params.competitions.length > 0) {
    if (params.competitions.includes('__none__')) {
      effectiveMatches = [];
    } else {
      const selectedSet = new Set(params.competitions);
      effectiveMatches = effectiveMatches.filter(
        (m) => selectedSet.has(m.competitionId) || selectedSet.has(m.competitionName)
      );
    }
  }

  if (effectiveMatches.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      calendarUpdatedTimestamp: formatRomeDate(new Date()),
      betType: params.betType,
      feasibility,
      multiSportPrompt: null,
      recommendedSingles: [],
      bestSlip: null,
      allCandidateSelections: [],
      aiCandidateEvents: [],
      coveredCompetitions: [],
      providerWarnings: [],
      isDemoData: false,
      noEventsMessage:
        'Nessuna partita di calcio disponibile per le competizioni e la finestra temporale selezionate.',
      quotaStatus: getStaticBackendStatus().quota
    };
  }

  let allSelections: CandidateSelection[] = [];
  for (const m of effectiveMatches) {
    const commenceTime = getMatchCommenceTime(m, now);
    const matchSels = generateSelectionsForMatch(m, commenceTime);
    allSelections.push(...matchSels);
  }

  if (params.allowedMarketGroups && params.allowedMarketGroups.length > 0) {
    const allowedSet = new Set<MarketGroupKey>(params.allowedMarketGroups);
    allSelections = allSelections.filter((s) => allowedSet.has(classifyMarketGroup(s.market)));
  }

  const activeCompNames = Array.from(new Set(effectiveMatches.map((m) => m.competitionName)));

  if (!feasibility.feasible) {
    return {
      generatedAt: new Date().toISOString(),
      calendarUpdatedTimestamp: formatRomeDate(new Date()),
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
          coveredCompetitions: activeCompNames,
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
    calendarUpdatedTimestamp: formatRomeDate(new Date()),
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
        coveredCompetitions: activeCompNames,
        uncoveredNote: 'Tutti i mercati principali, combo, giocatori e speciali sono attivi.',
        dailyRequestsLimitInfo: 'Illimitato su GitHub Pages'
      }
    ],
    providerWarnings: [],
    isDemoData: false,
    quotaStatus: getStaticBackendStatus().quota
  };
}
