export type CompetitionType = 'league' | 'cup' | 'other';

export interface CompetitionMetadata {
  id: string;
  name: string;
  country: string;
  type: CompetitionType;
}

export const KNOWN_COMPETITIONS: Record<string, CompetitionMetadata> = {
  // Italia
  soccer_italy_serie_a: { id: 'soccer_italy_serie_a', name: 'Serie A', country: 'Italia', type: 'league' },
  soccer_italy_serie_b: { id: 'soccer_italy_serie_b', name: 'Serie B', country: 'Italia', type: 'league' },
  soccer_italy_coppa_italia: { id: 'soccer_italy_coppa_italia', name: 'Coppa Italia', country: 'Italia', type: 'cup' },
  soccer_italy_supercoppa: { id: 'soccer_italy_supercoppa', name: 'Supercoppa Italiana', country: 'Italia', type: 'cup' },

  // Coppe Europee & Internazionali
  soccer_uefa_champs_league: { id: 'soccer_uefa_champs_league', name: 'UEFA Champions League', country: 'Europa', type: 'cup' },
  soccer_uefa_europa_league: { id: 'soccer_uefa_europa_league', name: 'UEFA Europa League', country: 'Europa', type: 'cup' },
  soccer_uefa_europa_conference_league: { id: 'soccer_uefa_europa_conference_league', name: 'UEFA Conference League', country: 'Europa', type: 'cup' },
  soccer_uefa_nations_league: { id: 'soccer_uefa_nations_league', name: 'UEFA Nations League', country: 'Europa', type: 'other' },
  soccer_uefa_super_cup: { id: 'soccer_uefa_super_cup', name: 'UEFA Super Cup', country: 'Europa', type: 'cup' },
  soccer_fifa_world_cup: { id: 'soccer_fifa_world_cup', name: 'Mondiali FIFA', country: 'Mondo', type: 'other' },
  soccer_fifa_world_cup_qualifiers_europe: { id: 'soccer_fifa_world_cup_qualifiers_europe', name: 'Qualificazioni Mondiali (Europa)', country: 'Europa', type: 'other' },
  soccer_fifa_world_cup_qualifiers_south_america: { id: 'soccer_fifa_world_cup_qualifiers_south_america', name: 'Qualificazioni Mondiali (Sudamerica)', country: 'Sudamerica', type: 'other' },
  soccer_conmebol_copa_libertadores: { id: 'soccer_conmebol_copa_libertadores', name: 'Copa Libertadores', country: 'Sudamerica', type: 'cup' },
  soccer_conmebol_copa_sudamericana: { id: 'soccer_conmebol_copa_sudamericana', name: 'Copa Sudamericana', country: 'Sudamerica', type: 'cup' },

  // Inghilterra
  soccer_epl: { id: 'soccer_epl', name: 'Premier League', country: 'Inghilterra', type: 'league' },
  soccer_efl_champ: { id: 'soccer_efl_champ', name: 'Championship', country: 'Inghilterra', type: 'league' },
  soccer_fa_cup: { id: 'soccer_fa_cup', name: 'FA Cup', country: 'Inghilterra', type: 'cup' },
  soccer_england_efl_cup: { id: 'soccer_england_efl_cup', name: 'EFL Cup (Carabao Cup)', country: 'Inghilterra', type: 'cup' },

  // Spagna
  soccer_spain_la_liga: { id: 'soccer_spain_la_liga', name: 'La Liga', country: 'Spagna', type: 'league' },
  soccer_spain_segunda_division: { id: 'soccer_spain_segunda_division', name: 'Segunda División', country: 'Spagna', type: 'league' },
  soccer_spain_copa_del_rey: { id: 'soccer_spain_copa_del_rey', name: 'Copa del Rey', country: 'Spagna', type: 'cup' },

  // Germania
  soccer_germany_bundesliga: { id: 'soccer_germany_bundesliga', name: 'Bundesliga', country: 'Germania', type: 'league' },
  soccer_germany_bundesliga2: { id: 'soccer_germany_bundesliga2', name: '2. Bundesliga', country: 'Germania', type: 'league' },
  soccer_germany_dfb_pokal: { id: 'soccer_germany_dfb_pokal', name: 'DFB-Pokal', country: 'Germania', type: 'cup' },

  // Francia
  soccer_france_ligue_one: { id: 'soccer_france_ligue_one', name: 'Ligue 1', country: 'Francia', type: 'league' },
  soccer_france_ligue_two: { id: 'soccer_france_ligue_two', name: 'Ligue 2', country: 'Francia', type: 'league' },
  soccer_france_coupe_de_france: { id: 'soccer_france_coupe_de_france', name: 'Coupe de France', country: 'Francia', type: 'cup' },

  // Paesi Bassi & Portogallo
  soccer_netherlands_eredivisie: { id: 'soccer_netherlands_eredivisie', name: 'Eredivisie', country: 'Paesi Bassi', type: 'league' },
  soccer_portugal_primeira_liga: { id: 'soccer_portugal_primeira_liga', name: 'Primeira Liga', country: 'Portogallo', type: 'league' },
  soccer_portugal_taca_de_portugal: { id: 'soccer_portugal_taca_de_portugal', name: 'Taça de Portugal', country: 'Portogallo', type: 'cup' },

  // Altre leghe mondiali
  soccer_brazil_campeonato: { id: 'soccer_brazil_campeonato', name: 'Brasileirão Série A', country: 'Brasile', type: 'league' },
  soccer_argentina_primera_division: { id: 'soccer_argentina_primera_division', name: 'Liga Profesional', country: 'Argentina', type: 'league' },
  soccer_turkey_super_league: { id: 'soccer_turkey_super_league', name: 'Süper Lig', country: 'Turchia', type: 'league' },
  soccer_belgium_first_div: { id: 'soccer_belgium_first_div', name: 'Jupiler Pro League', country: 'Belgio', type: 'league' },
  soccer_spl: { id: 'soccer_spl', name: 'Scottish Premiership', country: 'Scozia', type: 'league' },
  soccer_switzerland_superleague: { id: 'soccer_switzerland_superleague', name: 'Super League', country: 'Svizzera', type: 'league' },
  soccer_austria_bundesliga: { id: 'soccer_austria_bundesliga', name: 'Bundesliga Austriaca', country: 'Austria', type: 'league' },
  soccer_greece_super_league: { id: 'soccer_greece_super_league', name: 'Super League Grecia', country: 'Grecia', type: 'league' },
  soccer_denmark_superliga: { id: 'soccer_denmark_superliga', name: 'Superliga Danese', country: 'Danimarca', type: 'league' },
  soccer_norway_eliteserien: { id: 'soccer_norway_eliteserien', name: 'Eliteserien', country: 'Norvegia', type: 'league' },
  soccer_sweden_allsvenskan: { id: 'soccer_sweden_allsvenskan', name: 'Allsvenskan', country: 'Svezia', type: 'league' },
  soccer_usa_mls: { id: 'soccer_usa_mls', name: 'Major League Soccer (MLS)', country: 'USA', type: 'league' },
  soccer_mexico_ligamx: { id: 'soccer_mexico_ligamx', name: 'Liga MX', country: 'Messico', type: 'league' },
  soccer_japan_j_league: { id: 'soccer_japan_j_league', name: 'J-League', country: 'Giappone', type: 'league' },
  soccer_saudi_arabia_pro_league: { id: 'soccer_saudi_arabia_pro_league', name: 'Saudi Pro League', country: 'Arabia Saudita', type: 'league' },
  soccer_australia_aleague: { id: 'soccer_australia_aleague', name: 'A-League', country: 'Australia', type: 'league' }
};

const CUP_REGEX = /\b(cup|coppa|pokal|copa|coupe|champions league|europa league|conference league|supercup|supercoppa|libertadores|sudamericana|trophy|taca|taça)\b/i;
const LEAGUE_REGEX = /\b(league|serie|liga|division|divisione|championship|eredivisie|bundesliga|allsvenskan|eliteserien|premiership|mls|superleague|brasileir[aã]o)\b/i;

export function classifyCompetition(key: string, title?: string): CompetitionMetadata {
  const direct = KNOWN_COMPETITIONS[key];
  if (direct) {
    return direct;
  }

  const textToScan = `${key} ${title || ''}`.toLowerCase();

  let type: CompetitionType = 'other';
  if (CUP_REGEX.test(textToScan)) {
    type = 'cup';
  } else if (LEAGUE_REGEX.test(textToScan)) {
    type = 'league';
  }

  // Estrai paese se possibile dal prefisso key (es: soccer_spain_...)
  const parts = key.split('_');
  let country = 'Internazionale';
  if (parts.length >= 2 && parts[0] === 'soccer') {
    const rawCountry = parts[1];
    const countryMap: Record<string, string> = {
      italy: 'Italia',
      spain: 'Spagna',
      germany: 'Germania',
      england: 'Inghilterra',
      france: 'Francia',
      netherlands: 'Paesi Bassi',
      portugal: 'Portogallo',
      brazil: 'Brasile',
      argentina: 'Argentina',
      turkey: 'Turchia',
      belgium: 'Belgio',
      switzerland: 'Svizzera',
      austria: 'Austria',
      greece: 'Grecia',
      denmark: 'Danimarca',
      norway: 'Norvegia',
      sweden: 'Svezia',
      usa: 'USA',
      mexico: 'Messico',
      japan: 'Giappone',
      australia: 'Australia',
      uefa: 'Europa',
      fifa: 'Mondo',
      conmebol: 'Sudamerica'
    };
    if (countryMap[rawCountry]) {
      country = countryMap[rawCountry];
    }
  }

  return {
    id: key,
    name: title || key,
    country,
    type
  };
}

/**
 * Ordine di priorità per interrogazione campionati e aggregazione eventi (0 crediti e live odds)
 */
export const PRIORITY_FOOTBALL_KEYS: string[] = [
  'soccer_italy_serie_a',
  'soccer_italy_serie_b',
  'soccer_italy_coppa_italia',
  'soccer_italy_supercoppa',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league',
  'soccer_uefa_super_cup',
  'soccer_uefa_nations_league',
  'soccer_epl',
  'soccer_fa_cup',
  'soccer_england_efl_cup',
  'soccer_efl_champ',
  'soccer_spain_la_liga',
  'soccer_spain_copa_del_rey',
  'soccer_spain_segunda_division',
  'soccer_germany_bundesliga',
  'soccer_germany_dfb_pokal',
  'soccer_germany_bundesliga2',
  'soccer_france_ligue_one',
  'soccer_france_coupe_de_france',
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
  'soccer_australia_aleague',
  'soccer_fifa_world_cup',
  'soccer_conmebol_copa_libertadores',
  'soccer_conmebol_copa_sudamericana'
];

