/**
 * middleware/queryProfiler.js
 * 
 * Request-Scoped Database Query Profiler & N+1 Anti-Pattern Detector.
 * Utilizes Node.js AsyncLocalStorage to track every SQL query executed during an HTTP request.
 * 
 * Features:
 * 1. Automatic query counting & timing per HTTP request.
 * 2. N+1 Alert: Emits prominent console warnings with repeated SQL template breakdowns when query count exceeds threshold.
 * 3. Silent route filtering: Suppresses routine logs for heartbeats/polling while preserving active counting and N+1 alerts.
 * 4. Debug inspection: Injects `_debug` payload into JSON response when `?debug_queries=true` is requested.
 */

const { queryContext } = require('../database');

const defaultSilentRoutes = [
    '/api/health',
    '/health',
    '/api/exam/node-heartbeat',
    '/api/exam/heartbeat',
    '/api/student/session-heartbeat',
    '/api/admin/dashboard-stats',
    '/api/admin/dashboard/stats',
    '/api/admin/workstation-grid',
    '/api/admin/live-monitor',
    '/api/admin/active-context',
    '/api/admin/system-settings',
    '/api/student/assigned-exams',
    '/api/student/assigned-papers',
    '/api/student/assigned-subjects',
    '/api/assigned-exams',
    '/api/assigned-papers'
];

/**
 * Creates the query profiler middleware.
 * @param {Object} options
 * @param {number} [options.threshold=5] - Maximum allowable queries before triggering an N+1 alert.
 * @param {string[]} [options.silentRoutes] - Array of route prefixes to suppress routine logging for.
 */
function createQueryProfiler(options = {}) {
    const defaultThreshold = parseInt(process.env.QUERY_ALERT_THRESHOLD, 10) || 5;
    const threshold = options.threshold !== undefined ? options.threshold : defaultThreshold;
    const silentRoutes = options.silentRoutes || defaultSilentRoutes;

    return (req, res, next) => {
        const store = {
            queryCount: 0,
            queries: [],
            startTime: Date.now()
        };

        // Expose query profiling properties on req
        Object.defineProperty(req, 'queryCount', {
            get: () => store.queryCount,
            configurable: true
        });
        Object.defineProperty(req, 'queries', {
            get: () => store.queries,
            configurable: true
        });

        // Intercept res.json to inject _debug if requested
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            const isDebug = req.query && (req.query.debug_queries === 'true' || req.query.debug_queries === '1');
            if (isDebug) {
                const durationMs = Date.now() - store.startTime;
                const debugInfo = {
                    queryCount: store.queryCount,
                    durationMs,
                    threshold,
                    queries: store.queries.map(q => ({
                        sql: q.sql,
                        params: q.params,
                        offsetMs: q.time - store.startTime
                    }))
                };
                if (body && typeof body === 'object') {
                    body._debug = debugInfo;
                }
            }
            return originalJson(body);
        };

        // On response completion, evaluate performance and log stats / alerts
        res.on('finish', () => {
            const duration = Date.now() - store.startTime;
            const url = req.originalUrl || req.url || '';
            const pathOnly = req.path || '';
            const isSilent = silentRoutes.some(r => pathOnly.startsWith(r) || url.startsWith(r));

            if (store.queryCount > threshold) {
                // N+1 Alert triggers even for silent routes if threshold exceeded
                console.warn(`⚠️  [N+1 ALERT] ${req.method} ${url} executed ${store.queryCount} queries in ${duration}ms! (Threshold: ${threshold})`);
                
                // Group repeated SQL query templates
                const counts = new Map();
                for (const q of store.queries) {
                    counts.set(q.sql, (counts.get(q.sql) || 0) + 1);
                }
                for (const [sql, count] of counts.entries()) {
                    if (count > 1) {
                        const snippet = sql.length > 140 ? sql.slice(0, 140) + '...' : sql;
                        console.warn(`    ↳ Repeated query (${count}x): ${snippet}`);
                    }
                }
            } else if (!isSilent && url.startsWith('/api')) {
                // Log routine query stats for active API routes
                console.log(`⚡ [QUERY STAT] ${req.method} ${url} executed ${store.queryCount} queries (${duration}ms)`);
            }
        });

        // Enter AsyncLocalStorage execution context
        if (queryContext) {
            queryContext.run(store, () => {
                next();
            });
        } else {
            next();
        }
    };
}

module.exports = createQueryProfiler;
