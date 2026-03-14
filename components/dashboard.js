/**
 * components/dashboard.js — Vista del Dashboard Principal
 * Coach Management App
 *
 * Muestra el resumen del día: estadísticas de la práctica actual,
 * lista rápida de pagos del día y próxima práctica si no es hoy.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Dashboard = (() => {

  const Storage    = () => window.CoachApp.Storage;
  const DS         = window.CoachApp.DateSystem;
  const navigateTo = (view) => window.CoachApp.App.navigateTo(view);

  // ════════════════════════════════════════════════════════════════════════
  // RENDERIZADO PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Renderizar la vista del dashboard.
   * @param {HTMLElement} container - Elemento donde inyectar el HTML
   */
  const render = async (container) => {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
      // Cargar datos
      const [athletes, settings] = await Promise.all([
        Storage().getAll('athletes'),
        _loadSettings()
      ]);

      const practiceDays   = settings.practiceDays;
      const todayPracticeId = DS.getTodayPracticeId(practiceDays);
      const isToday         = !!todayPracticeId;
      const nextPractice    = DS.getNextPracticeDate(practiceDays);
      const weekKey         = DS.getWeekKey(new Date());

      // Cargar pagos de hoy si es día de práctica
      let todayPayments = [];
      if (isToday) {
        todayPayments = await Storage().getPaymentsByPractice(todayPracticeId);
      }

      // Calcular estadísticas del día
      const paidCount   = todayPayments.filter(p => p.status === 'paid').length;
      const unpaidCount = athletes.length - paidCount;

      // Estadísticas de la semana
      const weekPractices = DS.getPracticeDatesInWeek(new Date(), practiceDays);
      const weekStats     = await _getWeekStats(weekPractices, athletes.length);

      // Renderizar
      container.innerHTML = _buildHTML({
        athletes, settings, isToday,
        todayPracticeId, todayPayments,
        paidCount, unpaidCount,
        nextPractice, weekPractices, weekStats,
        teamName: settings.teamName || 'Mi Equipo'
      });

      // Attaching events
      _attachEvents(container, todayPracticeId, isToday);

    } catch (error) {
      console.error('[Dashboard] Error al renderizar:', error);
      container.innerHTML = `
        <div class="error-state">
          <p>Error al cargar el dashboard.</p>
          <button class="btn-primary" onclick="location.reload()">Reintentar</button>
        </div>
      `;
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // CONSTRUCCIÓN DEL HTML
  // ════════════════════════════════════════════════════════════════════════

  const _buildHTML = (data) => {
    const {
      athletes, settings, isToday,
      todayPracticeId, todayPayments,
      paidCount, unpaidCount,
      nextPractice, weekPractices, weekStats,
      teamName
    } = data;

    const today    = new Date();
    const currency = settings.currency || '$';
    const price    = settings.pricePerPractice || 0;
    const todayStr = DS.formatDateLong(today);

    return `
      <!-- Encabezado de fecha -->
      <div class="dash-date-header">
        <div>
          <p class="dash-date-sub">Hoy es</p>
          <h2 class="dash-date-main">${todayStr}</h2>
        </div>
        <div class="dash-week-badge">
          Semana ${DS.getISOWeek(today)[1]}
        </div>
      </div>

      <!-- Banner: práctica de hoy o próxima -->
      ${isToday ? _buildTodayBanner(paidCount, unpaidCount, athletes.length, currency, price) : _buildNextBanner(nextPractice)}

      <!-- Tarjetas de estadísticas -->
      <div class="dash-stats-grid">
        <div class="dash-stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-value">${athletes.length}</div>
          <div class="stat-label">Jugadores</div>
        </div>
        <div class="dash-stat-card ${isToday && paidCount > 0 ? 'stat-green' : ''}">
          <div class="stat-icon">✅</div>
          <div class="stat-value">${isToday ? paidCount : weekStats.totalPaid}</div>
          <div class="stat-label">${isToday ? 'Pagaron Hoy' : 'Pagados esta Semana'}</div>
        </div>
        <div class="dash-stat-card ${isToday && unpaidCount > 0 ? 'stat-red' : ''}">
          <div class="stat-icon">❌</div>
          <div class="stat-value">${isToday ? unpaidCount : weekStats.totalUnpaid}</div>
          <div class="stat-label">${isToday ? 'Sin Pagar Hoy' : 'Pendientes Semana'}</div>
        </div>
        <div class="dash-stat-card stat-orange">
          <div class="stat-icon">💰</div>
          <div class="stat-value">${currency}${isToday ? (paidCount * price).toFixed(0) : (weekStats.totalPaid * price).toFixed(0)}</div>
          <div class="stat-label">${isToday ? 'Recaudado Hoy' : 'Recaudado Semana'}</div>
        </div>
      </div>

      <!-- Lista de atletas de hoy si es práctica -->
      ${isToday && athletes.length > 0 ? _buildTodayAthleteList(athletes, todayPayments, todayPracticeId) : ''}

      <!-- Prácticas de la semana -->
      <div class="dash-section">
        <div class="dash-section-header">
          <h3 class="dash-section-title">Esta Semana</h3>
          <button class="dash-link-btn" id="btn-go-payments">Ver todo →</button>
        </div>
        <div class="dash-week-practices">
          ${_buildWeekPractices(weekPractices, weekStats.practiceStats, athletes.length)}
        </div>
      </div>

      <!-- Acciones rápidas -->
      <div class="dash-section">
        <h3 class="dash-section-title">Acciones Rápidas</h3>
        <div class="dash-quick-actions">
          <button class="quick-action-btn" id="qa-add-athlete">
            <span class="qa-icon">➕</span>
            <span>Agregar Atleta</span>
          </button>
          <button class="quick-action-btn" id="qa-payments">
            <span class="qa-icon">💳</span>
            <span>Registrar Pagos</span>
          </button>
          <button class="quick-action-btn" id="qa-report">
            <span class="qa-icon">📊</span>
            <span>Generar Reporte</span>
          </button>
        </div>
      </div>
    `;
  };

  const _buildTodayBanner = (paid, unpaid, total, currency, price) => `
    <div class="dash-today-banner banner-active">
      <div class="banner-left">
        <div class="banner-badge">🏀 PRÁCTICA HOY</div>
        <div class="banner-progress-wrap">
          <div class="banner-progress-bar">
            <div class="banner-progress-fill" style="width: ${total > 0 ? (paid/total*100).toFixed(0) : 0}%"></div>
          </div>
          <span class="banner-progress-text">${paid} de ${total} pagaron</span>
        </div>
      </div>
      <div class="banner-amount">
        <div class="amount-val">${currency}${(paid * price).toFixed(2)}</div>
        <div class="amount-label">recaudado</div>
      </div>
    </div>
  `;

  const _buildNextBanner = (nextDate) => {
    if (!nextDate) return '';
    const isNext   = !DS.isToday(nextDate);
    const label    = DS.formatDateLong(nextDate);
    const isoDay   = DS.jsToIsoDay(nextDate.getDay());
    const dayName  = DS.DAY_NAMES_FULL[isoDay];
    return `
      <div class="dash-today-banner banner-upcoming">
        <div class="banner-left">
          <div class="banner-badge">📅 PRÓXIMA PRÁCTICA</div>
          <div class="banner-next-date">${dayName}</div>
          <div class="banner-next-sub">${label}</div>
        </div>
        <div class="banner-calendar-icon">🗓️</div>
      </div>
    `;
  };

  const _buildTodayAthleteList = (athletes, payments, practiceId) => {
    const payMap = {};
    payments.forEach(p => { payMap[p.athleteId] = p.status; });

    const sorted = [...athletes].sort((a, b) => {
      const sa = payMap[a.id] || 'unpaid';
      const sb = payMap[b.id] || 'unpaid';
      if (sa === sb) return a.name.localeCompare(b.name);
      return sa === 'paid' ? -1 : 1;
    });

    return `
      <div class="dash-section">
        <div class="dash-section-header">
          <h3 class="dash-section-title">Pagos de Hoy</h3>
          <button class="dash-link-btn" id="btn-go-payments-today">Gestionar →</button>
        </div>
        <div class="athlete-quick-list">
          ${sorted.map(athlete => {
            const status = payMap[athlete.id] || 'unpaid';
            return `
              <div class="athlete-quick-item ${status}" data-athlete-id="${athlete.id}" data-practice-id="${practiceId}">
                <div class="aqi-avatar">${athlete.name.charAt(0).toUpperCase()}</div>
                <div class="aqi-name">${athlete.name}</div>
                <div class="aqi-status">
                  ${status === 'paid'
                    ? `<img src="assets/icons/paid-icon.svg" class="status-icon" alt="Pagado">`
                    : `<img src="assets/icons/unpaid-icon.svg" class="status-icon" alt="No Pagado">`
                  }
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  const _buildWeekPractices = (practices, practiceStats, totalAthletes) => {
    return practices.map((pd, i) => {
      const isoDay  = DS.jsToIsoDay(pd.getDay());
      const dayName = DS.DAY_NAMES_FULL[isoDay];
      const dateStr = DS.formatDateShort(pd);
      const stats   = practiceStats[i] || { paid: 0, unpaid: 0 };
      const isFut   = DS.isFuture(pd);
      const isTod   = DS.isToday(pd);

      let statusClass = 'practice-past';
      if (isTod) statusClass = 'practice-today';
      if (isFut) statusClass = 'practice-future';

      return `
        <div class="week-practice-card ${statusClass}">
          <div class="wpc-day">${dayName}</div>
          <div class="wpc-date">${dateStr}</div>
          ${isFut ? `
            <div class="wpc-future">Pendiente</div>
          ` : `
            <div class="wpc-stats">
              <span class="wpc-paid">✓${stats.paid}</span>
              <span class="wpc-unpaid">✗${stats.unpaid}</span>
            </div>
          `}
          ${isTod ? '<div class="wpc-badge-today">HOY</div>' : ''}
        </div>
      `;
    }).join('');
  };

  // ════════════════════════════════════════════════════════════════════════
  // DATOS Y EVENTOS
  // ════════════════════════════════════════════════════════════════════════

  const _getWeekStats = async (weekPractices, totalAthletes) => {
    let totalPaid = 0, totalUnpaid = 0;
    const practiceStats = [];

    for (const pd of weekPractices) {
      if (DS.isFuture(pd)) {
        practiceStats.push({ paid: 0, unpaid: 0 });
        continue;
      }
      const pid      = DS.getPracticeId(pd);
      const payments = await Storage().getPaymentsByPractice(pid);
      const paid     = payments.filter(p => p.status === 'paid').length;
      const unpaid   = totalAthletes - paid;
      totalPaid    += paid;
      totalUnpaid  += unpaid;
      practiceStats.push({ paid, unpaid });
    }

    return { totalPaid, totalUnpaid, practiceStats };
  };

  const _loadSettings = async () => {
    const [teamName, pricePerPractice, practiceDays, currency] = await Promise.all([
      Storage().getSetting('teamName',         'Mi Equipo'),
      Storage().getSetting('pricePerPractice', 0),
      Storage().getSetting('practiceDays',     [1, 3, 5]),
      Storage().getSetting('currency',         '$')
    ]);
    return { teamName, pricePerPractice, practiceDays, currency };
  };

  const _attachEvents = (container, todayPracticeId, isToday) => {
    // Navegar a pagos
    container.querySelector('#btn-go-payments')?.addEventListener('click', () => navigateTo('payments'));
    container.querySelector('#btn-go-payments-today')?.addEventListener('click', () => navigateTo('payments'));

    // Acciones rápidas
    container.querySelector('#qa-add-athlete')?.addEventListener('click', () => {
      navigateTo('athletes');
      setTimeout(() => document.getElementById('btn-add-athlete')?.click(), 300);
    });
    container.querySelector('#qa-payments')?.addEventListener('click', () => navigateTo('payments'));
    container.querySelector('#qa-report')?.addEventListener('click', () => navigateTo('reports'));

    // Toggle rápido de pago desde el dashboard
    if (isToday) {
      container.querySelectorAll('.athlete-quick-item').forEach(item => {
        item.addEventListener('click', async () => {
          const athleteId  = item.dataset.athleteId;
          const practiceId = item.dataset.practiceId;
          await _togglePaymentQuick(item, athleteId, practiceId);
        });
      });
    }
  };

  /** Toggle rápido de pago sin re-renderizar toda la vista */
  const _togglePaymentQuick = async (item, athleteId, practiceId) => {
    const currentStatus = item.classList.contains('paid') ? 'paid' : 'unpaid';
    const newStatus     = currentStatus === 'paid' ? 'unpaid' : 'paid';

    // Actualizar UI inmediatamente
    item.classList.remove('paid', 'unpaid');
    item.classList.add(newStatus);
    const iconImg = item.querySelector('.status-icon');
    if (iconImg) {
      iconImg.src = newStatus === 'paid'
        ? 'assets/icons/paid-icon.svg'
        : 'assets/icons/unpaid-icon.svg';
      iconImg.alt = newStatus === 'paid' ? 'Pagado' : 'No Pagado';
    }
    item.classList.add('aqi-pulse');
    setTimeout(() => item.classList.remove('aqi-pulse'), 400);

    // Guardar en BD
    try {
      const existing = await Storage().getPayment(athleteId, practiceId);
      const payment  = {
        id:         existing ? existing.id : Storage().generateId(),
        athleteId,
        practiceId,
        status:     newStatus,
        timestamp:  Date.now()
      };
      await Storage().put('payments', payment);
    } catch (err) {
      console.error('[Dashboard] Error al guardar pago:', err);
    }
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return { render };

})();
