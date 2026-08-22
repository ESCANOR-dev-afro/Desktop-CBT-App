import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useServerHealth } from '../hooks/useServerHealth';
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
  FileText,
  LogOut
} from 'lucide-react';

export default function Sidebar({
  activeView,
  setActiveView,
  selectedClass,
  setSelectedClass,
  onSelectClass,
  allClassesList = [],
  subjectsByClass = {},
  onSignOut,
}) {
  const { port } = useServerHealth(5000);
  const [classesOpen, setClassesOpen] = useState(true);
  const [expandedTiers, setExpandedTiers] = useState({ 'JSS 1': true, 'JSS 2': true, 'JSS 3': true, 'SS 1': true, 'SS 2': true, 'SS 3': true });

  const safeSetSelectedClass = (cls) => {
    if (typeof setSelectedClass === 'function') setSelectedClass(cls);
    if (typeof onSelectClass === 'function') onSelectClass(cls);
  };

  const handleSelectClass = (cls) => {
    safeSetSelectedClass(cls);
    setActiveView('class-workspace');
  };

  return (
    <aside className="w-72 bg-slate-950 border-r border-darkBorder flex flex-col h-screen select-none shrink-0 z-30">
      {/* Brand Header with Official School Logo */}
      <div className="p-4 border-b border-darkBorder flex items-center space-x-3 bg-slate-950/90">
        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-brand/40 p-1 flex items-center justify-center shrink-0 shadow-md shadow-brand/10 group overflow-hidden">
          <img
            src="school_logo.jpg"
            alt="Anthony Whitebridge Academy Logo"
            className="w-full h-full object-contain rounded-lg transform group-hover:scale-105 transition-transform duration-200"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-xs tracking-tight text-white truncate leading-tight uppercase">
            ANTHONY WHITEBRIDGE
          </h1>
          <p className="text-[11px] font-bold text-brand tracking-wider uppercase truncate">
            ACADEMY CBT
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
                safeSetSelectedClass(null);
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
                safeSetSelectedClass(null);
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
                safeSetSelectedClass(null);
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

        {/* School Classes Accordion Section with Dynamic Tier & Arm Dropdowns */}
        <div>
          <button
            onClick={() => setClassesOpen(!classesOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-slate-500 tracking-wider uppercase hover:text-slate-300 transition-colors"
          >
            <span className="flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-brand" />
              <span>School Classes & Arm Streams</span>
            </span>
            {classesOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {classesOpen && (
            <div className="mt-1.5 space-y-1">
              {['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'].map((mainTier) => {
                const arms = {
                  'JSS 1': ['JSS 1 Gold', 'JSS 1 Silver', 'JSS 1 Diamond'],
                  'JSS 2': ['JSS 2 Gold', 'JSS 2 Silver', 'JSS 2 Diamond'],
                  'JSS 3': ['JSS 3 Gold', 'JSS 3 Silver', 'JSS 3 Diamond'],
                  'SS 1': ['SS 1 Science', 'SS 1 Art', 'SS 1 Commercial'],
                  'SS 2': ['SS 2 Science', 'SS 2 Art', 'SS 2 Commercial'],
                  'SS 3': ['SS 3 Science', 'SS 3 Art', 'SS 3 Commercial'],
                }[mainTier] || [];

                const isTierExpanded = !!expandedTiers?.[mainTier];
                const isTierActive = activeView === 'class-workspace' && (selectedClass === mainTier || arms.includes(selectedClass));
                const mainSubjectCount = subjectsByClass[mainTier]?.length || 0;

                return (
                  <div key={mainTier} className="space-y-1">
                    <div
                      onClick={() => handleSelectClass(mainTier)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer group ${
                        isTierActive
                          ? 'bg-slate-900 text-brand border border-brand/40 shadow-sm font-semibold'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <div
                          className={`w-2 h-2 rounded-full transition-colors ${
                            isTierActive ? 'bg-brand brand-glow-sm' : 'bg-slate-700 group-hover:bg-slate-500'
                          }`}
                        />
                        <span className="truncate">{mainTier} Tier</span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold transition-colors ${
                            isTierActive
                              ? 'bg-brand/20 text-brand border border-brand/30'
                              : 'bg-slate-900 text-slate-500 group-hover:text-slate-400'
                          }`}
                        >
                          {arms.length} Arms
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTiers((prev) => ({ ...prev, [mainTier]: !prev[mainTier] }));
                          }}
                          className="p-1 text-slate-500 hover:text-slate-200 rounded-md transition-colors"
                        >
                          {isTierExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Sub-menu Arm Streams List */}
                    {isTierExpanded && (
                      <div className="pl-4 space-y-1 border-l-2 border-slate-800 ml-3.5 my-1">
                        {arms.map((arm) => {
                          const isArmSelected = activeView === 'class-workspace' && selectedClass === arm;
                          const armSubjectsCount = subjectsByClass[arm]?.length || mainSubjectCount;
                          const isGold = arm.includes('Gold');
                          const isSilver = arm.includes('Silver');
                          const isDiamond = arm.includes('Diamond');
                          const isScience = arm.includes('Science');
                          const isArt = arm.includes('Art');
                          const isComm = arm.includes('Commercial');

                          let badgeStyle = 'bg-slate-900 text-slate-400 border-darkBorder';
                          if (isGold) badgeStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
                          if (isSilver) badgeStyle = 'bg-slate-400/15 text-slate-200 border-slate-400/40 shadow-sm';
                          if (isDiamond) badgeStyle = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
                          if (isScience) badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
                          if (isArt) badgeStyle = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
                          if (isComm) badgeStyle = 'bg-blue-500/10 text-blue-400 border-blue-500/30';

                          return (
                            <button
                              key={arm}
                              onClick={() => handleSelectClass(arm)}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition-all group ${
                                isArmSelected
                                  ? 'bg-brand/20 text-white font-bold border border-brand/40 shadow-sm'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                              }`}
                            >
                              <span className="truncate flex items-center space-x-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${isArmSelected ? 'bg-brand' : 'bg-slate-600'}`} />
                                <span>{arm}</span>
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border ${badgeStyle}`}>
                                {armSubjectsCount} Subj
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
            Local server running on port {port || 3000}. Multi-class subject isolation enabled.
          </p>
        </div>
      </div>

      {/* Admin Profile Section */}
      <div className="p-4 border-t border-darkBorder bg-slate-950">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-darkBorder">
          <div className="flex items-center space-x-2.5 min-w-0">
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
          {onSignOut && (
            <button
              onClick={onSignOut}
              title="Lock Console / Sign Out"
              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all flex items-center justify-center shrink-0 ml-1 group"
            >
              <LogOut className="w-4 h-4 transform group-hover:-translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
