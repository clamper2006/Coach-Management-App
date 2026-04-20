/**
 * components/athlete-calendar.js — Calendario Mensual Individual (Long Press)
 * Coach Management App v1.0.2
 *
 * Se abre con long press (500ms) sobre una fila de atleta en la vista de Pagos.
 * Reutiliza TODA la lógica de Storage, DateSystem y Logic del sistema existente.
 * No duplica lógica de asistencia/pago.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.AthleteCalendar = (() => {

  const Storage = () => window.CoachApp.Storage;
  const DS      = window.CoachApp.DateSystem;
  const Logic   = window.CoachApp.Logic;

  // Estado interno del calendario
  let _state = {
    athlete:      null,
    year:         new Date().getFullYear(),
    month:        new Date().getMonth(),
    practiceDays: [1, 3, 5],
    currency:     '$',
    price:        0,
    // Mapas cargados del mes actual
    payMap:       {},  // { practiceId: 'paid'|'unpaid' }
    attMap:       {},  // { practiceId: true|false }
  };

  // ── Long press state ─────────────────────────────────────────────────────
  let _pressTimer    = null;
  let _pressStarted  = false;
  const LONG_PRESS_MS = 500;

  // ════════════════════════════════════════════════════════════════════════
  // LONG PRESS — adjuntar a filas de atletas
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Adjunta detección de long press a todas las filas .att-athlete-row
   * dentro del contenedor dado.
   * Llamado desde payments.js después de renderizar la lista.
   *
   * @param {HTMLElement} container
   */
  const attachLongPress = (container) => {
    container.querySelectorAll('.att-athlete-row').forEach(row => {
      // Touch (móvil)
      row.addEventListener('touchstart', (e) => {
        _startPress(e, row);
      }, { passive: true });

      row.addEventListener('touchend',   () => _cancelPress());
      row.addEventListener('touchmove',  () => _cancelPress());
      row.addEventListener('touchcancel',() => _cancelPress());

      // Mouse (escritorio / dev)
      row.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        _startPress(e, row);
      });
      row.addEventListener('mouseup',   () => _cancelPress());
      row.addEventListener('mouseleave',() => _cancelPress());
    });
  };

  const _startPress = (e, row) => {
    _cancelPress();
    _pressStarted = true;

    // Feedback visual
    row.classList.add('row-pressing');

    _pressTimer = setTimeout(() => {
      if (!_pressStarted) return;
      row.classList.remove('row-pressing');
      const athleteId = row.dataset.athleteId;
      _openCalendar(athleteId);
    }, LONG_PRESS_MS);
  };

  const _cancelPress = () => {
    _pressStarted = false;
    clearTimeout(_pressTimer);
    document.querySelectorAll('.row-pressing').forEach(r => r.classList.remove('row-pressing'));
  };

  // ════════════════════════════════════════════════════════════════════════
  // ABRIR MODAL DE CALENDARIO
  // ════════════════════════════════════════════════════════════════════════

  const _openCalendar = async (athleteId) => {
    try {
      const [athlete, practiceDays, currency, price] = await Promise.all([
        Storage().getById('athletes', athleteId),
        Storage().getSetting('practiceDays',     [1, 3, 5]),
        Storage().getSetting('currency',         '$'),
        Storage().getSetting('pricePerPractice', 0)
      ]);

      if (!athlete) return;

      _state.athlete      = athlete;
      _state.year         = new Date().getFullYear();
      _state.month        = new Date().getMonth();
      _state.practiceDays = practiceDays;
      _state.currency     = currency;
      _state.price        = price;

      await _loadMonthData();
      await _renderModal();

    } catch (err) {
      console.error('[AthleteCalendar] Error al abrir:', err);
      window.CoachApp.App.showToast('❌ Error al abrir el calendario', 'error');
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // CARGA DE DATOS DEL MES
  // ════════════════════════════════════════════════════════════════════════

  const _loadMonthData = async () => {
    const { athlete, year, month } = _state;

    const [allPayments, allAttendance] = await Promise.all([
      Storage().getPaymentsByAthlete(athlete.id),
      Storage().getAttendanceByAthlete(athlete.id)
    ]);

    // Filtrar solo los del mes actual
    const practiceDates = DS.getPracticeDatesInMonth(year, month, _state.practiceDays);
    const pidSet        = new Set(practiceDates.map(d => DS.getPracticeId(d)));

    _state.payMap = {};
    _state.attMap = {};

    allPayments.forEach(p => {
      if (pidSet.has(p.practiceId)) _state.payMap[p.practiceId] = p.status;
    });
    allAttendance.forEach(a => {
      if (pidSet.has(a.practiceId)) _state.attMap[a.practiceId] = a.asistio;
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDERIZADO DEL MODAL
  // ════════════════════════════════════════════════════════════════════════

  const _renderModal = async () => {
    // Eliminar modal previo
    document.getElementById('ac-modal')?.remove();

    const { athlete, year, month, practiceDays, currency, price, payMap, attMap } = _state;

    const practiceDates  = DS.getPracticeDatesInMonth(year, month, practiceDays);
    const pastPractices  = practiceDates.filter(d => !DS.isFuture(d));
    const practiceIdSet  = new Set(practiceDates.map(d => DS.getPracticeId(d)));
    const pastIds        = pastPractices.map(d => DS.getPracticeId(d));

    const stats = Logic.calcAthleteStats(
      athlete.id, athlete.ayudaSocial,
      pastIds,
      payMap,
      attMap
    );

    // Calcular deuda total GLOBAL (todos los meses) para el render inicial
    const totalDebt = await _calcTotalDebtAllMonths();

    // ── Construir la cuadrícula del mes ──────────────────────────────────
    const firstDay  = new Date(year, month, 1);
    const lastDay   = new Date(year, month + 1, 0);
    // Día de la semana del primer día (ISO: 1=Lun…7=Dom)
    let startOffset = DS.jsToIsoDay(firstDay.getDay()) - 1; // 0-6

    const cells = [];
    // Celdas vacías iniciales
    for (let i = 0; i < startOffset; i++) cells.push(null);
    // Días del mes
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push(new Date(year, month, d));
    }

    const today = new Date();

    const calRows = [];
    for (let i = 0; i < cells.length; i += 7) {
      calRows.push(cells.slice(i, i + 7));
    }

    const modal = document.createElement('div');
    modal.id    = 'ac-modal';
    modal.className = 'ac-modal';
    modal.innerHTML = `
      <div class="ac-backdrop"></div>
      <div class="ac-sheet" id="ac-sheet">

        <!-- Header -->
        <div class="ac-header">
          <button class="ac-close" id="ac-close" aria-label="Cerrar">✕</button>
          <div class="ac-header-info">
            <div class="ac-athlete-avatar ${athlete.ayudaSocial ? 'avatar-social' : ''}">
              ${athlete.name.charAt(0).toUpperCase()}
            </div>
            <div class="ac-header-text">
              <div class="ac-athlete-name">${athlete.name}</div>
              <div class="ac-athlete-sub">
                ${athlete.ayudaSocial ? '<span class="badge-social">Ayuda Social</span>' : 'Calendario de pagos'}
              </div>
            </div>
          </div>

          <!-- Navegación de mes -->
          <div class="ac-month-nav">
            <button class="ac-month-btn" id="ac-prev-month">‹</button>
            <span class="ac-month-label">${DS.formatMonth(year, month)}</span>
            <button class="ac-month-btn" id="ac-next-month">›</button>
          </div>
        </div>

        <!-- Métricas en tiempo real -->
        <div class="ac-metrics" id="ac-metrics">
          ${_buildMetrics(stats, pastPractices.length, currency, price, athlete.ayudaSocial)}
        </div>

        <!-- Cabecera días de la semana -->
        <div class="ac-weekdays">
          ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d =>
            `<span class="ac-weekday">${d}</span>`
          ).join('')}
        </div>

        <!-- Cuadrícula del mes -->
        <div class="ac-grid" id="ac-grid">
          ${calRows.map(row => `
            <div class="ac-week-row">
              ${row.map(cell => {
                if (!cell) return '<div class="ac-cell ac-cell-empty"></div>';

                const pid        = DS.getPracticeId(cell);
                const isPractice = practiceIdSet.has(pid);
                const isFut      = DS.isFuture(cell);
                const isTod      = DS.isToday(cell);
                const asistio    = attMap[pid];
                const pagoStatus = payMap[pid];
                const result     = isPractice
                  ? Logic.getPaymentStatus(asistio, pagoStatus, athlete.ayudaSocial)
                  : null;

                let stateClass = '';
                if (isPractice && !isFut) {
                  if (result === 'paid')   stateClass = 'ac-day-paid';
                  else if (result === 'unpaid') stateClass = 'ac-day-unpaid';
                  else                    stateClass = 'ac-day-neutral';
                } else if (isPractice && isFut) {
                  stateClass = 'ac-day-future-practice';
                }

                return `
                  <div class="ac-cell ${isPractice ? 'ac-cell-practice' : ''} ${stateClass} ${isTod ? 'ac-cell-today' : ''}"
                       data-date="${DS.toISODate(cell)}"
                       data-practice="${isPractice ? 'true' : 'false'}"
                       data-practice-id="${isPractice ? pid : ''}"
                       data-future="${isFut ? 'true' : 'false'}">
                    <span class="ac-day-num">${cell.getDate()}</span>
                    ${isPractice && !isFut ? `<div class="ac-day-dot ${stateClass}-dot"></div>` : ''}
                    ${isPractice && isFut  ? `<div class="ac-day-dot ac-dot-future"></div>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>

        <!-- Panel de día seleccionado -->
        <div class="ac-day-panel" id="ac-day-panel" style="display:none"></div>

        <!-- Total No Pagado — deuda real (asistió + no pagó) TODOS LOS MESES -->
        <div class="ac-debt-total" id="ac-debt-total">
          ${_buildDebtTotal(totalDebt, currency, athlete.ayudaSocial)}
        </div>

        <!-- Leyenda -->
        <div class="ac-legend">
          <div class="ac-legend-item"><span class="ac-legend-dot ac-day-paid-dot"></span> Asistió + Pagó</div>
          <div class="ac-legend-item"><span class="ac-legend-dot ac-day-unpaid-dot"></span> Asistió + No Pagó</div>
          <div class="ac-legend-item"><span class="ac-legend-dot ac-dot-future"></span> Práctica futura</div>
        </div>

      </div><!-- /.ac-sheet -->
    `;

    document.body.appendChild(modal);

    // Animar entrada
    requestAnimationFrame(() => modal.classList.add('ac-modal-visible'));

    _attachModalEvents(modal);
  };

  // ════════════════════════════════════════════════════════════════════════
  // MÉTRICAS
  // ════════════════════════════════════════════════════════════════════════

  const _buildMetrics = (stats, totalPractices, currency, price, ayudaSocial) => `
    <div class="ac-metric">
      <span class="ac-metric-val">${totalPractices}</span>
      <span class="ac-metric-lbl">Prácticas</span>
    </div>
    <div class="ac-metric-divider"></div>
    <div class="ac-metric">
      <span class="ac-metric-val ac-metric-green">${stats.attended}</span>
      <span class="ac-metric-lbl">Asistencias</span>
    </div>
    <div class="ac-metric-divider"></div>
    ${!ayudaSocial ? `
      <div class="ac-metric">
        <span class="ac-metric-val ac-metric-green">${stats.paid}</span>
        <span class="ac-metric-lbl">Pagados</span>
      </div>
      <div class="ac-metric-divider"></div>
      <div class="ac-metric">
        <span class="ac-metric-val ${stats.unpaid > 0 ? 'ac-metric-red' : 'ac-metric-green'}">${stats.unpaid}</span>
        <span class="ac-metric-lbl">Pendientes</span>
      </div>
    ` : `
      <div class="ac-metric">
        <span class="ac-metric-val ac-metric-yellow">—</span>
        <span class="ac-metric-lbl">Ayuda Social</span>
      </div>
    `}
  `;

  /**
   * Construye el bloque de deuda total (Total No Pagado).
   * Recibe el resultado de _calcTotalDebtAllMonths: { unpaid, amount }
   * Solo cuenta: asistio = true AND pago != 'paid' (TODOS los meses).
   * Oculto si ayudaSocial.
   */
  const _buildDebtTotal = (totalDebt, currency, ayudaSocial) => {
    if (ayudaSocial) return '';
    const { unpaid, amount } = totalDebt;
    return `
      <div class="ac-debt-inner ${unpaid > 0 ? 'ac-debt-has-value' : 'ac-debt-zero'}">
        <span class="ac-debt-label">Total No Pagado</span>
        <span class="ac-debt-value ${unpaid > 0 ? 'ac-debt-red' : 'ac-debt-ok'}">
          ${unpaid > 0
            ? `${currency}${amount.toFixed(2)} <span class="ac-debt-count">(${unpaid} práctica${unpaid !== 1 ? 's' : ''})</span>`
            : '✓ Sin deuda'}
        </span>
      </div>
    `;
  };

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS DEL MODAL
  // ════════════════════════════════════════════════════════════════════════

  const _attachModalEvents = (modal) => {
    const sheet = modal.querySelector('#ac-sheet');

    // Cerrar al click en backdrop
    modal.querySelector('.ac-backdrop')?.addEventListener('click', _closeModal);
    modal.querySelector('#ac-close')?.addEventListener('click', _closeModal);

    // Evitar que clicks dentro del sheet cierren el modal
    sheet?.addEventListener('click', e => e.stopPropagation());

    // Navegación de mes
    modal.querySelector('#ac-prev-month')?.addEventListener('click', async () => {
      _state.month--;
      if (_state.month < 0) { _state.month = 11; _state.year--; }
      await _loadMonthData();
      await _rerenderCalendarContent(modal);
    });

    modal.querySelector('#ac-next-month')?.addEventListener('click', async () => {
      _state.month++;
      if (_state.month > 11) { _state.month = 0; _state.year++; }
      await _loadMonthData();
      await _rerenderCalendarContent(modal);
    });

    // Click en una celda de práctica
    modal.querySelectorAll('.ac-cell-practice').forEach(cell => {
      cell.addEventListener('click', () => {
        const date       = cell.dataset.date;
        const practiceId = cell.dataset.practiceId;
        const isFuture   = cell.dataset.future === 'true';

        // Deseleccionar celda previa
        modal.querySelectorAll('.ac-cell-selected').forEach(c => c.classList.remove('ac-cell-selected'));
        cell.classList.add('ac-cell-selected');

        if (isFuture) {
          _showDayPanel(modal, date, practiceId, true);
        } else {
          _showDayPanel(modal, date, practiceId, false);
        }
      });
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // PANEL DE DÍA SELECCIONADO
  // ════════════════════════════════════════════════════════════════════════

  const _showDayPanel = (modal, dateStr, practiceId, isFuture) => {
    const panel    = modal.querySelector('#ac-day-panel');
    if (!panel) return;

    const { athlete, payMap, attMap } = _state;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj   = new Date(y, m - 1, d);
    const dayName   = DS.DAY_NAMES_FULL[DS.jsToIsoDay(dateObj.getDay())];
    const dateLabel = DS.formatDateLong(dateObj);

    const asistio    = attMap[practiceId];
    const pagoStatus = payMap[practiceId];
    const attChecked = asistio === true;
    const payChecked = pagoStatus === 'paid';
    const payDisabled = !attChecked || athlete.ayudaSocial;

    panel.style.display = '';
    panel.innerHTML = `
      <div class="ac-panel-header">
        <div class="ac-panel-date">
          <strong>${dayName}</strong>
          <span>${dateLabel}</span>
        </div>
        ${isFuture ? '<span class="ac-panel-future-badge">Práctica futura</span>' : ''}
      </div>

      ${isFuture ? `
        <p class="ac-panel-future-msg">Podrás registrar asistencia y pago el día de la práctica.</p>
      ` : `
        <div class="ac-panel-checks">

          <!-- Asistencia -->
          <label class="ac-check-row">
            <div class="ac-check-info">
              <span class="ac-check-title">Asistió</span>
            </div>
            <label class="att-check-label">
              <input type="checkbox"
                     class="att-checkbox ac-cb-asistencia"
                     data-practice-id="${practiceId}"
                     ${attChecked ? 'checked' : ''}
                     aria-label="Asistencia">
              <span class="att-check-custom ${attChecked ? 'checked-green' : ''}"></span>
            </label>
          </label>

          <!-- Pago (oculto si ayudaSocial) -->
          ${!athlete.ayudaSocial ? `
            <label class="ac-check-row ${payDisabled ? 'ac-check-row-disabled' : ''}"
                   id="ac-pay-row"
                   data-disabled="${payDisabled ? 'true' : 'false'}">
              <div class="ac-check-info">
                <span class="ac-check-title">Pago</span>
                ${payDisabled ? '<span class="ac-check-hint">Marca asistencia primero</span>' : ''}
              </div>
              <label class="att-check-label ${payDisabled ? 'att-check-disabled' : ''}"
                     data-disabled="${payDisabled ? 'true' : 'false'}">
                <input type="checkbox"
                       class="att-checkbox ac-cb-pago"
                       data-practice-id="${practiceId}"
                       ${payChecked ? 'checked' : ''}
                       ${payDisabled ? 'disabled' : ''}
                       aria-label="Pago">
                <span class="att-check-custom ${payChecked ? 'checked-orange' : ''} ${payDisabled ? 'check-disabled' : ''}"></span>
              </label>
            </label>
          ` : `
            <div class="ac-check-row ac-check-row-disabled">
              <div class="ac-check-info">
                <span class="ac-check-title">Pago</span>
                <span class="ac-check-hint">Ayuda Social: sin cobro</span>
              </div>
              <span class="att-no-pay-indicator">—</span>
            </div>
          `}

        </div>
      `}
    `;

    if (!isFuture) {
      _attachPanelEvents(modal, panel, practiceId);
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS DEL PANEL
  // ════════════════════════════════════════════════════════════════════════

  const _attachPanelEvents = (modal, panel, practiceId) => {
    const { athlete } = _state;

    // ── Checkbox ASISTENCIA ──────────────────────────────────────────────
    const attCb = panel.querySelector('.ac-cb-asistencia');
    attCb?.addEventListener('change', async () => {
      const asistio   = attCb.checked;
      const customBox = attCb.nextElementSibling;
      customBox?.classList.toggle('checked-green', asistio);

      // Actualizar estado interno
      _state.attMap[practiceId] = asistio;

      // Actualizar celda del calendario
      _updateCalendarCell(modal, practiceId);

      // Habilitar/deshabilitar pago en el panel
      const payCb    = panel.querySelector('.ac-cb-pago');
      const payLabel = payCb?.closest('.att-check-label');
      const payRow   = panel.querySelector('#ac-pay-row');
      const payCustom = payCb?.nextElementSibling;
      const payHint  = payRow?.querySelector('.ac-check-hint');

      if (payCb) {
        payCb.disabled = !asistio;
        payLabel?.classList.toggle('att-check-disabled', !asistio);
        if (payLabel) payLabel.dataset.disabled = !asistio ? 'true' : 'false';
        if (payRow)   payRow.dataset.disabled   = !asistio ? 'true' : 'false';
        payRow?.classList.toggle('ac-check-row-disabled', !asistio);
        payCustom?.classList.toggle('check-disabled', !asistio);

        if (payHint) {
          payHint.textContent = !asistio ? 'Marca asistencia primero' : '';
          payHint.style.display = !asistio ? '' : 'none';
        }

        // Si se desmarca asistencia y había pago → limpiar pago
        if (!asistio && payCb.checked) {
          payCb.checked = false;
          payCustom?.classList.remove('checked-orange');
          _state.payMap[practiceId] = 'unpaid';
          await _savePersist(athlete.id, practiceId, 'payment', 'unpaid');
          _updateCalendarCell(modal, practiceId);
        }
      }

      // Persistir asistencia
      await _savePersist(athlete.id, practiceId, 'attendance', asistio);
      // Actualizar métricas (async — incluye deuda total de todos los meses)
      await _refreshMetrics(modal);
    });

    // ── Checkbox PAGO ────────────────────────────────────────────────────
    const payCb = panel.querySelector('.ac-cb-pago');
    payCb?.addEventListener('change', async () => {
      if (payCb.disabled) {
        payCb.checked = false;
        window.CoachApp.App.showToast('⚠️ Primero marca la asistencia', 'error');
        return;
      }

      const paid      = payCb.checked;
      const payCustom = payCb.nextElementSibling;
      payCustom?.classList.toggle('checked-orange', paid);

      _state.payMap[practiceId] = paid ? 'paid' : 'unpaid';

      await _savePersist(athlete.id, practiceId, 'payment', paid ? 'paid' : 'unpaid');
      _updateCalendarCell(modal, practiceId);
      await _refreshMetrics(modal);
    });

    // Bloquear click en label de pago deshabilitado
    panel.querySelectorAll('.att-check-cell .att-check-label, .att-check-label').forEach(label => {
      label.addEventListener('click', (e) => {
        if (label.dataset.disabled === 'true') {
          e.preventDefault();
          window.CoachApp.App.showToast('⚠️ Primero marca la asistencia', 'error');
        }
      });
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // ACTUALIZAR CELDA EN LA CUADRÍCULA
  // ════════════════════════════════════════════════════════════════════════

  const _updateCalendarCell = (modal, practiceId) => {
    const { athlete, payMap, attMap } = _state;
    const cell = modal.querySelector(`.ac-cell[data-practice-id="${practiceId}"]`);
    if (!cell) return;

    const asistio    = attMap[practiceId];
    const pagoStatus = payMap[practiceId];
    const result     = Logic.getPaymentStatus(asistio, pagoStatus, athlete.ayudaSocial);

    // Quitar clases de estado
    cell.classList.remove('ac-day-paid', 'ac-day-unpaid', 'ac-day-neutral');
    const dot = cell.querySelector('.ac-day-dot');
    if (dot) dot.className = 'ac-day-dot';

    if (result === 'paid') {
      cell.classList.add('ac-day-paid');
      if (dot) dot.classList.add('ac-day-paid-dot');
    } else if (result === 'unpaid') {
      cell.classList.add('ac-day-unpaid');
      if (dot) dot.classList.add('ac-day-unpaid-dot');
    } else {
      cell.classList.add('ac-day-neutral');
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // DEUDA TOTAL — TODOS LOS MESES (fuente única: IndexedDB sin filtro)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Calcula la deuda total del atleta sumando TODOS los meses almacenados.
   * Lógica central: deuda = asistio:true AND pago != 'paid' AND !ayudaSocial
   *
   * @returns {{ unpaid: number, amount: number }}
   */
  const _calcTotalDebtAllMonths = async () => {
    const { athlete, price } = _state;

    if (athlete.ayudaSocial) return { unpaid: 0, amount: 0 };

    // Cargar TODOS los registros del atleta (sin filtro de mes)
    const [allPayments, allAttendance] = await Promise.all([
      Storage().getPaymentsByAthlete(athlete.id),
      Storage().getAttendanceByAthlete(athlete.id)
    ]);

    // Índice de pagos por practiceId
    const payIndex = {};
    allPayments.forEach(p => { payIndex[p.practiceId] = p.status; });

    // Contar prácticas pasadas donde asistió pero no pagó
    let unpaid = 0;
    for (const att of allAttendance) {
      if (att.asistio !== true) continue;                     // no asistió → sin deuda
      if (DS.isFuture(DS.parsePracticeId(att.practiceId))) continue; // futura → omitir
      const status = payIndex[att.practiceId];
      if (status !== 'paid') unpaid++;                        // asistió + no pagó → deuda
    }

    return { unpaid, amount: unpaid * price };
  };

  // ════════════════════════════════════════════════════════════════════════
  // ACTUALIZAR MÉTRICAS EN TIEMPO REAL
  // ════════════════════════════════════════════════════════════════════════

  const _refreshMetrics = async (modal) => {
    const { athlete, year, month, practiceDays, currency, price, payMap, attMap } = _state;
    const practiceDates = DS.getPracticeDatesInMonth(year, month, practiceDays);
    const pastPractices = practiceDates.filter(d => !DS.isFuture(d));
    const pastIds       = pastPractices.map(d => DS.getPracticeId(d));

    // Stats del mes visible (para las tarjetas superiores)
    const stats = Logic.calcAthleteStats(
      athlete.id, athlete.ayudaSocial, pastIds, payMap, attMap
    );

    // Actualizar tarjetas de métricas del mes
    const metricsEl = modal.querySelector('#ac-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = _buildMetrics(
        stats, pastPractices.length, currency, price, athlete.ayudaSocial
      );
    }

    // Deuda total GLOBAL (todos los meses) — cálculo desde Storage
    const totalDebt = await _calcTotalDebtAllMonths();
    const debtEl    = modal.querySelector('#ac-debt-total');
    if (debtEl) {
      debtEl.innerHTML = _buildDebtTotal(totalDebt, currency, athlete.ayudaSocial);
    }

    // Sincronizar con la vista de Pagos si está activa
    window.CoachApp.Payments?.refresh?.();
  };

  // ════════════════════════════════════════════════════════════════════════
  // RE-RENDERIZAR CONTENIDO DEL CALENDARIO (cambio de mes)
  // ════════════════════════════════════════════════════════════════════════

  const _rerenderCalendarContent = async (modal) => {
    modal.remove();
    await _renderModal();
  };

  // ════════════════════════════════════════════════════════════════════════
  // PERSISTENCIA — reutiliza helpers de Storage (igual que payments.js)
  // ════════════════════════════════════════════════════════════════════════

  const _savePersist = async (athleteId, practiceId, type, value) => {
    try {
      if (type === 'attendance') {
        const existing = await Storage().getAttendance(athleteId, practiceId);
        await Storage().put('attendance', {
          id:        existing?.id || Storage().generateId(),
          athleteId, practiceId,
          asistio:   value,
          timestamp: Date.now()
        });
      } else {
        const existing = await Storage().getPayment(athleteId, practiceId);
        await Storage().put('payments', {
          id:        existing?.id || Storage().generateId(),
          athleteId, practiceId,
          status:    value,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.error('[AthleteCalendar] Error al guardar:', err);
      window.CoachApp.App.showToast('❌ Error al guardar', 'error');
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // CERRAR MODAL
  // ════════════════════════════════════════════════════════════════════════

  const _closeModal = () => {
    const modal = document.getElementById('ac-modal');
    if (!modal) return;
    modal.classList.remove('ac-modal-visible');
    setTimeout(() => modal.remove(), 320);
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return { attachLongPress };

})();
