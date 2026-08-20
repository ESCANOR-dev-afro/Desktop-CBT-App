/**
 * storageService.js
 * LocalStorage persistence & crash recovery service for Student CBT Client.
 * Caches student credentials, active subject ID, exam session token, real-time answers, and flagged items.
 */

const STORAGE_KEYS = {
  ACTIVE_SESSION: 'cbt_active_session',
  ANSWERS_PREFIX: 'cbt_answers_',
  FLAGGED_PREFIX: 'cbt_flagged_',
};

export const storageService = {
  /**
   * Save active student login session metadata
   */
  saveActiveSession: (sessionData) => {
    try {
      if (!sessionData) return;
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(sessionData));
    } catch (e) {
      console.warn('⚠️ storageService: Error saving active session:', e);
    }
  },

  /**
   * Get active student login session metadata
   */
  getActiveSession: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('⚠️ storageService: Error reading active session:', e);
      return null;
    }
  },

  /**
   * Clear active student login session metadata
   */
  clearActiveSession: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    } catch (e) {
      console.warn('⚠️ storageService: Error clearing active session:', e);
    }
  },

  /**
   * Generate key for student answers or flagged items
   */
  getKey: (prefix, regNumber, subjectId) => {
    const reg = (regNumber || 'GUEST').toUpperCase().replace(/\s+/g, '_');
    const sub = String(subjectId || 'GENERAL').replace(/\s+/g, '_');
    return `${prefix}${reg}_${sub}`;
  },

  /**
   * Real-time answer selection persistence (called on every click)
   */
  saveAnswers: (regNumber, subjectId, answersMap) => {
    try {
      const key = storageService.getKey(STORAGE_KEYS.ANSWERS_PREFIX, regNumber, subjectId);
      localStorage.setItem(key, JSON.stringify(answersMap || {}));
    } catch (e) {
      console.warn('⚠️ storageService: Error saving answers:', e);
    }
  },

  /**
   * Retrieve cached answers map on resume / crash recovery
   */
  getAnswers: (regNumber, subjectId) => {
    try {
      const key = storageService.getKey(STORAGE_KEYS.ANSWERS_PREFIX, regNumber, subjectId);
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('⚠️ storageService: Error reading answers:', e);
      return {};
    }
  },

  /**
   * Clear cached answers map after exam submission
   */
  clearAnswers: (regNumber, subjectId) => {
    try {
      const key = storageService.getKey(STORAGE_KEYS.ANSWERS_PREFIX, regNumber, subjectId);
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('⚠️ storageService: Error clearing answers:', e);
    }
  },

  /**
   * Real-time flagged questions persistence
   */
  saveFlagged: (regNumber, subjectId, flaggedData) => {
    try {
      const key = storageService.getKey(STORAGE_KEYS.FLAGGED_PREFIX, regNumber, subjectId);
      localStorage.setItem(key, JSON.stringify(flaggedData || {}));
    } catch (e) {
      console.warn('⚠️ storageService: Error saving flagged items:', e);
    }
  },

  /**
   * Retrieve cached flagged questions on resume / crash recovery
   */
  getFlagged: (regNumber, subjectId) => {
    try {
      const key = storageService.getKey(STORAGE_KEYS.FLAGGED_PREFIX, regNumber, subjectId);
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('⚠️ storageService: Error reading flagged items:', e);
      return {};
    }
  },

  /**
   * Clear cached flagged questions after exam submission
   */
  clearFlagged: (regNumber, subjectId) => {
    try {
      const key = storageService.getKey(STORAGE_KEYS.FLAGGED_PREFIX, regNumber, subjectId);
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('⚠️ storageService: Error clearing flagged items:', e);
    }
  },

  /**
   * Clear all CBT exam-related data from localStorage (session, answers, flagged)
   * Called on full logout / session reset
   */
  clearAllExamData: () => {
    try {
      storageService.clearActiveSession();
      // Remove all keys matching CBT answer and flagged prefixes
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith(STORAGE_KEYS.ANSWERS_PREFIX) ||
            key.startsWith(STORAGE_KEYS.FLAGGED_PREFIX))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (e) {
      console.warn('⚠️ storageService: Error clearing all exam data:', e);
    }
  },
};

export default storageService;
