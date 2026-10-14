/**
 * autosaveQueueService.js
 * 
 * Resilient Offline Autosave Buffering & Silent Retry Queue for Student CBT Portal.
 * Automatically persists answer selections to localStorage immediately on click,
 * and maintains an asynchronous queue that retries syncing to the backend every 2.5s
 * during temporary LAN packet drops or Wi-Fi reconnects.
 * 
 * 100% Offline Air-Gapped Resilient.
 */

import apiClient from '../api';

class AutosaveQueueService {
  constructor() {
    this.queue = [];
    this.isFlushing = false;
    this.syncStatus = 'SAVED'; // 'SAVED' | 'SYNCING' | 'RECONNECTING'
    this.listeners = new Set();
    this.activeSessionId = null;
    this.retryTimer = null;
    this.initRetryLoop();
  }

  /**
   * Initializes or binds to an active exam session
   */
  initSession(sessionId, initialAnswers = {}) {
    this.activeSessionId = sessionId || 'current';
    this.loadPersistedQueue();

    // Persist initial state if present
    if (initialAnswers && Object.keys(initialAnswers).length > 0) {
      try {
        localStorage.setItem(`active_exam_${this.activeSessionId}`, JSON.stringify(initialAnswers));
      } catch (e) {}
    }
  }

  /**
   * Load any un-synced items from localStorage
   */
  loadPersistedQueue() {
    if (!this.activeSessionId) return;
    try {
      const saved = localStorage.getItem(`cbt_pending_queue_${this.activeSessionId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.queue = parsed;
          this.updateStatus('RECONNECTING');
        }
      }
    } catch (e) {
      console.warn('Failed to load persisted autosave queue:', e);
    }
  }

  /**
   * Persist pending items to localStorage
   */
  persistQueue() {
    if (!this.activeSessionId) return;
    try {
      if (this.queue.length > 0) {
        localStorage.setItem(`cbt_pending_queue_${this.activeSessionId}`, JSON.stringify(this.queue));
      } else {
        localStorage.removeItem(`cbt_pending_queue_${this.activeSessionId}`);
      }
    } catch (e) {}
  }

  /**
   * Periodic background retry timer (every 2.5 seconds)
   */
  initRetryLoop() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flushQueue();
      }
    }, 2500);
  }

  /**
   * Subscribe to sync state changes
   * @param {Function} listener - callback receiving (status: string, pendingCount: number)
   * @returns {Function} unsubscribe
   */
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.syncStatus, this.queue.length);
    return () => this.listeners.delete(listener);
  }

  /**
   * Internal status broadcaster
   */
  updateStatus(newStatus) {
    this.syncStatus = newStatus;
    const count = this.queue.length;
    this.listeners.forEach((fn) => {
      try {
        fn(this.syncStatus, count);
      } catch (err) {}
    });
  }

  /**
   * Enqueues an answer selection delta and triggers background sync.
   * Immediately persists full state to browser storage.
   */
  enqueue(payload) {
    const sessId = payload.sessionId || this.activeSessionId || 'current';
    this.activeSessionId = sessId;

    // 1. Immediately persist full state to browser storage
    if (payload.answers) {
      try {
        localStorage.setItem(`active_exam_${sessId}`, JSON.stringify(payload.answers));
      } catch (e) {
        console.warn('LocalStorage active_exam save error:', e);
      }
    }

    // 2. Prepare lightweight delta payload (no bloated answers map sent over LAN)
    const item = {
      student_id: payload.studentId || payload.student_id,
      studentId: payload.studentId || payload.student_id,
      regNumber: payload.regNumber || payload.reg_number,
      reg_number: payload.regNumber || payload.reg_number,
      subject: payload.subject,
      subject_name: payload.subject,
      question_id: payload.questionId || payload.question_id,
      questionId: payload.questionId || payload.question_id,
      selected_option: payload.selectedOption || payload.selected_option,
      selectedOption: payload.selectedOption || payload.selected_option,
      timestamp: payload.timestamp || Date.now(),
      sessionId: sessId,
    };

    // Filter out previous pending requests for the same question to coalesce network requests
    this.queue = this.queue.filter(
      (q) => !(q.question_id && q.question_id === item.question_id)
    );
    this.queue.push(item);
    this.persistQueue();

    this.updateStatus('SYNCING');
    this.flushQueue();
  }

  /**
   * Flushes pending items to the server with single-delta or bulk-batch coalescing
   */
  async flushQueue() {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    try {
      while (this.queue.length > 0) {
        if (this.queue.length === 1) {
          // Single-item delta post (<150 bytes payload, <5ms DB query)
          const item = this.queue[0];
          try {
            const res = await apiClient.post('/exam/autosave', item, {
              timeout: 3500,
            });

            if (res && res.status >= 200 && res.status < 300) {
              this.queue.shift();
              this.persistQueue();
            } else {
              throw new Error(`Server returned HTTP ${res?.status}`);
            }
          } catch (postErr) {
            console.warn('⚠️ [Autosave Queue] Network drop detected. Silent retry queued:', postErr.message);
            this.updateStatus('RECONNECTING');
            this.isFlushing = false;
            return;
          }
        } else {
          // Multi-item coalesced batch post (sync entire backlog in a single roundtrip)
          const batch = [...this.queue];
          const first = batch[0];
          const batchPayload = {
            studentId: first.studentId || first.student_id,
            student_id: first.studentId || first.student_id,
            regNumber: first.regNumber || first.reg_number,
            reg_number: first.regNumber || first.reg_number,
            subject: first.subject || first.subject_name,
            sessionId: first.sessionId,
            answers: batch.map(b => ({
              question_id: b.question_id || b.questionId,
              selected_option: b.selected_option || b.selectedOption,
            })),
          };

          try {
            const res = await apiClient.post('/exam/autosave', batchPayload, {
              timeout: 4500,
            });

            if (res && res.status >= 200 && res.status < 300) {
              this.queue.splice(0, batch.length);
              this.persistQueue();
            } else {
              throw new Error(`Server returned HTTP ${res?.status}`);
            }
          } catch (batchErr) {
            console.warn('⚠️ [Autosave Queue] Bulk batch retry queued:', batchErr.message);
            this.updateStatus('RECONNECTING');
            this.isFlushing = false;
            return;
          }
        }
      }

      // All items flushed
      this.updateStatus('SAVED');
    } catch (err) {
      console.warn('⚠️ [Autosave Queue Exception]:', err.message);
      this.updateStatus('RECONNECTING');
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Clear session queue on exam completion
   */
  clearQueue(sessionId) {
    const id = sessionId || this.activeSessionId || 'current';
    this.queue = [];
    try {
      localStorage.removeItem(`cbt_pending_queue_${id}`);
      localStorage.removeItem(`active_exam_${id}`);
    } catch (e) {}
    this.updateStatus('SAVED');
  }

  /**
   * Cleanup timer on unmount
   */
  destroy() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    this.listeners.clear();
  }
}

export const autosaveQueueService = new AutosaveQueueService();
export default autosaveQueueService;
