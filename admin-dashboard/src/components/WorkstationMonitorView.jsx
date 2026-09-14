import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Monitor,
  ShieldAlert,
  ShieldCheck,
  Activity,
  User,
  Clock,
  Unlock,
  Send,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Eye,
  X,
  Server,
  Terminal,
  ChevronRight,
  Sparkles
} from 'lucide-react';

export default function WorkstationMonitorView({ onShowToast }) {
  const [gridData, setGridData] = useState({
    summary: {
      total_seats: 92,
      online: 0,
      in_progress: 0,
      connected: 0,
      flagged: 0,
      submitted: 0,
      offline: 92,
    },
    nodes: [],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('all'); // 'all' | 'in_progress' | 'flagged' | 'connected' | 'submitted' | 'offline'
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedNodeId, setInspectedNodeId] = useState(null);
  const [inspectedAudit, setInspectedAudit] = useState(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // 1. Live LAN Polling (every 3 seconds, visibility-aware)
  const fetchWorkstationGrid = useCallback(async (silent = false) => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    try {
      if (!silent) setIsLoading(true);
      const res = await fetch('/api/admin/workstation-grid');
      const data = await res.json();
      if (data.success) {
        setGridData({
          summary: data.summary || {
            total_seats: 92,
            online: 0,
            in_progress: 0,
            connected: 0,
            flagged: 0,
            submitted: 0,
            offline: 92,
          },
          nodes: Array.isArray(data.nodes) ? data.nodes : [],
        });
        setLastSyncTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
      }
    } catch (err) {
      console.warn('Notice: Workstation grid LAN polling fallback active', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  // Polling Lifecycle with Visibility Listener
  useEffect(() => {
    fetchWorkstationGrid(false);
    const interval = setInterval(() => {
      fetchWorkstationGrid(true);
    }, 3000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchWorkstationGrid(true);
      }
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [fetchWorkstationGrid]);

  // Fetch chronological audit history when a node is inspected
  const fetchNodeAudit = useCallback(async (nodeId) => {
    if (!nodeId) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    try {
      const res = await fetch(`/api/admin/workstation/${nodeId}/audit`);
      const data = await res.json();
      if (data.success) {
        setInspectedAudit(data.audit_history || []);
      }
    } catch (err) {
      console.warn('Notice: Node audit fetch fallback active', err);
    }
  }, []);

  useEffect(() => {
    if (inspectedNodeId) {
      fetchNodeAudit(inspectedNodeId);
      const auditInterval = setInterval(() => {
        fetchNodeAudit(inspectedNodeId);
      }, 3000);
      return () => clearInterval(auditInterval);
    } else {
      setInspectedAudit(null);
    }
  }, [inspectedNodeId, fetchNodeAudit]);

  // Invigilator Action: Unlock Workstation
  const handleUnlockNode = async (nodeId) => {
    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/admin/workstation/${nodeId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performed_by: 'CHIEF_INVIGILATOR' }),
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(data.message || `Workstation ${nodeId} unlocked!`, 'success');
        fetchWorkstationGrid(true);
        fetchNodeAudit(nodeId);
      } else {
        if (onShowToast) onShowToast(data.message || 'Failed to unlock workstation.', 'error');
      }
    } catch (err) {
      if (onShowToast) onShowToast('Action failed: LAN connection issue.', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Invigilator Action: Force Submit Exam
  const handleForceSubmitNode = async (nodeId) => {
    if (!window.confirm(`Are you sure you want to FORCE SUBMIT the exam on ${nodeId}? This action is immediate and cannot be undone.`)) {
      return;
    }

    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/admin/workstation/${nodeId}/force-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performed_by: 'CHIEF_INVIGILATOR' }),
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(data.message || `Exam on ${nodeId} submitted!`, 'success');
        fetchWorkstationGrid(true);
        fetchNodeAudit(nodeId);
      } else {
        if (onShowToast) onShowToast(data.message || 'Failed to force submit.', 'error');
      }
    } catch (err) {
      if (onShowToast) onShowToast('Action failed: LAN connection issue.', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Currently inspected node object
  const activeNode = useMemo(() => {
    if (!inspectedNodeId) return null;
    return gridData.nodes.find((n) => n.node_id === inspectedNodeId) || null;
  }, [inspectedNodeId, gridData.nodes]);

  // Filter & Search Logic
  const filteredNodes = useMemo(() => {
    return gridData.nodes.filter((node) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        node.node_id.toLowerCase().includes(q) ||
        String(node.seat_number).includes(q) ||
        node.ip.includes(q) ||
        (node.student_name && node.student_name.toLowerCase().includes(q)) ||
        (node.student_reg && node.student_reg.toLowerCase().includes(q)) ||
        (node.subject && node.subject.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (selectedFilter === 'in_progress') return node.status === 'IN_PROGRESS';
      if (selectedFilter === 'flagged') return node.status === 'FLAGGED';
      if (selectedFilter === 'connected') return node.status === 'CONNECTED';
      if (selectedFilter === 'submitted') return node.status === 'SUBMITTED';
      if (selectedFilter === 'offline') return node.status === 'OFFLINE';

      return true;
    });
  }, [gridData.nodes, selectedFilter, searchQuery]);

  const formatRemainingTime = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) return '00:00';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 select-none">
      {/* Executive Lab Header with Live LAN Node Status */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 dark:border-darkBorder p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        {/* Subtle Watermark School Logo */}
        <img
          src="school_logo.jpg"
          alt=""
          className="absolute right-4 top-1/2 -translate-y-1/2 w-48 h-48 opacity-[0.05] object-contain pointer-events-none filter drop-shadow-lg"
        />

        <div className="flex items-center space-x-4 min-w-0 z-10">
          <div className="w-16 h-16 rounded-2xl bg-slate-950 border-2 border-brand/40 p-1.5 shadow-xl shadow-brand/10 shrink-0 flex items-center justify-center">
            <Monitor className="w-8 h-8 text-brand" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-extrabold text-brand uppercase tracking-wider bg-brand/10 px-2.5 py-1 rounded-md border border-brand/20">
                Hardware Hall Telemetry
              </span>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>92 Physical Seats Mapped</span>
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight mt-1.5">
              Workstation Lab Hall Monitor
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Real-time LAN-IP seat binding, terminal heartbeat telemetry & anti-cheat window lockout control.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10 shrink-0">
          <div className="px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 flex items-center space-x-2">
            <Server className="w-4 h-4 text-emerald-400" />
            <span>LAN Range: <strong className="text-white">192.168.10.101 – 192</strong></span>
          </div>

          <button
            type="button"
            onClick={() => fetchWorkstationGrid(false)}
            className="px-3.5 py-2 bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:border-brand/40 rounded-xl text-xs font-semibold text-slate-300 flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${isLoading ? 'animate-spin' : ''}`} />
            <span>{lastSyncTime ? `Synced ${lastSyncTime}` : 'Syncing...'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Seats */}
        <div
          onClick={() => setSelectedFilter('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            selectedFilter === 'all'
              ? 'bg-slate-900 text-white border-brand shadow-md'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-darkBorder text-slate-800 dark:text-slate-100 hover:border-slate-400'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold uppercase tracking-wider text-[10px]">Total Seats</span>
            <Monitor className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black mt-2">{gridData.summary.total_seats}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Physical terminals</div>
        </div>

        {/* Active In-Progress */}
        <div
          onClick={() => setSelectedFilter('in_progress')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            selectedFilter === 'in_progress'
              ? 'bg-emerald-950/60 border-emerald-500 shadow-md shadow-emerald-500/10'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-darkBorder hover:border-emerald-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
            <span className="font-bold uppercase tracking-wider text-[10px]">In Progress</span>
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            {gridData.summary.in_progress}
          </div>
          <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">Active candidates</div>
        </div>

        {/* Security Flagged */}
        <div
          onClick={() => setSelectedFilter('flagged')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            selectedFilter === 'flagged'
              ? 'bg-red-950/60 border-red-500 shadow-md shadow-red-500/15'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-darkBorder hover:border-red-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-red-600 dark:text-red-400">
            <span className="font-bold uppercase tracking-wider text-[10px]">Flagged Alerts</span>
            <AlertTriangle className={`w-4 h-4 ${gridData.summary.flagged > 0 ? 'animate-bounce' : ''}`} />
          </div>
          <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-2">
            {gridData.summary.flagged}
          </div>
          <div className="text-[10px] text-red-600/70 dark:text-red-400/70 mt-0.5">
            {gridData.summary.flagged > 0 ? 'Action Required' : 'Zero violations'}
          </div>
        </div>

        {/* Connected / Login */}
        <div
          onClick={() => setSelectedFilter('connected')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            selectedFilter === 'connected'
              ? 'bg-blue-950/60 border-blue-500 shadow-md shadow-blue-500/10'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-darkBorder hover:border-blue-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400">
            <span className="font-bold uppercase tracking-wider text-[10px]">Connected</span>
            <Wifi className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-2">
            {gridData.summary.connected}
          </div>
          <div className="text-[10px] text-blue-600/70 dark:text-blue-400/70 mt-0.5">At login screen</div>
        </div>

        {/* Submitted */}
        <div
          onClick={() => setSelectedFilter('submitted')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            selectedFilter === 'submitted'
              ? 'bg-purple-950/60 border-purple-500 shadow-md shadow-purple-500/10'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-darkBorder hover:border-purple-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-purple-600 dark:text-purple-400">
            <span className="font-bold uppercase tracking-wider text-[10px]">Submitted</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-2">
            {gridData.summary.submitted}
          </div>
          <div className="text-[10px] text-purple-600/70 dark:text-purple-400/70 mt-0.5">Exams completed</div>
        </div>

        {/* Offline / Idle */}
        <div
          onClick={() => setSelectedFilter('offline')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            selectedFilter === 'offline'
              ? 'bg-slate-800 border-slate-500 text-white'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-darkBorder hover:border-slate-500'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold uppercase tracking-wider text-[10px]">Offline</span>
            <WifiOff className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-2">
            {gridData.summary.offline}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Unoccupied seats</div>
        </div>
      </div>

      {/* Main Floor Grid Header & Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-6 rounded-2xl space-y-5 shadow-xs dark:shadow-xl">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <span>Physical Lab Workstation Matrix</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                {filteredNodes.length} of 92 Seats Displayed
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click any workstation card to view live telemetry, candidate profile, and invigilator overrides.
            </p>
          </div>

          {/* Quick Filters & Search */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search seat, student, IP, or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder rounded-xl focus:outline-none focus:border-brand text-slate-900 dark:text-slate-100 placeholder-slate-400"
              />
            </div>

            <div className="flex items-center space-x-1.5 text-xs">
              {[
                { id: 'all', label: 'All' },
                { id: 'in_progress', label: 'Active' },
                { id: 'flagged', label: 'Flagged' },
                { id: 'connected', label: 'Connected' },
                { id: 'submitted', label: 'Submitted' },
                { id: 'offline', label: 'Offline' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    selectedFilter === tab.id
                      ? 'bg-brand text-white shadow-xs shadow-brand/30'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 92-Seat Floor Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3.5 max-h-[640px] overflow-y-auto pr-1">
          {filteredNodes.map((node) => {
            const isInspected = inspectedNodeId === node.node_id;

            // State-based styles
            let statusBorder = 'border-slate-200 dark:border-slate-800 hover:border-slate-400';
            let statusBg = 'bg-slate-50 dark:bg-slate-950';
            let badgeBg = 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
            let statusText = 'OFFLINE';
            let dotColor = 'bg-slate-500';

            if (node.status === 'IN_PROGRESS') {
              statusBorder = 'border-emerald-500/60 dark:border-emerald-500/40 hover:border-emerald-500 shadow-sm shadow-emerald-500/10';
              statusBg = 'bg-emerald-50/40 dark:bg-emerald-950/20';
              badgeBg = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
              statusText = 'IN PROGRESS';
              dotColor = 'bg-emerald-500 animate-pulse';
            } else if (node.status === 'FLAGGED') {
              statusBorder = 'border-red-500 dark:border-red-500 shadow-md shadow-red-500/20 ring-1 ring-red-500/50';
              statusBg = 'bg-red-50/60 dark:bg-red-950/40';
              badgeBg = 'bg-red-500 text-white font-black animate-pulse';
              statusText = 'FLAGGED';
              dotColor = 'bg-red-500 animate-ping';
            } else if (node.status === 'CONNECTED') {
              statusBorder = 'border-blue-400 dark:border-blue-500/40 hover:border-blue-500 shadow-sm shadow-blue-500/10';
              statusBg = 'bg-blue-50/40 dark:bg-blue-950/20';
              badgeBg = 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30';
              statusText = 'CONNECTED';
              dotColor = 'bg-blue-500';
            } else if (node.status === 'SUBMITTED') {
              statusBorder = 'border-purple-400 dark:border-purple-500/40 hover:border-purple-500 shadow-sm shadow-purple-500/10';
              statusBg = 'bg-purple-50/40 dark:bg-purple-950/20';
              badgeBg = 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30';
              statusText = 'SUBMITTED';
              dotColor = 'bg-purple-500';
            }

            const progressPercent = node.total_questions > 0
              ? Math.min(100, Math.round((node.current_question / node.total_questions) * 100))
              : 0;

            return (
              <div
                key={node.node_id}
                onClick={() => setInspectedNodeId(node.node_id)}
                className={`p-3.5 rounded-xl border ${statusBorder} ${statusBg} ${
                  isInspected ? 'ring-2 ring-brand' : ''
                } transition-all duration-150 cursor-pointer flex flex-col justify-between space-y-2.5 group relative overflow-hidden`}
              >
                {/* Card Top: Node ID & Status Indicator */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                    <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 group-hover:text-brand transition-colors">
                      Seat #{node.seat_number}
                    </span>
                  </div>
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${badgeBg}`}>
                    {statusText}
                  </span>
                </div>

                {/* Card Middle: Student Name or IP */}
                <div className="space-y-1 min-w-0">
                  {node.status === 'IN_PROGRESS' || node.status === 'FLAGGED' || node.status === 'SUBMITTED' ? (
                    <>
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {node.student_name || node.student_reg || 'Candidate'}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {node.subject || 'Exam Paper'}
                      </p>
                    </>
                  ) : node.status === 'CONNECTED' ? (
                    <>
                      <p className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate">
                        {node.student_name || 'Terminal Active'}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {node.ip}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-slate-500 truncate">Unoccupied</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono truncate">
                        {node.ip}
                      </p>
                    </>
                  )}
                </div>

                {/* Card Bottom: Progress Bar or Latency */}
                {node.status === 'IN_PROGRESS' || node.status === 'FLAGGED' ? (
                  <div className="space-y-1 pt-1 border-t border-slate-200/60 dark:border-darkBorder/40">
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Q {node.current_question || 0}/{node.total_questions || 30}</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {formatRemainingTime(node.time_remaining)}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="pt-1 border-t border-slate-200/60 dark:border-darkBorder/40 flex items-center justify-between text-[9px] text-slate-400">
                    <span>{node.node_id}</span>
                    <span>{node.seconds_since_heartbeat !== null ? `${node.seconds_since_heartbeat}s ago` : 'Idle'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Node Inspection Modal / Detail Drawer */}
      {activeNode && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-brand/30 flex items-center justify-center text-brand">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-extrabold text-base tracking-tight text-white">
                      Seat #{activeNode.seat_number} ({activeNode.node_id})
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand/20 text-brand border border-brand/30">
                      Static IP: {activeNode.ip}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Hardware Workstation Inspection & Invigilator Control
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectedNodeId(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Status Alert Banner if Flagged */}
              {activeNode.status === 'FLAGGED' && (
                <div className="p-4 bg-red-500/10 border-2 border-red-500/40 rounded-xl flex items-start space-x-3 text-red-700 dark:text-red-400">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-500 animate-bounce" />
                  <div className="flex-1">
                    <h4 className="font-extrabold text-sm">Security Flag Triggered (Window Blur / Tab Switch)</h4>
                    <p className="text-xs mt-0.5 text-red-600/90 dark:text-red-400/90">
                      The candidate minimized the exam window, switched applications, or lost focus. Terminal is currently in flagged lockout status.
                    </p>
                  </div>
                </div>
              )}

              {/* Candidate Profile Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1">
                    <User className="w-3.5 h-3.5 text-brand" />
                    <span>Candidate Profile</span>
                  </span>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      {activeNode.student_name || 'No Candidate Assigned'}
                    </h4>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">
                      Reg: {activeNode.student_reg || 'N/A'}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Class: {activeNode.class_tier || 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Active Examination</span>
                  </span>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      {activeNode.subject || 'No Active Subject'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Slot: {activeNode.assessment_slot || 'Standard Assessment'}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 flex items-center space-x-2">
                      <span>Status: <strong className="uppercase font-bold">{activeNode.status}</strong></span>
                      <span>•</span>
                      <span>Signal: {activeNode.seconds_since_heartbeat !== null ? `${activeNode.seconds_since_heartbeat}s ago` : 'Offline'}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress & Timing Bar */}
              {(activeNode.status === 'IN_PROGRESS' || activeNode.status === 'FLAGGED' || activeNode.status === 'SUBMITTED') && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span>Progress: Question {activeNode.current_question || 0} of {activeNode.total_questions || 30}</span>
                    <span className="flex items-center space-x-1.5 font-mono text-brand font-black">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatRemainingTime(activeNode.time_remaining)} remaining</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand transition-all duration-300"
                      style={{
                        width: `${
                          activeNode.total_questions > 0
                            ? Math.min(100, Math.round((activeNode.current_question / activeNode.total_questions) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Human-Readable Chronological Audit Feed */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <Terminal className="w-4 h-4 text-brand" />
                    <span>Workstation Telemetry & Audit Stream</span>
                  </h4>
                  <span className="text-[10px] text-slate-500">Live invigilator audit trail</span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder rounded-xl p-3 max-h-48 overflow-y-auto space-y-2">
                  {inspectedAudit && inspectedAudit.length > 0 ? (
                    inspectedAudit.map((evt) => (
                      <div
                        key={evt.id}
                        className="flex items-start space-x-2.5 text-xs py-1 border-b border-slate-100 dark:border-darkBorder/40 last:border-0"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-800 dark:text-slate-200 font-medium leading-snug">
                            {evt.message}
                          </p>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-500 mt-0.5">
                            <span>{evt.time}</span>
                            <span>•</span>
                            <span className="font-mono">{evt.type}</span>
                            {evt.performed_by && (
                              <>
                                <span>•</span>
                                <span>By: {evt.performed_by}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-xs text-slate-400">
                      No audit events recorded for this seat yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer / Invigilator Controls */}
            <div className="px-6 py-4 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-darkBorder flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Authorized Invigilator Overrides (100% Offline)
              </div>

              <div className="flex items-center space-x-3">
                {activeNode.status === 'FLAGGED' && (
                  <button
                    type="button"
                    disabled={isActionLoading}
                    onClick={() => handleUnlockNode(activeNode.node_id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock Workstation</span>
                  </button>
                )}

                {(activeNode.status === 'IN_PROGRESS' || activeNode.status === 'FLAGGED') && (
                  <button
                    type="button"
                    disabled={isActionLoading}
                    onClick={() => handleForceSubmitNode(activeNode.node_id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-md shadow-red-600/20 flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Force Submit Paper</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setInspectedNodeId(null)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
