/**
 * components/calendar.js — Vista de Reportes Mensuales
 * Coach Management App
 *
 * Permite seleccionar un mes y generar el reporte PDF correspondiente.
 * Muestra un resumen previo del mes antes de generar el PDF.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Calendar = (() => {

  const Storage = () => window.CoachApp.Storage;
  const DS      = window.CoachApp.DateSystem;

  // Estado de la vista
  let _state = {
    year:  new Date().getFullYear(),
    month: new Date().getMonth()  // base 0
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
    const isFutureMonth   = new Date(year, month, 1) > new Date(today.getFullYear(), today.getMonth(), 1);

    // Cargar pagos del mes
    const monthPayments = [];
    for (const pd of practiceDates) {
      if (!DS.isFuture(pd)) {
        const pid  = DS.getPracticeId(pd);
        const pays = await Storage().getPaymentsByPractice(pid);
        monthPayments.push(...pays);
      }
    }

    // Estadísticas del mes
    const pastPractices = practiceDates.filter(pd => !DS.isFuture(pd));
    const totalPaid     = monthPayments.filter(p => p.status === 'paid').length;
    const totalExpected = pastPractices.length * athletes.length;
    const totalCollected = totalPaid * settings.pricePerPractice;
    const totalPending   = (totalExpected - totalPaid) * settings.pricePerPractice;
    const currency       = settings.currency;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Reportes</h2>
          <p class="view-subtitle">Resumen mensual de pagos</p>
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

      <!-- Tarjetas de resumen del mes -->
      <div class="report-summary-grid">
        <div class="report-stat-card">
          <div class="rsc-icon">🗓️</div>
          <div class="rsc-value">${practiceDates.length}</div>
          <div class="rsc-label">Prácticas en el mes</div>
          <div class="rsc-sub">${pastPractices.length} realizadas</div>
        </div>
        <div class="report-stat-card">
          <div class="rsc-icon">👥</div>
          <div class="rsc-value">${athletes.length}</div>
          <div class="rsc-label">Jugadores</div>
          <div class="rsc-sub">registrados</div>
        </div>
        <div class="report-stat-card rsc-green">
          <div class="rsc-icon">✅</div>
          <div class="rsc-value">${currency}${totalCollected.toFixed(2)}</div>
          <div class="rsc-label">Total Recaudado</div>
          <div class="rsc-sub">${totalPaid} pagos</div>
        </div>
        <div class="report-stat-card rsc-red">
          <div class="rsc-icon">⏳</div>
          <div class="rsc-value">${currency}${totalPending.toFixed(2)}</div>
          <div class="rsc-label">Pendiente</div>
          <div class="rsc-sub">${totalExpected - totalPaid} pagos</div>
        </div>
      </div>

      <!-- Botón principal: Generar PDF -->
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

      <!-- Tabla de prácticas del mes -->
      <div class="report-practices-section">
        <h3 class="section-title-sm">Prácticas de ${DS.MONTH_NAMES[month]}</h3>
        ${practiceDates.length === 0
          ? '<p class="empty-month">No hay prácticas configuradas para este mes.</p>'
          : `<div class="practices-table">
              <div class="pt-header">
                <span>Fecha</span>
                <span>Día</span>
                <span>Pagaron</span>
                <span>Pendiente</span>
              </div>
              ${practiceDates.map(pd => _buildPracticeRow(pd, monthPayments, athletes.length, currency, settings.pricePerPractice)).join('')}
            </div>`
        }
      </div>

      <!-- Resumen por atleta -->
      ${athletes.length > 0 ? `
        <div class="report-athletes-section">
          <h3 class="section-title-sm">Detalle por Atleta</h3>
          <div class="athlete-report-list">
            ${_buildAthleteReport(athletes, monthPayments, pastPractices, currency, settings.pricePerPractice)}
          </div>
        </div>
      ` : ''}
    `;

    _attachEvents(container, athletes, settings, practiceDates, monthPayments);
  };

  // ════════════════════════════════════════════════════════════════════════
  // FILAS Y LISTAS
  // ════════════════════════════════════════════════════════════════════════

  const _buildPracticeRow = (pd, payments, totalAthletes, currency, price) => {
    const pid       = DS.getPracticeId(pd);
    const isoDay    = DS.jsToIsoDay(pd.getDay());
    const dayName   = DS.DAY_NAMES_FULL[isoDay];
    const isFut     = DS.isFuture(pd);
    const isTod     = DS.isToday(pd);
    const paid      = payments.filter(p => p.practiceId === pid && p.status === 'paid').length;
    const unpaid    = totalAthletes - paid;
    const recaudado = paid * price;

    return `
      <div class="pt-row ${isTod ? 'pt-today' : ''} ${isFut ? 'pt-future' : ''}">
        <span class="pt-date">${DS.formatDateShort(pd)}</span>
        <span class="pt-day">${dayName}</span>
        ${isFut
          ? `<span class="pt-future-label" style="grid-column: 3/-1">Práctica futura</span>`
          : `
            <span class="pt-paid">${paid} <small>de ${totalAthletes}</small></span>
            <span class="pt-amount ${unpaid > 0 ? 'amount-warn' : 'amount-ok'}">${currency}${recaudado.toFixed(2)}</span>
          `
        }
        ${isTod ? '<span class="pt-today-badge">HOY</span>' : ''}
      </div>
    `;
  };

  const _buildAthleteReport = (athletes, payments, pastPractices, currency, price) => {
    const totalPast = pastPractices.length;

    const stats = athletes.map(a => {
      const paid = payments.filter(p => p.athleteId === a.id && p.status === 'paid').length;
      return { athlete: a, paid, unpaid: totalPast - paid, total: paid * price };
    }).sort((a, b) => b.paid - a.paid);

    return stats.map(({ athlete, paid, unpaid, total }) => `
      <div class="athlete-report-row">
        <div class="arr-avatar">${athlete.name.charAt(0).toUpperCase()}</div>
        <div class="arr-name">${athlete.name}</div>
        <div class="arr-stats">
          <span class="arr-paid">${paid}✓</span>
          <span class="arr-unpaid">${unpaid}✗</span>
          <span class="arr-total">${currency}${total.toFixed(2)}</span>
        </div>
        <div class="arr-bar-wrap">
          <div class="arr-bar" style="width:${totalPast > 0 ? (paid/totalPast*100).toFixed(0) : 0}%"></div>
        </div>
      </div>
    `).join('');
  };

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════

  const _attachEvents = (container, athletes, settings, practiceDates, monthPayments) => {
    // Navegación de meses
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

    // Generar PDF
    container.querySelector('#btn-generate-pdf')?.addEventListener('click', async () => {
      await _generatePDF(container, athletes, settings, practiceDates, monthPayments);
    });
  };

  const _generatePDF = async (container, athletes, settings, practiceDates, payments) => {
    const btn = container.querySelector('#btn-generate-pdf');
    if (!btn || btn.disabled) return;

    btn.disabled   = true;
    btn.innerHTML  = `<span class="btn-pdf-icon">⏳</span><div class="btn-pdf-text"><span class="btn-pdf-main">Generando PDF...</span></div>`;

    try {
      const filename = await window.CoachApp.PDFReport.generate({
        year:          _state.year,
        month:         _state.month,
        athletes,
        payments,
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

  // ── API pública ──────────────────────────────────────────────────────────
  return { render };

})();
