import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AcademicSessionContext = createContext(null);

export const AVAILABLE_SESSIONS = [
  '2026/2027',
  '2027/2028',
  '2028/2029',
  '2029/2030'
];
export const DEFAULT_SESSION = '2026/2027';
export const DEFAULT_TERM = '1st Term';
export const TERM_OPTIONS = ['1st Term', '2nd Term', '3rd Term'];

export function AcademicSessionProvider({ children, onShowToast = null }) {
  const [currentSession, setCurrentSession] = useState(() => {
    try {
      const stored = localStorage.getItem('awba_active_session');
      if (stored && stored !== '2025/2026' && !stored.includes('2025')) {
        return stored;
      }
      return DEFAULT_SESSION;
    } catch (_) {
      return DEFAULT_SESSION;
    }
  });

  const [currentTerm, setCurrentTerm] = useState(() => {
    try {
      return localStorage.getItem('awba_active_term') || DEFAULT_TERM;
    } catch (_) {
      return DEFAULT_TERM;
    }
  });

  const [availableTerms, setAvailableTerms] = useState(TERM_OPTIONS);
  const [availableSessions, setAvailableSessions] = useState(AVAILABLE_SESSIONS);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial active term & session from backend on mount
  useEffect(() => {
    let isMounted = true;
    fetch('/api/admin/active-context')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && data.success) {
          if (data.term || data.active_term) {
            const activeT = data.term || data.active_term;
            setCurrentTerm(activeT);
            try {
              localStorage.setItem('awba_active_term', activeT);
            } catch (_) {}
          }
          if (data.session || data.academic_session) {
            let activeS = data.session || data.academic_session;
            if (activeS === '2025/2026' || activeS.includes('2025')) {
              activeS = DEFAULT_SESSION;
            }
            setCurrentSession(activeS);
            try {
              localStorage.setItem('awba_active_session', activeS);
            } catch (_) {}
          }
          if (Array.isArray(data.terms)) {
            const names = data.terms.map((t) => t.name || t);
            if (names.length > 0) setAvailableTerms(names);
          }
        }
      })
      .catch((err) => console.log('Notice: Academic active-context API load fallback active', err));

    return () => {
      isMounted = false;
    };
  }, []);

  // Update backend and synchronize all views for Term changes
  const changeTerm = useCallback(async (newTerm) => {
    if (!newTerm) return;
    const targetSession = currentSession || DEFAULT_SESSION;

    // 1. Optimistic state and storage updates
    setCurrentTerm(newTerm);
    try {
      localStorage.setItem('awba_active_term', newTerm);
      localStorage.setItem('awba_active_session', targetSession);
    } catch (_) {}

    // 2. Dispatch custom window event so any non-React listeners or external tabs sync
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('academic-term-changed', {
          detail: { term: newTerm, session: targetSession },
        })
      );
    }

    // 3. Persist to Backend SQLite
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/active-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: newTerm, session: targetSession }),
      });
      const data = await res.json();
      if (data && data.success) {
        if (typeof onShowToast === 'function') {
          onShowToast(`Active Academic Term switched to ${newTerm} (${targetSession})`, 'success');
        }
      } else {
        if (typeof onShowToast === 'function') {
          onShowToast(data?.message || 'Failed to update academic term on server.', 'error');
        }
      }
    } catch (err) {
      console.warn('Academic term update notice:', err);
      if (typeof onShowToast === 'function') {
        onShowToast(`Active term set to ${newTerm} locally`, 'info');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentSession, onShowToast]);

  // When changing session, AUTOMATICALLY reset term to '1st Term'
  const changeSession = useCallback(async (newSession) => {
    if (!newSession) return;
    const targetTerm = DEFAULT_TERM; // Auto-reset to '1st Term'

    // 1. Optimistic state and storage updates
    setCurrentSession(newSession);
    setCurrentTerm(targetTerm);
    try {
      localStorage.setItem('awba_active_session', newSession);
      localStorage.setItem('awba_active_term', targetTerm);
    } catch (_) {}

    // 2. Dispatch custom window event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('academic-term-changed', {
          detail: { session: newSession, term: targetTerm },
        })
      );
    }

    // 3. Persist to Backend SQLite
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/active-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: newSession, term: targetTerm }),
      });
      const data = await res.json();
      if (data && data.success) {
        if (typeof onShowToast === 'function') {
          onShowToast(`Switched to ${newSession} Session • ${targetTerm}`, 'success');
        }
      } else {
        if (typeof onShowToast === 'function') {
          onShowToast(data?.message || 'Failed to update academic session on server.', 'error');
        }
      }
    } catch (err) {
      console.warn('Academic session update notice:', err);
      if (typeof onShowToast === 'function') {
        onShowToast(`Active session set to ${newSession} • ${targetTerm} locally`, 'info');
      }
    } finally {
      setIsLoading(false);
    }
  }, [onShowToast]);

  const value = {
    currentSession,
    currentTerm,
    activeSession: currentSession,
    activeTerm: currentTerm,
    session: currentSession,
    term: currentTerm,
    termOptions: availableTerms,
    availableTerms,
    sessionOptions: availableSessions,
    availableSessions,
    changeTerm,
    changeSession,
    setTerm: changeTerm,
    setSession: changeSession,
    setSelectedTerm: changeTerm,
    setSelectedSession: changeSession,
    isLoading,
  };

  return (
    <AcademicSessionContext.Provider value={value}>
      {children}
    </AcademicSessionContext.Provider>
  );
}

export function useAcademicSession() {
  const context = useContext(AcademicSessionContext);
  if (!context) {
    // Graceful fallback if used outside provider
    const fallbackTerm = (() => {
      try {
        return localStorage.getItem('awba_active_term') || DEFAULT_TERM;
      } catch (_) {
        return DEFAULT_TERM;
      }
    })();
    const fallbackSession = (() => {
      try {
        const stored = localStorage.getItem('awba_active_session');
        if (stored && stored !== '2025/2026' && !stored.includes('2025')) {
          return stored;
        }
        return DEFAULT_SESSION;
      } catch (_) {
        return DEFAULT_SESSION;
      }
    })();

    return {
      currentSession: fallbackSession,
      currentTerm: fallbackTerm,
      activeSession: fallbackSession,
      activeTerm: fallbackTerm,
      session: fallbackSession,
      term: fallbackTerm,
      termOptions: TERM_OPTIONS,
      availableTerms: TERM_OPTIONS,
      sessionOptions: AVAILABLE_SESSIONS,
      availableSessions: AVAILABLE_SESSIONS,
      changeTerm: () => {},
      changeSession: () => {},
      setTerm: () => {},
      setSession: () => {},
      setSelectedTerm: () => {},
      setSelectedSession: () => {},
      isLoading: false,
    };
  }
  return context;
}

export default AcademicSessionContext;
