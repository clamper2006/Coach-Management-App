/**
 * components/athletes.js — Gestión de Atletas
 * Coach Management App
 *
 * Permite agregar, editar, eliminar y listar atletas.
 * Cada atleta tiene: nombre, edad, teléfono del padre y notas.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Athletes = (() => {

  const Storage = () => window.CoachApp.Storage;
  const Modal   = () => window.CoachApp.App.Modal;

  // ════════════════════════════════════════════════════════════════════════
  // RENDERIZADO PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════

  const render = async (container) => {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
      const athletes = await Storage().getAll('athletes');
      // Ordenar alfabéticamente
      athletes.sort((a, b) => a.name.localeCompare(b.name));
      container.innerHTML = _buildHTML(athletes);
      _attachEvents(container);
    } catch (error) {
      console.error('[Athletes] Error al renderizar:', error);
      container.innerHTML = '<div class="error-state"><p>Error al cargar atletas.</p></div>';
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // HTML
  // ════════════════════════════════════════════════════════════════════════

  const _buildHTML = (athletes) => `
    <div class="view-header">
      <div>
        <h2 class="view-title">Atletas</h2>
        <p class="view-subtitle">${athletes.length} jugador${athletes.length !== 1 ? 'es' : ''} registrado${athletes.length !== 1 ? 's' : ''}</p>
      </div>
    </div>

    <div class="search-bar-wrap">
      <input
        type="text"
        id="athlete-search"
        class="search-input"
        placeholder="🔍 Buscar atleta..."
        autocomplete="off"
      >
    </div>

    ${athletes.length === 0 ? _buildEmptyState() : `
      <div class="athletes-list" id="athletes-list">
        ${athletes.map(a => _buildAthleteCard(a)).join('')}
      </div>
    `}

    <button class="fab" id="btn-add-athlete" title="Agregar atleta">
      <span class="fab-icon">+</span>
    </button>
  `;

  const _buildEmptyState = () => `
    <div class="empty-state">
      <img src="assets/icons/player-icon.svg" class="empty-icon" alt="">
      <h3>Sin atletas todavía</h3>
      <p>Toca el botón <strong>+</strong> para agregar tu primer jugador</p>
    </div>
  `;

  const _buildAthleteCard = (athlete) => `
    <div class="athlete-card" data-id="${athlete.id}">
      <div class="athlete-avatar">
        ${athlete.name.charAt(0).toUpperCase()}
      </div>
      <div class="athlete-info">
        <div class="athlete-name">${_escapeHtml(athlete.name)}</div>
        <div class="athlete-meta">
          ${athlete.age ? `<span>🎂 ${athlete.age} años</span>` : ''}
          ${athlete.parentPhone ? `<span>📱 ${_escapeHtml(athlete.parentPhone)}</span>` : ''}
        </div>
        ${athlete.notes ? `<div class="athlete-notes">${_escapeHtml(athlete.notes)}</div>` : ''}
      </div>
      <div class="athlete-actions">
        <button class="icon-btn btn-edit-athlete" data-id="${athlete.id}" title="Editar">
          ✏️
        </button>
        <button class="icon-btn btn-delete-athlete" data-id="${athlete.id}" title="Eliminar">
          🗑️
        </button>
      </div>
    </div>
  `;

  // ════════════════════════════════════════════════════════════════════════
  // MODAL: FORMULARIO DE ATLETA
  // ════════════════════════════════════════════════════════════════════════

  const _buildAthleteForm = (athlete = null) => {
    const isEdit = !!athlete;
    return `
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Editar Atleta' : 'Nuevo Atleta'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <form id="athlete-form" class="modal-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="field-name">Nombre completo *</label>
          <input
            id="field-name"
            type="text"
            class="form-input"
            placeholder="Ej: Juan Pérez"
            value="${isEdit ? _escapeHtml(athlete.name) : ''}"
            required
            autocomplete="off"
            maxlength="60"
          >
          <span class="form-error" id="error-name"></span>
        </div>

        <div class="form-group">
          <label class="form-label" for="field-age">Edad</label>
          <input
            id="field-age"
            type="number"
            class="form-input"
            placeholder="Ej: 15"
            value="${isEdit && athlete.age ? athlete.age : ''}"
            min="5" max="100"
          >
        </div>

        <div class="form-group">
          <label class="form-label" for="field-phone">Teléfono del padre/madre</label>
          <input
            id="field-phone"
            type="tel"
            class="form-input"
            placeholder="Ej: 0414-1234567"
            value="${isEdit && athlete.parentPhone ? _escapeHtml(athlete.parentPhone) : ''}"
            maxlength="20"
          >
        </div>

        <div class="form-group">
          <label class="form-label" for="field-notes">Notas</label>
          <textarea
            id="field-notes"
            class="form-input form-textarea"
            placeholder="Lesiones, observaciones, etc."
            maxlength="200"
            rows="3"
          >${isEdit && athlete.notes ? _escapeHtml(athlete.notes) : ''}</textarea>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="form-cancel">Cancelar</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Guardar Cambios' : 'Agregar Atleta'}</button>
        </div>
      </form>
    `;
  };

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════

  const _attachEvents = (container) => {
    // Botón agregar
    container.querySelector('#btn-add-athlete')?.addEventListener('click', () => _openForm(null));

    // Búsqueda
    container.querySelector('#athlete-search')?.addEventListener('input', (e) => {
      _filterAthletes(e.target.value.trim().toLowerCase(), container);
    });

    // Cards: editar / eliminar
    container.querySelectorAll('.btn-edit-athlete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const athlete = await Storage().getById('athletes', btn.dataset.id);
        if (athlete) _openForm(athlete);
      });
    });

    container.querySelectorAll('.btn-delete-athlete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await _confirmDelete(btn.dataset.id, container);
      });
    });

    // Tap en la card → abrir editar
    container.querySelectorAll('.athlete-card').forEach(card => {
      card.addEventListener('click', async () => {
        const athlete = await Storage().getById('athletes', card.dataset.id);
        if (athlete) _openForm(athlete);
      });
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // FORMULARIO
  // ════════════════════════════════════════════════════════════════════════

  const _openForm = (athlete = null) => {
    const modal = Modal();
    modal.open(_buildAthleteForm(athlete));

    // Foco en el primer campo
    setTimeout(() => document.getElementById('field-name')?.focus(), 100);

    // Cerrar modal
    document.getElementById('modal-close')?.addEventListener('click', modal.close);
    document.getElementById('form-cancel')?.addEventListener('click', modal.close);

    // Submit del formulario
    document.getElementById('athlete-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await _saveAthlete(athlete?.id || null, modal);
    });
  };

  const _saveAthlete = async (existingId, modal) => {
    const name  = document.getElementById('field-name')?.value.trim();
    const age   = document.getElementById('field-age')?.value;
    const phone = document.getElementById('field-phone')?.value.trim();
    const notes = document.getElementById('field-notes')?.value.trim();

    // Validación
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
      createdAt:   existingId ? undefined : Date.now()
    };

    // Si es edición, conservar el createdAt original
    if (existingId) {
      const existing = await Storage().getById('athletes', existingId);
      athleteData.createdAt = existing?.createdAt || Date.now();
    }

    try {
      await Storage().put('athletes', athleteData);
      modal.close();

      // Mostrar feedback
      window.CoachApp.App.showToast(existingId ? '✅ Atleta actualizado' : '✅ Atleta agregado');

      // Re-renderizar la vista
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
          <span class="confirm-sub">Se eliminarán también todos sus registros de pago.</span>
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
        // Eliminar atleta
        await Storage().remove('athletes', athleteId);

        // Eliminar sus pagos
        const payments = await Storage().getPaymentsByAthlete(athleteId);
        for (const p of payments) await Storage().remove('payments', p.id);

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
  // BÚSQUEDA
  // ════════════════════════════════════════════════════════════════════════

  const _filterAthletes = (query, container) => {
    const cards = container.querySelectorAll('.athlete-card');
    cards.forEach(card => {
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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return { render };

})();
