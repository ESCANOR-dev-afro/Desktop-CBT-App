import React from 'react';
import {
  Search,
  Bell,
  Sparkles,
  Plus,
  Wifi,
  Calendar,
  CheckCircle2,
  HelpCircle,
  UserCheck
} from 'lucide-react';

export default function Header({
  activeView,
  selectedClass,
  onOpenAddSubject,
  onOpenAddStudent,
}) {
  return (
    <header className="h-16 bg-slate-950/90 border-b border-darkBorder flex items-center justify-between px-6 shrink-0 backdrop-blur-md z-20">
      {/* Breadcrumbs with Official School Logo Micro Emblem */}
      <div className="flex items-center space-x-3 truncate">
        <div className="w-7 h-7 rounded-lg bg-slate-900 border border-brand/30 p-0.5 shadow-sm flex items-center justify-center shrink-0">
          <img
            src="/school_logo.jpg"
            alt="AWBA Crest"
            className="w-full h-full object-contain rounded"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400">
          <span className="font-bold text-slate-200">AWBA Control Center</span>
          <span>/</span>
          {activeView === 'dashboard' && <span className="text-slate-200">Dashboard Overview</span>}
          {activeView === 'live-results' && <span className="text-slate-200">Live Results & Analytics</span>}
          {activeView === 'class-workspace' && (
            <>
              <span>School Classes</span>
              <span>/</span>
              <span className="text-brand font-bold bg-brand/10 px-2 py-0.5 rounded-md border border-brand/20">
                {selectedClass}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-3.5">
        {/* Search input */}
        <div className="relative w-64 hidden lg:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search students, subjects, IDs..."
            className="w-full bg-slate-900 text-xs pl-9 pr-8 py-2 rounded-xl border border-darkBorder focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-slate-200 placeholder-slate-500 transition-all"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
            ⌘K
          </span>
        </div>

        {/* Academic Session Selector Badge */}
        <div className="hidden md:flex items-center space-x-2 bg-slate-900 border border-darkBorder px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300">
          <Calendar className="w-3.5 h-3.5 text-brand" />
          <span>2025/2026 • Term 2</span>
        </div>

        {/* Server Status */}
        <div className="hidden sm:flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Node 1: Online (12ms)</span>
        </div>

        {/* Quick Action Button for Adding Subject */}
        {activeView === 'class-workspace' && (
          <button
            onClick={onOpenAddSubject}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md shadow-brand/20 brand-glow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">+ Add New Subject</span>
          </button>
        )}

        {/* Notification Bell */}
        <button className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-transparent hover:border-darkBorder relative transition-all">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand rounded-full ring-2 ring-slate-950 animate-pulse"></span>
        </button>
      </div>
    </header>
  );
}
