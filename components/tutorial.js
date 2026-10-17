/**
 * components/tutorial.js — Tutorial Interactivo de Bienvenida
 * Coach Management App
 *
 * Muestra un tutorial paso a paso la primera vez que el usuario abre la app.
 * Se almacena en localStorage si fue completado para no mostrarse de nuevo.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Tutorial = (() => {

  const TUTORIAL_KEY   = 'coach_mgmt_tutorial_done';
  const TUTORIAL_STEPS = [
    {
      icon: `<img src="assets/icons/tutorial-icon.svg" class="tut-icon" alt="">`,
      title: '¡Bienvenido a Coach Management!',
      desc: 'Tu asistente digital para gestionar pagos y atletas de manera simple y rápida. Esta aplicación funciona completamente sin internet una vez instalada.',
      highlight: null,
      tip: '🏀 Diseñado para usarse durante los entrenamientos'
    },
    {
      icon: `<img src="assets/icons/player-icon.svg" class="tut-icon" alt="">`,
      title: 'Registra tus Atletas',
      desc: 'Ve a la sección <strong>Atletas</strong> para agregar a todos los jugadores de tu equipo. Por cada atleta puedes guardar su nombre, edad, teléfono del padre y notas.',
      highlight: '[data-view="athletes"]',
      tip: '👆 Toca el botón ＋ para agregar un atleta nuevo'
    },
    {
      icon: `<img src="assets/icons/paid-icon.svg" class="tut-icon" alt="">`,
      title: 'Registra los Pagos',
      desc: 'En la sección <strong>Pagos</strong> verás las prácticas de la semana. Toca el nombre de un atleta para marcar su pago como <span class="tut-green">✔ Pagado</span> o <span class="tut-red">✘ No Pagado</span>.',
      highlight: '[data-view="payments"]',
      tip: '⚡ Solo un toque para cambiar el estado del pago'
    },
    {
      icon: `<img src="assets/icons/calendar-icon.svg" class="tut-icon" alt="">`,
      title: 'Navega entre Semanas',
      desc: 'En la sección de Pagos puedes usar las flechas ← → para revisar semanas anteriores y ver el historial completo de pagos de tu equipo.',
      highlight: null,
      tip: '📅 La semana actual siempre se abre por defecto'
    },
    {
      icon: `<img src="assets/icons/report-icon.svg" class="tut-icon" alt="">`,
      title: 'Genera Reportes Mensuales',
      desc: 'En la sección <strong>Reportes</strong> puedes generar un PDF completo del mes con el total recaudado, pagos pendientes y el detalle por atleta.',
      highlight: '[data-view="reports"]',
      tip: '📄 El PDF se descarga directamente en tu dispositivo'
    }
  ];

  let _currentStep = 0;
  let _onComplete  = null;

  // ── Verificar si el tutorial ya fue completado ───────────────────────────
  const isCompleted = () => localStorage.getItem(TUTORIAL_KEY) === 'true';

  /** Marcar el tutorial como completado */
  const markCompleted = () => localStorage.setItem(TUTORIAL_KEY, 'true');

  /** Resetear el tutorial (para pruebas desde Ajustes) */
  const reset = () => localStorage.removeItem(TUTORIAL_KEY);

  // ════════════════════════════════════════════════════════════════════════
  // RENDERIZADO DEL TUTORIAL
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Iniciar el tutorial.
   * @param {Function} onComplete - Callback al terminar
   */
  const start = (onComplete = null) => {
    _currentStep = 0;
    _onComplete  = onComplete;
    _render();
  };

  /** Renderizar el overlay del tutorial completo */
  const _render = () => {
    // Eliminar overlay previo si existe
    const existing = document.getElementById('tutorial-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id    = 'tutorial-overlay';
    overlay.innerHTML = `
      <div class="tut-backdrop"></div>
      <div class="tut-container">
        <div class="tut-progress">
          ${TUTORIAL_STEPS.map((_, i) => `
            <div class="tut-dot ${i === _currentStep ? 'active' : i < _currentStep ? 'done' : ''}"></div>
          `).join('')}
        </div>

        <div class="tut-card" id="tut-card">
          <div class="tut-card-icon" id="tut-icon-wrap">
            ${TUTORIAL_STEPS[_currentStep].icon}
          </div>

          <div class="tut-step-badge">
            Paso ${_currentStep + 1} de ${TUTORIAL_STEPS.length}
          </div>

          <h2 class="tut-title" id="tut-title">
            ${TUTORIAL_STEPS[_currentStep].title}
          </h2>

          <p class="tut-desc" id="tut-desc">
            ${TUTORIAL_STEPS[_currentStep].desc}
          </p>

          ${TUTORIAL_STEPS[_currentStep].tip ? `
            <div class="tut-tip">
              <span>${TUTORIAL_STEPS[_currentStep].tip}</span>
            </div>
          ` : ''}
        </div>

        <div class="tut-actions">
          ${_currentStep > 0 ? `
            <button class="tut-btn tut-btn-ghost" id="tut-prev">
              ← Anterior
            </button>
          ` : `<div></div>`}

          <div class="tut-actions-right">
            <button class="tut-btn tut-btn-skip" id="tut-skip">
              Omitir tutorial
            </button>

            <button class="tut-btn tut-btn-primary" id="tut-next">
              ${_currentStep === TUTORIAL_STEPS.length - 1 ? '¡Comenzar!' : 'Siguiente →'}
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Animar entrada
    requestAnimationFrame(() => {
      overlay.classList.add('tut-visible');
    });

    // Eventos
    document.getElementById('tut-next')?.addEventListener('click', _nextStep);
    document.getElementById('tut-prev')?.addEventListener('click', _prevStep);
    document.getElementById('tut-skip')?.addEventListener('click', _skip);

    // Resaltar elemento de la UI si hay highlight
    _applyHighlight(TUTORIAL_STEPS[_currentStep].highlight);
  };

  /** Avanzar al siguiente paso */
  const _nextStep = () => {
    if (_currentStep === TUTORIAL_STEPS.length - 1) {
      _finish();
      return;
    }
    _currentStep++;
    _animateTransition();
  };

  /** Retroceder al paso anterior */
  const _prevStep = () => {
    if (_currentStep > 0) {
      _currentStep--;
      _animateTransition();
    }
  };

  /** Omitir el tutorial */
  const _skip = () => {
    _finish();
  };

  /** Finalizar y cerrar el tutorial */
  const _finish = () => {
    markCompleted();
    _removeHighlight();

    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
      overlay.classList.remove('tut-visible');
      overlay.classList.add('tut-closing');
      setTimeout(() => {
        overlay.remove();
        if (typeof _onComplete === 'function') _onComplete();
      }, 400);
    }
  };

  /** Animar transición entre pasos */
  const _animateTransition = () => {
    const card = document.getElementById('tut-card');
    if (card) {
      card.classList.add('tut-slide-out');
      setTimeout(() => {
        _removeHighlight();
        _render();
      }, 250);
    }
  };

  /** Resaltar elemento de la UI */
  const _applyHighlight = (selector) => {
    _removeHighlight();
    if (!selector) return;

    const el = document.querySelector(selector);
    if (el) {
      el.classList.add('tut-highlight');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  /** Quitar resaltado */
  const _removeHighlight = () => {
    document.querySelectorAll('.tut-highlight').forEach(el => {
      el.classList.remove('tut-highlight');
    });
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return { start, isCompleted, markCompleted, reset };

})();
