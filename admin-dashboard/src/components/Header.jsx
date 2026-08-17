import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Bell,
  Sparkles,
  Plus,
  Wifi,
  Calendar,
  CheckCircle2,
  HelpCircle,
  UserCheck,
  ChevronDown,
  Check,
  HardDrive,
  Loader2
} from 'lucide-react';

export default function Header({
  activeView,
  selectedClass,
  onOpenAddSubject,
  onOpenAddStudent,
  activeTerm = '2nd Term',
  academicSession = '2026/2027',
  onSelectAcademicTerm,
  onShowToast,
}) {
  const [isTermDropdownOpen, setIsTermDropdownOpen] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const dropdownRef = useRef(null);

  const termOptions = ['1st Term', '2nd Term', '3rd Term'];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsTermDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleTermSelect = (term) => {
    setIsTermDropdownOpen(false);
    if (onSelectAcademicTerm && term !== activeTerm) {
      onSelectAcademicTerm(term);
    }
  };

  const handleExecuteBackup = async () => {
    try {
      setIsBackingUp(true);
      if (onShowToast) onShowToast('Executing atomic database snapshot & USB backup...', 'info');
      const res = await fetch('/api/admin/backup', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) {
          onShowToast(data.message || `Backup completed successfully! Snapshot saved to ${data.backupDirectory}`, 'success');
        }
      } else {
        if (onShowToast) {
          onShowToast(data.message || 'Backup failed.', 'error');
        }
      }
    } catch (e) {
      if (onShowToast) {
        onShowToast('Backup execution failed. Ensure server connection.', 'error');
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <header className="h-16 bg-slate-950/90 border-b border-darkBorder flex items-center justify-between px-6 shrink-0 backdrop-blur-md z-20">
      {/* Breadcrumbs with Official School Logo Micro Emblem */}
      <div className="flex items-center space-x-3 truncate">
        <div className="w-7 h-7 rounded-lg bg-slate-900 border border-brand/30 p-0.5 shadow-sm flex items-center justify-center shrink-0">
          <img
            src="school_logo.jpg"
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

        {/* Academic Session & Active Term Selector Dropdown */}
        <div className="relative hidden md:block" ref={dropdownRef}>
          <button
            onClick={() => setIsTermDropdownOpen(!isTermDropdownOpen)}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800/80 border border-darkBorder hover:border-brand/40 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-brand"
            title="Click to switch active Academic Term"
          >
            <Calendar className="w-3.5 h-3.5 text-brand" />
            <span>{academicSession} • {activeTerm}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isTermDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Interactive Term Selection Menu */}
          {isTermDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Select Active Term ({academicSession})
              </div>
              {termOptions.map((term) => {
                const isSelected = term === activeTerm;
                return (
                  <button
                    key={term}
                    onClick={() => handleTermSelect(term)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left font-medium transition-colors ${isSelected
                        ? 'bg-brand/10 text-brand font-bold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                  >
                    <span>{term}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Server Status */}
        <div className="hidden sm:flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Node 1: Online (12ms)</span>
        </div>

        {/* USB / External Storage Backup Trigger Button */}
        <button
          onClick={handleExecuteBackup}
          disabled={isBackingUp}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-darkBorder hover:border-brand/40 text-xs font-semibold text-slate-200 transition-all cursor-pointer disabled:opacity-50"
          title="Trigger safe SQLite snapshot & mirror diagram assets to USB / external storage"
        >
          {isBackingUp ? (
            <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
          ) : (
            <HardDrive className="w-3.5 h-3.5 text-brand" />
          )}
          <span className="hidden lg:inline">{isBackingUp ? 'Backing up...' : 'Backup to USB'}</span>
        </button>

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
