/**
 * components/athletes.js — Gestión de Atletas
 * Coach Management App v1.0.1
 *
 * Cambios v1.0.1:
 *  - Campo "Ayuda Social" en formulario (athlete.ayudaSocial = boolean)
 *  - Badge visual "Ayuda Social" en tarjeta
 *  - Botón ⋮ menú contextual: Editar / Crear reporte / Eliminar
 *  - Reporte PDF individual del mes actual desde el menú contextual
 *  - Al eliminar atleta también se eliminan sus registros de asistencia
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Athletes = (() => {

  const Storage = () => window.CoachApp.Storage;
  const Modal   = () => window.CoachApp.App.Modal;
  const DS      = window.CoachApp.DateSystem;

  // Referencia al menú contextual activo
  let _activeMenu = null;

  // ════════════════════════════════════════════════════════════════════════
  // RENDERIZADO PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════

  const render = async (container) => {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    try {
      const athletes = await Storage().getAll('athletes');
      athletes.sort((a, b) => a.name.localeCompare(b.name));
      container.innerHTML = _buildHTML(athletes);
      _attachEvents(container);
    } catch (error) {
      console.error('[Athletes] Error al renderizar:', error);
      container.innerHTML = '<div class="error-state"><p>Error al cargar atletas.</p></div>';
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // HTML — LISTA Y TARJETAS
  // ════════════════════════════════════════════════════════════════════════

  const _buildHTML = (athletes) => `
    <div class="view-header">
      <div>
        <h2 class="view-title">Atletas</h2>
        <p class="view-subtitle">${athletes.length} jugador${athletes.length !== 1 ? 'es' : ''} registrado${athletes.length !== 1 ? 's' : ''}</p>
      </div>
    </div>

    <div class="search-bar-wrap">
      <input type="text" id="athlete-search" class="search-input"
             placeholder="🔍 Buscar atleta..." autocomplete="off">
    </div>

    ${athletes.length === 0 ? `
      <div class="empty-state">
        <img src="assets/icons/player-icon.svg" class="empty-icon" alt="">
        <h3>Sin atletas todavía</h3>
        <p>Toca el botón <strong>+</strong> para agregar tu primer jugador</p>
      </div>
    ` : `
      <div class="athletes-list" id="athletes-list">
        ${athletes.map(a => _buildAthleteCard(a)).join('')}
      </div>
    `}

    <button class="fab" id="btn-add-athlete" title="Agregar atleta">
      <span class="fab-icon">+</span>
    </button>
  `;

  const _buildAthleteCard = (athlete) => `
    <div class="athlete-card" data-id="${athlete.id}">
      <div class="athlete-avatar ${athlete.ayudaSocial ? 'avatar-social' : ''}">
        ${athlete.name.charAt(0).toUpperCase()}
      </div>
      <div class="athlete-info">
        <div class="athlete-name-row">
          <span class="athlete-name">${_escapeHtml(athlete.name)}</span>
          ${athlete.ayudaSocial ? '<span class="badge-social">Ayuda Social</span>' : ''}
        </div>
        <div class="athlete-meta">
          ${athlete.age         ? `<span>🎂 ${athlete.age} años</span>`                   : ''}
          ${athlete.parentPhone ? `<span>📱 ${_escapeHtml(athlete.parentPhone)}</span>` : ''}
        </div>
        ${athlete.notes ? `<div class="athlete-notes">${_escapeHtml(athlete.notes)}</div>` : ''}
      </div>
      <div class="athlete-actions">
        <button class="icon-btn btn-context-menu" data-id="${athlete.id}"
                title="Opciones" aria-label="Opciones del atleta">⋮</button>
      </div>
    </div>
  `;

  // ════════════════════════════════════════════════════════════════════════
  // MENÚ CONTEXTUAL ⋮  (fade + slide, cierra al click fuera)
  // ════════════════════════════════════════════════════════════════════════

  const _openContextMenu = (triggerBtn, athlete, container) => {
    _closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id        = 'active-context-menu';
    menu.innerHTML = `
      <button class="context-menu-item" id="ctx-edit">
        <span class="ctx-icon">✏️</span> Editar atleta
      </button>
      <button class="context-menu-item" id="ctx-report">
        <span class="ctx-icon">📄</span> Crear reporte
      </button>
      <div class="context-menu-divider"></div>
      <button class="context-menu-item ctx-danger" id="ctx-delete">
        <span class="ctx-icon">🗑️</span> Eliminar atleta
      </button>
    `;

    document.body.appendChild(menu);
    _activeMenu = menu;

    // Posicionamiento relativo al botón
    const rect  = triggerBtn.getBoundingClientRect();
    const menuW = 200;
    let   left  = rect.right - menuW;
    let   top   = rect.bottom + 6;
    if (left < 8) left = 8;
    if (top + 160 > window.innerHeight) top = rect.top - 166;

    menu.style.left = `${left + window.scrollX}px`;
    menu.style.top  = `${top  + window.scrollY}px`;

    requestAnimationFrame(() => menu.classList.add('context-menu-visible'));

    menu.querySelector('#ctx-edit')?.addEventListener('click', () => {
      _closeContextMenu(); _openForm(athlete);
    });
    menu.querySelector('#ctx-report')?.addEventListener('click', () => {
      _closeContextMenu(); _generateAthleteReport(athlete);
    });
    menu.querySelector('#ctx-delete')?.addEventListener('click', () => {
      _closeContextMenu(); _confirmDelete(athlete.id, container);
    });

    // Cerrar al clic fuera (diferido para no capturar el clic que lo abrió)
    setTimeout(() => {
      document.addEventListener('click', _handleOutsideClick, { capture: true, once: true });
    }, 50);
  };

  const _handleOutsideClick = (e) => {
    if (_activeMenu && !_activeMenu.contains(e.target)) {
      _closeContextMenu();
    }
  };

  const _closeContextMenu = () => {
    if (_activeMenu) {
      _activeMenu.classList.remove('context-menu-visible');
      const m = _activeMenu;
      setTimeout(() => m.remove(), 200);
      _activeMenu = null;
    }
    document.removeEventListener('click', _handleOutsideClick, { capture: true });
  };

  // ════════════════════════════════════════════════════════════════════════
  // FORMULARIO  (con campo Ayuda Social)
  // ════════════════════════════════════════════════════════════════════════

  const _buildAthleteForm = (athlete = null) => {
    const isEdit      = !!athlete;
    const ayudaSocial = isEdit ? !!athlete.ayudaSocial : false;
    return `
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Editar Atleta' : 'Nuevo Atleta'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <form id="athlete-form" class="modal-form" novalidate>

        <div class="form-group">
          <label class="form-label" for="field-name">Nombre completo *</label>
          <input id="field-name" type="text" class="form-input"
                 placeholder="Ej: Juan Pérez"
                 value="${isEdit ? _escapeHtml(athlete.name) : ''}"
                 required autocomplete="off" maxlength="60">
          <span class="form-error" id="error-name"></span>
        </div>

        <div class="form-group">
          <label class="form-label" for="field-age">Edad</label>
          <input id="field-age" type="number" class="form-input"
                 placeholder="Ej: 15"
                 value="${isEdit && athlete.age ? athlete.age : ''}"
                 min="5" max="100">
        </div>

        <div class="form-group">
          <label class="form-label" for="field-phone">Teléfono del padre/madre</label>
          <input id="field-phone" type="tel" class="form-input"
                 placeholder="Ej: 0414-1234567"
                 value="${isEdit && athlete.parentPhone ? _escapeHtml(athlete.parentPhone) : ''}"
                 maxlength="20">
        </div>

        <div class="form-group">
          <label class="form-label" for="field-notes">Notas</label>
          <textarea id="field-notes" class="form-input form-textarea"
                    placeholder="Lesiones, observaciones, etc."
                    maxlength="200" rows="3"
          >${isEdit && athlete.notes ? _escapeHtml(athlete.notes) : ''}</textarea>
        </div>

        <!-- Ayuda Social — nuevo campo v1.0.1 -->
        <div class="form-group">
          <label class="social-aid-label">
            <input type="checkbox" id="field-social-aid"
                   class="social-aid-checkbox" ${ayudaSocial ? 'checked' : ''}>
            <div class="social-aid-content">
              <span class="social-aid-title">Ayuda Social</span>
              <span class="social-aid-hint">
                El atleta asiste pero no paga. No se incluye en cálculos de ingresos.
              </span>
            </div>
          </label>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="form-cancel">Cancelar</button>
          <button type="submit" class="btn-primary">
            ${isEdit ? 'Guardar Cambios' : 'Agregar Atleta'}
          </button>
        </div>
      </form>
    `;
  };

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS DE LA LISTA
  // ════════════════════════════════════════════════════════════════════════

  const _attachEvents = (container) => {
    container.querySelector('#btn-add-athlete')
      ?.addEventListener('click', () => _openForm(null));

    container.querySelector('#athlete-search')
      ?.addEventListener('input', (e) => {
        _filterAthletes(e.target.value.trim().toLowerCase(), container);
      });

    // Botón ⋮ — abre menú contextual
    container.querySelectorAll('.btn-context-menu').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const athlete = await Storage().getById('athletes', btn.dataset.id);
        if (athlete) _openContextMenu(btn, athlete, container);
      });
    });

    // Tap en la card (no en ⋮) → abrir formulario
    container.querySelectorAll('.athlete-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.btn-context-menu')) return;
        const athlete = await Storage().getById('athletes', card.dataset.id);
        if (athlete) _openForm(athlete);
      });
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // ABRIR / GUARDAR FORMULARIO
  // ════════════════════════════════════════════════════════════════════════

  const _openForm = (athlete = null) => {
    const modal = Modal();
    modal.open(_buildAthleteForm(athlete));
    setTimeout(() => document.getElementById('field-name')?.focus(), 100);

    document.getElementById('modal-close')?.addEventListener('click', modal.close);
    document.getElementById('form-cancel')?.addEventListener('click', modal.close);
    document.getElementById('athlete-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await _saveAthlete(athlete?.id || null, modal);
    });
  };

  const _saveAthlete = async (existingId, modal) => {
    const name        = document.getElementById('field-name')?.value.trim();
    const age         = document.getElementById('field-age')?.value;
    const phone       = document.getElementById('field-phone')?.value.trim();
    const notes       = document.getElementById('field-notes')?.value.trim();
    const ayudaSocial = document.getElementById('field-social-aid')?.checked || false;

    if (!name) {
      document.getElementById('error-name').textContent = 'El nombre es obligatorio.';
      document.getElementById('field-name').classList.add('input-error');
      return;
    }

    const athleteData = {
      id:          existingId || Storage().generateId(),
      name,
      age:         age ? parseInt(age) : null,
      parentPhone: phone || null,
      notes:       notes || null,
      ayudaSocial,
      createdAt:   existingId ? undefined : Date.now()
    };

    if (existingId) {
      const existing       = await Storage().getById('athletes', existingId);
      athleteData.createdAt = existing?.createdAt || Date.now();
    }

    try {
      await Storage().put('athletes', athleteData);
      modal.close();
      window.CoachApp.App.showToast(existingId ? '✅ Atleta actualizado' : '✅ Atleta agregado');
      await render(document.getElementById('app-content'));
    } catch (error) {
      console.error('[Athletes] Error al guardar:', error);
      window.CoachApp.App.showToast('❌ Error al guardar. Intenta de nuevo.', 'error');
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // ELIMINAR
  // ════════════════════════════════════════════════════════════════════════

  const _confirmDelete = async (athleteId, container) => {
    const athlete = await Storage().getById('athletes', athleteId);
    if (!athlete) return;

    const modal = Modal();
    modal.open(`
      <div class="modal-header">
        <h3 class="modal-title">Eliminar Atleta</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="confirm-icon">⚠️</div>
        <p class="confirm-text">
          ¿Eliminar a <strong>${_escapeHtml(athlete.name)}</strong>?<br>
          <span class="confirm-sub">
            Se eliminarán también todos sus registros de pago y asistencia.
          </span>
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" id="btn-cancel-delete">Cancelar</button>
        <button class="btn-danger" id="btn-confirm-delete">Sí, Eliminar</button>
      </div>
    `);

    document.getElementById('modal-close')?.addEventListener('click', modal.close);
    document.getElementById('btn-cancel-delete')?.addEventListener('click', modal.close);
    document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
      try {
        await Storage().remove('athletes', athleteId);

        const payments    = await Storage().getPaymentsByAthlete(athleteId);
        for (const p of payments) await Storage().remove('payments', p.id);

        const attendance  = await Storage().getAttendanceByAthlete(athleteId);
        for (const a of attendance) await Storage().remove('attendance', a.id);

        modal.close();
        window.CoachApp.App.showToast('🗑️ Atleta eliminado');
        await render(document.getElementById('app-content'));
      } catch (error) {
        console.error('[Athletes] Error al eliminar:', error);
        window.CoachApp.App.showToast('❌ Error al eliminar.', 'error');
      }
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // REPORTE PDF INDIVIDUAL (v1.0.1)
  // Mes actual · asistencia · pago (excluido si ayudaSocial)
  // ════════════════════════════════════════════════════════════════════════

  const _generateAthleteReport = async (athlete) => {
    window.CoachApp.App.showToast('⏳ Generando reporte...');
    try {
      if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
        throw new Error('jsPDF no disponible. Requiere conexión a internet la primera vez.');
      }

      const { jsPDF }    = window.jspdf || window;
      const doc          = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const today        = new Date();
      const year         = today.getFullYear();
      const month        = today.getMonth();

      const [practiceDays, currency, price, teamName] = await Promise.all([
        Storage().getSetting('practiceDays',     [1, 3, 5]),
        Storage().getSetting('currency',         '$'),
        Storage().getSetting('pricePerPractice', 0),
        Storage().getSetting('teamName',         'Mi Equipo')
      ]);

      const practiceDates = DS.getPracticeDatesInMonth(year, month, practiceDays);
      const pastPractices = practiceDates.filter(d => !DS.isFuture(d));

      const allPayments   = await Storage().getPaymentsByAthlete(athlete.id);
      const allAttendance = await Storage().getAttendanceByAthlete(athlete.id);

      const payMap = {};
      const attMap = {};
      allPayments.forEach(p   => { payMap[p.practiceId] = p.status;  });
      allAttendance.forEach(a => { attMap[a.practiceId] = a.asistio; });

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

      // Usar la fuente única de verdad para la lógica de pago
      const Logic = window.CoachApp.Logic;

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
      doc.text('Coach Management v1.0.1', M, PH - 8);
      doc.text(DS.formatDateLong(today), PW - M, PH - 8, { align: 'right' });
      doc.setDrawColor(...C.lgray); doc.setLineWidth(0.3);
      doc.line(M, PH - 12, PW - M, PH - 12);

      // ── Guardar ────────────────────────────────────────────────────────
      const safe = athlete.name.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9]/g, '_');
      doc.save(`reporte-${safe}-${DS.MONTH_NAMES[month].toLowerCase()}-${year}.pdf`);
      window.CoachApp.App.showToast('✅ Reporte descargado');

    } catch (err) {
      console.error('[Athletes] Error al generar reporte:', err);
      window.CoachApp.App.showToast('❌ Error al generar el reporte', 'error');
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // BÚSQUEDA
  // ════════════════════════════════════════════════════════════════════════

  const _filterAthletes = (query, container) => {
    container.querySelectorAll('.athlete-card').forEach(card => {
      const name = card.querySelector('.athlete-name')?.textContent.toLowerCase() || '';
      card.style.display = name.includes(query) ? '' : 'none';
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // UTIL
  // ════════════════════════════════════════════════════════════════════════

  const _escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  return { render };

})();
