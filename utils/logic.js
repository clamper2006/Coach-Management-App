/**
 * utils/logic.js — Fuente Única de Verdad: Lógica de Negocio
 * Coach Management App v1.0.1
 *
 * REGLA CENTRAL INMUTABLE:
 *   Un atleta SOLO genera deuda si asistió Y no pagó.
 *   Si no asistió (sea false o null) → NO genera deuda en ningún caso.
 *   Si tiene Ayuda Social → NUNCA genera deuda de pago.
 *
 * Este módulo es importado por:
 *   - components/athletes.js   (PDF individual)
 *   - components/calendar.js   (reportes en app)
 *   - utils/pdf-report.js      (PDF mensual)
 *
 * ╔══════════════════════════════════════════════════════╗
 * ║  Tabla de verdad (THE SOURCE OF TRUTH)              ║
 * ╠══════════════╦════════╦═══════════╦═════════════════╣
 * ║  asistio     ║  pago  ║  Resultado ║  ¿Es deuda?    ║
 * ╠══════════════╬════════╬═══════════╬═════════════════╣
 * ║  true        ║  paid  ║  'paid'   ║  NO             ║
 * ║  true        ║  other ║  'unpaid' ║  SÍ             ║
 * ║  false       ║  any   ║  null     ║  NO             ║
 * ║  null/undef  ║  any   ║  null     ║  NO             ║
 * ║  any         ║  any   ║  null     ║  NO (ayudaSoc.) ║
 * ╚══════════════╩════════╩═══════════╩═════════════════╝
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Logic = (() => {

  // ════════════════════════════════════════════════════════════════════════
  // FUNCIÓN PRINCIPAL — estado de pago para una práctica
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Determina el estado de pago efectivo de un atleta para una práctica.
   *
   * @param {boolean|undefined} asistio    - true/false/undefined (sin registro)
   * @param {string|undefined}  payStatus  - 'paid' | 'unpaid' | undefined
   * @param {boolean}           ayudaSocial
   *
   * @returns {'paid' | 'unpaid' | null}
   *   'paid'   → asistió y pagó
   *   'unpaid' → asistió y NO pagó (GENERA DEUDA)
   *   null     → no asistió o sin registro (NO GENERA DEUDA)
   */
  const getPaymentStatus = (asistio, payStatus, ayudaSocial = false) => {
    // Ayuda social: nunca genera deuda de pago
    if (ayudaSocial) return null;

    // No asistió o sin registro de asistencia → sin deuda
    if (asistio !== true) return null;

    // Asistió: el estado depende del pago
    return payStatus === 'paid' ? 'paid' : 'unpaid';
  };

  /**
   * ¿Este caso genera deuda?
   * @returns {boolean}
   */
  const isDebt = (asistio, payStatus, ayudaSocial = false) => {
    return getPaymentStatus(asistio, payStatus, ayudaSocial) === 'unpaid';
  };

  // ════════════════════════════════════════════════════════════════════════
  // ESTADÍSTICAS DE ATLETA PARA UN CONJUNTO DE PRÁCTICAS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Calcula las estadísticas de un atleta para una lista de prácticas pasadas.
   *
   * @param {string}   athleteId
   * @param {boolean}  ayudaSocial
   * @param {string[]} practiceIds      - IDs de prácticas pasadas
   * @param {Object}   payMap           - { [practiceId]: 'paid'|'unpaid' }
   * @param {Object}   attMap           - { [practiceId]: true|false|undefined }
   *
   * @returns {{ attended, paid, unpaid, notDebt }}
   *   attended  → total asistencias
   *   paid      → total pagos válidos (asistió + pagó)
   *   unpaid    → total deudas reales (asistió + no pagó)
   *   notDebt   → prácticas sin deuda (no asistió o ayuda social)
   */
  const calcAthleteStats = (athleteId, ayudaSocial, practiceIds, payMap, attMap) => {
    let attended = 0, paid = 0, unpaid = 0, notDebt = 0;

    for (const pid of practiceIds) {
      const asistio   = attMap[pid];
      const payStatus = payMap[pid];
      const result    = getPaymentStatus(asistio, payStatus, ayudaSocial);

      if (asistio === true) attended++;
      if (result === 'paid')   paid++;
      if (result === 'unpaid') unpaid++;
      if (result === null)     notDebt++;
    }

    return { attended, paid, unpaid, notDebt };
  };

  /**
   * Calcula estadísticas globales de un mes para todos los atletas.
   *
   * @param {Object[]} athletes
   * @param {Object[]} payments    - [ { athleteId, practiceId, status } ]
   * @param {Object[]} attendances - [ { athleteId, practiceId, asistio } ]
   * @param {string[]} practiceIds - IDs de prácticas pasadas del mes
   *
   * @returns {{ totalAttended, totalPaid, totalUnpaid, totalExpected }}
   */
  const calcMonthStats = (athletes, payments, attendances, practiceIds) => {
    // Mapas rápidos por [athleteId][practiceId]
    const payIndex = {};
    const attIndex = {};
    payments.forEach(p => {
      if (!payIndex[p.athleteId]) payIndex[p.athleteId] = {};
      payIndex[p.athleteId][p.practiceId] = p.status;
    });
    attendances.forEach(a => {
      if (!attIndex[a.athleteId]) attIndex[a.athleteId] = {};
      attIndex[a.athleteId][a.practiceId] = a.asistio;
    });

    let totalAttended = 0, totalPaid = 0, totalUnpaid = 0;

    for (const athlete of athletes) {
      const payMap = payIndex[athlete.id] || {};
      const attMap = attIndex[athlete.id] || {};
      const stats  = calcAthleteStats(athlete.id, athlete.ayudaSocial, practiceIds, payMap, attMap);
      totalAttended += stats.attended;
      totalPaid     += stats.paid;
      totalUnpaid   += stats.unpaid;
    }

    return { totalAttended, totalPaid, totalUnpaid };
  };

  /**
   * Construye un mapa de pagos indexado por practiceId para un atleta dado.
   * Helper para no repetir .find() en loops.
   *
   * @param {Object[]} payments  - todos los pagos del atleta
   * @returns {Object} { [practiceId]: 'paid'|'unpaid' }
   */
  const buildPayMap = (payments) => {
    const map = {};
    payments.forEach(p => { map[p.practiceId] = p.status; });
    return map;
  };

  /**
   * Construye un mapa de asistencia indexado por practiceId.
   *
   * @param {Object[]} attendances
   * @returns {Object} { [practiceId]: boolean }
   */
  const buildAttMap = (attendances) => {
    const map = {};
    attendances.forEach(a => { map[a.practiceId] = a.asistio; });
    return map;
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return {
    getPaymentStatus,
    isDebt,
    calcAthleteStats,
    calcMonthStats,
    buildPayMap,
    buildAttMap
  };

})();
