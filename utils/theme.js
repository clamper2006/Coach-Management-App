/**
 * utils/theme.js — Gestor de Tema Visual (Claro / Oscuro)
 * Coach Management App
 *
 * Aplica el tema guardado al iniciar la app.
 * Persiste la preferencia en localStorage.
 * El tema se aplica mediante el atributo [data-theme] en <html>.
 */

window.CoachApp = window.CoachApp || {};

window.CoachApp.Theme = (() => {

  const STORAGE_KEY = 'coach_mgmt_theme';

  // Temas disponibles
  const THEMES = {
    dark:  'dark',
    light: 'light'
  };

  // ── Aplicar un tema al documento ─────────────────────────────────────────
  const apply = (theme) => {
    const validTheme = Object.values(THEMES).includes(theme) ? theme : THEMES.dark;
    document.documentElement.setAttribute('data-theme', validTheme);
    localStorage.setItem(STORAGE_KEY, validTheme);
    console.log('[Theme] Tema aplicado:', validTheme);
  };

  // ── Obtener el tema actualmente guardado ─────────────────────────────────
  const getCurrent = () => {
    return localStorage.getItem(STORAGE_KEY) || THEMES.dark;
  };

  // ── Alternar entre claro y oscuro ────────────────────────────────────────
  const toggle = () => {
    const next = getCurrent() === THEMES.dark ? THEMES.light : THEMES.dark;
    apply(next);
    return next;
  };

  // ── Inicializar: leer preferencia guardada y aplicarla ───────────────────
  const init = () => {
    apply(getCurrent());
  };

  // ── API pública ──────────────────────────────────────────────────────────
  return { apply, getCurrent, toggle, init, THEMES };

})();
