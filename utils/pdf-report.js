/**
 * utils/pdf-report.js — Generador de Reportes PDF Mensuales
 * Coach Management App
 *
 * Genera un reporte PDF profesional usando jsPDF.
 * El reporte incluye estadísticas del mes, lista de atletas y pagos.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.PDFReport = (() => {

  // ── Colores del tema ─────────────────────────────────────────────────────
  const COLORS = {
    primary:    [249, 115, 22],  // Naranja (#F97316)
    dark:       [13,  17,  23],  // Negro (#0D1117)
    darkGray:   [30,  41,  59],  // Gris oscuro
    medGray:    [100, 116, 139], // Gris medio
    lightGray:  [226, 232, 240], // Gris claro
    white:      [255, 255, 255],
    green:      [34,  197, 94],  // Verde pagado
    red:        [239, 68,  68],  // Rojo no pagado
    greenBg:    [240, 253, 244], // Fondo verde suave
    redBg:      [254, 242, 242], // Fondo rojo suave
  };

  /**
   * Generar el reporte PDF para un mes dado.
   *
   * @param {Object} params
   * @param {number}   params.year          - Año (ej: 2026)
   * @param {number}   params.month         - Mes base 0 (0=Enero)
   * @param {Object[]} params.athletes      - Lista de atletas
   * @param {Object[]} params.payments      - Lista de pagos del mes
   * @param {Object}   params.settings      - Configuración de la app
   * @param {Date[]}   params.practiceDates - Fechas de práctica del mes
   */
  const generate = async (params) => {
    const { year, month, athletes, payments, settings, practiceDates } = params;

    // Verificar que jsPDF esté disponible
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      throw new Error('jsPDF no está cargado. Verifica tu conexión a internet.');
    }

    const { jsPDF } = window.jspdf || window;
    const doc       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const PAGE_W    = doc.internal.pageSize.getWidth();
    const PAGE_H    = doc.internal.pageSize.getHeight();
    const MARGIN    = 15;
    const COL_W     = PAGE_W - MARGIN * 2;
    let   y         = MARGIN; // cursor Y actual

    const DS = window.CoachApp.DateSystem;

    // ── Helpers de dibujo ──────────────────────────────────────────────────
    const setFont    = (style = 'normal', size = 10) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
    };
    const setColor   = (rgb) => doc.setTextColor(...rgb);
    const setFill    = (rgb) => doc.setFillColor(...rgb);
    const setDraw    = (rgb) => doc.setDrawColor(...rgb);
    const checkPage  = (neededH = 20) => {
      if (y + neededH > PAGE_H - MARGIN) {
        doc.addPage();
        y = MARGIN + 5;
      }
    };
    const hLine = (yPos, color = COLORS.lightGray) => {
      setDraw(color);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, yPos, PAGE_W - MARGIN, yPos);
    };

    // ════════════════════════════════════════════════════════════════════
    // ENCABEZADO — Barra naranja con nombre del equipo
    // ════════════════════════════════════════════════════════════════════
    setFill(COLORS.primary);
    doc.rect(0, 0, PAGE_W, 40, 'F');

    // Título de la app
    setFont('bold', 20);
    setColor(COLORS.white);
    doc.text('Coach Management', MARGIN, 16);

    // Nombre del equipo
    setFont('normal', 11);
    setColor([255, 220, 180]);
    doc.text(settings.teamName || 'Mi Equipo', MARGIN, 25);

    // Mes y año del reporte
    setFont('bold', 14);
    setColor(COLORS.white);
    const monthLabel = `Reporte: ${DS.formatMonth(year, month)}`;
    doc.text(monthLabel, PAGE_W - MARGIN, 16, { align: 'right' });

    // Fecha de generación
    setFont('normal', 9);
    setColor([255, 220, 180]);
    doc.text(`Generado: ${DS.formatDateLong(new Date())}`, PAGE_W - MARGIN, 25, { align: 'right' });

    y = 48;

    // ════════════════════════════════════════════════════════════════════
    // RESUMEN ESTADÍSTICO — 4 tarjetas
    // ════════════════════════════════════════════════════════════════════
    const totalPractices = practiceDates.length;
    const totalAthletes  = athletes.length;
    const currency       = settings.currency || '$';
    const price          = settings.pricePerPractice || 0;

    // Calcular pagos y montos
    const today = new Date();
    const pastPractices = practiceDates.filter(d => !DS.isFuture(d));
    const totalExpected = pastPractices.length * totalAthletes * price;

    let totalPaidCount = 0;
    for (const pd of practiceDates) {
      const pid  = DS.getPracticeId(pd);
      const pPay = payments.filter(p => p.practiceId === pid && p.status === 'paid');
      totalPaidCount += pPay.length;
    }

    const totalCollected   = totalPaidCount * price;
    const totalMissedCount = (pastPractices.length * totalAthletes) - totalPaidCount;
    const missedAmount     = totalMissedCount * price;

    // Dibujar 4 tarjetas en 2×2
    const cardW = (COL_W - 8) / 2;
    const cardH = 22;
    const cards = [
      { label: 'Total de Prácticas', value: `${totalPractices}`, sub: `${pastPractices.length} realizadas`,      color: COLORS.dark    },
      { label: 'Total de Jugadores', value: `${totalAthletes}`,  sub: 'registrados',                             color: COLORS.darkGray },
      { label: 'Total Recaudado',    value: `${currency}${totalCollected.toFixed(2)}`,  sub: `de ${currency}${totalExpected.toFixed(2)} esperado`, color: COLORS.green },
      { label: 'Pagos Pendientes',   value: `${currency}${missedAmount.toFixed(2)}`,    sub: `${totalMissedCount} pagos faltantes`,                 color: COLORS.red   },
    ];

    cards.forEach((card, i) => {
      const cx = MARGIN + (i % 2) * (cardW + 8);
      const cy = y + Math.floor(i / 2) * (cardH + 5);

      // Fondo de tarjeta
      setFill(COLORS.lightGray);
      doc.roundedRect(cx, cy, cardW, cardH, 3, 3, 'F');

      // Barra lateral de color
      setFill(card.color);
      doc.roundedRect(cx, cy, 4, cardH, 2, 2, 'F');

      // Texto
      setFont('bold', 14);
      setColor(card.color);
      doc.text(card.value, cx + 10, cy + 11);

      setFont('bold', 7);
      setColor(COLORS.medGray);
      doc.text(card.label.toUpperCase(), cx + 10, cy + 17);

      setFont('normal', 7);
      setColor(COLORS.medGray);
      doc.text(card.sub, cx + 10, cy + 21);
    });

    y += cardH * 2 + 18;

    // ════════════════════════════════════════════════════════════════════
    // TABLA DE PRÁCTICAS DEL MES
    // ════════════════════════════════════════════════════════════════════
    checkPage(30);
    hLine(y);
    y += 6;

    setFont('bold', 12);
    setColor(COLORS.dark);
    doc.text('Prácticas del Mes', MARGIN, y);
    y += 8;

    // Encabezado de columnas
    setFill(COLORS.dark);
    doc.rect(MARGIN, y - 4, COL_W, 8, 'F');
    setFont('bold', 8);
    setColor(COLORS.white);
    doc.text('Fecha',        MARGIN + 3,           y + 0.5);
    doc.text('Día',          MARGIN + 42,           y + 0.5);
    doc.text('Pagaron',      MARGIN + 75,           y + 0.5);
    doc.text('No Pagaron',   MARGIN + 105,          y + 0.5);
    doc.text('Recaudado',    PAGE_W - MARGIN - 3,   y + 0.5, { align: 'right' });
    y += 8;

    let grandTotal = 0;
    for (let idx = 0; idx < practiceDates.length; idx++) {
      checkPage(8);
      const pd      = practiceDates[idx];
      const pid     = DS.getPracticeId(pd);
      const dayName = DS.DAY_NAMES_FULL[DS.jsToIsoDay(pd.getDay())];
      const pPay    = payments.filter(p => p.practiceId === pid && p.status === 'paid').length;
      const pUnpay  = totalAthletes - pPay;
      const recaud  = pPay * price;
      const isFut   = DS.isFuture(pd);
      const isTod   = DS.isToday(pd);
      grandTotal   += recaud;

      // Fila alternada
      if (idx % 2 === 0) {
        setFill([248, 250, 252]);
        doc.rect(MARGIN, y - 4, COL_W, 7, 'F');
      }

      // Si es hoy, resaltar
      if (isTod) {
        setFill([255, 237, 213]);
        doc.rect(MARGIN, y - 4, COL_W, 7, 'F');
      }

      setFont('normal', 8.5);
      setColor(isFut ? COLORS.medGray : COLORS.dark);
      doc.text(DS.formatDateLong(pd), MARGIN + 3, y);

      setFont('bold', 8.5);
      doc.text(dayName, MARGIN + 42, y);

      if (!isFut) {
        setFont('bold', 8.5);
        setColor(COLORS.green);
        doc.text(String(pPay),   MARGIN + 75,  y);
        setColor(COLORS.red);
        doc.text(String(pUnpay), MARGIN + 105, y);
        setColor(COLORS.dark);
        setFont('normal', 8.5);
        doc.text(`${currency}${recaud.toFixed(2)}`, PAGE_W - MARGIN - 3, y, { align: 'right' });
      } else {
        setColor(COLORS.medGray);
        doc.text('— Práctica futura —', MARGIN + 75, y);
      }

      y += 7;
    }

    // Total de la tabla
    hLine(y, COLORS.medGray);
    y += 5;
    setFont('bold', 9);
    setColor(COLORS.dark);
    doc.text('TOTAL RECAUDADO EN EL MES:', MARGIN + 3, y);
    setColor(COLORS.primary);
    doc.text(`${currency}${grandTotal.toFixed(2)}`, PAGE_W - MARGIN - 3, y, { align: 'right' });
    y += 12;

    // ════════════════════════════════════════════════════════════════════
    // TABLA DETALLADA DE ATLETAS
    // ════════════════════════════════════════════════════════════════════
    checkPage(30);
    hLine(y);
    y += 6;

    setFont('bold', 12);
    setColor(COLORS.dark);
    doc.text('Detalle por Atleta', MARGIN, y);
    y += 8;

    // Encabezado
    setFill(COLORS.dark);
    doc.rect(MARGIN, y - 4, COL_W, 8, 'F');
    setFont('bold', 8);
    setColor(COLORS.white);
    doc.text('Atleta',        MARGIN + 3,          y + 0.5);
    doc.text('Prácticas',     MARGIN + 75,          y + 0.5);
    doc.text('Pagadas',       MARGIN + 100,         y + 0.5);
    doc.text('Pendientes',    MARGIN + 125,         y + 0.5);
    doc.text('Total',         PAGE_W - MARGIN - 3, y + 0.5, { align: 'right' });
    y += 8;

    // Ordenar atletas: primero los que más han pagado
    const athleteStats = athletes.map(athlete => {
      const paidPays = payments.filter(p => p.athleteId === athlete.id && p.status === 'paid').length;
      const totalPast = pastPractices.length;
      return { athlete, paidPays, totalPast, unpaid: totalPast - paidPays };
    }).sort((a, b) => b.paidPays - a.paidPays);

    for (let i = 0; i < athleteStats.length; i++) {
      checkPage(8);
      const { athlete, paidPays, totalPast, unpaid } = athleteStats[i];
      const athleteTotal = paidPays * price;

      // Fila alternada
      if (i % 2 === 0) {
        setFill([248, 250, 252]);
        doc.rect(MARGIN, y - 4, COL_W, 7, 'F');
      }

      setFont('normal', 8.5);
      setColor(COLORS.dark);
      doc.text(athlete.name,          MARGIN + 3,           y);
      doc.text(String(totalPast),     MARGIN + 75,          y);

      setFont('bold', 8.5);
      setColor(COLORS.green);
      doc.text(String(paidPays),      MARGIN + 100,         y);
      setColor(unpaid > 0 ? COLORS.red : COLORS.medGray);
      doc.text(String(unpaid),        MARGIN + 125,         y);
      setColor(COLORS.dark);
      setFont('normal', 8.5);
      doc.text(`${currency}${athleteTotal.toFixed(2)}`, PAGE_W - MARGIN - 3, y, { align: 'right' });

      y += 7;
    }

    // ════════════════════════════════════════════════════════════════════
    // PIE DE PÁGINA en cada hoja
    // ════════════════════════════════════════════════════════════════════
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      setFont('normal', 8);
      setColor(COLORS.medGray);
      const footerY = PAGE_H - 8;
      doc.text('Coach Management App', MARGIN, footerY);
      doc.text(`Página ${p} de ${totalPages}`, PAGE_W / 2, footerY, { align: 'center' });
      doc.text(DS.formatDateLong(new Date()), PAGE_W - MARGIN, footerY, { align: 'right' });
      hLine(footerY - 4, COLORS.lightGray);
    }

    // ── Descargar el PDF ─────────────────────────────────────────────────
    const filename = `reporte-${DS.MONTH_NAMES[month].toLowerCase()}-${year}.pdf`;
    doc.save(filename);
    return filename;
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return { generate };

})();
