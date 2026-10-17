/**
 * utils/backup-system.js — Sistema de Respaldo de Datos
 * Coach Management App
 *
 * Maneja la exportación e importación completa de la base de datos
 * en formato JSON para respaldo local.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.BackupSystem = (() => {

  const Storage = () => window.CoachApp.Storage;

  // ════════════════════════════════════════════════════════════════════════
  // EXPORTAR DATOS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Exportar todos los datos como archivo JSON descargable.
   * El archivo se descarga automáticamente en el dispositivo.
   */
  const exportData = async () => {
    try {
      const data = await Storage().exportAll();

      // Serializar a JSON con formato legible
      const jsonString = JSON.stringify(data, null, 2);
      const blob       = new Blob([jsonString], { type: 'application/json' });
      const url        = URL.createObjectURL(blob);

      // Crear enlace de descarga y activarlo
      const a       = document.createElement('a');
      a.href        = url;
      a.download    = `coach-mgmt-backup-${_getDateStamp()}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      // Limpieza
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      console.log('[Backup] Exportación completada:', {
        athletes: data.athletes.length,
        payments:  data.payments.length
      });

      return {
        success:  true,
        athletes: data.athletes.length,
        payments:  data.payments.length,
        filename:  a.download
      };

    } catch (error) {
      console.error('[Backup] Error en exportación:', error);
      throw new Error('No se pudo exportar los datos: ' + error.message);
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // IMPORTAR DATOS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Importar datos desde un archivo JSON seleccionado por el usuario.
   * Retorna una Promesa que se resuelve con el resultado de la importación.
   */
  const importData = () => {
    return new Promise((resolve, reject) => {
      // Crear input de archivo invisible
      const input    = document.createElement('input');
      input.type     = 'file';
      input.accept   = '.json,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        document.body.removeChild(input);

        if (!file) {
          reject(new Error('No se seleccionó ningún archivo.'));
          return;
        }

        try {
          const text = await _readFile(file);
          const data = JSON.parse(text);

          // Validar estructura del archivo
          _validateBackup(data);

          // Importar en la BD
          await Storage().importAll(data);

          console.log('[Backup] Importación completada:', {
            athletes: data.athletes?.length || 0,
            payments:  data.payments?.length  || 0
          });

          resolve({
            success:  true,
            athletes: data.athletes?.length || 0,
            payments:  data.payments?.length  || 0,
            exportedAt: data.exportedAt
          });

        } catch (error) {
          console.error('[Backup] Error en importación:', error);
          reject(new Error('Error al importar: ' + error.message));
        }
      });

      // Activar el selector de archivos
      input.click();

      // Cancelación: si el input pierde el foco sin seleccionar archivo
      input.addEventListener('cancel', () => {
        document.body.removeChild(input);
        reject(new Error('Importación cancelada por el usuario.'));
      });
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ════════════════════════════════════════════════════════════════════════

  /** Leer un File como texto */
  const _readFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = ()  => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });

  /** Validar que el JSON tiene la estructura esperada */
  const _validateBackup = (data) => {
    if (!data)               throw new Error('Archivo vacío o inválido.');
    if (data.app !== 'Coach Management') {
      throw new Error('Este archivo no es un respaldo de Coach Management.');
    }
    if (!Array.isArray(data.athletes)) throw new Error('El archivo no contiene datos de atletas.');
    if (!Array.isArray(data.payments)) throw new Error('El archivo no contiene datos de pagos.');
    if (data.version !== '1.0')        console.warn('[Backup] Versión de respaldo diferente:', data.version);
  };

  /** Generar sello de fecha para el nombre del archivo: "2026-03-13" */
  const _getDateStamp = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const n = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${n}`;
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return { exportData, importData };

})();
