/**
 * heartbeatService.js
 * Dynamic Workstation Heartbeat & Live Sync Service.
 * Transmits 5-second background telemetry to server to track live candidate exam progress.
 */

import { getApiBaseUrl } from '../api';

let heartbeatTimer = null;
let isTransmitting = false;

export const heartbeatService = {
  /**
   * Start 5-second background heartbeat interval
   * @param {Object} config Configuration object
   * @param {Function} config.getPayload Callback function returning current live metrics
   * @param {number} [config.intervalMs=5000] Ping frequency in milliseconds (default: 5000ms)
   */
  startHeartbeat: ({ getPayload, intervalMs = 5000 }) => {
    heartbeatService.stopHeartbeat();

    const sendPing = async () => {
      if (isTransmitting) return;
      isTransmitting = true;
      try {
        const payload = typeof getPayload === 'function' ? getPayload() : null;
        if (!payload || !payload.regNumber) {
          isTransmitting = false;
          return;
        }

        const baseUrl = getApiBaseUrl();
        const endpoint = `${baseUrl}/student/session-heartbeat`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          console.warn(`⚠️ heartbeatService: Server returned HTTP ${response.status}`);
        }
      } catch (err) {
        console.warn('⚠️ heartbeatService: Background ping error (retrying next interval):', err.message);
      } finally {
        isTransmitting = false;
      }
    };

    // Immediate initial ping
    sendPing();

    // Start 5-second interval timer
    heartbeatTimer = setInterval(sendPing, intervalMs);
  },

  /**
   * Stop running heartbeat interval safely
   */
  stopHeartbeat: () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    isTransmitting = false;
  },
};

export default heartbeatService;
