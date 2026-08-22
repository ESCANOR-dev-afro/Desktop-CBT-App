import { useState, useEffect } from 'react';

export const useServerHealth = (intervalMs = 5000) => {
  const [status, setStatus] = useState('Online'); // 'Online' | 'Degraded' | 'Offline'
  const [latency, setLatency] = useState(12);
  const [isOnline, setIsOnline] = useState(true);
  const [port, setPort] = useState(3000);

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      const startTime = performance.now();
      try {
        const response = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
        const endTime = performance.now();
        const roundTripMs = Math.round(endTime - startTime);

        if (response.ok && isMounted) {
          const data = await response.json();
          setIsOnline(true);
          setLatency(roundTripMs);
          setStatus(roundTripMs > 300 ? 'Degraded' : 'Online');
          if (data && data.port) setPort(data.port);
        } else if (isMounted) {
          setIsOnline(false);
          setStatus('Offline');
        }
      } catch (err) {
        if (isMounted) {
          setIsOnline(false);
          setStatus('Offline');
          setLatency(0);
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, intervalMs);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [intervalMs]);

  return { status, latency, isOnline, port };
};
