/**
 * utils/athlete-reports.js — Reportes PDF por atleta
 * Coach Management App v1.1.0
 *
 * Separación de responsabilidades:
 *   1. Contexto de datos     → loadContext / getAvailableRange
 *   2. PDF mensual           → generateMonthlyReport(athlete, year, month)
 *   3. Cálculo de deuda      → computeDebt
 *   4. PDF de deuda general  → generateDebtReport(athlete, period)
 *   5. Descarga y ZIP        → downloadBlob / zipPdfs
 *
 * El PDF mensual es el diseño aprobado de v1.0.x: su cuerpo se movió desde
 * components/athletes.js sin cambios visuales; solo se parametrizó (año/mes).
 *
 * La regla de deuda NO se redefine aquí: se delega en Logic.getPaymentStatus
 * (utils/logic.js), igual que el resto de la app.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.AthleteReports = (() => {

  const APP_VERSION = '1.1.0';

  const Storage = () => window.CoachApp.Storage;
  const DS      = window.CoachApp.DateSystem;
  const Logic   = window.CoachApp.Logic;

  // ════════════════════════════════════════════════════════════════════════
  // 1. CONTEXTO DE DATOS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Carga una sola vez todo lo necesario de IndexedDB para un atleta,
   * de modo que generar varios meses no repita lecturas.
   */
  const loadContext = async (athlete) => {
    const [practiceDays, currency, price, teamName, payments, attendance] = await Promise.all([
      Storage().getSetting('practiceDays',     [1, 3, 5]),
      Storage().getSetting('currency',         '$'),
      Storage().getSetting('pricePerPractice', 0),
      Storage().getSetting('teamName',         'Mi Equipo'),
      Storage().getPaymentsByAthlete(athlete.id),
      Storage().getAttendanceByAthlete(athlete.id)
    ]);

    const payMap = {};
    const attMap = {};
    payments.forEach(p   => { payMap[p.practiceId] = p.status;  });
    attendance.forEach(a => { attMap[a.practiceId] = a.asistio; });

    return { practiceDays, currency, price: Number(price) || 0, teamName, payMap, attMap };
  };

  /**
   * Rango de meses que tiene sentido ofrecer en el selector:
   * desde el mes más antiguo con datos (o de alta del atleta) hasta el mes actual.
   * Los meses futuros no se ofrecen: solo contienen prácticas que aún no ocurren.
   */
  const getAvailableRange = async (athlete) => {
    const now      = new Date();
    let   earliest = athlete.createdAt ? new Date(athlete.createdAt) : now;

    const [payments, attendance] = await Promise.all([
      Storage().getPaymentsByAthlete(athlete.id),
      Storage().getAttendanceByAthlete(athlete.id)
    ]);
    [...payments, ...attendance].forEach(r => {
      if (!r.practiceId) return;
      const d = DS.parsePracticeId(r.practiceId);
      if (!isNaN(d) && d < earliest) earliest = d;
    });

    return {
      minYear:  earliest.getFullYear(),
      minMonth: earliest.getMonth(),
      maxYear:  now.getFullYear(),
      maxMonth: now.getMonth()
    };
  };

  // ════════════════════════════════════════════════════════════════════════
  // UTILIDADES COMUNES
  // ════════════════════════════════════════════════════════════════════════

  const _getJsPDF = () => {
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      throw new Error('jsPDF no disponible. Requiere conexión a internet la primera vez.');
    }
    return (window.jspdf || window).jsPDF;
  };

  /** "Juan Pérez" → "juan-perez" (para nombres de archivo) */
  const _slug = (text) => String(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'atleta';

  const _pad2 = (n) => String(n).padStart(2, '0');

  /** Fecha de generación con año: "7 de Octubre de 2026" */
  const _formatGenerated = (d) => `${d.getDate()} de ${DS.MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`;

  const _key = (year, month) => `${year}-${_pad2(month + 1)}`;

  // ════════════════════════════════════════════════════════════════════════
  // 2. PDF MENSUAL (diseño aprobado — NO modificar su aspecto)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Genera el PDF mensual individual de un atleta para el mes indicado.
   * Equivale al antiguo reporte "del mes actual", ahora con año/mes explícitos.
   *
   * @param {Object} athlete
   * @param {number} year
   * @param {number} month  base 0
   * @param {Object} [ctx]  resultado de loadContext (se carga si no se pasa)
   * @returns {Promise<{blob: Blob, filename: string}>}
   */
  const generateMonthlyReport = async (athlete, year, month, ctx = null) => {
    const jsPDF = _getJsPDF();
    const { practiceDays, currency, price, teamName, payMap, attMap } = ctx || await loadContext(athlete);

    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const today = new Date();

    const practiceDates = DS.getPracticeDatesInMonth(year, month, practiceDays);
    const pastPractices = practiceDates.filter(d => !DS.isFuture(d));

    const PW   = doc.internal.pageSize.getWidth();
    const PH   = doc.internal.pageSize.getHeight();
    const M    = 15;
    const CW   = PW - M * 2;
    let   y    = M;

    const C = {
      orange:    [249, 115,  22],
      dark:      [ 13,  17,  23],
      gray:      [100, 116, 139],
      lgray:     [226, 232, 240],
      white:     [255, 255, 255],
      green:     [ 34, 197,  94],
      red:       [239,  68,  68],
    };

    const setF  = (st, sz) => { doc.setFont('helvetica', st); doc.setFontSize(sz); };
    const setTC = (...rgb) => doc.setTextColor(...rgb);

    // ── Encabezado naranja ─────────────────────────────────────────────
    doc.setFillColor(...C.orange);
    doc.rect(0, 0, PW, 38, 'F');
    setF('bold', 18); setTC(...C.white);
    doc.text('Coach Management', M, 14);
    setF('normal', 10); setTC(255, 220, 180);
    doc.text(teamName, M, 22);
    setF('bold', 10); setTC(...C.white);
    doc.text(`Reporte Individual — ${DS.formatMonth(year, month)}`, PW - M, 14, { align: 'right' });
    setF('normal', 9); setTC(255, 220, 180);
    doc.text(`Generado: ${DS.formatDateLong(today)}`, PW - M, 22, { align: 'right' });
    y = 46;

    // ── Datos del atleta ───────────────────────────────────────────────
    doc.setFillColor(...C.lgray);
    doc.roundedRect(M, y, CW, 22, 3, 3, 'F');
    setF('bold', 15); setTC(...C.dark);
    doc.text(athlete.name, M + 4, y + 9);
    setF('normal', 9); setTC(...C.gray);
    const meta = [
      athlete.age         ? `Edad: ${athlete.age}`          : null,
      athlete.parentPhone ? `Tel: ${athlete.parentPhone}`   : null,
      athlete.ayudaSocial ? '★ Ayuda Social'                 : null,
    ].filter(Boolean).join('   ');
    if (meta) doc.text(meta, M + 4, y + 17);
    y += 28;

    // ── Encabezado de tabla ────────────────────────────────────────────
    doc.setFillColor(...C.dark);
    doc.rect(M, y, CW, 8, 'F');
    setF('bold', 8); setTC(...C.white);
    doc.text('Fecha',      M + 3,   y + 5);
    doc.text('Día',        M + 52,  y + 5);
    doc.text('Asistencia', M + 95,  y + 5);
    if (!athlete.ayudaSocial) doc.text('Pago', M + 140, y + 5);
    y += 8;

    let totalAtt = 0, totalPaid = 0, totalUnpaid = 0;

    practiceDates.forEach((pd, idx) => {
      if (y > 265) { doc.addPage(); y = 20; }
      const pid     = DS.getPracticeId(pd);
      const isFut   = DS.isFuture(pd);
      const isTod   = DS.isToday(pd);
      const asistio = attMap[pid];
      const pago    = payMap[pid];

      // Estado de pago calculado con la regla central:
      // null = no asistió o ayudaSocial → NO genera deuda
      const payStatus = Logic.getPaymentStatus(asistio, pago, athlete.ayudaSocial);

      // Fila alternada
      if (idx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(M, y-3, CW, 8, 'F'); }
      if (isTod)          { doc.setFillColor(255, 237, 213); doc.rect(M, y-3, CW, 8, 'F'); }

      const dayName = DS.DAY_NAMES_FULL[DS.jsToIsoDay(pd.getDay())];
      setF('normal', 8.5); setTC(...(isFut ? C.gray : C.dark));
      doc.text(DS.formatDateLong(pd), M + 3,  y);
      doc.text(dayName,               M + 52, y);

      if (!isFut) {
        // ── Columna de Asistencia ────────────────────────────────────
        if (asistio === true) {
          totalAtt++;
          setF('bold', 8.5); setTC(...C.green);
          doc.text('✓ Asistió', M + 95, y);
        } else if (asistio === false) {
          setF('bold', 8.5); setTC(...C.red);
          doc.text('✗ No asistió', M + 95, y);
        } else {
          setF('normal', 8.5); setTC(...C.gray);
          doc.text('—', M + 95, y);
        }

        // ── Columna de Pago ──────────────────────────────────────────
        // REGLA: solo se muestra si no es ayuda social.
        // CASO pagó: asistió + pagó → "✓ Pagó"
        // CASO deuda: asistió + no pagó → "✗ No Pagó"
        // CASO sin deuda: no asistió / sin registro → "—" (no genera deuda)
        if (!athlete.ayudaSocial) {
          if (payStatus === 'paid') {
            totalPaid++;
            setF('bold', 8.5); setTC(...C.green);
            doc.text('✓ Pagó', M + 140, y);
          } else if (payStatus === 'unpaid') {
            totalUnpaid++;
            setF('bold', 8.5); setTC(...C.red);
            doc.text('✗ No Pagó', M + 140, y);
          } else {
            // null = no asistió → sin deuda → celda vacía
            setF('normal', 8.5); setTC(...C.gray);
            doc.text('—', M + 140, y);
          }
        }
      } else {
        setF('italic', 8); setTC(...C.gray);
        doc.text('Práctica futura', M + 95, y);
      }
      y += 8;
    });

    // ── Separador ─────────────────────────────────────────────────────
    y += 4;
    doc.setDrawColor(...C.lgray); doc.setLineWidth(0.4);
    doc.line(M, y, PW - M, y);
    y += 8;

    // ── Resumen ────────────────────────────────────────────────────────
    setF('bold', 11); setTC(...C.dark);
    doc.text('Resumen del mes', M, y);
    y += 8;

    // Tarjetas de resumen — incluye "Total Sin Pagar" en rojo
    const cards = [
      { lbl: 'Prácticas realizadas', val: String(pastPractices.length), col: C.dark   },
      { lbl: 'Total asistencias',    val: String(totalAtt),             col: C.green  },
      ...(!athlete.ayudaSocial ? [
        { lbl: 'Total pagos',       val: String(totalPaid),                              col: C.green  },
        { lbl: 'Total sin pagar',   val: String(totalUnpaid),                            col: C.red    },
        { lbl: 'Recaudado',         val: `${currency}${(totalPaid * price).toFixed(2)}`, col: C.orange }
      ] : [
        { lbl: 'Estado', val: 'Ayuda Social', col: C.gray }
      ])
    ];

    const cw2 = (CW - (cards.length - 1) * 5) / cards.length;
    cards.forEach((card, i) => {
      const cx = M + i * (cw2 + 5);
      doc.setFillColor(...C.lgray);
      // La tarjeta "Total sin pagar" tiene fondo rojizo si hay deuda
      if (card.col === C.red && parseInt(card.val) > 0) {
        doc.setFillColor(254, 226, 226); // fondo rojo suave
      }
      doc.roundedRect(cx, y, cw2, 18, 2, 2, 'F');
      setF('bold', 13); setTC(...card.col);
      doc.text(card.val, cx + cw2 / 2, y + 9,  { align: 'center' });
      setF('normal', 7); setTC(...C.gray);
      doc.text(card.lbl.toUpperCase(), cx + cw2 / 2, y + 15, { align: 'center' });
    });

    // ── Pie de página ──────────────────────────────────────────────────
    setF('normal', 8); setTC(...C.gray);
    doc.text(`Coach Management v${APP_VERSION}`, M, PH - 8);
    doc.text(DS.formatDateLong(today), PW - M, PH - 8, { align: 'right' });
    doc.setDrawColor(...C.lgray); doc.setLineWidth(0.3);
    doc.line(M, PH - 12, PW - M, PH - 12);

    return {
      blob:     doc.output('blob'),
      filename: `reporte-${_slug(athlete.name)}-${_slug(DS.MONTH_NAMES[month])}-${year}.pdf`
    };
  };

  // ════════════════════════════════════════════════════════════════════════
  // 3. CÁLCULO DE DEUDA (reutiliza Logic — no define reglas propias)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Lista de meses {year, month} del período solicitado, ordenados.
   *  - { mode: 'all' }                       → desde la primera asistencia hasta hoy
   *  - { mode: 'months', months: [{year, month}] }
   */
  const _resolveMonths = (period, ctx) => {
    if (period.mode === 'months') {
      const seen = new Set();
      return period.months
        .filter(m => { const k = _key(m.year, m.month); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (a.year - b.year) || (a.month - b.month));
    }

    // Todo el historial: la deuda solo puede existir donde hubo asistencia
    let first = null;
    Object.keys(ctx.attMap).forEach(pid => {
      if (ctx.attMap[pid] !== true) return;
      const d = DS.parsePracticeId(pid);
      if (!isNaN(d) && (!first || d < first)) first = d;
    });
    if (!first) return [];

    const now    = new Date();
    const months = [];
    let   y = first.getFullYear(), m = first.getMonth();
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      months.push({ year: y, month: m });
      m++; if (m > 11) { m = 0; y++; }
    }
    return months;
  };

  /**
   * Calcula la deuda del atleta. Los importes se manejan en centavos enteros
   * para que subtotales y total cuadren exactamente.
   *
   * @returns {{
   *   months: {year, month, debtDates: Date[], paidDates: Date[], paidCount: number, subtotalCents: number}[],
   *   periodMonths: {year, month}[],
   *   priceCents: number, totalCents: number, paidCents: number,
   *   debtCount: number, monthsWithDebt: number
   * }}
   */
  const computeDebt = (athlete, ctx, period) => {
    const periodMonths = _resolveMonths(period, ctx);
    const priceCents   = Math.round(ctx.price * 100);
    const months       = [];

    let debtCount = 0, paidCount = 0;

    periodMonths.forEach(({ year, month }) => {
      // Solo prácticas ya ocurridas: una práctica futura nunca es deuda
      const dates = DS.getPracticeDatesInMonth(year, month, ctx.practiceDays)
        .filter(d => !DS.isFuture(d));

      const debtDates = [];
      const paidDates = [];   // mismo mes: días ya pagados, para marcarlos en verde junto a los rojos

      dates.forEach(pd => {
        const pid    = DS.getPracticeId(pd);
        const status = Logic.getPaymentStatus(ctx.attMap[pid], ctx.payMap[pid], athlete.ayudaSocial);
        if (status === 'unpaid') debtDates.push(pd);
        if (status === 'paid')   paidDates.push(pd);
      });

      debtCount += debtDates.length;
      paidCount += paidDates.length;

      // El calendario solo se muestra para meses con deuda (igual que antes);
      // paidDates viaja con él para marcar en verde los días ya pagados de ESE mes.
      if (debtDates.length > 0) {
        months.push({
          year, month, debtDates, paidDates,
          paidCount:     paidDates.length,
          subtotalCents: debtDates.length * priceCents
        });
      }
    });

    return {
      months,
      periodMonths,
      priceCents,
      totalCents:     months.reduce((n, m) => n + m.subtotalCents, 0),
      paidCents:      paidCount * priceCents,
      debtCount,
      monthsWithDebt: months.length
    };
  };

  /** Texto legible del período: agrupa meses consecutivos ("Agosto 2026 – Octubre 2026") */
  const _describePeriod = (period, debt) => {
    const list = debt.periodMonths;
    if (period.mode === 'all') {
      if (!list.length) return 'Todo el historial';
      const a = list[0], b = list[list.length - 1];
      return `Todo el historial (${DS.formatMonth(a.year, a.month)} – ${DS.formatMonth(b.year, b.month)})`;
    }

    const runs = [];
    list.forEach(m => {
      const idx  = m.year * 12 + m.month;
      const last = runs[runs.length - 1];
      if (last && last.endIdx === idx - 1) { last.end = m; last.endIdx = idx; }
      else runs.push({ start: m, end: m, endIdx: idx });
    });
    return runs.map(r => {
      const s = DS.formatMonth(r.start.year, r.start.month);
      const e = DS.formatMonth(r.end.year,   r.end.month);
      if (s === e) return s;
      return r.endIdx - (r.start.year * 12 + r.start.month) === 1 ? `${s} y ${e}` : `${s} – ${e}`;
    }).join(', ');
  };

  // ════════════════════════════════════════════════════════════════════════
  // 4. PDF — REPORTE GENERAL DE DEUDAS (diseño nuevo)
  // ════════════════════════════════════════════════════════════════════════

  const generateDebtReport = async (athlete, period, ctx = null) => {
    const jsPDF = _getJsPDF();
    ctx = ctx || await loadContext(athlete);
    const debt  = computeDebt(athlete, ctx, period);

    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW    = doc.internal.pageSize.getWidth();
    const PH    = doc.internal.pageSize.getHeight();
    const M     = 15;
    const CW    = PW - M * 2;
    const BOTTOM = PH - 20;           // límite inferior (deja espacio al pie)
    const today = new Date();
    let   y     = M;

    const C = {
      orange:  [249, 115,  22],
      dark:    [ 13,  17,  23],
      gray:    [100, 116, 139],
      lgray:   [226, 232, 240],
      zebra:   [248, 250, 252],
      white:   [255, 255, 255],
      green:   [ 34, 197,  94],
      greenBg: [220, 252, 231],
      red:     [239,  68,  68],
      redBg:   [254, 226, 226],
      peach:   [255, 237, 213],
    };

    const setF  = (st, sz) => { doc.setFont('helvetica', st); doc.setFontSize(sz); };
    const setTC = (...rgb) => doc.setTextColor(...rgb);
    const setFC = (...rgb) => doc.setFillColor(...rgb);
    const setDC = (...rgb) => doc.setDrawColor(...rgb);
    const money = (cents) => `${ctx.currency}${(cents / 100).toFixed(2)}`;
    const hLine = (yy, color = C.lgray) => { setDC(...color); doc.setLineWidth(0.3); doc.line(M, yy, PW - M, yy); };
    const newPage = () => { doc.addPage(); y = M + 5; };
    const ensure  = (h) => { if (y + h > BOTTOM) { newPage(); return true; } return false; };

    // ── Encabezado (misma estética que el reporte mensual) ───────────────
    setFC(...C.orange); doc.rect(0, 0, PW, 40, 'F');
    setF('bold', 20); setTC(...C.white);
    doc.text('Coach Management', M, 16);
    setF('normal', 11); setTC(255, 220, 180);
    doc.text(ctx.teamName || 'Mi Equipo', M, 25);
    setF('bold', 14); setTC(...C.white);
    doc.text('Reporte General de Deudas', PW - M, 16, { align: 'right' });
    setF('normal', 9); setTC(255, 220, 180);
    doc.text(`Generado: ${_formatGenerated(today)}`, PW - M, 25, { align: 'right' });
    y = 48;

    // ── Atleta y período ─────────────────────────────────────────────────
    const periodText  = `Período: ${_describePeriod(period, debt)}`;
    setF('normal', 9);
    const periodLines = doc.splitTextToSize(periodText, CW - 8);
    const meta = [
      athlete.age         ? `Edad: ${athlete.age}`        : null,
      athlete.parentPhone ? `Tel: ${athlete.parentPhone}` : null,
      athlete.ayudaSocial ? '★ Ayuda Social'               : null,
    ].filter(Boolean).join('   ');
    const boxH = 13 + periodLines.length * 4.6 + (meta ? 5 : 0);

    setFC(...C.lgray); doc.roundedRect(M, y, CW, boxH, 3, 3, 'F');
    setF('bold', 15); setTC(...C.dark);
    doc.text(athlete.name, M + 4, y + 9);
    let ty = y + 15;
    setF('normal', 9); setTC(...C.gray);
    if (meta) { doc.text(meta, M + 4, ty); ty += 5; }
    doc.text(periodLines, M + 4, ty);
    y += boxH + 7;

    // ── Resumen de deuda ─────────────────────────────────────────────────
    const hasDebt = debt.totalCents > 0 || debt.debtCount > 0;
    const cards = [
      { lbl: 'Deuda total',            val: money(debt.totalCents),   col: hasDebt ? C.red : C.green, bg: hasDebt ? C.redBg : C.greenBg },
      { lbl: 'Meses con deuda',        val: String(debt.monthsWithDebt), col: C.dark },
      { lbl: 'Prácticas pendientes',   val: String(debt.debtCount),   col: hasDebt ? C.red : C.dark },
      { lbl: 'Total pagado (período)', val: money(debt.paidCents),    col: C.green },
    ];
    const cw4 = (CW - 3 * 4) / 4;
    cards.forEach((card, i) => {
      const cx = M + i * (cw4 + 4);
      setFC(...(card.bg || C.lgray)); doc.roundedRect(cx, y, cw4, 20, 2, 2, 'F');
      setF('bold', 13); setTC(...card.col);
      doc.text(card.val, cx + cw4 / 2, y + 10, { align: 'center' });
      setF('normal', 6.5); setTC(...C.gray);
      doc.text(card.lbl.toUpperCase(), cx + cw4 / 2, y + 16, { align: 'center' });
    });
    y += 28;

    // ── Caso sin deuda ───────────────────────────────────────────────────
    if (!hasDebt) {
      setFC(...C.greenBg); doc.roundedRect(M, y, CW, 34, 3, 3, 'F');
      setFC(...C.green);   doc.roundedRect(M, y, 4, 34, 2, 2, 'F');
      setF('bold', 20); setTC(...C.green);
      doc.text('Sin deuda pendiente', PW / 2, y + 14, { align: 'center' });
      setF('bold', 11); setTC(...C.dark);
      doc.text(`Total adeudado: ${money(0)}`, PW / 2, y + 23, { align: 'center' });
      setF('normal', 8.5); setTC(...C.gray);
      const note = athlete.ayudaSocial
        ? 'El atleta tiene Ayuda Social: no genera deuda de pago.'
        : 'No hay prácticas asistidas sin pagar en el período indicado.';
      doc.text(note, PW / 2, y + 29, { align: 'center' });
      y += 40;
    } else {
      y = _drawCalendars(doc, debt, { M, CW, BOTTOM, C, setF, setTC, setFC, setDC, hLine, ensure, newPage, getY: () => y, setY: (v) => { y = v; } });
      y = _drawDetail(doc, debt, ctx, { M, PW, CW, BOTTOM, C, setF, setTC, setFC, hLine, ensure, newPage, money, getY: () => y, setY: (v) => { y = v; } });
    }

    // ── Pie de página en todas las páginas ───────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      setF('normal', 8); setTC(...C.gray);
      const fy = PH - 8;
      doc.text(`Coach Management v${APP_VERSION}`, M, fy);
      doc.text(`Página ${p} de ${totalPages}`, PW / 2, fy, { align: 'center' });
      doc.text(DS.formatDateLong(today), PW - M, fy, { align: 'right' });
      hLine(fy - 4);
    }

    return { blob: doc.output('blob'), filename: _debtFilename(athlete, period, debt) };
  };

  const _debtFilename = (athlete, period, debt) => {
    const base = `reporte-deudas-${_slug(athlete.name)}`;
    if (period.mode === 'all') return `${base}-historial.pdf`;
    const list = debt.periodMonths;
    if (!list.length) return `${base}.pdf`;
    const a = list[0], b = list[list.length - 1];
    return list.length === 1
      ? `${base}-${_slug(DS.MONTH_NAMES[a.month])}-${a.year}.pdf`
      : `${base}-${_key(a.year, a.month)}-a-${_key(b.year, b.month)}.pdf`;
  };

  // ── Calendarios mensuales con círculos rojos ───────────────────────────
  // 2 calendarios por fila; si no caben, continúan en la página siguiente.
  const _drawCalendars = (doc, debt, h) => {
    const { M, CW, C, setF, setTC, setFC, setDC, hLine, ensure } = h;
    const GAP   = 6;
    const colW  = (CW - GAP) / 2;
    const HEAD  = 9;     // alto del título del mes
    const WEEKH = 5;     // alto de la fila de días de la semana
    const ROWH  = 6.5;   // alto de cada semana

    const calHeight = (entry) => {
      const offset = DS.jsToIsoDay(new Date(entry.year, entry.month, 1).getDay()) - 1;
      const days   = new Date(entry.year, entry.month + 1, 0).getDate();
      return HEAD + WEEKH + Math.ceil((offset + days) / 7) * ROWH + 3;
    };

    const drawOne = (entry, x, yy) => {
      const offset = DS.jsToIsoDay(new Date(entry.year, entry.month, 1).getDay()) - 1; // 0 = lunes
      const days   = new Date(entry.year, entry.month + 1, 0).getDate();               // respeta 28/29/30/31
      const height = calHeight(entry);
      const debtDays = new Set(entry.debtDates.map(d => d.getDate()));
      const paidDays = new Set((entry.paidDates || []).map(d => d.getDate()));

      setDC(...C.lgray); doc.setLineWidth(0.4);
      doc.roundedRect(x, yy, colW, height, 2, 2, 'S');

      setF('bold', 9.5); setTC(...C.dark);
      doc.text(DS.formatMonth(entry.year, entry.month), x + 4, yy + 6);
      const n = entry.debtDates.length;
      setF('bold', 7.5); setTC(...C.red);
      doc.text(`${n} ${n === 1 ? 'práctica' : 'prácticas'}`, x + colW - 4, yy + 6, { align: 'right' });

      const cellW = (colW - 4) / 7;
      setF('normal', 6.5); setTC(...C.gray);
      for (let i = 1; i <= 7; i++) {
        doc.text(DS.DAY_NAMES_SHORT[i], x + 2 + cellW * (i - 0.5), yy + HEAD + 3, { align: 'center' });
      }

      for (let d = 1; d <= days; d++) {
        const idx = offset + d - 1;
        const cx  = x + 2 + cellW * ((idx % 7) + 0.5);
        const cy  = yy + HEAD + WEEKH + Math.floor(idx / 7) * ROWH + ROWH / 2;
        // Un día nunca es ambas cosas a la vez (la regla central excluye esa combinación),
        // pero por claridad visual el rojo (deuda) tiene prioridad si alguna vez coincidieran.
        if (debtDays.has(d)) {
          setFC(...C.red); doc.circle(cx, cy, 2.7, 'F');
          setF('bold', 7.5); setTC(...C.white);
        } else if (paidDays.has(d)) {
          setFC(...C.green); doc.circle(cx, cy, 2.7, 'F');
          setF('bold', 7.5); setTC(...C.white);
        } else {
          setF('normal', 7.5); setTC(...C.dark);
        }
        doc.text(String(d), cx, cy + 1, { align: 'center' });
      }
      return height;
    };

    // Título de sección + leyenda
    ensure(14 + calHeight(debt.months[0]));
    let y = h.getY();
    hLine(y); y += 6;
    setF('bold', 12); setTC(...C.dark);
    doc.text('Calendarios de deuda', M, y);
    setF('normal', 8); setTC(...C.gray);
    doc.text('Pagada', M + CW, y, { align: 'right' });
    setFC(...C.green); doc.circle(M + CW - 20, y - 1, 1.6, 'F');
    doc.text('Con deuda', M + CW - 26, y, { align: 'right' });
    setFC(...C.red); doc.circle(M + CW - 48, y - 1, 1.6, 'F');
    y += 6;
    h.setY(y);

    for (let i = 0; i < debt.months.length; i += 2) {
      const pair = debt.months.slice(i, i + 2);
      const rowH = Math.max(...pair.map(calHeight));
      ensure(rowH);
      y = h.getY();
      pair.forEach((entry, k) => drawOne(entry, M + k * (colW + GAP), y));
      h.setY(y + rowH + 5);
    }
    return h.getY() + 3;
  };

  // ── Detalle por mes + total ────────────────────────────────────────────
  const _drawDetail = (doc, debt, ctx, h) => {
    const { M, PW, CW, C, setF, setTC, setFC, hLine, ensure, newPage, money } = h;
    const ROW = 7;

    ensure(40);
    let y = h.getY();
    hLine(y); y += 6;
    setF('bold', 12); setTC(...C.dark);
    doc.text('Detalle de deuda por mes', M, y);
    y += 8;
    h.setY(y);

    const monthHeader = (entry, cont) => {
      let yy = h.getY();
      setFC(...C.peach); doc.rect(M, yy - 4, CW, 7, 'F');
      setF('bold', 10); setTC(...C.dark);
      doc.text(`${DS.formatMonth(entry.year, entry.month)}${cont ? ' (continuación)' : ''}`, M + 3, yy + 0.5);
      yy += 7;
      setFC(...C.dark); doc.rect(M, yy - 4, CW, 7, 'F');
      setF('bold', 8); setTC(...C.white);
      doc.text('Fecha',    M + 3,  yy + 0.3);
      doc.text('Día',      M + 40, yy + 0.3);
      doc.text('Práctica', M + 85, yy + 0.3);
      doc.text('Importe',  PW - M - 3, yy + 0.3, { align: 'right' });
      h.setY(yy + 7);
    };

    debt.months.forEach(entry => {
      // Evitar encabezado huérfano: caben encabezados + al menos 2 filas + subtotal
      ensure(14 + Math.min(entry.debtDates.length, 2) * ROW + 10);
      monthHeader(entry, false);

      entry.debtDates.forEach((pd, idx) => {
        if (h.getY() + ROW > h.BOTTOM) { newPage(); monthHeader(entry, true); }
        const yy = h.getY();
        if (idx % 2 === 0) { setFC(...C.zebra); doc.rect(M, yy - 4, CW, ROW, 'F'); }
        setF('normal', 8.5); setTC(...C.dark);
        doc.text(`${_pad2(pd.getDate())}/${_pad2(pd.getMonth() + 1)}/${pd.getFullYear()}`, M + 3, yy);
        doc.text(DS.DAY_NAMES_FULL[DS.jsToIsoDay(pd.getDay())], M + 40, yy);
        doc.text('Práctica', M + 85, yy);
        doc.text(money(debt.priceCents), PW - M - 3, yy, { align: 'right' });
        h.setY(yy + ROW);
      });

      // Subtotal
      if (h.getY() + 9 > h.BOTTOM) { newPage(); }
      let yy = h.getY();
      hLine(yy - 3, C.gray);
      setF('bold', 9); setTC(...C.dark);
      doc.text(`Subtotal ${DS.MONTH_NAMES[entry.month]}:`, M + 3, yy + 2);
      setTC(...C.red);
      doc.text(money(entry.subtotalCents), PW - M - 3, yy + 2, { align: 'right' });
      h.setY(yy + 11);
    });

    // TOTAL ADEUDADO
    ensure(26);
    y = h.getY();
    setFC(...C.redBg); doc.roundedRect(M, y, CW, 20, 3, 3, 'F');
    setFC(...C.red);   doc.roundedRect(M, y, 4, 20, 2, 2, 'F');
    setF('bold', 11); setTC(...C.dark);
    doc.text('TOTAL ADEUDADO', M + 10, y + 9);
    setF('normal', 8); setTC(...C.gray);
    doc.text(`${debt.debtCount} ${debt.debtCount === 1 ? 'práctica' : 'prácticas'} × ${money(debt.priceCents)}`, M + 10, y + 15);
    setF('bold', 20); setTC(...C.red);
    doc.text(money(debt.totalCents), PW - M - 6, y + 13, { align: 'right' });
    return y + 26;
  };

  // ════════════════════════════════════════════════════════════════════════
  // 5. DESCARGA Y EMPAQUETADO
  // ════════════════════════════════════════════════════════════════════════

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /** Empaqueta [{blob, filename}] en un único ZIP */
  const zipPdfs = async (files) => {
    const entries = [];
    for (const f of files) {
      entries.push({ name: f.filename, data: new Uint8Array(await f.blob.arrayBuffer()) });
    }
    return window.CoachApp.ZipLite.create(entries);
  };

  const zipFilename = (athlete, months) => {
    const sorted = [...months].sort((a, b) => (a.year - b.year) || (a.month - b.month));
    const y1 = sorted[0].year, y2 = sorted[sorted.length - 1].year;
    return `reportes-${_slug(athlete.name)}-${y1 === y2 ? y1 : `${y1}-${y2}`}.zip`;
  };

  return {
    loadContext, getAvailableRange,
    generateMonthlyReport, computeDebt, generateDebtReport,
    downloadBlob, zipPdfs, zipFilename
  };

})();
