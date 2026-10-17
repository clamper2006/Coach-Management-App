/**
 * components/calendar.js — Vista de Reportes Mensuales
 * Coach Management App v1.0.1
 *
 * Correcciones v1.0.1:
 *  - Carga asistencias junto con pagos
 *  - Stats: asistencias, ausencias, pagos, pendientes (asistentes - pagos)
 *  - Atletas ayudaSocial excluidos de cálculos de ingresos
 *  - Tabla de prácticas: columnas asistencia + pagos
 *  - Tabla de atletas: columnas asistencia + pagos
 *  - PDF recibe attendances para el reporte enriquecido
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Calendar = (() => {

  const Storage = () => window.CoachApp.Storage;
  const DS      = window.CoachApp.DateSystem;

  let _state = {
    year:  new Date().getFullYear(),
    month: new Date().getMonth()
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDERIZADO PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════

  const render = async (container) => {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    try {
      const [athletes, practiceDays, currency, price, teamName] = await Promise.all([
        Storage().getAll('athletes'),
        Storage().getSetting('practiceDays',     [1, 3, 5]),
        Storage().getSetting('currency',         '$'),
        Storage().getSetting('pricePerPractice', 0),
        Storage().getSetting('teamName',         'Mi Equipo')
      ]);

      const settings = { practiceDays, currency, pricePerPractice: price, teamName };
      await _renderView(container, athletes, settings);
    } catch (error) {
      console.error('[Calendar] Error:', error);
      container.innerHTML = '<div class="error-state"><p>Error al cargar reportes.</p></div>';
    }
  };

  const _renderView = async (container, athletes, settings) => {
    const { year, month } = _state;
    const practiceDates   = DS.getPracticeDatesInMonth(year, month, settings.practiceDays);
    const today           = new Date();
    const isCurrentMonth  = year === today.getFullYear() && month === today.getMonth();

    // Atletas facturables (sin ayuda social)
    const billable = athletes.filter(a => !a.ayudaSocial);

    // Cargar pagos Y asistencias del mes
    const monthPayments    = [];
    const monthAttendances = [];
    for (const pd of practiceDates) {
      if (!DS.isFuture(pd)) {
        const pid = DS.getPracticeId(pd);
        const [pays, atts] = await Promise.all([
          Storage().getPaymentsByPractice(pid),
          Storage().getAttendanceByPractice(pid)
        ]);
        monthPayments.push(...pays);
        monthAttendances.push(...atts);
      }
    }

    const pastPractices = practiceDates.filter(pd => !DS.isFuture(pd));

    // ── Estadísticas del mes — usando fuente única de verdad ──────────────
    const Logic       = window.CoachApp.Logic;
    const pastPracticeIds = pastPractices.map(pd => DS.getPracticeId(pd));

    // calcMonthStats garantiza que deuda = solo asistió + no pagó
    const { totalAttended, totalPaid, totalUnpaid } = Logic.calcMonthStats(
      athletes, monthPayments, monthAttendances, pastPracticeIds
    );
    const totalAbsences  = (pastPractices.length * athletes.length) - totalAttended;
    const totalCollected = totalPaid * settings.pricePerPractice;
    const pendingAmount  = totalUnpaid * settings.pricePerPractice;
    const pendingPayments = totalUnpaid;
    const currency        = settings.currency;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Reportes</h2>
          <p class="view-subtitle">Resumen mensual de asistencia y pagos</p>
        </div>
      </div>

      <!-- Selector de mes -->
      <div class="month-selector">
        <button class="month-nav-btn" id="btn-prev-month">‹</button>
        <div class="month-display">
          <div class="month-name">${DS.formatMonth(year, month)}</div>
          ${isCurrentMonth ? '<div class="month-current-badge">Mes actual</div>' : ''}
        </div>
        <button class="month-nav-btn" id="btn-next-month">›</button>
      </div>

      <!-- Tarjetas de resumen: 4 stats clave -->
      <div class="report-summary-grid">
        <div class="report-stat-card">
          <div class="rsc-icon">🗓️</div>
          <div class="rsc-value">${practiceDates.length}</div>
          <div class="rsc-label">Prácticas del mes</div>
          <div class="rsc-sub">${pastPractices.length} realizadas</div>
        </div>
        <div class="report-stat-card ${totalAttended > 0 ? 'rsc-green' : ''}">
          <div class="rsc-icon">📋</div>
          <div class="rsc-value">${totalAttended}</div>
          <div class="rsc-label">Total Asistencias</div>
          <div class="rsc-sub">${totalAbsences} ausencias</div>
        </div>
        <div class="report-stat-card rsc-green">
          <div class="rsc-icon">✅</div>
          <div class="rsc-value">${currency}${totalCollected.toFixed(2)}</div>
          <div class="rsc-label">Total Recaudado</div>
          <div class="rsc-sub">${totalPaid} pagos</div>
        </div>
        <div class="report-stat-card ${pendingPayments > 0 ? 'rsc-red' : ''}">
          <div class="rsc-icon">⏳</div>
          <div class="rsc-value">${currency}${pendingAmount.toFixed(2)}</div>
          <div class="rsc-label">Pagos Pendientes</div>
          <div class="rsc-sub">${pendingPayments} sin pagar</div>
        </div>
      </div>

      <!-- Botón Generar PDF -->
      <div class="report-generate-section">
        <button class="btn-generate-pdf" id="btn-generate-pdf" ${athletes.length === 0 ? 'disabled' : ''}>
          <span class="btn-pdf-icon">📄</span>
          <div class="btn-pdf-text">
            <span class="btn-pdf-main">Generar Reporte PDF</span>
            <span class="btn-pdf-sub">${DS.formatMonth(year, month)} — ${currency}${totalCollected.toFixed(2)} recaudado</span>
          </div>
        </button>
        ${athletes.length === 0 ? '<p class="report-warn">Agrega atletas para generar el reporte</p>' : ''}
      </div>

      <!-- Tabla de prácticas con asistencia + pagos -->
      <div class="report-practices-section">
        <h3 class="section-title-sm">Prácticas de ${DS.MONTH_NAMES[month]}</h3>
        ${practiceDates.length === 0
          ? '<p class="empty-month">No hay prácticas configuradas para este mes.</p>'
          : `<div class="practices-table">
              <div class="pt-header pt-header-v2">
                <span>Fecha</span>
                <span>Día</span>
                <span>Asistencia</span>
                <span>Pagos</span>
              </div>
              ${practiceDates.map(pd =>
                _buildPracticeRow(pd, monthPayments, monthAttendances, athletes, currency, settings.pricePerPractice)
              ).join('')}
            </div>`
        }
      </div>

      <!-- Resumen por atleta -->
      ${athletes.length > 0 ? `
        <div class="report-athletes-section">
          <h3 class="section-title-sm">Detalle por Atleta</h3>
          <div class="athlete-report-list">
            ${_buildAthleteReport(athletes, monthPayments, monthAttendances, pastPractices, currency, settings.pricePerPractice)}
          </div>
        </div>
      ` : ''}
    `;

    _attachEvents(container, athletes, settings, practiceDates, monthPayments, monthAttendances);
  };

  // ════════════════════════════════════════════════════════════════════════
  // FILAS DE PRÁCTICAS — asistencia + pagos
  // ════════════════════════════════════════════════════════════════════════

  const _buildPracticeRow = (pd, payments, attendances, athletes, currency, price) => {
    const pid     = DS.getPracticeId(pd);
    const isoDay  = DS.jsToIsoDay(pd.getDay());
    const dayName = DS.DAY_NAMES_FULL[isoDay];
    const isFut   = DS.isFuture(pd);
    const isTod   = DS.isToday(pd);

    const attended = attendances.filter(a => a.practiceId === pid && a.asistio).length;
    const total    = athletes.length;
    // Pagos solo de asistentes facturables
    const paid     = payments.filter(p => {
      if (p.practiceId !== pid || p.status !== 'paid') return false;
      const athlete = athletes.find(a => a.id === p.athleteId);
      return athlete && !athlete.ayudaSocial;
    }).length;
    const recaud   = paid * price;

    return `
      <div class="pt-row pt-row-v2 ${isTod ? 'pt-today' : ''} ${isFut ? 'pt-future' : ''}">
        <span class="pt-date">${DS.formatDateShort(pd)}</span>
        <span class="pt-day">${dayName}</span>
        ${isFut
          ? `<span class="pt-future-label" style="grid-column:3/-1">Práctica futura</span>`
          : `
            <span class="pt-att ${attended > 0 ? 'val-green' : 'val-red'}">
              ${attended}<small>/${total}</small>
            </span>
            <span class="pt-amount ${paid > 0 ? 'amount-ok' : 'amount-warn'}">
              ${currency}${recaud.toFixed(2)}<small> (${paid})</small>
            </span>
          `
        }
        ${isTod ? '<span class="pt-today-badge">HOY</span>' : ''}
      </div>
    `;
  };

  // ════════════════════════════════════════════════════════════════════════
  // TABLA POR ATLETA — asistencia + pagos X/Y + lógica centralizada
  // ════════════════════════════════════════════════════════════════════════

  const _buildAthleteReport = (athletes, payments, attendances, pastPractices, currency, price) => {
    const totalPast = pastPractices.length;
    const Logic     = window.CoachApp.Logic;

    // Pre-construir índices globales por athleteId → practiceId
    const payIndex = {};
    const attIndex = {};
    payments.forEach(p => {
      if (!payIndex[p.athleteId]) payIndex[p.athleteId] = {};
      payIndex[p.athleteId][p.practiceId] = p.status;
    });
    attendances.forEach(a => {
      if (!attIndex[a.athleteId]) attIndex[a.athleteId] = {};
      attIndex[a.athleteId][a.practiceId] = a.asistio;
    });

    const practiceIds = pastPractices.map(pd => Logic.buildPayMap
      ? window.CoachApp.DateSystem.getPracticeId(pd)
      : window.CoachApp.DateSystem.getPracticeId(pd));

    const stats = athletes.map(athlete => {
      const payMap = payIndex[athlete.id] || {};
      const attMap = attIndex[athlete.id] || {};

      // Usar fuente única de verdad
      const s = Logic.calcAthleteStats(
        athlete.id, athlete.ayudaSocial, practiceIds, payMap, attMap
      );

      const total = athlete.ayudaSocial ? 0 : s.paid * price;
      return { athlete, attCount: s.attended, paidCount: s.paid, pending: s.unpaid, total };
    }).sort((a, b) => b.attCount - a.attCount);

    return stats.map(({ athlete, attCount, paidCount, pending, total }) => `
      <div class="athlete-report-row arr-v2">
        <div class="arr-avatar ${athlete.ayudaSocial ? 'avatar-social' : ''}">
          ${athlete.name.charAt(0).toUpperCase()}
        </div>
        <div class="arr-info">
          <div class="arr-name">${athlete.name}</div>
          ${athlete.ayudaSocial ? '<span class="badge-social badge-social-sm">Ayuda Social</span>' : ''}
        </div>
        <div class="arr-stats arr-stats-v2">
          <span class="arr-att" title="Asistencias">📋 ${attCount}/${totalPast}</span>
          ${!athlete.ayudaSocial ? `
            <span class="arr-pay-ratio ${paidCount === attCount && attCount > 0 ? 'arr-all-paid' : ''}"
                  title="Pagos / Asistencias">
              💲 ${paidCount}/${attCount}
            </span>
            ${pending > 0 ? `
              <span class="arr-unpaid arr-warn" title="Sin pagar (asistió pero no pagó)">⏳ ${pending}</span>
            ` : ''}
            <span class="arr-total">${currency}${total.toFixed(2)}</span>
          ` : `
            <span class="arr-social-note">Sin cobro</span>
          `}
        </div>
        <div class="arr-bar-wrap">
          <div class="arr-bar arr-bar-att" style="width:${totalPast > 0 ? (attCount/totalPast*100).toFixed(0) : 0}%"></div>
        </div>
      </div>
    `).join('');
  };

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════

  const _attachEvents = (container, athletes, settings, practiceDates, monthPayments, monthAttendances) => {
    container.querySelector('#btn-prev-month')?.addEventListener('click', async () => {
      _state.month--;
      if (_state.month < 0) { _state.month = 11; _state.year--; }
      await _renderView(container, athletes, settings);
    });

    container.querySelector('#btn-next-month')?.addEventListener('click', async () => {
      _state.month++;
      if (_state.month > 11) { _state.month = 0; _state.year++; }
      await _renderView(container, athletes, settings);
    });

    container.querySelector('#btn-generate-pdf')?.addEventListener('click', async () => {
      await _generatePDF(container, athletes, settings, practiceDates, monthPayments, monthAttendances);
    });
  };

  const _generatePDF = async (container, athletes, settings, practiceDates, payments, attendances) => {
    const btn = container.querySelector('#btn-generate-pdf');
    if (!btn || btn.disabled) return;

    btn.disabled  = true;
    btn.innerHTML = `<span class="btn-pdf-icon">⏳</span><div class="btn-pdf-text"><span class="btn-pdf-main">Generando PDF...</span></div>`;

    try {
      const filename = await window.CoachApp.PDFReport.generate({
        year:          _state.year,
        month:         _state.month,
        athletes,
        payments,
        attendances,   // ← nuevo parámetro v1.0.1
        settings,
        practiceDates
      });
      window.CoachApp.App.showToast(`✅ PDF descargado: ${filename}`);
    } catch (error) {
      console.error('[Calendar] Error al generar PDF:', error);
      window.CoachApp.App.showToast('❌ Error al generar el PDF. ¿Tienes internet?', 'error');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = `
        <span class="btn-pdf-icon">📄</span>
        <div class="btn-pdf-text">
          <span class="btn-pdf-main">Generar Reporte PDF</span>
          <span class="btn-pdf-sub">${DS.formatMonth(_state.year, _state.month)}</span>
        </div>
      `;
    }
  };

  return { render };

})();
