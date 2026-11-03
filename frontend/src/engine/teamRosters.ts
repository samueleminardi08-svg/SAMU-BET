export interface TeamRoster {
  striker: string;
  winger: string;
  midfielder: string;
  defender: string;
  formation: string;
  coachNote: string;
}

export const KNOWN_TEAM_ROSTERS: Record<string, TeamRoster> = {
  // Serie A & B
  inter: {
    striker: 'Lautaro Martínez',
    winger: 'Marcus Thuram',
    midfielder: 'Hakan Çalhanoğlu',
    defender: 'Alessandro Bastoni',
    formation: '3-5-2',
    coachNote: 'Lautaro Martínez e Thuram confermati dal 1° minuto; Çalhanoğlu rigorista designato.'
  },
  internazionale: {
    striker: 'Lautaro Martínez',
    winger: 'Marcus Thuram',
    midfielder: 'Hakan Çalhanoğlu',
    defender: 'Alessandro Bastoni',
    formation: '3-5-2',
    coachNote: 'Lautaro Martínez e Thuram confermati dal 1° minuto; Çalhanoğlu rigorista designato.'
  },
  milan: {
    striker: 'Álvaro Morata',
    winger: 'Rafael Leão',
    midfielder: 'Christian Pulisic',
    defender: 'Theo Hernández',
    formation: '4-2-3-1',
    coachNote: 'Pulisic e Leão titolari inamovibili a supporto di Morata prima punta.'
  },
  'ac milan': {
    striker: 'Álvaro Morata',
    winger: 'Rafael Leão',
    midfielder: 'Christian Pulisic',
    defender: 'Theo Hernández',
    formation: '4-2-3-1',
    coachNote: 'Pulisic e Leão titolari inamovibili a supporto di Morata prima punta.'
  },
  juventus: {
    striker: 'Dušan Vlahović',
    winger: 'Kenan Yıldız',
    midfielder: 'Teun Koopmeiners',
    defender: 'Federico Gatti',
    formation: '4-2-3-1',
    coachNote: 'Vlahović terminale offensivo e rigorista primario, assistito da Yıldız e Koopmeiners.'
  },
  napoli: {
    striker: 'Romelu Lukaku',
    winger: 'Khvicha Kvaratskhelia',
    midfielder: 'Scott McTominay',
    defender: 'Giovanni Di Lorenzo',
    formation: '4-3-3',
    coachNote: 'Lukaku riferimento avanzato con Kvara e gli inserimenti aerei di McTominay.'
  },
  roma: {
    striker: 'Artem Dovbyk',
    winger: 'Paulo Dybala',
    midfielder: 'Lorenzo Pellegrini',
    defender: 'Gianluca Mancini',
    formation: '3-4-2-1',
    coachNote: 'Dovbyk centravanti d\'area supportato dalla classe di Dybala e Pellegrini.'
  },
  'as roma': {
    striker: 'Artem Dovbyk',
    winger: 'Paulo Dybala',
    midfielder: 'Lorenzo Pellegrini',
    defender: 'Gianluca Mancini',
    formation: '3-4-2-1',
    coachNote: 'Dovbyk centravanti d\'area supportato dalla classe di Dybala e Pellegrini.'
  },
  lazio: {
    striker: 'Valentín Castellanos',
    winger: 'Mattia Zaccagni',
    midfielder: 'Matteo Guendouzi',
    defender: 'Mario Gila',
    formation: '4-2-3-1',
    coachNote: 'Zaccagni capitano e rigorista con Castellanos attaccante di movimento.'
  },
  atalanta: {
    striker: 'Mateo Retegui',
    winger: 'Ademola Lookman',
    midfielder: 'Charles De Ketelaere',
    defender: 'Isak Hien',
    formation: '3-4-2-1',
    coachNote: 'Retegui capocannoniere al centro dell\'attacco con Lookman e De Ketelaere.'
  },
  fiorentina: {
    striker: 'Moise Kean',
    winger: 'Albert Guðmundsson',
    midfielder: 'Andrea Colpani',
    defender: 'Pietro Comuzzo',
    formation: '4-2-3-1',
    coachNote: 'Moise Kean terminale d\'attacco affiancato dalla fantasia di Guðmundsson.'
  },
  bologna: {
    striker: 'Santiago Castro',
    winger: 'Riccardo Orsolini',
    midfielder: 'Remo Freuler',
    defender: 'Sam Beukema',
    formation: '4-2-3-1',
    coachNote: 'Orsolini rigorista e specialista dei piazzati con la grinta di Castro.'
  },
  torino: {
    striker: 'Ché Adams',
    winger: 'Nikola Vlašić',
    midfielder: 'Samuele Ricci',
    defender: 'Saúl Coco',
    formation: '3-5-2',
    coachNote: 'Ché Adams guida l\'attacco granata supportato dalla regia di Ricci.'
  },
  como: {
    striker: 'Patrick Cutrone',
    winger: 'Gabriel Strefezza',
    midfielder: 'Nico Paz',
    defender: 'Alberto Moreno',
    formation: '4-2-3-1',
    coachNote: 'Nico Paz faro illuminante sulla trequarti per servire Cutrone e Strefezza.'
  },
  monza: {
    striker: 'Milan Đurić',
    winger: 'Dany Mota',
    midfielder: 'Matteo Pessina',
    defender: 'Pablo Marí',
    formation: '3-4-2-1',
    coachNote: 'Đurić riferimento aereo sulle palle alte per le sponde a rimorchio di Pessina.'
  },
  genoa: {
    striker: 'Andrea Pinamonti',
    winger: 'Morten Frendrup',
    midfielder: 'Milan Badelj',
    defender: 'Johan Vásquez',
    formation: '3-5-2',
    coachNote: 'Pinamonti boa d\'attacco a sfruttare i cross dalle fasce a Marassi.'
  },
  parma: {
    striker: 'Ange-Yoan Bonny',
    winger: 'Dennis Man',
    midfielder: 'Adrián Bernabé',
    defender: 'Botond Balogh',
    formation: '4-2-3-1',
    coachNote: 'Dennis Man e Bonny frecce offensive con le geometrie di Bernabé.'
  },
  venezia: {
    striker: 'Joel Pohjanpalo',
    winger: 'Gaetano Oristanio',
    midfielder: 'Gianluca Busio',
    defender: 'Jay Idzes',
    formation: '3-4-2-1',
    coachNote: 'Pohjanpalo finalizzatore e leader carismatico dei lagunari al Penzo.'
  },
  udinese: {
    striker: 'Lorenzo Lucca',
    winger: 'Florian Thauvin',
    midfielder: 'Jesper Karlström',
    defender: 'Jaka Bijol',
    formation: '3-5-2',
    coachNote: 'Thauvin capitano e ispiratore delle giocate per la statura di Lucca.'
  },
  lecce: {
    striker: 'Nikola Krstović',
    winger: 'Patrick Dorgu',
    midfielder: 'Ylber Ramadani',
    defender: 'Federico Baschirotto',
    formation: '4-3-3',
    coachNote: 'Krstović primo tiratore della squadra con Dorgu a tutta fascia.'
  },
  cagliari: {
    striker: 'Roberto Piccoli',
    winger: 'Zito Luvumbo',
    midfielder: 'Razvan Marin',
    defender: 'Sebastiano Luperto',
    formation: '4-2-3-1',
    coachNote: 'Luvumbo velocista sulle corsie esterne a creare superiorità.'
  },

  // Coppe e Grandi Europee
  'real madrid': {
    striker: 'Kylian Mbappé',
    winger: 'Vinícius Júnior',
    midfielder: 'Jude Bellingham',
    defender: 'Antonio Rüdiger',
    formation: '4-3-1-2',
    coachNote: 'Coppia gol Mbappé - Vinícius supportata dagli inserimenti letali di Bellingham.'
  },
  barcelona: {
    striker: 'Robert Lewandowski',
    winger: 'Lamine Yamal',
    midfielder: 'Pedri',
    defender: 'Pau Cubarsí',
    formation: '4-3-3',
    coachNote: 'Lewandowski terminale infallibile con Lamine Yamal e Raphinha sulle fasce.'
  },
  'atletico madrid': {
    striker: 'Julián Álvarez',
    winger: 'Antoine Griezmann',
    midfielder: 'Rodrigo De Paul',
    defender: 'José María Giménez',
    formation: '4-4-2',
    coachNote: 'Julián Álvarez e Griezmann tandem offensivo mobile al Metropolitano.'
  },
  'atlético madrid': {
    striker: 'Julián Álvarez',
    winger: 'Antoine Griezmann',
    midfielder: 'Rodrigo De Paul',
    defender: 'José María Giménez',
    formation: '4-4-2',
    coachNote: 'Julián Álvarez e Griezmann tandem offensivo mobile al Metropolitano.'
  },
  'manchester city': {
    striker: 'Erling Haaland',
    winger: 'Savinho',
    midfielder: 'Phil Foden',
    defender: 'Rúben Dias',
    formation: '4-1-4-1',
    coachNote: 'Erling Haaland terminale inamovibile con Foden e Bernardo Silva suggeritori.'
  },
  arsenal: {
    striker: 'Kai Havertz',
    winger: 'Bukayo Saka',
    midfielder: 'Martin Ødegaard',
    defender: 'Gabriel Magalhães',
    formation: '4-3-3',
    coachNote: 'Bukayo Saka leader e tiratore di rigori e corner; Gabriel minaccia sui piazzati.'
  },
  liverpool: {
    striker: 'Mohamed Salah',
    winger: 'Luis Díaz',
    midfielder: 'Alexis Mac Allister',
    defender: 'Virgil van Dijk',
    formation: '4-3-3',
    coachNote: 'Mohamed Salah punto focale offensivo e rigorista dei Reds con Luis Díaz.'
  },
  'manchester united': {
    striker: 'Rasmus Højlund',
    winger: 'Alejandro Garnacho',
    midfielder: 'Bruno Fernandes',
    defender: 'Lisandro Martínez',
    formation: '4-2-3-1',
    coachNote: 'Bruno Fernandes faro della trequarti con Garnacho e Højlund in attacco.'
  },
  'bayern munich': {
    striker: 'Harry Kane',
    winger: 'Michael Olise',
    midfielder: 'Jamal Musiala',
    defender: 'Dayot Upamecano',
    formation: '4-2-3-1',
    coachNote: 'Harry Kane centravanti e rigorista infallibile con Musiala e Olise incursori.'
  },
  'borussia dortmund': {
    striker: 'Serhou Guirassy',
    winger: 'Jamie Gittens',
    midfielder: 'Julian Brandt',
    defender: 'Nico Schlotterbeck',
    formation: '4-2-3-1',
    coachNote: 'Serhou Guirassy bomber al Signal Iduna Park con Brandt rifinitore.'
  },
  'bayer leverkusen': {
    striker: 'Victor Boniface',
    winger: 'Florian Wirtz',
    midfielder: 'Granit Xhaka',
    defender: 'Jonathan Tah',
    formation: '3-4-2-1',
    coachNote: 'Florian Wirtz genio della trequarti con Boniface finalizzatore d\'area.'
  },
  'paris saint-germain': {
    striker: 'Ousmane Dembélé',
    winger: 'Bradley Barcola',
    midfielder: 'Vitinha',
    defender: 'Achraf Hakimi',
    formation: '4-3-3',
    coachNote: 'Tridente fulmineo con Dembélé e Barcola, Hakimi a spingere sulla destra.'
  },
  psg: {
    striker: 'Ousmane Dembélé',
    winger: 'Bradley Barcola',
    midfielder: 'Vitinha',
    defender: 'Achraf Hakimi',
    formation: '4-3-3',
    coachNote: 'Tridente fulmineo con Dembélé e Barcola, Hakimi a spingere sulla destra.'
  },
  feyenoord: {
    striker: 'Santiago Giménez',
    winger: 'Igor Paixão',
    midfielder: 'Quinten Timber',
    defender: 'Dávid Hancko',
    formation: '4-3-3',
    coachNote: 'Giménez ed Igor Paixão punti di forza offensivi del Feyenoord al De Kuip.'
  },
  'sporting cp': {
    striker: 'Viktor Gyökeres',
    winger: 'Trincão',
    midfielder: 'Morten Hjulmand',
    defender: 'Gonçalo Inácio',
    formation: '3-4-2-1',
    coachNote: 'Viktor Gyökeres capocannoniere dominante e perno offensivo dello Sporting.'
  },
  galatasaray: {
    striker: 'Victor Osimhen',
    winger: 'Barış Alper Yılmaz',
    midfielder: 'Gabriel Sara',
    defender: 'Davinson Sánchez',
    formation: '4-2-3-1',
    coachNote: 'Victor Osimhen bomber e idolo del pubblico con Barış Alper in corsia.'
  },
  'aston villa': {
    striker: 'Ollie Watkins',
    winger: 'Leon Bailey',
    midfielder: 'Morgan Rogers',
    defender: 'Ezri Konsa',
    formation: '4-2-3-1',
    coachNote: 'Watkins terminale veloce e letale in profondità supportato da Rogers.'
  },
  villarreal: {
    striker: 'Ayoze Pérez',
    winger: 'Álex Baena',
    midfielder: 'Dani Parejo',
    defender: 'Raúl Albiol',
    formation: '4-4-2',
    coachNote: 'Ayoze Pérez punta d\'area con i filtranti di Baena e le punizioni di Parejo.'
  },
  chelsea: {
    striker: 'Nicolas Jackson',
    winger: 'Cole Palmer',
    midfielder: 'Moises Caicedo',
    defender: 'Levi Colwill',
    formation: '4-2-3-1',
    coachNote: 'Cole Palmer trequartista e rigorista primario dei Blues.'
  },
  tottenham: {
    striker: 'Dominic Solanke',
    winger: 'Son Heung-min',
    midfielder: 'James Maddison',
    defender: 'Cristian Romero',
    formation: '4-3-3',
    coachNote: 'Son capitano e trascinatore con Maddison rifinitore e Solanke centravanti.'
  }
};

export function getRosterForTeam(teamName: string): TeamRoster {
  const norm = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, roster] of Object.entries(KNOWN_TEAM_ROSTERS)) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm === normKey || norm.includes(normKey) || normKey.includes(norm)) {
      return roster;
    }
  }

  // Fallback realistico per squadre non ancora censite nel dizionario
  return {
    striker: `Attaccante #${teamName}`,
    winger: `Ala #${teamName}`,
    midfielder: `Regista #${teamName}`,
    defender: `Capitano #${teamName}`,
    formation: '4-3-3',
    coachNote: `Formazione tipo di ${teamName} con assetto bilanciato e pressione sulle seconde palle.`
  };
}
