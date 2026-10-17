/**
 * components/payments.js — Registro de Pagos y Asistencia por Práctica
 * Coach Management App v1.0.1
 *
 * Reglas estrictas:
 *  pagoValido = asistio && !ayudaSocial
 *
 *  - Pago se habilita/deshabilita en tiempo real al cambiar asistencia
 *  - Si asistencia = false y había pago → se elimina automáticamente
 *  - ayudaSocial: muestra "—" en lugar del checkbox de pago
 *  - Compatible con todos los navegadores (sin :has() CSS)
 *  - Tabs muestran [📋 X/total] [💲 Y/asistentes]
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Payments = (() => {

  const Storage = () => window.CoachApp.Storage;
  const DS      = window.CoachApp.DateSystem;

  let _state = {
    referenceDate:    new Date(),
    selectedPractice: null,
    athletes:         [],
    practiceDays:     [1, 3, 5],
    currency:         '$',
    price:            0
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDERIZADO PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════

  const render = async (container) => {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    try {
      const [athletes, practiceDays, currency, price] = await Promise.all([
        Storage().getAll('athletes'),
        Storage().getSetting('practiceDays',     [1, 3, 5]),
        Storage().getSetting('currency',         '$'),
        Storage().getSetting('pricePerPractice', 0)
      ]);

      _state.athletes     = athletes.sort((a, b) => a.name.localeCompare(b.name));
      _state.practiceDays = practiceDays;
      _state.currency     = currency;
      _state.price        = price;

      if (!_state.selectedPractice) {
        const todayId = DS.getTodayPracticeId(practiceDays);
        _state.selectedPractice = todayId ? new Date() : DS.getNextPracticeDate(practiceDays);
      }

      await _renderView(container);
    } catch (error) {
      console.error('[Payments] Error al renderizar:', error);
      container.innerHTML = '<div class="error-state"><p>Error al cargar pagos.</p></div>';
    }
  };

  const _renderView = async (container) => {
    const practices     = DS.getPracticeDatesInWeek(_state.referenceDate, _state.practiceDays);
    const weekLabel     = DS.formatWeekRange(_state.referenceDate);
    const [year, weekNum] = DS.getISOWeek(_state.referenceDate);
    const isCurrentWeek = DS.getWeekKey(new Date()) === DS.getWeekKey(_state.referenceDate);

    // Cargar pagos Y asistencias de toda la semana
    const allPayments    = [];
    const allAttendances = [];
    for (const pd of practices) {
      if (!DS.isFuture(pd)) {
        const pid = DS.getPracticeId(pd);
        const [pays, atts] = await Promise.all([
          Storage().getPaymentsByPractice(pid),
          Storage().getAttendanceByPractice(pid)
        ]);
        allPayments.push(...pays);
        allAttendances.push(...atts);
      }
    }

    // Determinar práctica activa
    let activePractice = _state.selectedPractice;
    if (!activePractice) activePractice = practices[0];
    const activeId             = DS.getPracticeId(activePractice);
    const activePracticeInWeek = practices.find(p => DS.getPracticeId(p) === activeId);
    if (!activePracticeInWeek) {
      activePractice = practices[0];
      _state.selectedPractice = activePractice;
    }

    const activePracticeDate  = activePracticeInWeek || practices[0];
    const activePracticeId    = DS.getPracticeId(activePracticeDate);
    const practicePayments    = allPayments.filter(p => p.practiceId === activePracticeId);
    const practiceAttendances = allAttendances.filter(a => a.practiceId === activePracticeId);

    const paidCount    = practicePayments.filter(p => p.status === 'paid').length;
    const attendedCount = practiceAttendances.filter(a => a.asistio).length;
    const isFuture     = DS.isFuture(activePracticeDate);
    const isToday      = DS.isToday(activePracticeDate);

    container.innerHTML = `
      <!-- Navegación de semana -->
      <div class="payments-header">
        <button class="week-nav-btn" id="btn-prev-week">‹</button>
        <div class="week-info">
          <div class="week-label">${weekLabel}</div>
          <div class="week-num">Semana ${weekNum} ${isCurrentWeek ? '<span class="badge-current">Esta semana</span>' : ''}</div>
        </div>
        <button class="week-nav-btn" id="btn-next-week">›</button>
      </div>

      <!-- Tabs de prácticas -->
      <div class="practice-tabs">
        ${practices.map(pd => {
          const pid      = DS.getPracticeId(pd);
          const isoDay   = DS.jsToIsoDay(pd.getDay());
          const dayName  = DS.DAY_NAMES_SHORT[isoDay];
          const dateStr  = DS.formatDateShort(pd);
          const isFut    = DS.isFuture(pd);
          const isTod    = DS.isToday(pd);
          const isActive = pid === activePracticeId;
          const tabAtt   = allAttendances.filter(a => a.practiceId === pid && a.asistio).length;
          const tabPaid  = allPayments.filter(p => p.practiceId === pid && p.status === 'paid').length;

          return `
            <button class="practice-tab ${isActive ? 'active' : ''} ${isFut ? 'future' : ''} ${isTod ? 'today' : ''}"
                    data-practice-date="${DS.toISODate(pd)}">
              <span class="tab-day">${dayName}</span>
              <span class="tab-date">${dateStr}</span>
              ${!isFut ? `
                <span class="tab-dual-count">
                  <span class="${tabAtt > 0 ? 'count-green' : 'count-red'}">📋${tabAtt}</span>
                  <span class="${tabPaid > 0 ? 'count-green' : 'count-red'}">💲${tabPaid}</span>
                </span>
              ` : `<span class="tab-future-tag">—</span>`}
              ${isTod ? '<span class="tab-today-dot"></span>' : ''}
            </button>
          `;
        }).join('')}
      </div>

      <!-- Encabezado de práctica seleccionada -->
      <div class="practice-detail-header ${isFuture ? 'future' : isToday ? 'today' : 'past'}">
        <div class="pdh-left">
          <div class="pdh-title">${DS.DAY_NAMES_FULL[DS.jsToIsoDay(activePracticeDate.getDay())]}</div>
          <div class="pdh-date">${DS.formatDateLong(activePracticeDate)}</div>
          ${isToday  ? '<div class="pdh-badge pdh-badge-today">🏀 HOY</div>' : ''}
          ${isFuture ? '<div class="pdh-badge pdh-badge-future">📅 Práctica futura</div>' : ''}
        </div>
        ${!isFuture ? `
          <div class="pdh-stats">
            <div class="pdh-stat pdh-stat-att">
              <span class="pdh-stat-num" id="stat-att">${attendedCount}</span>
              <span class="pdh-stat-lbl">Asistieron</span>
            </div>
            <div class="pdh-stat pdh-stat-paid">
              <span class="pdh-stat-num" id="stat-paid">${paidCount}</span>
              <span class="pdh-stat-lbl">Pagaron</span>
            </div>
            <div class="pdh-stat pdh-stat-amount">
              <span class="pdh-stat-num" id="stat-amount">${_state.currency}${(paidCount * _state.price).toFixed(0)}</span>
              <span class="pdh-stat-lbl">Recaudado</span>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Leyenda de columnas -->
      ${!isFuture && _state.athletes.length > 0 ? `
        <div class="att-columns-header">
          <span class="att-col-name">Atleta</span>
          <span class="att-col-check">Asistió</span>
          <span class="att-col-check">Pago</span>
        </div>
      ` : ''}

      <!-- Lista de atletas -->
      <div class="payment-athlete-list" id="payment-athlete-list">
        ${_buildAthleteList(
          _state.athletes, practicePayments, practiceAttendances,
          activePracticeId, isFuture
        )}
      </div>
    `;

    _attachEvents(container, practices, activePracticeId, isFuture);

    // Adjuntar long press para calendario mensual individual
    if (!isFuture && _state.athletes.length > 0) {
      window.CoachApp.AthleteCalendar.attachLongPress(
        container.querySelector('#payment-athlete-list')
      );
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // LISTA DE ATLETAS
  // ════════════════════════════════════════════════════════════════════════

  const _buildAthleteList = (athletes, payments, attendances, practiceId, isFuture) => {
    if (athletes.length === 0) {
      return `
        <div class="empty-state">
          <img src="assets/icons/player-icon.svg" class="empty-icon" alt="">
          <h3>Sin atletas</h3>
          <p>Ve a <strong>Atletas</strong> para agregar jugadores</p>
        </div>
      `;
    }

    const payMap = {};
    const attMap = {};
    payments.forEach(p   => { payMap[p.athleteId]  = p.status;  });
    attendances.forEach(a => { attMap[a.athleteId] = a.asistio; });

    if (isFuture) {
      return `
        <div class="future-practice-msg">
          <div class="future-icon">🗓️</div>
          <h3>Práctica futura</h3>
          <p>Los registros se habilitan el día de la práctica.</p>
          <div class="future-athlete-preview">
            ${athletes.map(a => `
              <div class="future-athlete-chip">
                <div class="fac-avatar">${a.name.charAt(0).toUpperCase()}</div>
                <span>${a.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Ordenar: sin asistencia primero
    const sorted = [...athletes].sort((a, b) => {
      const aa = attMap[a.id]; const ab = attMap[b.id];
      if (aa === ab) return a.name.localeCompare(b.name);
      return aa ? 1 : -1;
    });

    return sorted.map(athlete => {
      const asistio    = attMap[athlete.id];
      const pagoStatus = payMap[athlete.id];
      const attChecked = asistio === true;
      const payChecked = pagoStatus === 'paid';
      // pagoValido = asistio && !ayudaSocial
      const payDisabled = !attChecked || athlete.ayudaSocial;

      return `
        <div class="att-athlete-row ${attChecked ? 'att-attended' : ''} ${payChecked ? 'att-paid' : ''}"
             data-athlete-id="${athlete.id}"
             data-practice-id="${practiceId}">

          <div class="att-athlete-identity">
            <div class="att-avatar ${athlete.ayudaSocial ? 'avatar-social' : ''}">
              ${athlete.name.charAt(0).toUpperCase()}
            </div>
            <div class="att-athlete-info">
              <span class="att-name">${athlete.name}</span>
              ${athlete.ayudaSocial
                ? '<span class="badge-social badge-social-sm">Ayuda Social</span>'
                : ''}
            </div>
          </div>

          <!-- Asistencia -->
          <div class="att-check-cell">
            <label class="att-check-label">
              <input type="checkbox"
                     class="att-checkbox att-cb-asistencia"
                     data-athlete-id="${athlete.id}"
                     data-practice-id="${practiceId}"
                     ${attChecked ? 'checked' : ''}
                     aria-label="Asistencia de ${athlete.name}">
              <span class="att-check-custom ${attChecked ? 'checked-green' : ''}"></span>
            </label>
          </div>

          <!-- Pago -->
          <div class="att-check-cell">
            ${athlete.ayudaSocial ? `
              <span class="att-no-pay-indicator" title="Ayuda Social: sin pago">—</span>
            ` : `
              <label class="att-check-label ${payDisabled ? 'att-check-disabled' : ''}"
                     title="${payDisabled ? 'Primero marca la asistencia' : 'Marcar pago'}"
                     data-disabled="${payDisabled ? 'true' : 'false'}">
                <input type="checkbox"
                       class="att-checkbox att-cb-pago"
                       data-athlete-id="${athlete.id}"
                       data-practice-id="${practiceId}"
                       ${payChecked ? 'checked' : ''}
                       ${payDisabled ? 'disabled' : ''}
                       aria-label="Pago de ${athlete.name}">
                <span class="att-check-custom ${payChecked ? 'checked-orange' : ''} ${payDisabled ? 'check-disabled' : ''}"></span>
              </label>
            `}
          </div>
        </div>
      `;
    }).join('');
  };

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════

  const _attachEvents = (container, practices, activePracticeId, isFuture) => {
    // Navegación de semanas
    container.querySelector('#btn-prev-week')?.addEventListener('click', () => {
      _state.referenceDate    = DS.shiftWeeks(_state.referenceDate, -1);
      _state.selectedPractice = null;
      _renderView(container);
    });
    container.querySelector('#btn-next-week')?.addEventListener('click', () => {
      _state.referenceDate    = DS.shiftWeeks(_state.referenceDate, 1);
      _state.selectedPractice = null;
      _renderView(container);
    });

    // Tabs de prácticas
    container.querySelectorAll('.practice-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const dateStr = tab.dataset.practiceDate;
        if (dateStr) {
          const [y, m, d]         = dateStr.split('-').map(Number);
          _state.selectedPractice = new Date(y, m - 1, d);
          _renderView(container);
        }
      });
    });

    if (isFuture) return;

    // ── Checkbox ASISTENCIA — reactivo en tiempo real ─────────────────
    container.querySelectorAll('.att-cb-asistencia').forEach(cb => {
      cb.addEventListener('change', async () => {
        const athleteId  = cb.dataset.athleteId;
        const practiceId = cb.dataset.practiceId;
        const asistio    = cb.checked;

        // Actualizar visual del propio checkbox
        const customBox = cb.nextElementSibling;
        customBox?.classList.toggle('checked-green', asistio);

        // Encontrar la fila completa
        const row = container.querySelector(
          `.att-athlete-row[data-athlete-id="${athleteId}"]`
        );
        if (row) {
          row.classList.toggle('att-attended', asistio);

          // Encontrar checkbox de pago dentro de esta fila
          const payCb     = row.querySelector('.att-cb-pago');
          const payLabel  = payCb?.closest('.att-check-label');
          const payCustom = payCb?.nextElementSibling;

          if (payCb) {
            // Habilitar / deshabilitar inmediatamente
            payCb.disabled = !asistio;
            payLabel?.classList.toggle('att-check-disabled', !asistio);
            if (payLabel) payLabel.dataset.disabled = !asistio ? 'true' : 'false';
            payCustom?.classList.toggle('check-disabled', !asistio);

            // Si se desmarca asistencia y estaba pagado → limpiar pago
            if (!asistio && payCb.checked) {
              payCb.checked = false;
              payCustom?.classList.remove('checked-orange');
              row.classList.remove('att-paid');
              await _savePayment(athleteId, practiceId, 'unpaid');
            }
          }
        }

        // Guardar asistencia en BD
        await _saveAttendance(athleteId, practiceId, asistio);
        await _refreshHeaderStats(container, activePracticeId);
      });
    });

    // ── Checkbox PAGO ─────────────────────────────────────────────────
    container.querySelectorAll('.att-cb-pago').forEach(cb => {
      cb.addEventListener('change', async () => {
        if (cb.disabled) {
          cb.checked = false;
          window.CoachApp.App.showToast('⚠️ Primero marca la asistencia', 'error');
          return;
        }

        const athleteId  = cb.dataset.athleteId;
        const practiceId = cb.dataset.practiceId;
        const paid       = cb.checked;

        const row       = container.querySelector(
          `.att-athlete-row[data-athlete-id="${athleteId}"]`
        );
        const payCustom = cb.nextElementSibling;
        payCustom?.classList.toggle('checked-orange', paid);
        row?.classList.toggle('att-paid', paid);

        row?.classList.add('item-toggle-anim');
        setTimeout(() => row?.classList.remove('item-toggle-anim'), 350);

        await _savePayment(athleteId, practiceId, paid ? 'paid' : 'unpaid');
        await _refreshHeaderStats(container, activePracticeId);
      });
    });

    // Bloquear click en labels de pago cuando estén deshabilitados.
    // CRÍTICO: adjuntar a TODOS los labels (no solo [data-disabled="true"]),
    // y verificar data-disabled dinámicamente en cada click. Esto garantiza
    // que al marcar asistencia y cambiar dataset.disabled a "false" en runtime,
    // el checkbox de pago se desbloquea inmediatamente sin recargar.
    container.querySelectorAll('.att-check-cell .att-check-label').forEach(label => {
      label.addEventListener('click', (e) => {
        if (label.dataset.disabled === 'true') {
          e.preventDefault();
          window.CoachApp.App.showToast('⚠️ Primero marca la asistencia', 'error');
        }
      });
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // ACTUALIZAR ESTADÍSTICAS SIN RE-RENDERIZAR
  // ════════════════════════════════════════════════════════════════════════

  const _refreshHeaderStats = async (container, practiceId) => {
    const [payments, attendances] = await Promise.all([
      Storage().getPaymentsByPractice(practiceId),
      Storage().getAttendanceByPractice(practiceId)
    ]);

    const paid     = payments.filter(p => p.status === 'paid').length;
    const attended = attendances.filter(a => a.asistio).length;

    const elAtt    = container.querySelector('#stat-att');
    const elPaid   = container.querySelector('#stat-paid');
    const elAmount = container.querySelector('#stat-amount');

    if (elAtt)    elAtt.textContent    = String(attended);
    if (elPaid)   elPaid.textContent   = String(paid);
    if (elAmount) elAmount.textContent = `${_state.currency}${(paid * _state.price).toFixed(0)}`;

    // Actualizar tab activo con dual count
    const activeTab = container.querySelector('.practice-tab.active .tab-dual-count');
    if (activeTab) {
      const spans = activeTab.querySelectorAll('span');
      if (spans[0]) {
        spans[0].textContent = `📋${attended}`;
        spans[0].className   = attended > 0 ? 'count-green' : 'count-red';
      }
      if (spans[1]) {
        spans[1].textContent = `💲${paid}`;
        spans[1].className   = paid > 0 ? 'count-green' : 'count-red';
      }
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // PERSISTENCIA
  // ════════════════════════════════════════════════════════════════════════

  const _saveAttendance = async (athleteId, practiceId, asistio) => {
    try {
      const existing = await Storage().getAttendance(athleteId, practiceId);
      await Storage().put('attendance', {
        id:        existing?.id || Storage().generateId(),
        athleteId, practiceId, asistio,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[Payments] Error al guardar asistencia:', err);
      window.CoachApp.App.showToast('❌ Error al guardar asistencia', 'error');
    }
  };

  const _savePayment = async (athleteId, practiceId, status) => {
    try {
      const existing = await Storage().getPayment(athleteId, practiceId);
      await Storage().put('payments', {
        id:        existing?.id || Storage().generateId(),
        athleteId, practiceId, status,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[Payments] Error al guardar pago:', err);
      window.CoachApp.App.showToast('❌ Error al guardar pago', 'error');
    }
  };

  const resetState = () => {
    _state.referenceDate    = new Date();
    _state.selectedPractice = null;
  };

  /**
   * refresh() — re-renderiza la vista de pagos actual sin reiniciar el estado
   * de semana/práctica. Llamado desde athlete-calendar.js después de guardar
   * cambios para mantener ambas vistas sincronizadas en tiempo real.
   */
  const refresh = () => {
    const container = document.getElementById('app-content');
    if (!container) return;
    // Solo actuar si la vista de pagos está montada
    if (!container.querySelector('.payments-header')) return;
    _renderView(container);
  };

  return { render, resetState, refresh };

})();
