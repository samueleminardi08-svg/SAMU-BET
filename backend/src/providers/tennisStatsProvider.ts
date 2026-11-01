import { EventStatsContext } from '../types/models.js';

/**
 * Sezione 4: "Tennis: provider gratuito o a basso costo per ranking, forma, superficie, head-to-head;
 * se non esiste una fonte affidabile gratuita, usa le sole quote e i feed RSS e dichiaralo."
 */
export async function getTennisEventStats(competitionName: string): Promise<EventStatsContext> {
  const lower = competitionName.toLowerCase();
  let surfaceHint = 'Superficie variabile / da torneo ufficiale';
  if (lower.includes('roland garros') || lower.includes('french open') || lower.includes('rome') || lower.includes('madrid') || lower.includes('monte carlo')) {
    surfaceHint = 'Terra battuta (Clay)';
  } else if (lower.includes('wimbledon') || lower.includes('halle') || lower.includes('queen')) {
    surfaceHint = 'Erba (Grass)';
  } else if (lower.includes('us open') || lower.includes('australian open') || lower.includes('paris') || lower.includes('finals') || lower.includes('indian wells') || lower.includes('miami')) {
    surfaceHint = 'Cemento (Hard court)';
  }

  return {
    competitionCovered: false,
    summaryLines: [
      `Torneo: ${competitionName} (${surfaceHint}).`,
      'Dichiarazione trasparenza: non esistendo una API gratuita affidabile per statistiche live H2H/ranking ATP-WTA senza abbonamento, il motore utilizza le quote bookmaker depurate dal margine e i feed RSS specializzati (Ubitennis, Gazzetta Tennis, BBC Tennis, OA Sport).'
    ],
    injuriesOrAbsences: [],
    sourceName: 'Solo quote The Odds API + Feed RSS Tennis'
  };
}

