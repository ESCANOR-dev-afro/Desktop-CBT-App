import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Play,
  Pause,
  RotateCcw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Zap,
  ShieldAlert,
  Server
} from 'lucide-react';

export default function WorkstationMonitorTab({
  currentClass,
  workstations,
  onUpdateWorkstations,
  onShowToast,
}) {
  const [simulating, setSimulating] = useState(false);

  // Live simulation tick timer
  useEffect(() => {
    let interval = null;
    if (simulating) {
      interval = setInterval(() => {
        onUpdateWorkstations((prev) =>
          prev.map((ws) => {
            if (ws.status === 'ACTIVE' && ws.timeRemaining > 0) {
              const newTime = ws.timeRemaining - 1;
              const newQ =
                newTime % 15 === 0 && ws.currentQuestion < ws.totalQuestions
                  ? ws.currentQuestion + 1
                  : ws.currentQuestion;
              return {
                ...ws,
                timeRemaining: newTime,
                currentQuestion: newQ,
                status: newTime === 0 ? 'SUBMITTED' : ws.status,
              };
            }
            return ws;
          })
        );
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [simulating, onUpdateWorkstations]);

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    if (secs <= 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleForceSubmit = (nodeName, studentName) => {
    onUpdateWorkstations((prev) =>
      prev.map((w) =>
        w.nodeName === nodeName
          ? { ...w, status: 'SUBMITTED', timeRemaining: 0 }
          : w
      )
    );
    onShowToast(`Force submitted exam session for ${studentName} on ${nodeName}`, 'info');
  };

  const handleResetLockout = (nodeName, studentName) => {
    onUpdateWorkstations((prev) =>
      prev.map((w) =>
        w.nodeName === nodeName
          ? { ...w, status: 'ACTIVE', lockoutAlert: false, lockoutReason: null }
          : w
      )
    );
    onShowToast(`Reset Security Lockout & Restored Focus for ${studentName} on ${nodeName}`, 'success');
  };

  const handleExtendTime = (nodeName, studentName) => {
    onUpdateWorkstations((prev) =>
      prev.map((w) =>
        w.nodeName === nodeName
          ? { ...w, timeRemaining: w.timeRemaining + 300 }
          : w
      )
    );
    onShowToast(`Granted +5 Minutes extra time to ${studentName} on ${nodeName}`, 'success');
  };

  const handleTogglePause = (nodeName) => {
    onUpdateWorkstations((prev) =>
      prev.map((w) => {
        if (w.nodeName === nodeName) {
          const nextStatus = w.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
          return { ...w, status: nextStatus };
        }
        return w;
      })
    );
  };

  const activeNodesCount = workstations.filter((w) => w.status === 'ACTIVE').length;
  const lockoutNodesCount = workstations.filter((w) => w.status === 'LOCKOUT_ALERT').length;

  return (
    <div className="space-y-6">
      {/* Top Banner Control Panel */}
      <div className="bg-slate-900 border border-darkBorder p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-brand/15 border border-brand/30 rounded-2xl text-brand">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              {currentClass} CBT Workstation Monitor
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Live monitoring of computer lab nodes allocated for {currentClass} CBT examination
            </p>
          </div>
        </div>

        {/* Live Simulation Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setSimulating(!simulating);
              onShowToast(
                simulating
                  ? 'Paused CBT Live Simulation'
                  : 'Started CBT Live Exam Simulation Engine!',
                'info'
              );
            }}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all shadow-md ${
              simulating
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                : 'bg-brand hover:bg-brand-600 text-white brand-glow-sm'
            }`}
          >
            {simulating ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause Simulation</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>⚡ Start Live Exam Simulation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-darkBorder p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Active Workstations</p>
            <p className="text-xl font-extrabold text-slate-100">{activeNodesCount}</p>
          </div>
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        <div className="bg-slate-900 border border-darkBorder p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Lockout Alerts</p>
            <p className="text-xl font-extrabold text-rose-400">{lockoutNodesCount}</p>
          </div>
          {lockoutNodesCount > 0 && (
            <AlertTriangle className="w-4 h-4 text-rose-400 animate-bounce" />
          )}
        </div>

        <div className="bg-slate-900 border border-darkBorder p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Submitted Exams</p>
            <p className="text-xl font-extrabold text-brand">
              {workstations.filter((w) => w.status === 'SUBMITTED').length}
            </p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-brand" />
        </div>

        <div className="bg-slate-900 border border-darkBorder p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Idle Nodes</p>
            <p className="text-xl font-extrabold text-slate-400">
              {workstations.filter((w) => w.status === 'IDLE').length}
            </p>
          </div>
          <Server className="w-4 h-4 text-slate-600" />
        </div>
      </div>

      {/* Workstations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {workstations.map((ws) => {
          const isLockout = ws.status === 'LOCKOUT_ALERT';
          const isActive = ws.status === 'ACTIVE';
          const isSubmitted = ws.status === 'SUBMITTED';

          return (
            <div
              key={ws.id}
              className={`bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between space-y-3 transition-all relative overflow-hidden ${
                isLockout
                  ? 'border-rose-500/80 shadow-lg shadow-rose-500/20 bg-slate-900/90'
                  : isActive
                  ? 'border-darkBorder hover:border-brand/50'
                  : 'border-darkBorder opacity-75'
              }`}
            >
              {/* Card Header: Node ID & Status */}
              <div className="flex items-center justify-between pb-2 border-b border-darkBorder/60">
                <div className="flex items-center space-x-1.5 font-mono text-xs font-bold text-slate-200">
                  <Monitor className="w-3.5 h-3.5 text-slate-400" />
                  <span>{ws.nodeName}</span>
                </div>

                {isActive && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>LIVE</span>
                  </span>
                )}

                {isLockout && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse flex items-center space-x-1">
                    <ShieldAlert className="w-3 h-3" />
                    <span>LOCKOUT</span>
                  </span>
                )}

                {isSubmitted && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/15 text-brand border border-brand/30">
                    SUBMITTED
                  </span>
                )}

                {ws.status === 'PAUSED' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    PAUSED
                  </span>
                )}
              </div>

              {/* Student Info */}
              {ws.studentName !== 'Unassigned Node' ? (
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <img
                      src={ws.avatar}
                      alt={ws.studentName}
                      className="w-10 h-10 rounded-xl object-cover border border-darkBorder shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h5 className="font-bold text-xs text-slate-100 truncate">
                        {ws.studentName}
                      </h5>
                      <p className="text-[10px] font-mono text-slate-400 truncate">
                        {ws.regNo}
                      </p>
                      <p className="text-[10px] text-brand font-semibold truncate">
                        {ws.subject}
                      </p>
                    </div>
                  </div>

                  {/* Lockout alert notice if locked */}
                  {isLockout && (
                    <div className="p-2 bg-rose-500/15 border border-rose-500/30 rounded-lg text-[10px] text-rose-300 font-medium">
                      ⚠️ {ws.lockoutReason}
                    </div>
                  )}

                  {/* Exam progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                      <span>Progress: Q{ws.currentQuestion}/{ws.totalQuestions}</span>
                      <span className="text-slate-200">{formatTime(ws.timeRemaining)}</span>
                    </div>
                    <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-darkBorder">
                      <div
                        className="bg-brand h-full transition-all duration-300"
                        style={{
                          width: `${(ws.currentQuestion / ws.totalQuestions) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Admin Actions for active/lockout node */}
                  <div className="pt-2 border-t border-darkBorder/60 flex flex-wrap gap-1.5">
                    {isLockout ? (
                      <button
                        onClick={() => handleResetLockout(ws.nodeName, ws.studentName)}
                        className="w-full py-1.5 px-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center space-x-1"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>Unlock Node</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleExtendTime(ws.nodeName, ws.studentName)}
                          className="flex-1 py-1 px-2 bg-slate-950 hover:bg-slate-800 border border-darkBorder text-slate-300 rounded-lg text-[10px] font-semibold transition-colors flex items-center justify-center space-x-1"
                        >
                          <Clock className="w-3 h-3 text-brand" />
                          <span>+5m</span>
                        </button>

                        <button
                          onClick={() => handleForceSubmit(ws.nodeName, ws.studentName)}
                          className="flex-1 py-1 px-2 bg-slate-950 hover:bg-slate-800 border border-darkBorder text-rose-400 rounded-lg text-[10px] font-semibold transition-colors flex items-center justify-center space-x-1"
                        >
                          <Lock className="w-3 h-3" />
                          <span>Submit</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-500 space-y-1">
                  <Server className="w-6 h-6 mx-auto text-slate-700" />
                  <p className="text-xs font-semibold text-slate-400">Node Available</p>
                  <p className="text-[10px] text-slate-600">Ready for candidate login</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
