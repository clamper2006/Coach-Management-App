/**
 * utils/date-system.js — Sistema de fechas y prácticas
 * Coach Management App
 *
 * Maneja toda la lógica de fechas, semanas ISO, y detección automática
 * de días de práctica. Las prácticas se generan dinámicamente (no se almacenan).
 *
 * Convención: días de semana en formato ISO (1=Lunes ... 7=Domingo)
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.DateSystem = (() => {

  // ════════════════════════════════════════════════════════════════════════
  // Constantes
  // ════════════════════════════════════════════════════════════════════════

  const DAY_NAMES_FULL = {
    1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
    4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo'
  };

  const DAY_NAMES_SHORT = {
    1: 'Lun', 2: 'Mar', 3: 'Mié',
    4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom'
  };

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const MONTH_NAMES_SHORT = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];

  // ════════════════════════════════════════════════════════════════════════
  // Conversión de días (JS ↔ ISO)
  // ════════════════════════════════════════════════════════════════════════

  /** Convertir getDay() de JS (0=Dom) a ISO (1=Lun, 7=Dom) */
  const jsToIsoDay = (jsDay) => jsDay === 0 ? 7 : jsDay;

  /** Convertir ISO day (1=Lun) a offset desde Lunes (0-6) */
  const isoToOffset = (isoDay) => isoDay - 1;

  // ════════════════════════════════════════════════════════════════════════
  // Operaciones con semanas
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Obtener el número de semana ISO y el año de una fecha.
   * Retorna [año, semana] ej: [2026, 11]
   */
  const getISOWeek = (date) => {
    const d    = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day  = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum   = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return [d.getUTCFullYear(), weekNum];
  };

  /**
   * Obtener la clave de semana en formato "YYYY-WNN"
   * Ej: "2026-W11"
   */
  const getWeekKey = (date) => {
    const [year, week] = getISOWeek(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  };

  /**
   * Obtener el lunes (inicio) de la semana que contiene la fecha dada.
   */
  const getMondayOfWeek = (date) => {
    const d    = new Date(date);
    const day  = d.getDay(); // 0=Dom
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  /**
   * Desplazar una fecha por N semanas (positivo=futuro, negativo=pasado)
   */
  const shiftWeeks = (date, offset) => {
    const d = new Date(date);
    d.setDate(d.getDate() + offset * 7);
    return d;
  };

  // ════════════════════════════════════════════════════════════════════════
  // Prácticas
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Obtener las fechas de práctica de una semana dada.
   * @param {Date}     referenceDate - Cualquier fecha dentro de la semana
   * @param {number[]} practiceDays  - Días ISO ej: [1, 3, 5]
   * @returns {Date[]} Array de fechas de práctica ordenadas
   */
  const getPracticeDatesInWeek = (referenceDate, practiceDays) => {
    const monday  = getMondayOfWeek(referenceDate);
    const sorted  = [...practiceDays].sort((a, b) => a - b);
    return sorted.map(isoDay => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + isoToOffset(isoDay));
      d.setHours(0, 0, 0, 0);
      return d;
    });
  };

  /**
   * Generar el ID determinístico de una práctica a partir de su fecha.
   * Formato: "practice-YYYY-MM-DD"
   * Ej:      "practice-2026-03-13"
   */
  const getPracticeId = (date) => {
    const d   = new Date(date);
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `practice-${y}-${m}-${day}`;
  };

  /**
   * Parsear un practiceId de regreso a Date.
   * "practice-2026-03-13" → Date(2026, 2, 13)
   */
  const parsePracticeId = (practiceId) => {
    const parts = practiceId.replace('practice-', '').split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  };

  /**
   * Verificar si la fecha de hoy es un día de práctica.
   * @returns {string|null} practiceId si hoy es práctica, null si no
   */
  const getTodayPracticeId = (practiceDays) => {
    const today   = new Date();
    const isoDay  = jsToIsoDay(today.getDay());
    if (practiceDays.includes(isoDay)) {
      return getPracticeId(today);
    }
    return null;
  };

  /**
   * Obtener la próxima fecha de práctica desde hoy (incluye hoy si es día de práctica).
   */
  const getNextPracticeDate = (practiceDays) => {
    const today  = new Date();
    today.setHours(0, 0, 0, 0);
    const sorted = [...practiceDays].sort((a, b) => a - b);

    for (let i = 0; i <= 14; i++) {
      const d      = new Date(today);
      d.setDate(today.getDate() + i);
      const isoDay = jsToIsoDay(d.getDay());
      if (sorted.includes(isoDay)) return d;
    }
    return null;
  };

  /**
   * Obtener todas las fechas de práctica en un mes dado.
   * @param {number}   year         - Año (ej: 2026)
   * @param {number}   month        - Mes base 0 (0=Enero, 11=Diciembre)
   * @param {number[]} practiceDays - Días ISO
   */
  const getPracticeDatesInMonth = (year, month, practiceDays) => {
    const dates    = [];
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const sorted   = [...practiceDays].sort((a, b) => a - b);

    let current = new Date(firstDay);
    while (current <= lastDay) {
      const isoDay = jsToIsoDay(current.getDay());
      if (sorted.includes(isoDay)) {
        dates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  // ════════════════════════════════════════════════════════════════════════
  // Comparaciones de fechas
  // ════════════════════════════════════════════════════════════════════════

  /** Verificar si dos fechas son el mismo día */
  const isSameDay = (a, b) => {
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear()
        && da.getMonth()    === db.getMonth()
        && da.getDate()     === db.getDate();
  };

  /** Verificar si una fecha es hoy */
  const isToday = (date) => isSameDay(date, new Date());

  /** Verificar si una fecha es en el futuro (después de hoy) */
  const isFuture = (date) => {
    const d     = new Date(date); d.setHours(0, 0, 0, 0);
    const today = new Date();     today.setHours(0, 0, 0, 0);
    return d > today;
  };

  /** Verificar si una fecha es en el pasado (antes de hoy) */
  const isPast = (date) => {
    const d     = new Date(date); d.setHours(0, 0, 0, 0);
    const today = new Date();     today.setHours(0, 0, 0, 0);
    return d < today;
  };

  // ════════════════════════════════════════════════════════════════════════
  // Formateo de fechas
  // ════════════════════════════════════════════════════════════════════════

  /** Formato largo: "Viernes, 13 de Marzo" */
  const formatDateLong = (date) => {
    const d      = new Date(date);
    const isoDay = jsToIsoDay(d.getDay());
    return `${DAY_NAMES_FULL[isoDay]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
  };

  /** Formato corto: "13/03" */
  const formatDateShort = (date) => {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  };

  /** Formato para encabezado de semana: "10 - 15 Mar 2026" */
  const formatWeekRange = (referenceDate) => {
    const monday = getMondayOfWeek(referenceDate);
    const friday = new Date(monday); friday.setDate(monday.getDate() + 4);
    const m      = MONTH_NAMES_SHORT[monday.getMonth()];
    const y      = monday.getFullYear();
    return `${monday.getDate()} – ${friday.getDate()} ${m} ${y}`;
  };

  /** Formato de mes completo: "Marzo 2026" */
  const formatMonth = (year, month) => `${MONTH_NAMES[month]} ${year}`;

  /** Retornar fecha en formato ISO YYYY-MM-DD */
  const toISODate = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return {
    // Constantes
    DAY_NAMES_FULL, DAY_NAMES_SHORT, MONTH_NAMES, MONTH_NAMES_SHORT,
    // Conversión
    jsToIsoDay, isoToOffset,
    // Semanas
    getISOWeek, getWeekKey, getMondayOfWeek, shiftWeeks,
    // Prácticas
    getPracticeDatesInWeek, getPracticeId, parsePracticeId,
    getTodayPracticeId, getNextPracticeDate, getPracticeDatesInMonth,
    // Comparaciones
    isSameDay, isToday, isFuture, isPast,
    // Formateo
    formatDateLong, formatDateShort, formatWeekRange, formatMonth, toISODate
  };

})();
