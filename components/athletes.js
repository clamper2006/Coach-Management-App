/**
 * components/athletes.js — Gestión de Atletas
 * Coach Management App v1.1.0
 *
 * Cambios v1.1.0:
 *  - "Crear reporte" abre el modal de reportes (mensuales / deuda general)
 *
 * Cambios v1.0.1:
 *  - Campo "Ayuda Social" en formulario (athlete.ayudaSocial = boolean)
 *  - Badge visual "Ayuda Social" en tarjeta
 *  - Botón ⋮ menú contextual: Editar / Crear reporte / Eliminar
 *  - Reporte PDF individual del mes actual desde el menú contextual (ahora en utils/athlete-reports.js)
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
      _closeContextMenu(); window.CoachApp.ReportModal.open(athlete);
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
  // REPORTES (v1.1.0)
  // "Crear reporte" abre components/report-modal.js; el PDF mensual individual
  // (antes aquí) vive ahora en utils/athlete-reports.js → generateMonthlyReport.
  // ════════════════════════════════════════════════════════════════════════

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
