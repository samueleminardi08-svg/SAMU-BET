import { sharedCache, TTL_RSS_MS } from '../cache/cacheManager.js';
import { RssNewsItem, SportKey } from '../types/models.js';

interface FeedDefinition {
  url: string;
  sourceName: string;
  sport: SportKey;
}

const DEFAULT_FEEDS: FeedDefinition[] = [
  // Calcio & Probabili Formazioni
  {
    url: 'https://www.gazzetta.it/dynamic-feed/rss/section/Calcio.xml',
    sourceName: 'La Gazzetta dello Sport (Calcio)',
    sport: 'football'
  },
  {
    url: 'https://www.gazzetta.it/dynamic-feed/rss/section/Calcio/Serie-A.xml',
    sourceName: 'La Gazzetta dello Sport (Serie A & Formazioni)',
    sport: 'football'
  },
  {
    url: 'https://www.sportmediaset.mediaset.it/rss/calcio.xml',
    sourceName: 'SportMediaset (Calcio & Probabili Formazioni)',
    sport: 'football'
  },
  {
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    sourceName: 'BBC Sport (Football & Team News)',
    sport: 'football'
  },
  // Formula 1
  {
    url: 'https://www.gazzetta.it/dynamic-feed/rss/section/Formula-1.xml',
    sourceName: 'La Gazzetta dello Sport (Formula 1)',
    sport: 'f1'
  },
  {
    url: 'https://www.motorsport.com/rss/f1/news/',
    sourceName: 'Motorsport.com (F1)',
    sport: 'f1'
  },
  {
    url: 'https://www.formulapassion.it/feed',
    sourceName: 'FormulaPassion.it',
    sport: 'f1'
  },
  {
    url: 'https://feeds.bbci.co.uk/sport/formula1/rss.xml',
    sourceName: 'BBC Sport (Formula 1)',
    sport: 'f1'
  },
  // Tennis
  {
    url: 'https://www.gazzetta.it/dynamic-feed/rss/section/Tennis.xml',
    sourceName: 'La Gazzetta dello Sport (Tennis)',
    sport: 'tennis'
  },
  {
    url: 'https://www.ubitennis.com/feed/',
    sourceName: 'Ubitennis',
    sport: 'tennis'
  },
  {
    url: 'https://feeds.bbci.co.uk/sport/tennis/rss.xml',
    sourceName: 'BBC Sport (Tennis)',
    sport: 'tennis'
  },
  {
    url: 'https://www.oasport.it/feed/',
    sourceName: 'OA Sport',
    sport: 'tennis'
  }
];

// Dizionario alias per squadre, piloti e tennisti principali per migliorare il matching RSS
const PARTICIPANT_ALIASES: Record<string, string[]> = {
  'internazionale': ['inter', 'nerazzurri', 'inzaghi', 'lautaro'],
  'inter milan': ['inter', 'nerazzurri'],
  'ac milan': ['milan', 'rossoneri', 'leao'],
  'juventus': ['juve', 'bianconeri', 'vlahovic'],
  'ssc napoli': ['napoli', 'azzurri', 'conte', 'lukaku'],
  'as roma': ['roma', 'giallorossi', 'dybala'],
  'ss lazio': ['lazio', 'biancocelesti'],
  'atalanta bc': ['atalanta', 'dea', 'gasperini'],
  'fiorentina': ['viola', 'fiorentina'],
  'real madrid': ['real madrid', 'blancos', 'mbappe', 'vinicius', 'ancelotti'],
  'fc barcelona': ['barcellona', 'barcelona', 'barca', 'yamal', 'lewandowski'],
  'manchester city': ['man city', 'city', 'guardiola', 'haaland'],
  'manchester united': ['man utd', 'man united', 'united'],
  'liverpool fc': ['liverpool', 'reds', 'salah', 'slot'],
  'arsenal fc': ['arsenal', 'gunners', 'arteta', 'saka'],
  'bayern munich': ['bayern', 'monaco', 'kane'],
  'paris saint germain': ['psg', 'parigi'],
  'max verstappen': ['verstappen', 'red bull'],
  'charles leclerc': ['leclerc', 'ferrari'],
  'lewis hamilton': ['hamilton', 'ferrari'],
  'lando norris': ['norris', 'mclaren'],
  'oscar piastri': ['piastri', 'mclaren'],
  'george russell': ['russell', 'mercedes'],
  'carlos sainz': ['sainz', 'williams'],
  'fernando alonso': ['alonso', 'aston martin'],
  'kimi antonelli': ['antonelli', 'mercedes'],
  'jannik sinner': ['sinner', 'jannik'],
  'carlos alcaraz': ['alcaraz', 'carlos'],
  'novak djokovic': ['djokovic', 'nole'],
  'alexander zverev': ['zverev'],
  'daniil medvedev': ['medvedev'],
  'lorenzo musetti': ['musetti'],
  'matteo berrettini': ['berrettini'],
  'jasmine paolini': ['paolini', 'jasmine'],
  'aryna sabalenka': ['sabalenka'],
  'iga swiatek': ['swiatek']
};

export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlAndTruncate(raw: string, maxLen = 220): string {
  const withoutCdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const withoutTags = withoutCdata
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&egrave;/gi, 'è')
    .replace(/&agrave;/gi, 'à')
    .replace(/&ograve;/gi, 'ò')
    .replace(/&ugrave;/gi, 'ù')
    .replace(/&igrave;/gi, 'ì')
    .replace(/\s+/g, ' ')
    .trim();

  if (withoutTags.length <= maxLen) return withoutTags;
  return withoutTags.slice(0, maxLen - 1).trimEnd() + '…';
}

function extractXmlTag(block: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(regex);
  if (!match) return '';
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

export function parseRssXmlItems(xml: string, sourceName: string): RssNewsItem[] {
  const items: RssNewsItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks.slice(0, 40)) {
    const rawTitle = extractXmlTag(block, 'title');
    const rawDesc = extractXmlTag(block, 'description');
    const rawLink = extractXmlTag(block, 'link');
    const rawDate = extractXmlTag(block, 'pubDate') || extractXmlTag(block, 'dc:date');

    const title = stripHtmlAndTruncate(rawTitle, 140);
    if (!title) continue;

    // Rispetto ToS e robots.txt (Sez. 4): solo titolo, data, breve estratto (max 220 char) e link + fonte
    const excerpt = stripHtmlAndTruncate(rawDesc, 220);

    items.push({
      title,
      pubDate: rawDate || new Date().toISOString(),
      excerpt,
      link: rawLink.trim(),
      source: sourceName
    });
  }

  return items;
}

export async function fetchSportRssItems(sport: SportKey): Promise<RssNewsItem[]> {
  const cacheKey = `rss:${sport}`;
  const cached = sharedCache.get<RssNewsItem[]>(cacheKey);
  if (cached) return cached;

  const feeds = DEFAULT_FEEDS.filter((f) => f.sport === sport);
  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const res = await fetch(f.url, {
          headers: {
            'User-Agent': 'SamuBet-NewsReader/1.0 (+RSS-Metadata-Only)',
            Accept: 'application/rss+xml, application/xml, text/xml'
          },
          signal: controller.signal
        });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRssXmlItems(xml, f.sourceName);
      } catch {
        return [];
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  const merged: RssNewsItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      merged.push(...r.value);
    }
  }

  sharedCache.set(cacheKey, merged, TTL_RSS_MS);
  return merged;
}

export function buildParticipantSearchTokens(participants: string[], eventName: string): string[] {
  const tokens = new Set<string>();
  const allNames = [...participants, eventName];

  for (const raw of allNames) {
    const norm = normalizeText(raw);
    if (!norm) continue;

    if (norm.length >= 4) {
      tokens.add(norm);
    }

    // Controlla alias conosciuti
    for (const [canonical, aliases] of Object.entries(PARTICIPANT_ALIASES)) {
      if (norm.includes(canonical) || aliases.some((a) => norm.includes(a))) {
        aliases.forEach((a) => tokens.add(normalizeText(a)));
      }
    }

    // Aggiungi parole significative (>= 4 lettere, escludendo termini generici)
    const stopWords = new Set([
      'calcio',
      'club',
      'sport',
      'united',
      'city',
      'real',
      'gran',
      'premio',
      'grand',
      'prix',
      'open',
      'tour',
      'atp',
      'wta'
    ]);

    for (const word of norm.split(' ')) {
      if (word.length >= 4 && !stopWords.has(word)) {
        tokens.add(word);
      }
    }
  }

  return Array.from(tokens);
}

/**
 * Filtra gli articoli RSS per evento associando i nomi di squadre/giocatori/piloti
 * presenti nel titolo o nell'estratto (max 5 per evento - Sez. 4).
 */
export function matchNewsForEvent(
  allSportNews: RssNewsItem[],
  participants: string[],
  eventName: string,
  maxItems = 5
): RssNewsItem[] {
  const searchTokens = buildParticipantSearchTokens(participants, eventName);
  if (searchTokens.length === 0) return [];

  const scored: Array<{ item: RssNewsItem; hits: number }> = [];
  const seenTitles = new Set<string>();

  for (const item of allSportNews) {
    const normTitle = normalizeText(item.title);
    if (seenTitles.has(normTitle)) continue;

    const haystack = `${normTitle} ${normalizeText(item.excerpt)}`;
    let hits = 0;

    for (const token of searchTokens) {
      if (haystack.includes(token)) {
        hits += normTitle.includes(token) ? 2 : 1;
      }
    }

    if (hits > 0) {
      // Dai priorità alle notizie che parlano di formazioni, titolari, infortuni o squalifiche
      const lineupKeywords = [
        'formazion',
        'probabil',
        'titolar',
        'infortun',
        'squalific',
        'convocat',
        'ballottagg',
        'assent',
        'lineup',
        'starting',
        'injur',
        'team news'
      ];
      for (const kw of lineupKeywords) {
        if (haystack.includes(kw)) {
          hits += 2;
        }
      }
      seenTitles.add(normTitle);
      scored.push({ item, hits });
    }
  }

  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, maxItems).map((s) => s.item);
}

export function getActiveRssSourcesBySport(sport: SportKey): string[] {
  return DEFAULT_FEEDS.filter((f) => f.sport === sport).map((f) => f.sourceName);
}

