import React, { useState } from 'react';
import {
  BarChart3,
  Trophy,
  Download,
  Filter,
  Search,
  CheckCircle2,
  Award,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';

export default function LiveResults({ students, classesList, onShowToast }) {
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredStudents = students.filter((s) => {
    const matchesClass = selectedClass === 'ALL' || s.class === selectedClass;
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.regNo.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesClass && matchesSearch;
  });

  const handleExportResults = () => {
    onShowToast('Exported CBT Live Results Report to CSV format successfully!', 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner with Official School Logo & Background Watermark */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-darkBorder p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        {/* Watermark Logo */}
        <img
          src="/school_logo.jpg"
          alt=""
          className="absolute right-4 top-1/2 -translate-y-1/2 w-48 h-48 opacity-[0.06] object-contain pointer-events-none filter drop-shadow-md"
        />

        <div className="flex items-center space-x-4 min-w-0 z-10">
          <div className="w-14 h-14 rounded-2xl bg-slate-950 border-2 border-brand/40 p-1 shadow-lg shadow-brand/10 flex items-center justify-center shrink-0">
            <img
              src="/school_logo.jpg"
              alt="Anthony White Bridge Academy Logo"
              className="w-full h-full object-contain rounded-xl"
            />
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-brand uppercase tracking-wider bg-brand/10 px-2.5 py-1 rounded-md border border-brand/20">
              Official Real-Time Analytics
            </span>
            <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight mt-1.5">
              Anthony White Bridge Academy Live CBT Results
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Automated grading, class average performance & candidate leaderboard
            </p>
          </div>
        </div>

        <button
          onClick={handleExportResults}
          className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md shadow-brand/20 flex items-center space-x-2 brand-glow-sm z-10 shrink-0"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Export Full Score CSV</span>
        </button>
      </div>

      {/* Leaderboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-slate-900 border border-darkBorder p-5 rounded-2xl flex items-center space-x-4 shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xl shrink-0">
            🥇
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Class Top Scorer</p>
            <h4 className="text-sm font-extrabold text-slate-100">Amina Usman (SS 3)</h4>
            <p className="text-xs font-bold text-brand mt-0.5">94% Aggregate Score</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-darkBorder p-5 rounded-2xl flex items-center space-x-4 shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-slate-700/20 border border-slate-600 flex items-center justify-center text-slate-300 font-bold text-xl shrink-0">
            🥈
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Second Highest</p>
            <h4 className="text-sm font-extrabold text-slate-100">Zainab Ahmed (SS 3)</h4>
            <p className="text-xs font-bold text-emerald-400 mt-0.5">91% Aggregate Score</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-darkBorder p-5 rounded-2xl flex items-center space-x-4 shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand font-bold text-xl shrink-0">
            🥉
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Third Highest</p>
            <h4 className="text-sm font-extrabold text-slate-100">Chidi Obi (SS 3)</h4>
            <p className="text-xs font-bold text-slate-300 mt-0.5">88% Aggregate Score</p>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-slate-900 border border-darkBorder rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-darkBorder">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search candidate by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 text-xs pl-10 pr-4 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-brand text-slate-200"
            />
          </div>

          <div className="flex items-center space-x-2 bg-slate-950 border border-darkBorder px-3 py-1.5 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-brand" />
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All School Classes</option>
              {classesList.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-darkBorder uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Candidate Name</th>
                <th className="px-4 py-3.5">Reg Number</th>
                <th className="px-4 py-3.5">Class Scope</th>
                <th className="px-4 py-3.5">Tested Subjects</th>
                <th className="px-4 py-3.5 text-right">Score Percentage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder/60">
              {filteredStudents.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-slate-100">
                    <div className="flex items-center space-x-3">
                      <img
                        src={s.avatar}
                        alt={s.name}
                        className="w-8 h-8 rounded-full object-cover border border-darkBorder shrink-0"
                      />
                      <span>{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-slate-300">{s.regNo}</td>
                  <td className="px-4 py-3.5 font-semibold text-brand">{s.class}</td>
                  <td className="px-4 py-3.5 text-slate-400">
                    {s.assignedSubjects.join(', ')}
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-sm text-emerald-400">
                    {s.recentScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
