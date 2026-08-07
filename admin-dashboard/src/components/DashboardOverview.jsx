import React from 'react';
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
  Zap
} from 'lucide-react';

export default function DashboardOverview({
  classesList,
  subjectsByClass,
  students,
  activityLogs,
  onSelectClass,
}) {
  const totalStudents = students.length;
  const totalSubjects = Object.values(subjectsByClass).reduce(
    (acc, list) => acc + list.length,
    0
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Executive Welcome Header with Official School Logo & Subtle Background Watermark */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-darkBorder p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
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
              alt="Anthony White Bridge Academy Logo"
              className="w-full h-full object-contain rounded-xl"
            />
          </div>

          <div>
            <span className="text-[10px] font-extrabold text-brand uppercase tracking-wider bg-brand/10 px-2.5 py-1 rounded-md border border-brand/20">
              Official Executive Control Panel
            </span>
            <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight mt-1.5">
              Anthony White Bridge Academy CBT Overview
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Real-time computer-based testing infrastructure, candidate enrollment & class subject isolation monitor.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 z-10 shrink-0">
          <div className="px-4 py-2 bg-slate-950/80 border border-darkBorder rounded-xl text-xs font-semibold text-slate-300 flex items-center space-x-2">
            <Server className="w-4 h-4 text-emerald-400" />
            <span>Server Latency: <strong className="text-slate-100">12ms</strong></span>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-slate-900 border border-darkBorder p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-lg group hover:border-brand/50 transition-all">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Enrolled Candidates</span>
            <div className="p-2.5 bg-brand/15 text-brand rounded-xl border border-brand/30">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-100">{totalStudents}</span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center space-x-1">
              <TrendingUp className="w-3 h-3" />
              <span>+14.2%</span>
            </span>
          </div>
          <p className="text-[10px] text-slate-500">Across 6 Secondary School Classes</p>
        </div>

        <div className="bg-slate-900 border border-darkBorder p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-lg group hover:border-brand/50 transition-all">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Isolated Class Subjects</span>
            <div className="p-2.5 bg-brand/15 text-brand rounded-xl border border-brand/30">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-100">{totalSubjects}</span>
            <span className="text-xs font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full border border-brand/20">
              Strict Isolated
            </span>
          </div>
          <p className="text-[10px] text-slate-500">Zero cross-class subject leaking</p>
        </div>

        <div className="bg-slate-900 border border-darkBorder p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-lg group hover:border-brand/50 transition-all">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">CBT System Uptime</span>
            <div className="p-2.5 bg-emerald-500/15 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-100">99.98%</span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Optimal
            </span>
          </div>
          <p className="text-[10px] text-slate-500">Local node network active</p>
        </div>

        <div className="bg-slate-900 border border-darkBorder p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-lg group hover:border-brand/50 transition-all">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Average CBT Score</span>
            <div className="p-2.5 bg-brand/15 text-brand rounded-xl border border-brand/30">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-100">84.5%</span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Distinction
            </span>
          </div>
          <p className="text-[10px] text-slate-500">Term 2 Mock Examinations</p>
        </div>
      </div>

      {/* Middle Section: Class Allocation Grid & Audit Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Class Workspaces Grid */}
        <div className="lg:col-span-2 bg-slate-900 border border-darkBorder p-6 rounded-2xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-100">School Classes Allocation</h3>
              <p className="text-xs text-slate-400">Select any class to enter its dedicated CBT workspace</p>
            </div>
            <span className="text-xs font-bold text-brand bg-brand/10 px-2.5 py-1 rounded-full border border-brand/20">
              6 Classes Configured
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {classesList.map((cls) => {
              const subs = subjectsByClass[cls] || [];
              const count = students.filter((s) => s.class === cls).length;

              return (
                <div
                  key={cls}
                  onClick={() => onSelectClass(cls)}
                  className="bg-slate-950 border border-darkBorder hover:border-brand p-4 rounded-xl space-y-3 cursor-pointer transition-all duration-150 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <img
                        src="school_logo.jpg"
                        alt=""
                        className="w-8 h-8 rounded-lg border border-brand/30 p-0.5 bg-slate-900 object-contain shrink-0"
                      />
                      <span className="font-extrabold text-sm text-slate-100 group-hover:text-brand transition-colors">
                        {cls} Workspace
                      </span>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-brand transition-colors" />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span>{count} Candidates</span>
                    <span className="font-bold text-slate-200">{subs.length} Subjects</span>
                  </div>

                  {/* Isolated subjects preview pills */}
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-darkBorder/60">
                    {subs.slice(0, 3).map((sub) => (
                      <span
                        key={sub.id}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-slate-300 border border-darkBorder"
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
            })}
          </div>
        </div>

        {/* Real-time CBT System Logs */}
        <div className="bg-slate-900 border border-darkBorder p-6 rounded-2xl space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-brand font-bold text-xs uppercase tracking-wider mb-1">
              <Zap className="w-4 h-4" />
              <span>Real-Time CBT Security Stream</span>
            </div>
            <h3 className="text-base font-bold text-slate-100">Audit & System Activity</h3>
            <p className="text-xs text-slate-400 mt-1">Live audit trail of CBT system actions</p>

            <div className="mt-4 space-y-3">
              {activityLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-950 rounded-xl border border-darkBorder flex items-start space-x-3 text-xs"
                >
                  <div className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 font-medium leading-snug">{log.event}</p>
                    <div className="flex items-center space-x-2 mt-1 text-[10px] text-slate-500">
                      <Clock className="w-3 h-3 text-slate-600" />
                      <span>{log.time}</span>
                      <span>•</span>
                      <span className="font-bold text-slate-400">{log.category}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-darkBorder">
            <div className="p-3 bg-brand/10 border border-brand/30 rounded-xl flex items-center space-x-2 text-xs text-brand">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Anti-Cheating Lockout Engine Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
