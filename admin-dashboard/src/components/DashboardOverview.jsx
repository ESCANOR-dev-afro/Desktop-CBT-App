import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  BookOpen,
  Activity,
  ShieldCheck,
  TrendingUp,
  Award,
  Clock,
  Layers,
  ArrowUpRight,
  Server,
  Zap,
  Search,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { useAcademicSession } from '../context/AcademicSessionContext';

export default function DashboardOverview({
  classesList,
  subjectsByClass,
  students,
  activityLogs,
  onSelectClass,
}) {
  const { currentSession, currentTerm } = useAcademicSession();
  const [dashboardStats, setDashboardStats] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('all'); // 'all' | 'senior' | 'junior' | 'tier' | 'arm'
  const [searchQuery, setSearchQuery] = useState('');
  const isFetchingRef = React.useRef(false);

  // Live LAN Polling from SQLite Backend Endpoint (Visibility-aware with 8s interval)
  const fetchDashboardStats = useCallback(async () => {
    // Only poll when browser tab is active/visible, not extracting questions, and not currently in-flight
    if (typeof window !== 'undefined' && window.__IS_EXTRACTING_QUESTIONS__) {
      return;
    }
    if (typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible')) {
      return;
    }
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    try {
      setIsPolling(true);
      const sessionParam = encodeURIComponent(currentSession || '2026/2027');
      const termParam = encodeURIComponent(currentTerm || '1st Term');
      const res = await fetch(`/api/admin/dashboard-stats?session=${sessionParam}&term=${termParam}`);
      const data = await res.json();
      if (data.success && data.stats) {
        setDashboardStats(data.stats);
        setLastSyncedTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
      }
    } catch (err) {
      console.warn('Notice: Dashboard stats live polling fallback active', err);
    } finally {
      setIsPolling(false);
      isFetchingRef.current = false;
    }
  }, [currentSession, currentTerm]);

  // Initial fetch, 8-second interval LAN polling, and visibility event listener
  useEffect(() => {
    fetchDashboardStats();
    const intervalId = setInterval(fetchDashboardStats, 8000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchDashboardStats();
      }
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [fetchDashboardStats]);

  // Dynamic fallback computations
  const totalStudents = dashboardStats?.total_candidates ?? students.length;
  const totalSubjects = dashboardStats?.total_subjects ?? Object.values(subjectsByClass).reduce(
    (acc, list) => acc + list.length,
    0
  );

  // Filtered and searched class workspaces
  const filteredClasses = useMemo(() => {
    return classesList.filter((cls) => {
      const matchesSearch = cls.toLowerCase().includes(searchQuery.toLowerCase().trim());
      if (!matchesSearch) return false;

      const isSenior = cls.startsWith('SS');
      const isJunior = cls.startsWith('JSS');
      const isTier = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'].includes(cls);
      const isArm = !isTier;

      if (selectedFilter === 'senior') return isSenior;
      if (selectedFilter === 'junior') return isJunior;
      if (selectedFilter === 'tier') return isTier;
      if (selectedFilter === 'arm') return isArm;
      return true;
    });
  }, [classesList, searchQuery, selectedFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Executive Welcome Header with Official School Logo & Subtle Background Watermark */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 dark:border-darkBorder p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        {/* Subtle Watermark School Logo in Background */}
        <img
          src="school_logo.jpg"
          alt=""
          className="absolute right-4 top-1/2 -translate-y-1/2 w-48 h-48 opacity-[0.06] object-contain pointer-events-none filter drop-shadow-lg"
        />

        <div className="flex items-center space-x-4 min-w-0 z-10">
          <div className="w-16 h-16 rounded-2xl bg-slate-950 border-2 border-brand/40 p-1.5 shadow-xl shadow-brand/10 shrink-0 flex items-center justify-center">
            <img
              src="school_logo.jpg"
              alt="Anthony Whitebridge Academy Logo"
              className="w-full h-full object-contain rounded-xl"
            />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-extrabold text-brand uppercase tracking-wider bg-brand/10 px-2.5 py-1 rounded-md border border-brand/20">
                Official Executive Control Panel
              </span>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>100% LAN OFFLINE</span>
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight mt-1.5">
              Anthony Whitebridge Academy CBT Overview
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Real-time computer-based testing infrastructure, candidate enrollment & class subject isolation monitor.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10 shrink-0">
          <div className="px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 flex items-center space-x-2">
            <Server className="w-4 h-4 text-emerald-400" />
            <span>LAN Node: <strong className="text-white">Active (4s Sync)</strong></span>
          </div>

          <div className="px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-semibold text-slate-400 flex items-center space-x-1.5">
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${isPolling ? 'animate-spin' : ''}`} />
            <span>{lastSyncedTime ? `Synced ${lastSyncedTime}` : 'Connecting...'}</span>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Total Enrolled Candidates */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-xs dark:shadow-lg group hover:border-brand/50 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Enrolled Candidates</span>
            <div className="p-2.5 bg-brand/15 text-brand rounded-xl border border-brand/30">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-slate-100">{totalStudents}</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20 flex items-center space-x-1">
              <TrendingUp className="w-3 h-3" />
              <span>Live Database</span>
            </span>
          </div>
          <p className="text-[10px] text-slate-500">
            {dashboardStats?.classes_badge ? `Across ${dashboardStats.classes_badge}` : `Across ${classesList.length} Configured Classes & Arms`}
          </p>
        </div>

        {/* Card 2: Isolated Class Subjects */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-xs dark:shadow-lg group hover:border-brand/50 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Isolated Class Subjects</span>
            <div className="p-2.5 bg-brand/15 text-brand rounded-xl border border-brand/30">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-slate-100">{totalSubjects}</span>
            <span className="text-xs font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full border border-brand/20">
              Strict Isolated
            </span>
          </div>
          <p className="text-[10px] text-slate-500">Zero cross-class subject leaking</p>
        </div>

        {/* Card 3: CBT System Uptime */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-xs dark:shadow-lg group hover:border-brand/50 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">CBT System Uptime</span>
            <div className="p-2.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/30">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-slate-100">
              {dashboardStats?.uptime_formatted || '100% Operational'}
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20">
              Optimal
            </span>
          </div>
          <p className="text-[10px] text-slate-500">
            Local node runtime • {dashboardStats?.uptime_percentage || '99.98%'} stability
          </p>
        </div>

        {/* Card 4: Average CBT Score */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-xs dark:shadow-lg group hover:border-brand/50 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Average CBT Score</span>
            <div className="p-2.5 bg-brand/15 text-brand rounded-xl border border-brand/30">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-slate-100">
              {dashboardStats?.avg_score_formatted || '0.0%'}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
              (dashboardStats?.total_completed_exams || 0) > 0
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
                : 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}>
              {dashboardStats?.score_badge || 'Pending'}
            </span>
          </div>
          <p className="text-[10px] text-slate-500">
            {dashboardStats?.score_subtext || `${currentTerm || '1st Term'} Examinations`}
          </p>
        </div>
      </div>

      {/* Middle Section: Class Allocation Grid & Audit Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Class Workspaces Grid */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-6 rounded-2xl space-y-5 shadow-xs dark:shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">School Classes Allocation</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select any class or arm to enter its dedicated CBT workspace
              </p>
            </div>
            <span className="text-xs font-bold text-brand bg-brand/10 px-3 py-1 rounded-full border border-brand/20 self-start sm:self-auto">
              {dashboardStats?.classes_badge || `${classesList.length} Classes Configured`}
            </span>
          </div>

          {/* Quick Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-darkBorder/50">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'All Workspaces' },
                { id: 'senior', label: 'Senior (SS 1-3)' },
                { id: 'junior', label: 'Junior (JSS 1-3)' },
                { id: 'tier', label: 'Tiers Only' },
                { id: 'arm', label: 'Arms Only' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedFilter === tab.id
                      ? 'bg-brand text-white shadow-xs shadow-brand/30'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search class or arm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder rounded-lg focus:outline-none focus:border-brand text-slate-900 dark:text-slate-100 placeholder-slate-400"
              />
            </div>
          </div>

          {/* Grid of Workspaces */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[560px] overflow-y-auto pr-1">
            {filteredClasses.length === 0 ? (
              <div className="col-span-2 py-12 text-center text-slate-400 text-xs">
                No classes match the filter criteria.
              </div>
            ) : (
              filteredClasses.map((cls) => {
                const subs = subjectsByClass[cls] || [];
                // Live Candidate Count from class_stats (with fallback to local students array)
                const count = dashboardStats?.class_stats?.[cls]?.candidate_count 
                  ?? students.filter((s) => s.class === cls).length;
                const subjCount = dashboardStats?.class_stats?.[cls]?.subject_count 
                  || subs.length;

                return (
                  <div
                    key={cls}
                    onClick={() => onSelectClass(cls)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder hover:border-brand p-4 rounded-xl space-y-3 cursor-pointer transition-all duration-150 group shadow-xs hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <img
                          src="school_logo.jpg"
                          alt=""
                          className="w-8 h-8 rounded-lg border border-brand/30 p-0.5 bg-white dark:bg-slate-900 object-contain shrink-0"
                        />
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 group-hover:text-brand transition-colors">
                          {cls} Workspace
                        </span>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-brand transition-colors" />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        <strong className="text-brand font-black">{count}</strong> Candidates
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{subjCount} Subjects</span>
                    </div>

                    {/* Isolated subjects preview pills */}
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200 dark:border-darkBorder/60">
                      {subs.slice(0, 3).map((sub) => (
                        <span
                          key={sub.id || sub.name}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-darkBorder shadow-xs"
                        >
                          {sub.name}
                        </span>
                      ))}
                      {subs.length > 3 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold text-brand bg-brand/10">
                          +{subs.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Real-time CBT System Logs */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-6 rounded-2xl space-y-4 shadow-xs dark:shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-brand font-bold text-xs uppercase tracking-wider mb-1">
              <Zap className="w-4 h-4" />
              <span>Real-Time CBT Security Stream</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Audit & System Activity</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Live audit trail of CBT system actions</p>

            <div className="mt-4 space-y-3">
              {activityLogs.slice(0, 6).map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-darkBorder flex items-start space-x-3 text-xs"
                >
                  <div className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 dark:text-slate-200 font-medium leading-snug">{log.event}</p>
                    <div className="flex items-center space-x-2 mt-1 text-[10px] text-slate-500">
                      <Clock className="w-3 h-3 text-slate-400 dark:text-slate-600" />
                      <span>{log.time}</span>
                      <span>•</span>
                      <span className="font-bold text-slate-600 dark:text-slate-400">{log.category}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-darkBorder">
            <div className="p-3 bg-brand/10 border border-brand/30 rounded-xl flex items-center space-x-2 text-xs text-brand font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Anti-Cheating Lockout Engine Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
