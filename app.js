/**
 * app.js — Controlador Principal de Coach Management
 *
 * Maneja:
 *  - Inicialización de la app y de IndexedDB
 *  - Router de vistas (navegación entre secciones)
 *  - Sistema de modales
 *  - Toasts de notificación
 *  - Registro del Service Worker
 *  - Vista de Ajustes y Respaldo
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.App = (() => {

  // Alias de módulos
  const Storage  = () => window.CoachApp.Storage;
  const DS       = window.CoachApp.DateSystem;

  // Vista activa actualmente
  let _activeView = 'home';

  // ════════════════════════════════════════════════════════════════════════
  // INICIALIZACIÓN
  // ════════════════════════════════════════════════════════════════════════

  const init = async () => {
    console.log('[App] Iniciando Coach Management...');

    try {
      // 1. Abrir base de datos IndexedDB
      await Storage().open();
      console.log('[App] Base de datos lista');

      // 2. Aplicar tema guardado antes de renderizar nada
      window.CoachApp.Theme.init();

      // 3. Inicializar configuración por defecto si no existe
      await _initDefaultSettings();

      // 4. Actualizar nombre del equipo en el header
      await _updateHeader();

      // 5. Configurar navegación
      _setupNavigation();

      // 6. Registrar Service Worker
      _registerServiceWorker();

      // 7. Manejar URL params (accesos directos del manifest)
      const urlView = new URLSearchParams(window.location.search).get('view');
      const startView = urlView || 'home';

      // 8. Renderizar vista inicial
      await navigateTo(startView);

      // 9. Mostrar tutorial si es la primera vez
      setTimeout(() => {
        if (!window.CoachApp.Tutorial.isCompleted()) {
          window.CoachApp.Tutorial.start();
        }
      }, 800);

    } catch (error) {
      console.error('[App] Error crítico en inicialización:', error);
      document.getElementById('app-content').innerHTML = `
        <div class="error-state critical">
          <div class="error-icon">⚠️</div>
          <h3>Error al iniciar la aplicación</h3>
          <p>${error.message}</p>
          <button class="btn-primary" onclick="location.reload()">Reintentar</button>
        </div>
      `;
    }
  };

  const _initDefaultSettings = async () => {
    const teamName = await Storage().getSetting('teamName');
    if (!teamName) {
      await Promise.all([
        Storage().setSetting('teamName',         'Mi Equipo'),
        Storage().setSetting('pricePerPractice', 10),
        Storage().setSetting('practiceDays',     [1, 3, 5]),
        Storage().setSetting('currency',         '$')
      ]);
      console.log('[App] Configuración por defecto creada');
    }
  };

  const _updateHeader = async () => {
    const teamName = await Storage().getSetting('teamName', 'Mi Equipo');
    const el = document.getElementById('header-team-name');
    if (el) el.textContent = teamName;
  };

  // ════════════════════════════════════════════════════════════════════════
  // ROUTER / NAVEGACIÓN
  // ════════════════════════════════════════════════════════════════════════

  const navigateTo = async (viewName) => {
    const content = document.getElementById('app-content');
    if (!content) return;

    // Actualizar botones de navegación
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Transición de salida
    content.classList.add('view-exit');

    await new Promise(r => setTimeout(r, 150));

    content.classList.remove('view-exit');
    content.classList.add('view-enter');

    _activeView = viewName;

    // Renderizar la vista correspondiente
    switch (viewName) {
      case 'home':
        await window.CoachApp.Dashboard.render(content);
        break;

      case 'athletes':
        await window.CoachApp.Athletes.render(content);
        break;

      case 'payments':
        await window.CoachApp.Payments.render(content);
        break;

      case 'reports':
        await window.CoachApp.Calendar.render(content);
        break;

      case 'settings':
        await _renderSettings(content);
        break;

      case 'about':
        _renderAbout(content);
        break;

      default:
        await window.CoachApp.Dashboard.render(content);
    }

    content.classList.remove('view-enter');

    // Scroll al inicio
    content.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  const _setupNavigation = () => {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view && view !== _activeView) {
          // Reset del estado de pagos al cambiar de vista
          if (_activeView === 'payments') {
            window.CoachApp.Payments.resetState?.();
          }
          navigateTo(view);
        }
      });
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // VISTA: ACERCA DE
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Pantalla independiente con información del desarrollador.
   * Accesible desde el botón "i" del header.
   */
  const _renderAbout = (container) => {
    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Acerca de</h2>
          <p class="view-subtitle">Información de la aplicación</p>
        </div>
      </div>

      <!-- Tarjeta principal de la app -->
      <div class="about-hero-card">
        <div class="about-hero-logo-wrap">
          <img src="assets/icons/logo.png" alt="Coach Management Logo" class="about-hero-logo"
               onerror="this.style.display='none'">
        </div>
        <h1 class="about-hero-name">Coach Management</h1>
        <div class="about-version-badge">Versión 1.0.0</div>
        <p class="about-hero-desc">
          Herramienta digital para entrenadores de baloncesto juvenil.
          Registra atletas, controla pagos semanales y genera reportes mensuales.
          Funciona completamente sin conexión a internet una vez instalada.
        </p>
      </div>

      <!-- Tarjeta del desarrollador -->
      <div class="about-dev-card">
        <div class="about-dev-header">
          <div class="about-dev-avatar">CL</div>
          <div>
            <div class="about-dev-title">Desarrollador</div>
            <div class="about-dev-name">Cesar Lamper</div>
          </div>
        </div>

        <p class="about-dev-tagline">Esta App fue desarrollada por CL Developer</p>

        <div class="about-dev-contacts">

          <a class="about-contact-row" href="mailto:cl.developer33@gmail.com">
            <div class="about-contact-icon about-icon-email">
              <!-- Ícono email -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </div>
            <div class="about-contact-info">
              <span class="about-contact-label">Email</span>
              <span class="about-contact-value">cl.developer33@gmail.com</span>
            </div>
            <div class="about-contact-arrow">→</div>
          </a>

          <a class="about-contact-row" href="https://wa.me/584125423946" target="_blank" rel="noopener noreferrer">
            <div class="about-contact-icon about-icon-whatsapp">
              <!-- Ícono WhatsApp -->
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
              </svg>
            </div>
            <div class="about-contact-info">
              <span class="about-contact-label">WhatsApp</span>
              <span class="about-contact-value">+58 412-5423946</span>
            </div>
            <div class="about-contact-arrow">→</div>
          </a>

        </div>
      </div>

      <!-- Características de la app -->
      <div class="about-features-card">
        <h3 class="about-features-title">Características</h3>
        <div class="about-features-list">
          <div class="about-feature-item">
            <span class="about-feature-icon">👥</span>
            <span>Gestión completa de atletas</span>
          </div>
          <div class="about-feature-item">
            <span class="about-feature-icon">💳</span>
            <span>Control de pagos por práctica</span>
          </div>
          <div class="about-feature-item">
            <span class="about-feature-icon">📊</span>
            <span>Reportes PDF mensuales</span>
          </div>
          <div class="about-feature-item">
            <span class="about-feature-icon">📶</span>
            <span>Funciona sin internet (offline)</span>
          </div>
          <div class="about-feature-item">
            <span class="about-feature-icon">📱</span>
            <span>Instalable como app (PWA)</span>
          </div>
          <div class="about-feature-item">
            <span class="about-feature-icon">💾</span>
            <span>Respaldo y restauración de datos</span>
          </div>
        </div>
      </div>

      <div class="about-footer-note">
        © 2025 CL Developer · Todos los derechos reservados
      </div>

      <div class="settings-bottom-space"></div>
    `;
  };

  // ════════════════════════════════════════════════════════════════════════
  // VISTA DE AJUSTES  (con sección de tema añadida)
  // ════════════════════════════════════════════════════════════════════════

  const _renderSettings = async (container) => {
    const [teamName, price, practiceDays, currency] = await Promise.all([
      Storage().getSetting('teamName',         'Mi Equipo'),
      Storage().getSetting('pricePerPractice', 10),
      Storage().getSetting('practiceDays',     [1, 3, 5]),
      Storage().getSetting('currency',         '$')
    ]);

    const currentTheme = window.CoachApp.Theme.getCurrent();
    const isDark       = currentTheme === 'dark';

    const dayOptions = [
      { iso: 1, label: 'Lunes'    },
      { iso: 2, label: 'Martes'   },
      { iso: 3, label: 'Miércoles'},
      { iso: 4, label: 'Jueves'   },
      { iso: 5, label: 'Viernes'  },
      { iso: 6, label: 'Sábado'   },
      { iso: 7, label: 'Domingo'  }
    ];

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Ajustes</h2>
          <p class="view-subtitle">Configura tu equipo</p>
        </div>
      </div>

      <!-- ── TEMA ─────────────────────────────────────── -->
      <div class="settings-section">
        <h3 class="settings-section-title">🎨 Apariencia</h3>
        <div class="settings-card">
          <div class="theme-toggle-row">
            <div class="theme-toggle-info">
              <span class="theme-toggle-label">Tema de la aplicación</span>
              <span class="theme-toggle-current">${isDark ? '🌙 Oscuro activo' : '☀️ Claro activo'}</span>
            </div>
            <div class="theme-switch-wrap">
              <button class="theme-option-btn ${isDark ? '' : 'theme-option-active'}" id="btn-theme-light" title="Tema claro">
                ☀️ Claro
              </button>
              <button class="theme-option-btn ${isDark ? 'theme-option-active' : ''}" id="btn-theme-dark" title="Tema oscuro">
                🌙 Oscuro
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── EQUIPO ────────────────────────────────────── -->
      <div class="settings-section">
        <h3 class="settings-section-title">📋 Información del Equipo</h3>

        <div class="settings-card">
          <form id="settings-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="set-team-name">Nombre del Equipo</label>
              <input
                id="set-team-name"
                type="text"
                class="form-input"
                value="${_escapeHtml(teamName)}"
                placeholder="Ej: Baloncesto Academia"
                maxlength="50"
              >
            </div>

            <div class="form-group">
              <label class="form-label" for="set-price">Precio por Práctica</label>
              <div class="input-with-prefix">
                <select id="set-currency" class="form-input form-select currency-select">
                  <option value="$"  ${currency === '$'  ? 'selected' : ''}>$</option>
                  <option value="€"  ${currency === '€'  ? 'selected' : ''}>€</option>
                  <option value="Bs" ${currency === 'Bs' ? 'selected' : ''}>Bs</option>
                  <option value="S/" ${currency === 'S/' ? 'selected' : ''}>S/</option>
                </select>
                <input
                  id="set-price"
                  type="number"
                  class="form-input"
                  value="${price}"
                  min="0" step="0.5"
                  placeholder="0.00"
                >
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Días de Práctica</label>
              <div class="day-selector">
                ${dayOptions.map(day => `
                  <label class="day-chip ${practiceDays.includes(day.iso) ? 'selected' : ''}">
                    <input
                      type="checkbox"
                      name="practice-day"
                      value="${day.iso}"
                      ${practiceDays.includes(day.iso) ? 'checked' : ''}
                      class="day-checkbox"
                    >
                    ${day.label.substring(0, 3)}
                  </label>
                `).join('')}
              </div>
              <p class="form-hint">Selecciona exactamente los días de entrenamiento</p>
            </div>

            <button type="submit" class="btn-primary btn-full">Guardar Configuración</button>
          </form>
        </div>
      </div>

      <!-- ── RESPALDO ───────────────────────────────────── -->
      <div class="settings-section">
        <h3 class="settings-section-title">💾 Respaldo de Datos</h3>
        <div class="settings-card">
          <p class="backup-info">
            Exporta todos tus datos para hacer una copia de seguridad.
            Puedes restaurarlos importando el archivo JSON generado.
          </p>
          <div class="backup-actions">
            <button class="btn-backup btn-export" id="btn-export">
              <span>⬇️</span> Exportar Datos
            </button>
            <button class="btn-backup btn-import" id="btn-import">
              <span>⬆️</span> Importar Datos
            </button>
          </div>
        </div>
      </div>

      <!-- ── TUTORIAL ───────────────────────────────────── -->
      <div class="settings-section">
        <h3 class="settings-section-title">🎓 Tutorial</h3>
        <div class="settings-card">
          <p class="backup-info">¿Quieres volver a ver el tutorial de bienvenida?</p>
          <button class="btn-secondary btn-full" id="btn-restart-tutorial">
            📖 Ver Tutorial de Nuevo
          </button>
        </div>
      </div>

      <div class="settings-bottom-space"></div>
    `;

    _attachSettingsEvents(container);
  };

  const _attachSettingsEvents = (container) => {
    // ── Toggles de tema ───────────────────────────────────────────────────
    container.querySelector('#btn-theme-light')?.addEventListener('click', () => {
      window.CoachApp.Theme.apply('light');
      // Re-renderizar settings para reflejar el cambio de botón activo
      _renderSettings(container);
    });

    container.querySelector('#btn-theme-dark')?.addEventListener('click', () => {
      window.CoachApp.Theme.apply('dark');
      _renderSettings(container);
    });

    // ── Guardar configuración del equipo ─────────────────────────────────
    container.querySelector('#settings-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const teamName = document.getElementById('set-team-name')?.value.trim();
      const price    = parseFloat(document.getElementById('set-price')?.value) || 0;
      const currency = document.getElementById('set-currency')?.value || '$';
      const checked  = [...document.querySelectorAll('.day-checkbox:checked')].map(cb => parseInt(cb.value));

      if (!teamName) {
        showToast('⚠️ El nombre del equipo es obligatorio', 'error');
        return;
      }
      if (checked.length === 0) {
        showToast('⚠️ Selecciona al menos un día de práctica', 'error');
        return;
      }

      try {
        await Promise.all([
          Storage().setSetting('teamName',         teamName),
          Storage().setSetting('pricePerPractice', price),
          Storage().setSetting('practiceDays',     checked.sort()),
          Storage().setSetting('currency',         currency)
        ]);

        // Actualizar header con nuevo nombre
        const el = document.getElementById('header-team-name');
        if (el) el.textContent = teamName;

        showToast('✅ Configuración guardada');
        window.CoachApp.Payments.resetState?.();
      } catch (err) {
        console.error('[Settings] Error al guardar:', err);
        showToast('❌ Error al guardar configuración', 'error');
      }
    });

    // Day chips: toggle visual
    container.querySelectorAll('.day-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const cb = chip.querySelector('.day-checkbox');
        if (cb) chip.classList.toggle('selected', cb.checked);
      });
    });

    // Exportar datos
    container.querySelector('#btn-export')?.addEventListener('click', async () => {
      try {
        const result = await window.CoachApp.BackupSystem.exportData();
        showToast(`✅ Exportado: ${result.athletes} atletas, ${result.payments} pagos`);
      } catch (err) {
        showToast('❌ Error al exportar: ' + err.message, 'error');
      }
    });

    // Importar datos
    container.querySelector('#btn-import')?.addEventListener('click', async () => {
      const confirmed = await _confirmImport();
      if (!confirmed) return;

      try {
        const result = await window.CoachApp.BackupSystem.importData();
        showToast(`✅ Importado: ${result.athletes} atletas, ${result.payments} pagos`);
        setTimeout(() => navigateTo('settings'), 500);
      } catch (err) {
        if (!err.message.includes('cancelada')) {
          showToast('❌ Error al importar: ' + err.message, 'error');
        }
      }
    });

    // Reiniciar tutorial
    container.querySelector('#btn-restart-tutorial')?.addEventListener('click', () => {
      window.CoachApp.Tutorial.reset();
      window.CoachApp.Tutorial.start();
    });
  };

  // Confirmación antes de importar (destructiva)
  const _confirmImport = () => new Promise((resolve) => {
    const modal = Modal;
    modal.open(`
      <div class="modal-header">
        <h3 class="modal-title">⚠️ Importar Datos</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <p class="confirm-text">
          Importar datos <strong>reemplazará completamente</strong> todos los atletas y pagos actuales.<br>
          <span class="confirm-sub">Esta acción no se puede deshacer.</span>
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" id="import-cancel">Cancelar</button>
        <button class="btn-danger" id="import-confirm">Sí, Importar</button>
      </div>
    `);

    document.getElementById('modal-close')?.addEventListener('click', () => { modal.close(); resolve(false); });
    document.getElementById('import-cancel')?.addEventListener('click', () => { modal.close(); resolve(false); });
    document.getElementById('import-confirm')?.addEventListener('click', () => { modal.close(); resolve(true); });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SISTEMA DE MODALES
  // ════════════════════════════════════════════════════════════════════════

  const Modal = {
    open: (html) => {
      const overlay = document.getElementById('modal-overlay');
      const content = document.getElementById('modal-content');
      if (!overlay || !content) return;

      content.innerHTML = html;
      overlay.classList.add('modal-visible');

      // Cerrar al hacer click en el fondo
      overlay.onclick = (e) => {
        if (e.target === overlay) Modal.close();
      };

      // Cerrar con Escape
      document.addEventListener('keydown', _escapeListener);

      // Foco inicial
      setTimeout(() => {
        const firstInput = content.querySelector('input, select, textarea, button');
        firstInput?.focus();
      }, 100);
    },

    close: () => {
      const overlay = document.getElementById('modal-overlay');
      if (!overlay) return;
      overlay.classList.remove('modal-visible');
      document.removeEventListener('keydown', _escapeListener);
    }
  };

  const _escapeListener = (e) => {
    if (e.key === 'Escape') Modal.close();
  };

  // ════════════════════════════════════════════════════════════════════════
  // SISTEMA DE TOAST NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════════════

  const showToast = (message, type = 'success') => {
    // Eliminar toast previo
    document.querySelector('.toast-notification')?.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animar entrada
    requestAnimationFrame(() => toast.classList.add('toast-show'));

    // Auto-dismiss
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  };

  // ════════════════════════════════════════════════════════════════════════
  // SERVICE WORKER
  // ════════════════════════════════════════════════════════════════════════

  const _registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
      console.log('[SW] Service Workers no soportados en este navegador.');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      console.log('[SW] Registrado con éxito. Scope:', registration.scope);

      // Detectar actualización disponible
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.statechange === 'installed' && navigator.serviceWorker.controller) {
            _showUpdateBanner();
          }
        });
      });
    } catch (error) {
      console.warn('[SW] Error al registrar:', error.message);
    }
  };

  const _showUpdateBanner = () => {
    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span>🔄 Nueva versión disponible</span>
      <button onclick="window.location.reload()">Actualizar</button>
    `;
    document.body.appendChild(banner);
  };

  // ════════════════════════════════════════════════════════════════════════
  // UTILS
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
  return { init, navigateTo, Modal, showToast };

})();

// ── Arrancar la app cuando el DOM esté listo ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.CoachApp.App.init();
});
