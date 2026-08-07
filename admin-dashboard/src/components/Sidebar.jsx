import React, { useState } from 'react';
import {
  LayoutDashboard,
  BarChart3,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  BookOpen,
  Award,
  Layers,
  FileText
} from 'lucide-react';

export default function Sidebar({
  activeView,
  setActiveView,
  selectedClass,
  setSelectedClass,
  classesList,
  subjectsByClass,
}) {
  const [classesOpen, setClassesOpen] = useState(true);

  const handleSelectClass = (cls) => {
    setSelectedClass(cls);
    setActiveView('class-workspace');
  };

  return (
    <aside className="w-72 bg-slate-950 border-r border-darkBorder flex flex-col h-screen select-none shrink-0 z-30">
      {/* Brand Header with Official School Logo */}
      <div className="p-4 border-b border-darkBorder flex items-center space-x-3 bg-slate-950/90">
        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-brand/40 p-1 flex items-center justify-center shrink-0 shadow-md shadow-brand/10 group overflow-hidden">
          <img
            src="school_logo.jpg"
            alt="Anthony White Bridge Academy Logo"
            className="w-full h-full object-contain rounded-lg transform group-hover:scale-105 transition-transform duration-200"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-xs tracking-tight text-white truncate leading-tight uppercase">
            ANTHONY WHITE
          </h1>
          <p className="text-[11px] font-bold text-brand tracking-wider uppercase truncate">
            BRIDGE ACADEMY CBT
          </p>
          <span className="text-[9px] text-slate-500 font-semibold block truncate">
            Official Control Center v3.4
          </span>
        </div>
      </div>

      {/* Main Navigation List */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6">
        {/* Core Navigation Group */}
        <div>
          <div className="px-3 mb-2 text-[10px] font-bold text-slate-500 tracking-wider uppercase">
            Main Console
          </div>
          <div className="space-y-1">
            <button
              onClick={() => {
                setActiveView('dashboard');
                setSelectedClass(null);
              }}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                activeView === 'dashboard'
                  ? 'bg-brand text-white shadow-md shadow-brand/25 font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span className="truncate">Dashboard Overview</span>
            </button>

            <button
              onClick={() => {
                setActiveView('live-results');
                setSelectedClass(null);
              }}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                activeView === 'live-results'
                  ? 'bg-brand text-white shadow-md shadow-brand/25 font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span className="truncate">Live Results & Analytics</span>
            </button>

            <button
              onClick={() => {
                setActiveView('question-bank');
                setSelectedClass(null);
              }}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                activeView === 'question-bank'
                  ? 'bg-brand text-white shadow-md shadow-brand/25 font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="truncate">Question Bank Hub</span>
            </button>
          </div>
        </div>

        {/* School Classes Accordion Section */}
        <div>
          <button
            onClick={() => setClassesOpen(!classesOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-slate-500 tracking-wider uppercase hover:text-slate-300 transition-colors"
          >
            <span className="flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-brand" />
              <span>School Classes Allocation</span>
            </span>
            {classesOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {classesOpen && (
            <div className="mt-1.5 pl-2 space-y-1">
              {classesList.map((cls) => {
                const isSelected = activeView === 'class-workspace' && selectedClass === cls;
                const subjectCount = subjectsByClass[cls]?.length || 0;

                return (
                  <button
                    key={cls}
                    onClick={() => handleSelectClass(cls)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group ${
                      isSelected
                        ? 'bg-slate-900 text-brand border border-brand/40 shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <div
                        className={`w-2 h-2 rounded-full transition-colors ${
                          isSelected ? 'bg-brand brand-glow-sm' : 'bg-slate-700 group-hover:bg-slate-500'
                        }`}
                      />
                      <span className="truncate">{cls} Class Workspace</span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors ${
                        isSelected
                          ? 'bg-brand/20 text-brand border border-brand/30'
                          : 'bg-slate-900 text-slate-500 group-hover:text-slate-400'
                      }`}
                    >
                      {subjectCount} Subj
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* CBT System Health Badge */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-darkBorder space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>AWBA CBT Engine</span>
            </span>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              OPERATIONAL
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-normal">
            Local server running on port 8080. Multi-class subject isolation enabled.
          </p>
        </div>
      </div>

      {/* Admin Profile Section */}
      <div className="p-4 border-t border-darkBorder bg-slate-950">
        <div className="flex items-center space-x-3 p-2 rounded-xl bg-slate-900/80 border border-darkBorder">
          <img
            src="school_logo.jpg"
            alt="School Crest"
            className="w-8 h-8 rounded-lg border border-brand/30 p-0.5 bg-slate-950 object-contain shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-200 truncate">Principal Admin</p>
            <p className="text-[10px] text-slate-400 truncate">control@awba-cbt.edu.ng</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
