/**
 * components/report-modal.js — Modal "Crear reporte" (por atleta)
 * Coach Management App v1.1.0
 *
 * Se abre desde Atletas → ⋮ → Crear reporte.
 *  - Reportes mensuales: selector de meses por año (1 PDF, o ZIP si son varios)
 *  - Reporte general de deudas: todo el historial o meses concretos
 *
 * Solo orquesta la interfaz; el cálculo y los PDF viven en utils/athlete-reports.js.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.ReportModal = (() => {

  const DS      = window.CoachApp.DateSystem;
  const Modal   = () => window.CoachApp.App.Modal;
  const toast   = (msg, type) => window.CoachApp.App.showToast(msg, type);
  const Reports = () => window.CoachApp.AthleteReports;

  // Estado del modal abierto
  let _s = null;
  let _busy = false;   // evita doble generación

  const _esc = (str) => String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const _key = (year, month) => `${year}-${month}`;

  // ════════════════════════════════════════════════════════════════════════
  // APERTURA
  // ════════════════════════════════════════════════════════════════════════

  const open = async (athlete) => {
    if (_busy) return;
    let range;
    try {
      range = await Reports().getAvailableRange(athlete);
    } catch (err) {
      console.error('[ReportModal] Error al leer datos:', err);
      toast('❌ No se pudieron cargar los datos del atleta', 'error');
      return;
    }

    _s = {
      athlete,
      range,
      type:       'monthly',          // 'monthly' | 'debt'
      debtPeriod: 'all',              // 'all' | 'months'
      viewYear:   range.maxYear,      // año actual expandido al abrir
      selected:   new Set()           // claves "YYYY-M" (mes base 0)
    };

    Modal().open(`
      <div id="rpt-root">
        <div class="modal-header rpt-header">
          <div class="rpt-header-text">
            <h3 class="modal-title">Crear reporte</h3>
            <p class="rpt-subtitle">${_esc(athlete.name)}</p>
          </div>
          <button class="modal-close" id="modal-close" aria-label="Cerrar">✕</button>
        </div>
        <div id="rpt-body"></div>
        <div class="rpt-footer">
          <button type="button" class="btn-primary btn-full" id="rpt-generate"></button>
        </div>
      </div>
    `);

    document.getElementById('modal-close')?.addEventListener('click', () => { if (!_busy) Modal().close(); });
    document.getElementById('rpt-root')?.addEventListener('click', _onClick);
    _render();
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDER (solo se reescribe el cuerpo; cabecera y botón se conservan)
  // ════════════════════════════════════════════════════════════════════════

  const _render = () => {
    const body = document.getElementById('rpt-body');
    if (!body || !_s) return;

    const showPicker = _s.type === 'monthly' || (_s.type === 'debt' && _s.debtPeriod === 'months');

    body.innerHTML = `
      <div class="rpt-section-label">Tipo de reporte</div>
      <div class="rpt-seg" role="radiogroup" aria-label="Tipo de reporte">
        ${_segBtn('type', 'monthly', '📅', 'Reportes mensuales',       _s.type === 'monthly')}
        ${_segBtn('type', 'debt',    '💰', 'Reporte general de deudas', _s.type === 'debt')}
      </div>

      ${_s.type === 'debt' ? `
        <div class="rpt-section-label">Período</div>
        <div class="rpt-seg" role="radiogroup" aria-label="Período">
          ${_segBtn('period', 'all',    '🗂️', 'Todo el historial',   _s.debtPeriod === 'all')}
          ${_segBtn('period', 'months', '🗓️', 'Seleccionar meses',   _s.debtPeriod === 'months')}
        </div>
      ` : ''}

      ${showPicker ? _monthPickerHTML() : ''}
    `;
    _updateFooter();
  };

  const _segBtn = (group, value, icon, label, active) => `
    <button type="button" class="rpt-seg-btn ${active ? 'active' : ''}"
            data-group="${group}" data-value="${value}"
            role="radio" aria-checked="${active}" ${_busy ? 'disabled' : ''}>
      <span class="rpt-seg-icon">${icon}</span>
      <span class="rpt-seg-label">${label}</span>
    </button>
  `;

  const _monthPickerHTML = () => {
    const { range, viewYear, selected } = _s;
    const canPrev = viewYear > range.minYear;
    const canNext = viewYear < range.maxYear;

    const cells = DS.MONTH_NAMES.map((name, m) => {
      const outOfRange = (viewYear === range.minYear && m < range.minMonth)
                      || (viewYear === range.maxYear && m > range.maxMonth);
      const isSel = selected.has(_key(viewYear, m));
      return `
        <button type="button" class="rpt-month-btn ${isSel ? 'selected' : ''}"
                data-year="${viewYear}" data-month="${m}"
                aria-pressed="${isSel}" ${outOfRange || _busy ? 'disabled' : ''}>${name}</button>`;
    }).join('');

    const n = selected.size;
    return `
      <div class="rpt-section-label">Meses</div>
      <div class="rpt-year-nav">
        <button type="button" class="rpt-year-btn" data-year-step="-1" aria-label="Año anterior" ${canPrev && !_busy ? '' : 'disabled'}>‹</button>
        <span class="rpt-year-label">${viewYear}</span>
        <button type="button" class="rpt-year-btn" data-year-step="1" aria-label="Año siguiente" ${canNext && !_busy ? '' : 'disabled'}>›</button>
      </div>
      <div class="rpt-month-grid">${cells}</div>
      <div class="rpt-count">${n === 0 ? 'Ningún mes seleccionado' : `${n} mes${n !== 1 ? 'es' : ''} seleccionado${n !== 1 ? 's' : ''}`}</div>
    `;
  };

  const _isValid = () => {
    if (!_s) return false;
    if (_s.type === 'monthly') return _s.selected.size > 0;
    return _s.debtPeriod === 'all' || _s.selected.size > 0;
  };

  const _updateFooter = () => {
    const btn = document.getElementById('rpt-generate');
    if (!btn || !_s) return;
    btn.disabled = _busy || !_isValid();
    btn.classList.toggle('is-loading', _busy);
    btn.innerHTML = _busy
      ? '<span class="rpt-btn-spinner"></span> Generando…'
      : 'Generar reporte';
  };

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS (delegados sobre #rpt-root)
  // ════════════════════════════════════════════════════════════════════════

  const _onClick = (e) => {
    if (_busy || !_s) return;

    const seg = e.target.closest('.rpt-seg-btn');
    if (seg) {
      if (seg.dataset.group === 'type')   _s.type       = seg.dataset.value;
      if (seg.dataset.group === 'period') _s.debtPeriod = seg.dataset.value;
      _render();
      return;
    }

    const step = e.target.closest('[data-year-step]');
    if (step) {
      const next = _s.viewYear + Number(step.dataset.yearStep);
      if (next >= _s.range.minYear && next <= _s.range.maxYear) { _s.viewYear = next; _render(); }
      return;
    }

    const mBtn = e.target.closest('.rpt-month-btn');
    if (mBtn && !mBtn.disabled) {
      const k = _key(Number(mBtn.dataset.year), Number(mBtn.dataset.month));
      _s.selected.has(k) ? _s.selected.delete(k) : _s.selected.add(k);
      _render();
      return;
    }

    if (e.target.closest('#rpt-generate')) _generate();
  };

  const _selectedMonths = () => [..._s.selected].map(k => {
    const [year, month] = k.split('-').map(Number);
    return { year, month };
  }).sort((a, b) => (a.year - b.year) || (a.month - b.month));

  // ════════════════════════════════════════════════════════════════════════
  // GENERACIÓN
  // ════════════════════════════════════════════════════════════════════════

  const _tick = () => new Promise(r => setTimeout(r, 30));   // deja pintar el estado de carga

  const _generate = async () => {
    if (_busy || !_isValid()) return;
    _busy = true;
    _render();
    await _tick();

    const R = Reports();
    const { athlete } = _s;

    try {
      const ctx = await R.loadContext(athlete);

      if (_s.type === 'monthly') {
        const months = _selectedMonths();
        const files  = [];
        for (const { year, month } of months) {
          files.push(await R.generateMonthlyReport(athlete, year, month, ctx));
          await _tick();
        }

        if (files.length === 1) {
          R.downloadBlob(files[0].blob, files[0].filename);
          toast('✅ Reporte descargado');
        } else {
          R.downloadBlob(await R.zipPdfs(files), R.zipFilename(athlete, months));
          toast(`✅ ${files.length} reportes descargados en un ZIP`);
        }
      } else {
        const period = _s.debtPeriod === 'all'
          ? { mode: 'all' }
          : { mode: 'months', months: _selectedMonths() };
        const file = await R.generateDebtReport(athlete, period, ctx);
        R.downloadBlob(file.blob, file.filename);
        toast('✅ Reporte de deudas descargado');
      }

      _busy = false;
      // Cerrar solo si el modal sigue siendo este (el usuario pudo cerrarlo o abrir otro)
      if (document.getElementById('rpt-root')) Modal().close();
      _s = null;
    } catch (err) {
      console.error('[ReportModal] Error al generar reporte:', err);
      _busy = false;
      toast(`❌ ${err?.message?.includes('jsPDF') ? err.message : 'Error al generar el reporte'}`, 'error');
      _render();
    }
  };

  return { open };

})();
