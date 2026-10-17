/**
 * components/dashboard.js — Vista del Dashboard Principal
 * Coach Management App v1.0.1
 *
 * Correcciones v1.0.1:
 *  - Lista de atletas usa checkboxes asistencia + pago (idéntico a payments.js)
 *  - Pago bloqueado si asistencia = false (regla estricta)
 *  - Ayuda Social: nunca permite pago, siempre permite asistencia
 *  - Tarjetas de semana muestran [📋 asistencia/total] [💲 pagos/asistencia]
 *  - Stats del día basadas en asistencia, no solo en pagos
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Dashboard = (() => {

  const Storage    = () => window.CoachApp.Storage;
  const DS         = window.CoachApp.DateSystem;
  const navigateTo = (view) => window.CoachApp.App.navigateTo(view);

  // ════════════════════════════════════════════════════════════════════════
  // RENDERIZADO PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════

  const render = async (container) => {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
      const [athletes, settings] = await Promise.all([
        Storage().getAll('athletes'),
        _loadSettings()
      ]);

      const practiceDays    = settings.practiceDays;
      const todayPracticeId = DS.getTodayPracticeId(practiceDays);
      const isToday         = !!todayPracticeId;
      const nextPractice    = DS.getNextPracticeDate(practiceDays);

      // Cargar pagos Y asistencias del día si es práctica
      let todayPayments    = [];
      let todayAttendances = [];
      if (isToday) {
        [todayPayments, todayAttendances] = await Promise.all([
          Storage().getPaymentsByPractice(todayPracticeId),
          Storage().getAttendanceByPractice(todayPracticeId)
        ]);
      }

      // Atletas facturables (sin ayuda social) para cálculos de pago
      const billable    = athletes.filter(a => !a.ayudaSocial);
      const paidCount   = todayPayments.filter(p => p.status === 'paid').length;
      const attCount    = todayAttendances.filter(a => a.asistio).length;

      const weekPractices = DS.getPracticeDatesInWeek(new Date(), practiceDays);
      const weekStats     = await _getWeekStats(weekPractices, athletes);

      container.innerHTML = _buildHTML({
        athletes, settings, isToday,
        todayPracticeId, todayPayments, todayAttendances,
        paidCount, attCount,
        nextPractice, weekPractices, weekStats,
        teamName: settings.teamName || 'Mi Equipo'
      });

      _attachEvents(container, todayPracticeId, isToday, athletes);

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
  // HTML PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════

  const _buildHTML = (data) => {
    const {
      athletes, settings, isToday,
      todayPracticeId, todayPayments, todayAttendances,
      paidCount, attCount,
      nextPractice, weekPractices, weekStats,
      teamName
    } = data;

    const today    = new Date();
    const currency = settings.currency || '$';
    const price    = settings.pricePerPractice || 0;

    return `
      <div class="dash-date-header">
        <div>
          <p class="dash-date-sub">Hoy es</p>
          <h2 class="dash-date-main">${DS.formatDateLong(today)}</h2>
        </div>
        <div class="dash-week-badge">Semana ${DS.getISOWeek(today)[1]}</div>
      </div>

      ${isToday
        ? _buildTodayBanner(paidCount, attCount, athletes.length, currency, price)
        : _buildNextBanner(nextPractice)}

      <div class="dash-stats-grid">
        <div class="dash-stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-value">${athletes.length}</div>
          <div class="stat-label">Jugadores</div>
        </div>
        <div class="dash-stat-card ${isToday && attCount > 0 ? 'stat-green' : ''}">
          <div class="stat-icon">📋</div>
          <div class="stat-value">${isToday ? attCount : weekStats.totalAtt}</div>
          <div class="stat-label">${isToday ? 'Asistieron Hoy' : 'Asistencias Semana'}</div>
        </div>
        <div class="dash-stat-card ${isToday && paidCount > 0 ? 'stat-green' : ''}">
          <div class="stat-icon">✅</div>
          <div class="stat-value">${isToday ? paidCount : weekStats.totalPaid}</div>
          <div class="stat-label">${isToday ? 'Pagaron Hoy' : 'Pagados Semana'}</div>
        </div>
        <div class="dash-stat-card stat-orange">
          <div class="stat-icon">💰</div>
          <div class="stat-value">${currency}${isToday
            ? (paidCount * price).toFixed(0)
            : (weekStats.totalPaid * price).toFixed(0)}</div>
          <div class="stat-label">${isToday ? 'Recaudado Hoy' : 'Recaudado Semana'}</div>
        </div>
      </div>

      ${isToday && athletes.length > 0
        ? _buildTodayAthleteList(athletes, todayPayments, todayAttendances, todayPracticeId)
        : ''}

      <div class="dash-section">
        <div class="dash-section-header">
          <h3 class="dash-section-title">Esta Semana</h3>
          <button class="dash-link-btn" id="btn-go-payments">Ver todo →</button>
        </div>
        <div class="dash-week-practices">
          ${_buildWeekPractices(weekPractices, weekStats.practiceStats, athletes.length)}
        </div>
      </div>

      <div class="dash-section">
        <h3 class="dash-section-title">Acciones Rápidas</h3>
        <div class="dash-quick-actions">
          <button class="quick-action-btn" id="qa-add-athlete">
            <span class="qa-icon">➕</span><span>Agregar Atleta</span>
          </button>
          <button class="quick-action-btn" id="qa-payments">
            <span class="qa-icon">💳</span><span>Registrar Pagos</span>
          </button>
          <button class="quick-action-btn" id="qa-report">
            <span class="qa-icon">📊</span><span>Generar Reporte</span>
          </button>
        </div>
      </div>
    `;
  };

  // ════════════════════════════════════════════════════════════════════════
  // BANNERS
  // ════════════════════════════════════════════════════════════════════════

  const _buildTodayBanner = (paid, attended, total, currency, price) => `
    <div class="dash-today-banner banner-active">
      <div class="banner-left">
        <div class="banner-badge">🏀 PRÁCTICA HOY</div>
        <div class="banner-progress-wrap">
          <div class="banner-progress-bar">
            <div class="banner-progress-fill"
                 style="width:${total > 0 ? (attended/total*100).toFixed(0) : 0}%"></div>
          </div>
          <span class="banner-progress-text">${attended} asistieron · ${paid} pagaron</span>
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
    const isoDay  = DS.jsToIsoDay(nextDate.getDay());
    const dayName = DS.DAY_NAMES_FULL[isoDay];
    return `
      <div class="dash-today-banner banner-upcoming">
        <div class="banner-left">
          <div class="banner-badge">📅 PRÓXIMA PRÁCTICA</div>
          <div class="banner-next-date">${dayName}</div>
          <div class="banner-next-sub">${DS.formatDateLong(nextDate)}</div>
        </div>
        <div class="banner-calendar-icon">🗓️</div>
      </div>
    `;
  };

  // ════════════════════════════════════════════════════════════════════════
  // LISTA DE ATLETAS DEL DÍA — idéntica en lógica a payments.js
  // ════════════════════════════════════════════════════════════════════════

  const _buildTodayAthleteList = (athletes, payments, attendances, practiceId) => {
    const payMap = {};
    const attMap = {};
    payments.forEach(p   => { payMap[p.athleteId]  = p.status;  });
    attendances.forEach(a => { attMap[a.athleteId] = a.asistio; });

    // Ordenar: primero no atendieron, luego atendieron
    const sorted = [...athletes].sort((a, b) => {
      const aa = attMap[a.id]; const ab = attMap[b.id];
      if (aa === ab) return a.name.localeCompare(b.name);
      return aa ? 1 : -1;
    });

    return `
      <div class="dash-section">
        <div class="dash-section-header">
          <h3 class="dash-section-title">Asistencia y Pagos de Hoy</h3>
          <button class="dash-link-btn" id="btn-go-payments-today">Gestionar →</button>
        </div>
        <div class="att-columns-header">
          <span class="att-col-name">Atleta</span>
          <span class="att-col-check">Asistió</span>
          <span class="att-col-check">Pago</span>
        </div>
        <div class="dash-today-list" id="dash-today-list">
          ${sorted.map(athlete => {
            const asistio    = attMap[athlete.id];
            const pagoStatus = payMap[athlete.id];
            const attChecked = asistio === true;
            const payChecked = pagoStatus === 'paid';
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

                <!-- Checkbox: Asistió -->
                <div class="att-check-cell">
                  <label class="att-check-label">
                    <input type="checkbox"
                           class="att-checkbox dash-cb-asistencia"
                           data-athlete-id="${athlete.id}"
                           data-practice-id="${practiceId}"
                           ${attChecked ? 'checked' : ''}
                           aria-label="Asistencia de ${athlete.name}">
                    <span class="att-check-custom ${attChecked ? 'checked-green' : ''}"></span>
                  </label>
                </div>

                <!-- Checkbox: Pago (oculto si ayudaSocial) -->
                <div class="att-check-cell">
                  ${athlete.ayudaSocial ? `
                    <span class="att-no-pay-indicator" title="Ayuda Social: sin pago">—</span>
                  ` : `
                    <label class="att-check-label ${payDisabled ? 'att-check-disabled' : ''}"
                           title="${payDisabled ? 'Primero marca la asistencia' : 'Marcar pago'}"
                           data-disabled="${payDisabled ? 'true' : 'false'}">
                      <input type="checkbox"
                             class="att-checkbox dash-cb-pago"
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
          }).join('')}
        </div>
      </div>
    `;
  };

  // ════════════════════════════════════════════════════════════════════════
  // TARJETAS DE SEMANA — muestra 📋 asistencia / 💲 pagos
  // ════════════════════════════════════════════════════════════════════════

  const _buildWeekPractices = (practices, practiceStats, totalAthletes) => {
    return practices.map((pd, i) => {
      const isoDay  = DS.jsToIsoDay(pd.getDay());
      const dayName = DS.DAY_NAMES_FULL[isoDay];
      const dateStr = DS.formatDateShort(pd);
      const stats   = practiceStats[i] || { att: 0, paid: 0 };
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
            <div class="wpc-stats-v2">
              <span class="wpc-stat-item wpc-att ${stats.att > 0 ? 'wpc-green' : 'wpc-red'}">
                📋 ${stats.att}/${totalAthletes}
              </span>
              <span class="wpc-stat-item wpc-pay ${stats.paid > 0 ? 'wpc-green' : 'wpc-red'}">
                💲 ${stats.paid}/${stats.att}
              </span>
            </div>
          `}
          ${isTod ? '<div class="wpc-badge-today">HOY</div>' : ''}
        </div>
      `;
    }).join('');
  };

  // ════════════════════════════════════════════════════════════════════════
  // ESTADÍSTICAS DE SEMANA (incluye asistencias)
  // ════════════════════════════════════════════════════════════════════════

  const _getWeekStats = async (weekPractices, athletes) => {
    let totalPaid = 0, totalAtt = 0;
    const practiceStats = [];

    for (const pd of weekPractices) {
      if (DS.isFuture(pd)) {
        practiceStats.push({ att: 0, paid: 0 });
        continue;
      }
      const pid         = DS.getPracticeId(pd);
      const [payments, attendances] = await Promise.all([
        Storage().getPaymentsByPractice(pid),
        Storage().getAttendanceByPractice(pid)
      ]);
      const paid = payments.filter(p => p.status === 'paid').length;
      const att  = attendances.filter(a => a.asistio).length;
      totalPaid += paid;
      totalAtt  += att;
      practiceStats.push({ att, paid });
    }

    return { totalPaid, totalAtt, practiceStats };
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

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS — checkboxes de asistencia y pago (misma lógica que payments.js)
  // ════════════════════════════════════════════════════════════════════════

  const _attachEvents = (container, todayPracticeId, isToday, athletes) => {
    container.querySelector('#btn-go-payments')?.addEventListener('click', () => navigateTo('payments'));
    container.querySelector('#btn-go-payments-today')?.addEventListener('click', () => navigateTo('payments'));

    container.querySelector('#qa-add-athlete')?.addEventListener('click', () => {
      navigateTo('athletes');
      setTimeout(() => document.getElementById('btn-add-athlete')?.click(), 300);
    });
    container.querySelector('#qa-payments')?.addEventListener('click', () => navigateTo('payments'));
    container.querySelector('#qa-report')?.addEventListener('click', () => navigateTo('reports'));

    if (!isToday) return;

    // ── Checkboxes de ASISTENCIA ──────────────────────────────────────
    container.querySelectorAll('.dash-cb-asistencia').forEach(cb => {
      cb.addEventListener('change', async () => {
        const athleteId  = cb.dataset.athleteId;
        const practiceId = cb.dataset.practiceId;
        const asistio    = cb.checked;

        // Actualizar visual del checkbox de asistencia
        const customBox = cb.nextElementSibling;
        customBox?.classList.toggle('checked-green', asistio);

        // Obtener la fila
        const row = container.querySelector(
          `.att-athlete-row[data-athlete-id="${athleteId}"]`
        );
        if (row) {
          row.classList.toggle('att-attended', asistio);

          // Encontrar el checkbox de pago dentro de esta fila.
          // CRÍTICO: usar payCb?.closest() — idéntico a payments.js.
          // El selector anterior (.att-check-label:last-of-type) devuelve
          // el primer label del DOM (asistencia), no el de pago, porque
          // :last-of-type aplica al tag dentro de su padre directo y ambos
          // labels son hijos únicos en sus respectivos .att-check-cell.
          const payCb     = row.querySelector('.dash-cb-pago');
          const payLabel  = payCb?.closest('.att-check-label');
          const payCustom = payCb?.nextElementSibling;

          if (payCb) {
            payCb.disabled = !asistio;

            // Si se desmarca asistencia y había pago → limpiar pago
            if (!asistio && payCb.checked) {
              payCb.checked = false;
              payCustom?.classList.remove('checked-orange');
              row.classList.remove('att-paid');
              await _savePayment(athleteId, practiceId, 'unpaid');
            }

            // Actualizar estilos del label de pago
            if (payLabel) {
              payLabel.classList.toggle('att-check-disabled', !asistio);
              payLabel.dataset.disabled = !asistio ? 'true' : 'false';
            }
            payCustom?.classList.toggle('check-disabled', !asistio);
          }
        }

        await _saveAttendance(athleteId, practiceId, asistio);
      });
    });

    // ── Checkboxes de PAGO ────────────────────────────────────────────
    container.querySelectorAll('.dash-cb-pago').forEach(cb => {
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
      console.error('[Dashboard] Error al guardar asistencia:', err);
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
      console.error('[Dashboard] Error al guardar pago:', err);
      window.CoachApp.App.showToast('❌ Error al guardar pago', 'error');
    }
  };

  return { render };

})();
