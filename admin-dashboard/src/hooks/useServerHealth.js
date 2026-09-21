import { useState, useEffect } from 'react';

/**
 * Shared Singleton Server Health State & Polling Manager
 * Guarantees exactly ONE network ping to /api/health across the entire application,
 * sharing state synchronously with Header, Sidebar, and all subscribing components.
 */

let sharedHealthState = {
  status: 'Online', // 'Online' | 'Degraded' | 'Offline'
  latency: 12,
  isOnline: true,
  port: 3000,
};

const subscribers = new Set();
let pollingTimer = null;
let isFetching = false;
let lastFetchTime = 0;
const HEALTH_POLL_INTERVAL_MS = 8000; // 8-second clean interval

const notifySubscribers = () => {
  for (const subscriber of subscribers) {
    subscriber({ ...sharedHealthState });
  }
};

const executeHealthCheck = async () => {
  // Prevent stacking multiple simultaneous requests, polling when browser tab is inactive, or during heavy extraction
  if (isFetching) return;
  if (typeof window !== 'undefined' && window.__IS_EXTRACTING_QUESTIONS__) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  isFetching = true;
  const startTime = performance.now();

  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    });
    const endTime = performance.now();
    const roundTripMs = Math.round(endTime - startTime);
    lastFetchTime = Date.now();

    if (response.ok) {
      const data = await response.json();
      sharedHealthState = {
        status: roundTripMs > 300 ? 'Degraded' : 'Online',
        latency: roundTripMs,
        isOnline: true,
        port: data?.port || sharedHealthState.port || 3000,
      };
    } else {
      sharedHealthState = {
        ...sharedHealthState,
        status: 'Offline',
        isOnline: false,
      };
    }
  } catch (err) {
    sharedHealthState = {
      ...sharedHealthState,
      status: 'Offline',
      isOnline: false,
      latency: 0,
    };
  } finally {
    isFetching = false;
    notifySubscribers();
  }
};

const handleVisibilityChange = () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    // If tab just became active and more than 4s passed, ping immediately
    if (Date.now() - lastFetchTime > 4000) {
      executeHealthCheck();
    }
  }
};

const startPollingLoop = () => {
  if (pollingTimer) return;

  // Initial check if we haven't checked recently
  if (Date.now() - lastFetchTime > 4000) {
    executeHealthCheck();
  }

  pollingTimer = setInterval(executeHealthCheck, HEALTH_POLL_INTERVAL_MS);

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('visibilitychange', handleVisibilityChange);
  }
};

const stopPollingLoop = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  if (typeof window !== 'undefined' && window.removeEventListener) {
    window.removeEventListener('visibilitychange', handleVisibilityChange);
  }
};

/**
 * Unified useServerHealth Hook
 * Subscribes to the single shared server health polling cycle.
 */
export const useServerHealth = (intervalMs = HEALTH_POLL_INTERVAL_MS) => {
  const [health, setHealth] = useState(sharedHealthState);

  useEffect(() => {
    // Register this component as an active subscriber
    subscribers.add(setHealth);

    // If first subscriber, launch the shared polling cycle
    if (subscribers.size === 1) {
      startPollingLoop();
    }

    return () => {
      subscribers.delete(setHealth);
      // If all subscribers unmounted, gracefully stop background polling
      if (subscribers.size === 0) {
        stopPollingLoop();
      }
    };
  }, []);

  return health;
};
