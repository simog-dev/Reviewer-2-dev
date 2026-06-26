/**
 * ThemeManager - Gestisce il tema chiaro/scuro dell'applicazione
 *
 * Supporta tre modalità:
 * - 'auto': Segue il tema di sistema
 * - 'light': Forza modalità chiara
 * - 'dark': Forza modalità scura
 */
class ThemeManager {
  static preference = 'auto';
  static mediaQuery = null;
  static listeners = [];

  /**
   * Inizializza il ThemeManager
   * Carica la preferenza salvata e applica il tema
   */
  static async init() {
    try {
      // Carica preferenza da DB (default: 'auto')
      const savedPreference = await window.api.getSetting('theme');
      this.preference = savedPreference || 'auto';

      // Setup listener per tema sistema
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      // Listener per cambiamenti del tema sistema
      this.mediaQuery.addEventListener('change', () => {
        this.applyTheme();
        this.notifyListeners();
      });

      // Applica tema iniziale
      this.applyTheme();
    } catch (error) {
      console.error('Error initializing ThemeManager:', error);
      // Fallback a tema scuro se c'è un errore
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  /**
   * Applica il tema basandosi sulla preferenza corrente
   */
  static applyTheme() {
    let effectiveTheme;

    if (this.preference === 'auto') {
      // Usa tema sistema
      effectiveTheme = this.mediaQuery.matches ? 'dark' : 'light';
    } else {
      effectiveTheme = this.preference;
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }

  /**
   * Imposta la preferenza del tema
   * @param {string} mode - 'auto', 'light', o 'dark'
   */
  static async setTheme(mode) {
    if (!['auto', 'light', 'dark'].includes(mode)) {
      console.error('Invalid theme mode:', mode);
      return;
    }

    this.preference = mode;

    try {
      await window.api.setSetting('theme', mode);
      this.applyTheme();
      this.notifyListeners();
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  }

  /**
   * Restituisce il tema attualmente applicato ('light' o 'dark')
   * @returns {string}
   */
  static getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme');
  }

  /**
   * Restituisce la preferenza dell'utente ('auto', 'light', o 'dark')
   * @returns {string}
   */
  static getPreference() {
    return this.preference;
  }

  /**
   * Cicla tra i due temi visivi in base al tema attualmente applicato.
   * L'opzione "auto" resta supportata come preferenza salvata, ma il pulsante
   * deve sempre cambiare immediatamente l'aspetto visibile.
   * @returns {string} La nuova preferenza
   */
  static async cycle() {
    const currentTheme = this.getCurrentTheme();
    const nextMode = currentTheme === 'dark' ? 'light' : 'dark';

    await this.setTheme(nextMode);
    return nextMode;
  }

  /**
   * Aggiunge un listener per i cambiamenti del tema
   * @param {Function} callback - Funzione chiamata quando il tema cambia
   */
  static addListener(callback) {
    this.listeners.push(callback);
  }

  /**
   * Rimuove un listener
   * @param {Function} callback
   */
  static removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  /**
   * Notifica tutti i listener registrati
   */
  static notifyListeners() {
    const theme = this.getCurrentTheme();
    const preference = this.getPreference();
    this.listeners.forEach(callback => {
      try {
        callback({ theme, preference });
      } catch (error) {
        console.error('Error in theme listener:', error);
      }
    });
  }
}

export default ThemeManager;
