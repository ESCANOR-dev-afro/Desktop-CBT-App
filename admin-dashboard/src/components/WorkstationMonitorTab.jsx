import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Users,
  Server,
  RefreshCw
} from 'lucide-react';

export default function WorkstationMonitorTab({
  currentClass,
  onShowToast,
}) {
  const [liveData, setLiveData] = useState({
    metrics: {
      enrolledCandidates: 0,
      activeWorkstations: 0,
      lockoutAlerts: 0,
      submittedExams: 0,
      idleNodes: 0
    },
    sessions: []
  });
  const [loading, setLoading] = useState(true);

  // Real-time polling tick for live class sessions
  const fetchLiveMonitor = async () => {
    try {
      const res = await fetch(`/api/admin/live-monitor?class=${encodeURIComponent(currentClass)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLiveData({
            metrics: data.metrics || {
              enrolledCandidates: 0,
              activeWorkstations: 0,
              lockoutAlerts: 0,
              submittedExams: 0,
              idleNodes: 0
            },
            sessions: Array.isArray(data.sessions) ? data.sessions : []
          });
        }
      }
    } catch (err) {
      console.log('Notice: Live monitor polling fallback', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveMonitor();
    const interval = setInterval(fetchLiveMonitor, 3000);
    return () => clearInterval(interval);
  }, [currentClass]);

  // Format seconds or timestamp to mm:ss countdown
  const formatTimeRemaining = (expiresAt) => {
    if (!expiresAt) return '45:00';
    const now = Date.now();
    const expiry = new Date(expiresAt).getTime();
    const diffSecs = Math.max(0, Math.floor((expiry - now) / 1000));
    if (diffSecs <= 0) return '00:00';
    const m = Math.floor(diffSecs / 60);
    const s = diffSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleForceSubmit = async (sessionId, studentName) => {
    try {
      const res = await fetch('/api/admin/live-monitor/force-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast?.(`Force submitted exam paper for ${studentName}`, 'info');
        fetchLiveMonitor();
      }
    } catch (e) {
      onShowToast?.('Failed to submit session', 'error');
    }
  };

  const handleResetLockout = async (sessionId, studentName) => {
    try {
      const res = await fetch('/api/admin/live-monitor/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast?.(`Security lockout reset & focus restored for ${studentName}`, 'success');
        fetchLiveMonitor();
      }
    } catch (e) {
      onShowToast?.('Failed to unlock session', 'error');
    }
  };

  const handleExtendTime = async (sessionId, studentName) => {
    try {
      const res = await fetch('/api/admin/live-monitor/extend-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, minutes: 5 })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast?.(`Granted +5 Minutes time extension to ${studentName}`, 'success');
        fetchLiveMonitor();
      }
    } catch (e) {
      onShowToast?.('Failed to extend time', 'error');
    }
  };

  const { metrics, sessions } = liveData;

  return (
    <div className="space-y-6">
      {/* Top Banner Control Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs dark:shadow-xl transition-colors">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-brand/15 border border-brand/30 rounded-2xl text-brand">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <span>{currentClass} Live Exam & Workstation Monitor</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping inline-block" />
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Streaming real-time metrics and active candidate sessions for {currentClass}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchLiveMonitor}
            className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-darkBorder text-xs text-slate-700 dark:text-slate-300 font-bold transition-all flex items-center space-x-2 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Monitor</span>
          </button>
        </div>
      </div>

      {/* Top Computed Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Enrolled</p>
            <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">{metrics.enrolledCandidates}</p>
          </div>
          <Users className="w-4 h-4 text-slate-400 dark:text-slate-500" />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active</p>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{metrics.activeWorkstations}</p>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lockout Alerts</p>
            <p className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">{metrics.lockoutAlerts}</p>
          </div>
          {metrics.lockoutAlerts > 0 ? (
            <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 animate-bounce" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-slate-300 dark:text-slate-700" />
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Submitted</p>
            <p className="text-xl font-extrabold text-brand mt-0.5">{metrics.submittedExams}</p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-brand" />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Idle / Not Started</p>
            <p className="text-xl font-extrabold text-slate-500 dark:text-slate-400 mt-0.5">{metrics.idleNodes}</p>
          </div>
          <Server className="w-4 h-4 text-slate-400 dark:text-slate-600" />
        </div>
      </div>

      {/* Workstations Grid */}
      {sessions.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/60 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl p-12 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20 text-brand flex items-center justify-center mx-auto mb-2">
            <Server className="w-7 h-7" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Active Exam Sessions</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            No active exam sessions in progress for <strong className="text-slate-800 dark:text-slate-200">{currentClass}</strong>. Workstation cards will appear live when students launch their paper.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {sessions.map((ws) => {
            const isLockout = ws.status === 'LOCKOUT_ALERT';
            const isActive = ws.status === 'IN_PROGRESS';
            const isSubmitted = ws.status === 'SUBMITTED' || ws.status === 'EXPIRED';

            return (
              <div
                key={ws.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between space-y-3 transition-all relative overflow-hidden shadow-xs ${
                  isLockout
                    ? 'border-rose-400 dark:border-rose-500/80 shadow-md shadow-rose-500/20 bg-rose-50/20 dark:bg-slate-900/90'
                    : isActive
                    ? 'border-brand/40 hover:border-brand/70 shadow-md shadow-brand/5'
                    : 'border-slate-200 dark:border-darkBorder opacity-80'
                }`}
              >
                {/* Header: Node & Status Badge */}
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-darkBorder/60">
                  <div className="flex items-center space-x-1.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Monitor className="w-3.5 h-3.5 text-brand" />
                    <span>{ws.nodeName}</span>
                  </div>

                  {isActive && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
                      <span>IN PROGRESS</span>
                    </span>
                  )}

                  {isLockout && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/40 animate-pulse flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>LOCKOUT</span>
                    </span>
                  )}

                  {isSubmitted && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/10 dark:bg-brand/15 text-brand border border-brand/20 dark:border-brand/30">
                      SUBMITTED
                    </span>
                  )}
                </div>

                {/* Candidate Information */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-brand/15 border border-brand/30 text-brand font-bold text-xs flex items-center justify-center shrink-0">
                      {ws.studentName ? ws.studentName[0] : 'S'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {ws.studentName}
                      </h5>
                      <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {ws.regNo}
                      </p>
                      <p className="text-[10px] text-brand font-bold truncate mt-0.5">
                        {ws.subject}
                      </p>
                    </div>
                  </div>

                  {/* Lockout Notice */}
                  {isLockout && (
                    <div className="p-2 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 rounded-lg text-[10px] text-rose-700 dark:text-rose-300 font-medium">
                      ⚠️ {ws.lockoutReason}
                    </div>
                  )}

                  {/* Exam progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                      <span>Progress: Q {ws.currentQuestion} / {ws.totalQuestions}</span>
                      <span className="text-slate-800 dark:text-slate-200 font-mono">{formatTimeRemaining(ws.expiresAt)}</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-200 dark:border-darkBorder">
                      <div
                        className="bg-brand h-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, (ws.currentQuestion / (ws.totalQuestions || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Action Controls */}
                  {!isSubmitted && (
                    <div className="pt-2 border-t border-slate-100 dark:border-darkBorder/60 flex items-center space-x-1.5">
                      {isLockout ? (
                        <button
                          onClick={() => handleResetLockout(ws.session_id, ws.studentName)}
                          className="w-full py-1.5 px-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                        >
                          <Unlock className="w-3 h-3" />
                          <span>Unlock Node</span>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleExtendTime(ws.session_id, ws.studentName)}
                            className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-darkBorder text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-semibold transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <Clock className="w-3 h-3 text-brand" />
                            <span>+5m</span>
                          </button>

                          <button
                            onClick={() => handleForceSubmit(ws.session_id, ws.studentName)}
                            className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-darkBorder text-rose-600 dark:text-rose-400 rounded-lg text-[10px] font-semibold transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Submit</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
