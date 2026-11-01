import { BettingSlipResult } from '../config/riskConfig';

/**
 * Disegna e scarica la schedina come immagine ad alta risoluzione (PNG a 1200px di larghezza),
 * con design professionale da ricevitoria digitale (dark neon, trasparenze, gradienti,
 * tipografia nitida, badge per ogni selezione e dettagli quote/EV).
 */
export async function downloadSlipAsImage(
  slip: BettingSlipResult,
  generatedAt: string,
  filename?: string
): Promise<void> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = 1200;
  const padding = 50;
  const cardWidth = width - padding * 2;

  // Calcola l'altezza dinamica in base al numero di selezioni
  const headerHeight = 220;
  const kpiHeight = 150;
  const cardGap = 20;

  // Calcola altezza di ciascuna card (alcune con 2 righe di fattori)
  const itemHeights = slip.selections.map((sel) => {
    let h = 135;
    if (sel.keyFactors && sel.keyFactors.length > 0) {
      h += 38;
    }
    return h;
  });

  const cardsTotalHeight =
    itemHeights.reduce((acc, h) => acc + h, 0) + (slip.selections.length - 1) * cardGap;
  const footerHeight = 180;
  const totalHeight = headerHeight + kpiHeight + cardsTotalHeight + footerHeight + padding * 2;

  canvas.width = width;
  canvas.height = totalHeight;

  // 1. Sfondo scuro elegante con gradiente radiale
  const bgGrad = ctx.createLinearGradient(0, 0, width, totalHeight);
  bgGrad.addColorStop(0, '#0a0e17');
  bgGrad.addColorStop(0.5, '#0d1527');
  bgGrad.addColorStop(1, '#070a10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, totalHeight);

  // Bagliore neon soffuso in alto a destra
  const glow = ctx.createRadialGradient(width - 150, 150, 20, width - 150, 150, 350);
  glow.addColorStop(0, 'rgba(0, 230, 153, 0.12)');
  glow.addColorStop(1, 'rgba(0, 230, 153, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, totalHeight);

  // Cornice esterna con raggio
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 20, 20, width - 40, totalHeight - 40, 24);
  ctx.stroke();

  // 2. HEADER
  const headerY = padding + 10;

  // Logo / Brand
  ctx.fillStyle = '#00e699';
  ctx.font = '900 38px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText('SAMU BET', padding + 10, headerY + 40);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '600 16px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText('INTELLIGENZA ARTIFICIALE QUANTITATIVA & PALINSESTO SNAI', padding + 12, headerY + 68);

  // Badge tipo schedina
  const typeText =
    slip.selections.length === 1
      ? 'SCHEDINA SINGOLA'
      : `MULTIPLA ${slip.selections.length} EVENTI`;
  ctx.font = '700 15px "Inter", "Segoe UI", system-ui, sans-serif';
  const badgeWidth = ctx.measureText(typeText).width + 30;
  const badgeX = width - padding - badgeWidth - 10;
  const badgeY = headerY + 12;

  ctx.fillStyle = 'rgba(0, 230, 153, 0.15)';
  drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, 34, 17);
  ctx.fill();
  ctx.strokeStyle = '#00e699';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, 34, 17);
  ctx.stroke();

  ctx.fillStyle = '#00e699';
  ctx.fillText(typeText, badgeX + 15, badgeY + 23);

  // Data e ora
  const dateFormatted = new Date(generatedAt).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '500 14px "Inter", "Segoe UI", system-ui, sans-serif';
  const dateText = `Generata il: ${dateFormatted}`;
  ctx.fillText(dateText, width - padding - ctx.measureText(dateText).width - 10, headerY + 70);

  // Separatore orizzontale
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, headerY + 95);
  ctx.lineTo(width - padding, headerY + 95);
  ctx.stroke();

  // 3. SEZIONE KPI (Quota Totale, Probabilità, Valore EV, Potenziale su 10€)
  const kpiY = headerY + 115;
  const kpiBoxWidth = (cardWidth - 45) / 4;
  const kpiBoxHeight = 110;

  const kpis = [
    {
      label: 'QUOTA TOTALE',
      val: slip.totalOdds.toFixed(2),
      sub: `Target: ${slip.targetOdds.toFixed(2)}`,
      color: '#00e699'
    },
    {
      label: 'PROBABILITÀ',
      val: `${(slip.combinedProbability * 100).toFixed(1)}%`,
      sub: `Difficoltà: ${slip.difficultyLabel}`,
      color: '#60a5fa'
    },
    {
      label: 'VALORE ATTESO (EV)',
      val: `${slip.combinedEv >= 0 ? '+' : ''}${(slip.combinedEv * 100).toFixed(1)}%`,
      sub: slip.combinedEv >= 0 ? 'Vantaggio matematico' : 'Margine banco',
      color: slip.combinedEv >= 0 ? '#34d399' : '#f87171'
    },
    {
      label: 'POTENZIALE SU 10€',
      val: `€ ${(slip.totalOdds * 10).toFixed(2)}`,
      sub: 'Puntata base 10 €',
      color: '#fbbf24'
    }
  ];

  kpis.forEach((kpi, i) => {
    const kX = padding + i * (kpiBoxWidth + 15);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    drawRoundedRect(ctx, kX, kpiY, kpiBoxWidth, kpiBoxHeight, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, kX, kpiY, kpiBoxWidth, kpiBoxHeight, 14);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '700 12px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(kpi.label, kX + 16, kpiY + 28);

    ctx.fillStyle = kpi.color;
    ctx.font = '900 28px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(kpi.val, kX + 16, kpiY + 66);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '500 12px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(kpi.sub, kX + 16, kpiY + 92);
  });

  // 4. LISTA EVENTI
  let currentY = kpiY + kpiBoxHeight + 35;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '800 14px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText('PRONOSTICI SELEZIONATI DALL\'ALGORITMO', padding, currentY - 12);

  slip.selections.forEach((sel, idx) => {
    const itemH = itemHeights[idx];
    const itemY = currentY;

    // Card background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    drawRoundedRect(ctx, padding, itemY, cardWidth, itemH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, padding, itemY, cardWidth, itemH, 16);
    ctx.stroke();

    // Numero progressivo cerchiato
    ctx.fillStyle = 'rgba(0, 230, 153, 0.12)';
    ctx.beginPath();
    ctx.arc(padding + 32, itemY + 38, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00e699';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#00e699';
    ctx.font = '800 15px "Inter", "Segoe UI", system-ui, sans-serif';
    const numStr = String(idx + 1);
    ctx.fillText(numStr, padding + 32 - ctx.measureText(numStr).width / 2, itemY + 43);

    // Titolo Partita
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 20px "Inter", "Segoe UI", system-ui, sans-serif';
    const eventTitle = sel.eventName;
    ctx.fillText(eventTitle, padding + 65, itemY + 36);

    // Competizione e data
    const datePart = new Date(sel.commenceTime).toLocaleString('it-IT', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '500 13px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${sel.competitionName} • ${datePart}`, padding + 65, itemY + 56);

    // Box Quota & Probabilità a destra
    const oddsBoxW = 190;
    const oddsBoxX = width - padding - oddsBoxW - 15;
    const oddsBoxY = itemY + 16;
    ctx.fillStyle = 'rgba(0, 230, 153, 0.08)';
    drawRoundedRect(ctx, oddsBoxX, oddsBoxY, oddsBoxW, 58, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 230, 153, 0.3)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, oddsBoxX, oddsBoxY, oddsBoxW, 58, 12);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '600 12px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText('QUOTA', oddsBoxX + 16, oddsBoxY + 24);
    ctx.fillText('PROB.', oddsBoxX + 105, oddsBoxY + 24);

    ctx.fillStyle = '#00e699';
    ctx.font = '900 24px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(sel.effectiveOdds.toFixed(2), oddsBoxX + 16, oddsBoxY + 49);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 20px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${Math.round(sel.pFinal * 100)}%`, oddsBoxX + 105, oddsBoxY + 48);

    // Riga Pronostico e Mercato
    const selY = itemY + 92;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '600 14px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`Mercato: ${sel.market}`, padding + 65, selY);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '800 16px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`➔ Pronostico: ${sel.selection}`, padding + 65, selY + 24);

    // Pill AI Factors se presente
    if (sel.keyFactors && sel.keyFactors.length > 0) {
      const factorY = itemY + 138;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      drawRoundedRect(ctx, padding + 65, factorY - 14, cardWidth - 110, 28, 8);
      ctx.fill();

      ctx.fillStyle = '#a7f3d0';
      ctx.font = '500 12px "Inter", "Segoe UI", system-ui, sans-serif';
      const factorText = `💡 Motivazione AI: ${sel.keyFactors.slice(0, 2).join(' • ')}`;
      const truncated =
        factorText.length > 125 ? factorText.slice(0, 122).trim() + '…' : factorText;
      ctx.fillText(truncated, padding + 76, factorY + 4);
    }

    currentY += itemH + cardGap;
  });

  // 5. FOOTER & DISCLAIMER
  const footerY = currentY + 15;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, footerY);
  ctx.lineTo(width - padding, footerY);
  ctx.stroke();

  // QR Code fittizio estetico o watermark
  const qrX = width - padding - 95;
  const qrY = footerY + 20;
  drawFauxQRCode(ctx, qrX, qrY, 80);

  // Disclaimer e testi
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 15px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText('SAMU BET • Analisi Predittiva e Monitoraggio SNAI', padding, footerY + 32);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '400 12px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(
    'Le stime e le quote sono calcolate tramite modelli matematici di Poisson e valutazioni Gemini AI.',
    padding,
    footerY + 54
  );
  ctx.fillText(
    'Il gioco può causare dipendenza patologica ed è vietato ai minori di 18 anni. Gioca sempre responsabilmente.',
    padding,
    footerY + 74
  );
  ctx.fillText(
    'Controlla sempre la quota effettiva e la disponibilità delle selezioni sull\'app o sito ufficiale SNAI.',
    padding,
    footerY + 94
  );

  // 6. Download Trigger
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const link = document.createElement('a');
  const safeDate = new Date(generatedAt).toISOString().slice(0, 10);
  link.download = filename || `SAMU-BET-Schedina-${safeDate}-${Math.round(slip.totalOdds)}x.png`;
  link.href = dataUrl;
  link.click();
}

/**
 * Disegna un rettangolo arrotondato
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Disegna una decorazione geometrica simile a un QR Code (effetto ricevitoria moderno)
 */
function drawFauxQRCode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  drawRoundedRect(ctx, x, y, size, size, 8);
  ctx.fill();

  ctx.fillStyle = '#00e699';
  const dotSize = size / 8;

  // 3 riquadri angolari classici
  const drawCorner = (cx: number, cy: number) => {
    ctx.fillRect(cx, cy, dotSize * 2.5, dotSize * 2.5);
    ctx.clearRect(cx + dotSize * 0.5, cy + dotSize * 0.5, dotSize * 1.5, dotSize * 1.5);
    ctx.fillRect(cx + dotSize * 0.8, cy + dotSize * 0.8, dotSize * 0.9, dotSize * 0.9);
  };

  drawCorner(x + dotSize * 0.5, y + dotSize * 0.5);
  drawCorner(x + size - dotSize * 3, y + dotSize * 0.5);
  drawCorner(x + dotSize * 0.5, y + size - dotSize * 3);

  // Pattern centrale
  ctx.fillStyle = 'rgba(0, 230, 153, 0.6)';
  ctx.fillRect(x + dotSize * 3.5, y + dotSize * 3.5, dotSize, dotSize);
  ctx.fillRect(x + dotSize * 5, y + dotSize * 4, dotSize, dotSize);
  ctx.fillRect(x + dotSize * 3.5, y + dotSize * 5.5, dotSize, dotSize);
}
