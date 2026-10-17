/**
 * utils/zip-lite.js — Empaquetador ZIP mínimo (sin dependencias)
 * Coach Management App v1.1.0
 *
 * Crea un ZIP "stored" (sin compresión): los PDF ya vienen comprimidos, así
 * que comprimirlos de nuevo apenas ahorraría espacio y requeriría una librería.
 *
 * Uso:
 *   const blob = window.CoachApp.ZipLite.create([
 *     { name: 'a.pdf', data: Uint8Array }, ...
 *   ]);
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.ZipLite = (() => {

  // Tabla CRC-32 (polinomio 0xEDB88320), calculada una sola vez
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  const crc32 = (bytes) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  // Fecha/hora en formato MS-DOS
  const dosDateTime = (date) => {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day  = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time: time & 0xFFFF, day: day & 0xFFFF };
  };

  /**
   * @param {{name:string, data:Uint8Array}[]} files
   * @returns {Blob} application/zip
   */
  const create = (files) => {
    const enc     = new TextEncoder();
    const parts   = [];   // trozos del archivo final
    const central = [];   // registros del directorio central
    const { time, day } = dosDateTime(new Date());
    let offset = 0;

    files.forEach(({ name, data }) => {
      const nameBytes = enc.encode(name);
      const crc       = crc32(data);
      const size      = data.length;

      // Cabecera local (30 bytes) + nombre; flag bit 11 = nombre en UTF-8
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0,  0x04034B50, true);
      local.setUint16(4,  20, true);
      local.setUint16(6,  0x0800, true);
      local.setUint16(8,  0, true);          // método 0 = stored
      local.setUint16(10, time, true);
      local.setUint16(12, day, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), nameBytes, data);

      // Registro del directorio central (46 bytes) + nombre
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0,  0x02014B50, true);
      cen.setUint16(4,  20, true);
      cen.setUint16(6,  20, true);
      cen.setUint16(8,  0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, time, true);
      cen.setUint16(14, day, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, size, true);
      cen.setUint32(24, size, true);
      cen.setUint16(28, nameBytes.length, true);
      cen.setUint16(30, 0, true);
      cen.setUint16(32, 0, true);
      cen.setUint16(34, 0, true);
      cen.setUint16(36, 0, true);
      cen.setUint32(38, 0, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nameBytes);

      offset += 30 + nameBytes.length + size;
    });

    const centralSize = central.reduce((n, c) => n + c.length, 0);

    // Fin del directorio central (22 bytes)
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0,  0x06054B50, true);
    end.setUint16(8,  files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  };

  return { create, crc32 };

})();
