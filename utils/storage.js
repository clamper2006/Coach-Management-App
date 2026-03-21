/**
 * utils/storage.js — Capa de acceso a IndexedDB
 * Coach Management App
 *
 * Provee una API de promesas limpia sobre IndexedDB.
 * Todos los módulos acceden a datos exclusivamente a través de este módulo.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Storage = (() => {

  const DB_NAME    = 'coach-management-db';
  const DB_VERSION = 2; // v2: agrega store attendance
  let   _db        = null;

  // ── Apertura y configuración de la base de datos ────────────────────────
  const open = () => new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Se ejecuta cuando la BD se crea por primera vez o se actualiza la versión
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // ── Store: athletes ────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('athletes')) {
        const store = db.createObjectStore('athletes', { keyPath: 'id' });
        store.createIndex('name',      'name',      { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // ── Store: payments ────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('payments')) {
        const store = db.createObjectStore('payments', { keyPath: 'id' });
        store.createIndex('athleteId',       'athleteId',                       { unique: false });
        store.createIndex('practiceId',      'practiceId',                      { unique: false });
        store.createIndex('athletePractice', ['athleteId', 'practiceId'],       { unique: true  });
      }

      // ── Store: settings (clave-valor genérico) ─────────────────────────
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // ── Store: attendance (v2) ─────────────────────────────────────────
      // Registra si un atleta asistió a una práctica.
      // practiceId = "practice-YYYY-MM-DD" (misma clave que en payments).
      if (!db.objectStoreNames.contains('attendance')) {
        const attStore = db.createObjectStore('attendance', { keyPath: 'id' });
        attStore.createIndex('athleteId',       'athleteId',                  { unique: false });
        attStore.createIndex('practiceId',      'practiceId',                 { unique: false });
        attStore.createIndex('athletePractice', ['athleteId', 'practiceId'],  { unique: true  });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      console.log('[Storage] Base de datos abierta:', DB_NAME, 'v' + DB_VERSION);

      // Manejar actualizaciones de versión iniciadas desde otra pestaña
      _db.onversionchange = () => {
        _db.close();
        _db = null;
        window.location.reload();
      };

      resolve(_db);
    };

    request.onerror = () => {
      console.error('[Storage] Error abriendo BD:', request.error);
      reject(request.error);
    };

    request.onblocked = () => {
      console.warn('[Storage] BD bloqueada. Cierre otras pestañas de la app.');
    };
  });

  // ── Utilidad: envolver IDBRequest en Promesa ─────────────────────────────
  const promisify = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });

  // ── Obtener object store dentro de una transacción ───────────────────────
  const getStore = (storeName, mode = 'readonly') => {
    if (!_db) throw new Error('[Storage] BD no inicializada. Llama open() primero.');
    const tx = _db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  };

  // ════════════════════════════════════════════════════════════════════════
  // CRUD Genérico
  // ════════════════════════════════════════════════════════════════════════

  /** Obtener todos los registros de un store */
  const getAll = (storeName) => {
    const store = getStore(storeName, 'readonly');
    return promisify(store.getAll());
  };

  /** Obtener un registro por su clave primaria */
  const getById = (storeName, id) => {
    const store = getStore(storeName, 'readonly');
    return promisify(store.get(id));
  };

  /** Insertar o actualizar un registro */
  const put = (storeName, data) => {
    const store = getStore(storeName, 'readwrite');
    return promisify(store.put(data));
  };

  /** Eliminar un registro por su clave primaria */
  const remove = (storeName, id) => {
    const store = getStore(storeName, 'readwrite');
    return promisify(store.delete(id));
  };

  /** Buscar registros por índice */
  const getByIndex = (storeName, indexName, value) => {
    const store = getStore(storeName, 'readonly');
    const index = store.index(indexName);
    return promisify(index.getAll(value));
  };

  /** Verificar si existe un registro por índice compuesto */
  const getByCompoundIndex = (storeName, indexName, values) => {
    const store = getStore(storeName, 'readonly');
    const index = store.index(indexName);
    return promisify(index.get(values));
  };

  /** Eliminar todos los registros de un store */
  const clearStore = (storeName) => {
    const store = getStore(storeName, 'readwrite');
    return promisify(store.clear());
  };

  // ════════════════════════════════════════════════════════════════════════
  // Helpers de Configuración
  // ════════════════════════════════════════════════════════════════════════

  /** Leer un valor de configuración */
  const getSetting = async (key, defaultValue = null) => {
    try {
      const result = await getById('settings', key);
      return result !== undefined ? result.value : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  /** Guardar un valor de configuración */
  const setSetting = (key, value) => put('settings', { key, value });

  // ════════════════════════════════════════════════════════════════════════
  // Helpers de Pagos
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Obtener el pago de un atleta para una práctica específica.
   * Retorna null si no existe registro.
   */
  const getPayment = (athleteId, practiceId) => {
    return getByCompoundIndex('payments', 'athletePractice', [athleteId, practiceId]);
  };

  /**
   * Obtener todos los pagos de una práctica específica.
   */
  const getPaymentsByPractice = (practiceId) => {
    return getByIndex('payments', 'practiceId', practiceId);
  };

  /**
   * Obtener todos los pagos de un atleta.
   */
  const getPaymentsByAthlete = (athleteId) => {
    return getByIndex('payments', 'athleteId', athleteId);
  };

  // ════════════════════════════════════════════════════════════════════════
  // Helpers de Asistencia
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Obtener el registro de asistencia de un atleta para una práctica.
   */
  const getAttendance = (athleteId, practiceId) => {
    return getByCompoundIndex('attendance', 'athletePractice', [athleteId, practiceId]);
  };

  /**
   * Obtener todos los registros de asistencia de una práctica.
   */
  const getAttendanceByPractice = (practiceId) => {
    return getByIndex('attendance', 'practiceId', practiceId);
  };

  /**
   * Obtener todos los registros de asistencia de un atleta.
   */
  const getAttendanceByAthlete = (athleteId) => {
    return getByIndex('attendance', 'athleteId', athleteId);
  };

  // ════════════════════════════════════════════════════════════════════════
  // Exportación / Importación (Backup System)
  // ════════════════════════════════════════════════════════════════════════

  /** Exportar toda la base de datos como objeto JSON */
  const exportAll = async () => {
    const [athletes, payments, settings, attendance] = await Promise.all([
      getAll('athletes'),
      getAll('payments'),
      getAll('settings'),
      getAll('attendance')
    ]);
    return {
      version:    '1.1',
      app:        'Coach Management',
      exportedAt: new Date().toISOString(),
      athletes,
      payments,
      settings,
      attendance
    };
  };

  /** Importar toda la base de datos desde un objeto JSON */
  const importAll = async (data) => {
    if (!data || data.app !== 'Coach Management') {
      throw new Error('Archivo de respaldo inválido o de otra aplicación.');
    }

    await clearStore('athletes');
    await clearStore('payments');
    await clearStore('settings');
    // attendance puede no existir en respaldos antiguos (v1.0)
    try { await clearStore('attendance'); } catch (_) {}

    const ops = [
      ...(data.athletes   || []).map(r => put('athletes',   r)),
      ...(data.payments   || []).map(r => put('payments',   r)),
      ...(data.settings   || []).map(r => put('settings',   r)),
      ...(data.attendance || []).map(r => put('attendance', r))
    ];

    await Promise.all(ops);
    console.log('[Storage] Importación completada:', {
      athletes:   data.athletes?.length   || 0,
      payments:   data.payments?.length   || 0,
      attendance: data.attendance?.length || 0
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // UUID Helper
  // ════════════════════════════════════════════════════════════════════════

  /** Generar un UUID v4 compatible con todos los navegadores */
  const generateId = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return {
    open,
    // CRUD
    getAll, getById, put, remove,
    getByIndex, getByCompoundIndex, clearStore,
    // Settings
    getSetting, setSetting,
    // Payments
    getPayment, getPaymentsByPractice, getPaymentsByAthlete,
    // Attendance (v2)
    getAttendance, getAttendanceByPractice, getAttendanceByAthlete,
    // Backup
    exportAll, importAll,
    // Utils
    generateId
  };

})();
