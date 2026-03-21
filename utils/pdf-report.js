/**
 * utils/pdf-report.js — Generador de Reportes PDF Mensuales
 * Coach Management App v1.0.1
 *
 * Correcciones v1.0.1:
 *  - Recibe attendances como parámetro
 *  - Columnas de asistencia en tabla de prácticas y atletas
 *  - ayudaSocial excluidos de cálculos de ingresos
 *  - Pendientes = asistentes facturables - pagos
 *  - 4 tarjetas summary: Prácticas · Asistencias · Recaudado · Pendiente
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.PDFReport = (() => {

  const C = {
    primary:   [249, 115,  22],
    dark:      [ 13,  17,  23],
    darkGray:  [ 30,  41,  59],
    medGray:   [100, 116, 139],
    lightGray: [226, 232, 240],
    white:     [255, 255, 255],
    green:     [ 34, 197,  94],
    red:       [239,  68,  68],
    yellow:    [234, 179,   8],
  };

  /**
   * @param {Object}   params
   * @param {number}   params.year
   * @param {number}   params.month         base 0
   * @param {Object[]} params.athletes
   * @param {Object[]} params.payments
   * @param {Object[]} params.attendances    ← nuevo v1.0.1
   * @param {Object}   params.settings
   * @param {Date[]}   params.practiceDates
   */
  const generate = async (params) => {
    const { year, month, athletes, payments, attendances = [], settings, practiceDates } = params;

    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      throw new Error('jsPDF no está cargado. Verifica tu conexión a internet.');
    }

    const { jsPDF } = window.jspdf || window;
    const doc       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PAGE_W    = doc.internal.pageSize.getWidth();
    const PAGE_H    = doc.internal.pageSize.getHeight();
    const M         = 15;
    const CW        = PAGE_W - M * 2;
    let   y         = M;
    const DS        = window.CoachApp.DateSystem;
    const Logic     = window.CoachApp.Logic;

    // ── Helpers ──────────────────────────────────────────────────────────
    const sf     = (st, sz) => { doc.setFont('helvetica', st); doc.setFontSize(sz); };
    const tc     = (...rgb) => doc.setTextColor(...rgb);
    const fc     = (...rgb) => doc.setFillColor(...rgb);
    const dc     = (...rgb) => doc.setDrawColor(...rgb);
    const checkPage = (h = 20) => {
      if (y + h > PAGE_H - M) { doc.addPage(); y = M + 5; }
    };
    const hLine = (yp, color = C.lightGray) => {
      dc(...color); doc.setLineWidth(0.3);
      doc.line(M, yp, PAGE_W - M, yp);
    };

    const currency = settings.currency || '$';
    const price    = settings.pricePerPractice || 0;

    // ── Pre-calcular stats usando la fuente única de verdad ───────────────
    const pastPractices   = practiceDates.filter(d => !DS.isFuture(d));
    const pastPracticeIds = pastPractices.map(pd => DS.getPracticeId(pd));

    const { totalAttended, totalPaid: totalPaidCount, totalUnpaid } = Logic.calcMonthStats(
      athletes, payments, attendances, pastPracticeIds
    );

    const totalAbsences  = (pastPractices.length * athletes.length) - totalAttended;
    const totalCollected = totalPaidCount * price;
    const pendingAmount  = totalUnpaid    * price;

    // ════════════════════════════════════════════════════════════════════
    // ENCABEZADO
    // ════════════════════════════════════════════════════════════════════
    fc(...C.primary); doc.rect(0, 0, PAGE_W, 40, 'F');
    sf('bold', 20); tc(...C.white);
    doc.text('Coach Management', M, 16);
    sf('normal', 11); tc(255, 220, 180);
    doc.text(settings.teamName || 'Mi Equipo', M, 25);
    sf('bold', 14); tc(...C.white);
    doc.text(`Reporte: ${DS.formatMonth(year, month)}`, PAGE_W - M, 16, { align: 'right' });
    sf('normal', 9); tc(255, 220, 180);
    doc.text(`Generado: ${DS.formatDateLong(new Date())}`, PAGE_W - M, 25, { align: 'right' });
    y = 48;

    // ════════════════════════════════════════════════════════════════════
    // 4 TARJETAS RESUMEN
    // ════════════════════════════════════════════════════════════════════
    const cardW = (CW - 8) / 2;
    const cardH = 22;
    const cards = [
      {
        label: 'Total de Prácticas',
        value: `${practiceDates.length}`,
        sub:   `${pastPractices.length} realizadas`,
        color: C.dark
      },
      {
        label: 'Total Asistencias',
        value: `${totalAttended}`,
        sub:   `${totalAbsences} ausencias`,
        color: C.green
      },
      {
        label: 'Total Recaudado',
        value: `${currency}${totalCollected.toFixed(2)}`,
        sub:   `${totalPaidCount} pagos registrados`,
        color: C.green
      },
      {
        label: 'Sin Pagar',
        value: `${totalUnpaid}`,
        sub:   `${currency}${pendingAmount.toFixed(2)} pendiente`,
        color: totalUnpaid > 0 ? C.red : C.medGray
      },
    ];

    cards.forEach((card, i) => {
      const cx = M + (i % 2) * (cardW + 8);
      const cy = y + Math.floor(i / 2) * (cardH + 5);
      fc(...C.lightGray); doc.roundedRect(cx, cy, cardW, cardH, 3, 3, 'F');
      fc(...card.color);  doc.roundedRect(cx, cy, 4, cardH, 2, 2, 'F');
      sf('bold', 14); tc(...card.color);
      doc.text(card.value, cx + 10, cy + 11);
      sf('bold', 7); tc(...C.medGray);
      doc.text(card.label.toUpperCase(), cx + 10, cy + 17);
      sf('normal', 7);
      doc.text(card.sub, cx + 10, cy + 21);
    });

    y += cardH * 2 + 18;

    // ════════════════════════════════════════════════════════════════════
    // TABLA DE PRÁCTICAS (asistencia + pagos)
    // ════════════════════════════════════════════════════════════════════
    checkPage(30);
    hLine(y); y += 6;
    sf('bold', 12); tc(...C.dark);
    doc.text('Prácticas del Mes', M, y);
    y += 8;

    // Encabezado tabla
    fc(...C.dark); doc.rect(M, y - 4, CW, 8, 'F');
    sf('bold', 8); tc(...C.white);
    doc.text('Fecha',      M + 3,          y + 0.5);
    doc.text('Día',        M + 42,         y + 0.5);
    doc.text('Asistencia', M + 78,         y + 0.5);
    doc.text('Pagos',      M + 112,        y + 0.5);
    doc.text('Recaudado',  PAGE_W - M - 3, y + 0.5, { align: 'right' });
    y += 8;

    let grandTotal = 0;
    for (let idx = 0; idx < practiceDates.length; idx++) {
      checkPage(8);
      const pd      = practiceDates[idx];
      const pid     = DS.getPracticeId(pd);
      const dayName = DS.DAY_NAMES_FULL[DS.jsToIsoDay(pd.getDay())];
      const isFut   = DS.isFuture(pd);
      const isTod   = DS.isToday(pd);

      // Para cada práctica: contar asistentes y pagos válidos (solo asistentes)
      const attCount = attendances.filter(a => a.practiceId === pid && a.asistio).length;
      const paidCount = payments.filter(p => {
        if (p.practiceId !== pid || p.status !== 'paid') return false;
        // Verificar que el atleta asistió a ESTA práctica
        const att = attendances.find(a => a.athleteId === p.athleteId && a.practiceId === pid);
        const ath = athletes.find(a => a.id === p.athleteId);
        return att && att.asistio === true && ath && !ath.ayudaSocial;
      }).length;
      const recaud   = paidCount * price;
      grandTotal    += recaud;

      if (idx % 2 === 0) { fc(248, 250, 252); doc.rect(M, y - 4, CW, 7, 'F'); }
      if (isTod)          { fc(255, 237, 213); doc.rect(M, y - 4, CW, 7, 'F'); }

      sf('normal', 8.5); tc(...(isFut ? C.medGray : C.dark));
      doc.text(DS.formatDateLong(pd), M + 3,  y);
      sf('bold', 8.5);
      doc.text(dayName,               M + 42, y);

      if (!isFut) {
        // Asistencia
        sf('bold', 8.5); tc(...(attCount > 0 ? C.green : C.red));
        doc.text(`${attCount}/${athletes.length}`, M + 78, y);
        // Pagos
        tc(...(paidCount > 0 ? C.green : C.red));
        doc.text(`${paidCount}/${attCount}`, M + 112, y);
        // Recaudado
        tc(...C.dark); sf('normal', 8.5);
        doc.text(`${currency}${recaud.toFixed(2)}`, PAGE_W - M - 3, y, { align: 'right' });
      } else {
        sf('italic', 8); tc(...C.medGray);
        doc.text('— Práctica futura —', M + 78, y);
      }
      y += 7;
    }

    hLine(y, C.medGray); y += 5;
    sf('bold', 9); tc(...C.dark);
    doc.text('TOTAL RECAUDADO EN EL MES:', M + 3, y);
    tc(...C.primary);
    doc.text(`${currency}${grandTotal.toFixed(2)}`, PAGE_W - M - 3, y, { align: 'right' });
    y += 12;

    // ════════════════════════════════════════════════════════════════════
    // TABLA DE ATLETAS (asistencia + pagos + pendientes)
    // ════════════════════════════════════════════════════════════════════
    checkPage(30);
    hLine(y); y += 6;
    sf('bold', 12); tc(...C.dark);
    doc.text('Detalle por Atleta', M, y);
    y += 8;

    fc(...C.dark); doc.rect(M, y - 4, CW, 8, 'F');
    sf('bold', 8); tc(...C.white);
    doc.text('Atleta',         M + 3,          y + 0.5);
    doc.text('Asistencias',    M + 68,         y + 0.5);
    doc.text('Pagos/Asist.',   M + 98,         y + 0.5);
    doc.text('Sin Pagar',      M + 128,        y + 0.5);
    doc.text('Total',          PAGE_W - M - 3, y + 0.5, { align: 'right' });
    y += 8;

    const athleteStats = athletes.map(athlete => {
      // Usar la fuente única de verdad: deuda solo si asistió + no pagó
      const payMap = Logic.buildPayMap(payments.filter(p => p.athleteId === athlete.id));
      const attMap = Logic.buildAttMap(attendances.filter(a => a.athleteId === athlete.id));
      const s = Logic.calcAthleteStats(
        athlete.id, athlete.ayudaSocial, pastPracticeIds, payMap, attMap
      );
      return {
        athlete,
        attCount:  s.attended,
        paidCount: s.paid,
        pending:   s.unpaid,
        total:     s.paid * price
      };
    }).sort((a, b) => b.attCount - a.attCount);

    for (let i = 0; i < athleteStats.length; i++) {
      checkPage(8);
      const { athlete, attCount, paidCount, pending, total } = athleteStats[i];

      if (i % 2 === 0) { fc(248, 250, 252); doc.rect(M, y - 4, CW, 7, 'F'); }

      sf('normal', 8.5); tc(...C.dark);
      doc.text(athlete.name, M + 3, y);

      // Asistencias: X / total_prácticas
      sf('bold', 8.5); tc(...(attCount > 0 ? C.green : C.red));
      doc.text(`${attCount}/${pastPractices.length}`, M + 68, y);

      if (!athlete.ayudaSocial) {
        // Pagos: X / Y (pagados / asistencias)  ← formato solicitado
        const payRatioColor = paidCount === attCount && attCount > 0 ? C.green : C.medGray;
        tc(...payRatioColor);
        doc.text(`${paidCount}/${attCount}`, M + 98, y);
        // Sin Pagar (deudas reales = asistió + no pagó)
        tc(...(pending > 0 ? C.red : C.medGray));
        sf(pending > 0 ? 'bold' : 'normal', 8.5);
        doc.text(String(pending), M + 128, y);
        // Total $
        tc(...C.dark); sf('normal', 8.5);
        doc.text(`${currency}${total.toFixed(2)}`, PAGE_W - M - 3, y, { align: 'right' });
      } else {
        sf('italic', 7.5); tc(...C.yellow);
        doc.text('Ayuda Social', M + 98, y);
      }

      y += 7;
    }

    // ════════════════════════════════════════════════════════════════════
    // PIE DE PÁGINA
    // ════════════════════════════════════════════════════════════════════
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      sf('normal', 8); tc(...C.medGray);
      const fy = PAGE_H - 8;
      doc.text('Coach Management v1.0.1', M, fy);
      doc.text(`Página ${p} de ${totalPages}`, PAGE_W / 2, fy, { align: 'center' });
      doc.text(DS.formatDateLong(new Date()), PAGE_W - M, fy, { align: 'right' });
      hLine(fy - 4);
    }

    const filename = `reporte-${DS.MONTH_NAMES[month].toLowerCase()}-${year}.pdf`;
    doc.save(filename);
    return filename;
  };

  return { generate };

})();
