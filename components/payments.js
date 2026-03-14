/**
 * components/payments.js — Registro de Pagos por Práctica
 * Coach Management App
 *
 * Muestra las prácticas de la semana con la lista de atletas por práctica.
 * Permite marcar/desmarcar pagos con un solo toque.
 * Incluye navegación entre semanas.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Payments = (() => {

  const Storage = () => window.CoachApp.Storage;
  const DS      = window.CoachApp.DateSystem;

  // Estado interno de la vista
  let _state = {
    referenceDate:   new Date(),   // Fecha de referencia para la semana mostrada
    selectedPractice: null,        // Fecha de práctica seleccionada
    athletes:        [],
    practiceDays:    [1, 3, 5],
    currency:        '$',
    price:           0
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDERIZADO PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════

  const render = async (container) => {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
      // Cargar configuración y atletas
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

      // Seleccionar práctica automáticamente: hoy si es día de práctica, si no la más cercana
      if (!_state.selectedPractice) {
        const todayId = DS.getTodayPracticeId(practiceDays);
        _state.selectedPractice = todayId
          ? new Date()
          : DS.getNextPracticeDate(practiceDays);
      }

      await _renderView(container);
    } catch (error) {
      console.error('[Payments] Error al renderizar:', error);
      container.innerHTML = '<div class="error-state"><p>Error al cargar pagos.</p></div>';
    }
  };

  const _renderView = async (container) => {
    const practices = DS.getPracticeDatesInWeek(_state.referenceDate, _state.practiceDays);
    const weekLabel = DS.formatWeekRange(_state.referenceDate);
    const [year, weekNum] = DS.getISOWeek(_state.referenceDate);
    const isCurrentWeek = DS.getWeekKey(new Date()) === DS.getWeekKey(_state.referenceDate);

    // Cargar pagos de toda la semana de una sola vez
    const allPayments = [];
    for (const pd of practices) {
      if (!DS.isFuture(pd)) {
        const pid  = DS.getPracticeId(pd);
        const pays = await Storage().getPaymentsByPractice(pid);
        allPayments.push(...pays);
      }
    }

    // Determinar práctica activa (selected)
    let activePractice = _state.selectedPractice;
    if (!activePractice) activePractice = practices[0];

    // Asegurarse que la práctica seleccionada está en la semana actual
    const activeId = DS.getPracticeId(activePractice);
    const activePracticeInWeek = practices.find(p => DS.getPracticeId(p) === activeId);
    if (!activePracticeInWeek) {
      activePractice = practices[0];
      _state.selectedPractice = activePractice;
    }

    const activePracticeDate = activePracticeInWeek || practices[0];
    const activePracticeId   = DS.getPracticeId(activePracticeDate);
    const practicePayments   = allPayments.filter(p => p.practiceId === activePracticeId);

    // Estadísticas de la práctica activa
    const paidCount   = practicePayments.filter(p => p.status === 'paid').length;
    const unpaidCount = _state.athletes.length - paidCount;
    const isFuture    = DS.isFuture(activePracticeDate);
    const isToday     = DS.isToday(activePracticeDate);

    container.innerHTML = `
      <!-- Encabezado de semana con navegación -->
      <div class="payments-header">
        <button class="week-nav-btn" id="btn-prev-week" title="Semana anterior">
          ‹
        </button>
        <div class="week-info">
          <div class="week-label">${weekLabel}</div>
          <div class="week-num">Semana ${weekNum} ${isCurrentWeek ? '<span class="badge-current">Esta semana</span>' : ''}</div>
        </div>
        <button class="week-nav-btn" id="btn-next-week" title="Siguiente semana">
          ›
        </button>
      </div>

      <!-- Tabs de prácticas de la semana -->
      <div class="practice-tabs">
        ${practices.map(pd => {
          const pid     = DS.getPracticeId(pd);
          const isoDay  = DS.jsToIsoDay(pd.getDay());
          const dayName = DS.DAY_NAMES_SHORT[isoDay];
          const dateStr = DS.formatDateShort(pd);
          const isFut   = DS.isFuture(pd);
          const isTod   = DS.isToday(pd);
          const isActive = pid === activePracticeId;
          const tabPays  = allPayments.filter(p => p.practiceId === pid && p.status === 'paid').length;

          return `
            <button
              class="practice-tab ${isActive ? 'active' : ''} ${isFut ? 'future' : ''} ${isTod ? 'today' : ''}"
              data-practice-date="${DS.toISODate(pd)}"
            >
              <span class="tab-day">${dayName}</span>
              <span class="tab-date">${dateStr}</span>
              ${!isFut ? `<span class="tab-count ${tabPays > 0 ? 'count-green' : 'count-red'}">${tabPays}/${_state.athletes.length}</span>` : '<span class="tab-future-tag">—</span>'}
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
          ${isToday ? '<div class="pdh-badge pdh-badge-today">🏀 HOY</div>' : ''}
          ${isFuture ? '<div class="pdh-badge pdh-badge-future">📅 Práctica futura</div>' : ''}
        </div>
        ${!isFuture ? `
          <div class="pdh-stats">
            <div class="pdh-stat pdh-stat-paid">
              <span class="pdh-stat-num">${paidCount}</span>
              <span class="pdh-stat-lbl">Pagaron</span>
            </div>
            <div class="pdh-stat pdh-stat-unpaid">
              <span class="pdh-stat-num">${unpaidCount}</span>
              <span class="pdh-stat-lbl">Pendientes</span>
            </div>
            <div class="pdh-stat pdh-stat-amount">
              <span class="pdh-stat-num">${_state.currency}${(paidCount * _state.price).toFixed(0)}</span>
              <span class="pdh-stat-lbl">Recaudado</span>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Controles de la lista -->
      ${!isFuture && _state.athletes.length > 0 ? `
        <div class="list-controls">
          <button class="list-control-btn" id="btn-mark-all-paid">✅ Marcar todos pagados</button>
          <button class="list-control-btn btn-outline" id="btn-mark-all-unpaid">❌ Limpiar pagos</button>
        </div>
      ` : ''}

      <!-- Lista de atletas con estado de pago -->
      <div class="payment-athlete-list" id="payment-athlete-list">
        ${_buildAthleteList(_state.athletes, practicePayments, activePracticeId, isFuture)}
      </div>
    `;

    _attachEvents(container, practices, activePracticeId, isFuture);
  };

  // ════════════════════════════════════════════════════════════════════════
  // LISTA DE ATLETAS
  // ════════════════════════════════════════════════════════════════════════

  const _buildAthleteList = (athletes, payments, practiceId, isFuture) => {
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
    payments.forEach(p => { payMap[p.athleteId] = p.status; });

    if (isFuture) {
      return `
        <div class="future-practice-msg">
          <div class="future-icon">🗓️</div>
          <h3>Práctica futura</h3>
          <p>Los pagos se podrán registrar el día de la práctica.</p>
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

    // Ordenar: primero no pagados, luego pagados
    const sorted = [...athletes].sort((a, b) => {
      const sa = payMap[a.id] || 'unpaid';
      const sb = payMap[b.id] || 'unpaid';
      if (sa === sb) return a.name.localeCompare(b.name);
      return sa === 'unpaid' ? -1 : 1;
    });

    return sorted.map(athlete => {
      const status = payMap[athlete.id] || 'unpaid';
      return `
        <div
          class="payment-athlete-item ${status}"
          data-athlete-id="${athlete.id}"
          data-practice-id="${practiceId}"
          role="button"
          tabindex="0"
          aria-label="${athlete.name} - ${status === 'paid' ? 'Pagado' : 'No Pagado'}"
        >
          <div class="pai-avatar">${athlete.name.charAt(0).toUpperCase()}</div>
          <div class="pai-info">
            <div class="pai-name">${athlete.name}</div>
            ${athlete.age ? `<div class="pai-meta">${athlete.age} años</div>` : ''}
          </div>
          <div class="pai-status-wrap">
            <div class="pai-status-pill ${status}">
              ${status === 'paid'
                ? `<img src="assets/icons/paid-icon.svg" class="status-svg" alt=""> Pagado`
                : `<img src="assets/icons/unpaid-icon.svg" class="status-svg" alt=""> Sin Pagar`
              }
            </div>
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
          const [y, m, d] = dateStr.split('-').map(Number);
          _state.selectedPractice = new Date(y, m - 1, d);
          _renderView(container);
        }
      });
    });

    if (isFuture) return;

    // Toggle de pago por atleta
    container.querySelectorAll('.payment-athlete-item').forEach(item => {
      const toggle = async () => {
        const athleteId  = item.dataset.athleteId;
        const practiceId = item.dataset.practiceId;
        await _togglePayment(item, athleteId, practiceId, container, practices);
      };
      item.addEventListener('click', toggle);
      item.addEventListener('keypress', (e) => { if (e.key === 'Enter' || e.key === ' ') toggle(); });
    });

    // Marcar todos pagados
    container.querySelector('#btn-mark-all-paid')?.addEventListener('click', async () => {
      await _markAll('paid', activePracticeId, container, practices);
    });

    // Limpiar pagos
    container.querySelector('#btn-mark-all-unpaid')?.addEventListener('click', async () => {
      await _markAll('unpaid', activePracticeId, container, practices);
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // LÓGICA DE PAGOS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Toggle de pago con feedback visual inmediato.
   */
  const _togglePayment = async (item, athleteId, practiceId, container, practices) => {
    const currentStatus = item.classList.contains('paid') ? 'paid' : 'unpaid';
    const newStatus     = currentStatus === 'paid' ? 'unpaid' : 'paid';

    // 1. Feedback visual INMEDIATO (sin esperar BD)
    _updateAthleteItemUI(item, newStatus);

    // 2. Guardar en BD
    try {
      const existing = await Storage().getPayment(athleteId, practiceId);
      await Storage().put('payments', {
        id:        existing?.id || Storage().generateId(),
        athleteId,
        practiceId,
        status:    newStatus,
        timestamp: Date.now()
      });

      // 3. Actualizar stats del encabezado sin re-renderizar todo
      await _refreshHeaderStats(container, practiceId);

    } catch (err) {
      console.error('[Payments] Error al guardar pago:', err);
      // Revertir cambio visual si falla
      _updateAthleteItemUI(item, currentStatus);
      window.CoachApp.App.showToast('❌ Error al guardar pago', 'error');
    }
  };

  /** Actualizar la UI de un item de atleta sin re-renderizar */
  const _updateAthleteItemUI = (item, newStatus) => {
    item.classList.remove('paid', 'unpaid');
    item.classList.add(newStatus);

    const pill = item.querySelector('.pai-status-pill');
    if (pill) {
      pill.className = `pai-status-pill ${newStatus}`;
      pill.innerHTML = newStatus === 'paid'
        ? `<img src="assets/icons/paid-icon.svg" class="status-svg" alt=""> Pagado`
        : `<img src="assets/icons/unpaid-icon.svg" class="status-svg" alt=""> Sin Pagar`;
    }

    // Animación de confirmación
    item.classList.add('item-toggle-anim');
    setTimeout(() => item.classList.remove('item-toggle-anim'), 350);
  };

  /** Refrescar solo las estadísticas del encabezado de práctica */
  const _refreshHeaderStats = async (container, practiceId) => {
    const payments = await Storage().getPaymentsByPractice(practiceId);
    const paid     = payments.filter(p => p.status === 'paid').length;
    const unpaid   = _state.athletes.length - paid;

    const statPaid   = container.querySelector('.pdh-stat-paid .pdh-stat-num');
    const statUnpaid = container.querySelector('.pdh-stat-unpaid .pdh-stat-num');
    const statAmount = container.querySelector('.pdh-stat-amount .pdh-stat-num');

    if (statPaid)   statPaid.textContent   = String(paid);
    if (statUnpaid) statUnpaid.textContent = String(unpaid);
    if (statAmount) statAmount.textContent = `${_state.currency}${(paid * _state.price).toFixed(0)}`;

    // También actualizar el tab activo
    const activeTab = container.querySelector(`.practice-tab.active .tab-count`);
    if (activeTab) {
      activeTab.textContent = `${paid}/${_state.athletes.length}`;
      activeTab.className   = `tab-count ${paid > 0 ? 'count-green' : 'count-red'}`;
    }
  };

  /** Marcar todos los atletas con el mismo estado */
  const _markAll = async (status, practiceId, container, practices) => {
    const items = container.querySelectorAll('.payment-athlete-item');

    // Actualizar UI inmediatamente
    items.forEach(item => _updateAthleteItemUI(item, status));

    // Guardar en BD
    try {
      for (const athlete of _state.athletes) {
        const existing = await Storage().getPayment(athlete.id, practiceId);
        await Storage().put('payments', {
          id:        existing?.id || Storage().generateId(),
          athleteId: athlete.id,
          practiceId,
          status,
          timestamp: Date.now()
        });
      }

      await _refreshHeaderStats(container, practiceId);
      const label = status === 'paid' ? '✅ Todos marcados como pagados' : '🔄 Pagos reiniciados';
      window.CoachApp.App.showToast(label);
    } catch (err) {
      console.error('[Payments] Error al marcar todos:', err);
      window.CoachApp.App.showToast('❌ Error al guardar', 'error');
    }
  };

  /** Resetear el estado de la vista (para cuando se cambia de pestaña) */
  const resetState = () => {
    _state.referenceDate    = new Date();
    _state.selectedPractice = null;
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return { render, resetState };

})();
