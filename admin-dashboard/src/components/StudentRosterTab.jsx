import React, { useState } from 'react';
import {
  Search,
  Filter,
  UserPlus,
  Key,
  Trash2,
  Edit,
  ShieldCheck,
  CheckCircle,
  Clock,
  Ban,
  Download,
  FileSpreadsheet
} from 'lucide-react';

export default function StudentRosterTab({
  students,
  currentClass,
  subjectsByClass,
  onOpenAddStudent,
  onDeleteStudent,
  onShowToast,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Filter students by current class first, then by search & filters
  const classStudents = students.filter((s) => s.class === currentClass);

  const filteredStudents = classStudents.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.regNo.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSubject =
      subjectFilter === 'ALL' || s.assignedSubjects.includes(subjectFilter);

    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;

    return matchesSearch && matchesSubject && matchesStatus;
  });

  const availableSubjectsForClass = subjectsByClass[currentClass] || [];

  const handleGeneratePasscode = (studentName) => {
    const pass = Math.floor(100000 + Math.random() * 900000);
    onShowToast(`Generated CBT Passcode [${pass}] for ${studentName}`, 'info');
  };

  return (
    <div className="space-y-5">
      {/* Multi-column Flex Controls Bar */}
      <div className="bg-slate-900 border border-darkBorder p-4 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder={`Search ${currentClass} candidates by name or Reg No...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 text-xs pl-10 pr-4 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-brand text-slate-200"
          />
        </div>

        {/* Filter controls group */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Subject Filter Dropdown (Isolated to current class) */}
          <div className="flex items-center space-x-2 bg-slate-950 border border-darkBorder px-3 py-1.5 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-brand" />
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All {currentClass} Subjects</option>
              {availableSubjectsForClass.map((sub) => (
                <option key={sub.id} value={sub.name}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center space-x-2 bg-slate-950 border border-darkBorder px-3 py-1.5 rounded-xl">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="Exam Ready">Exam Ready</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>

          {/* Primary Action Button */}
          <button
            onClick={onOpenAddStudent}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md shadow-brand/20 flex items-center space-x-2 brand-glow-sm shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Register Candidate</span>
          </button>
        </div>
      </div>

      {/* Roster Data Table Container */}
      <div className="bg-slate-900 border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-darkBorder uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Candidate Info</th>
                <th className="px-4 py-3.5">Reg Number</th>
                <th className="px-4 py-3.5">Isolated Subjects Allocated</th>
                <th className="px-4 py-3.5">CBT Status</th>
                <th className="px-4 py-3.5">Latest CBT Score</th>
                <th className="px-5 py-3.5 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder/60">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-brand/30 p-1 mx-auto mb-3 opacity-60 flex items-center justify-center">
                      <img src="/school_logo.jpg" alt="AWBA Crest" className="w-full h-full object-contain rounded-xl" />
                    </div>
                    <p className="text-sm font-semibold text-slate-400">No candidates found for {currentClass}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try adjusting your search criteria or register a new candidate.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors group">
                    {/* Student Info */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center space-x-3 min-w-[200px]">
                        <img
                          src={s.avatar}
                          alt={s.name}
                          className="w-9 h-9 rounded-full object-cover border border-darkBorder shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-100 truncate group-hover:text-brand transition-colors">
                            {s.name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {s.gender} • Parent: {s.parentContact}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Reg Number */}
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-200 whitespace-nowrap">
                      {s.regNo}
                    </td>

                    {/* Isolated Subjects Allocated */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {s.assignedSubjects.map((subName, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-950 text-brand border border-brand/20 whitespace-nowrap"
                          >
                            {subName}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {s.status === 'Exam Ready' && (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" />
                          <span>Exam Ready</span>
                        </span>
                      )}
                      {s.status === 'Active' && (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3 h-3" />
                          <span>Active Session</span>
                        </span>
                      )}
                      {s.status === 'Suspended' && (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <Ban className="w-3 h-3" />
                          <span>Suspended</span>
                        </span>
                      )}
                    </td>

                    {/* Score */}
                    <td className="px-4 py-3.5 font-semibold text-slate-200 whitespace-nowrap">
                      {s.recentScore}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleGeneratePasscode(s.name)}
                          title="Generate CBT Access Passcode"
                          className="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteStudent(s.id)}
                          title="Delete Candidate Record"
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Stats */}
        <div className="p-4 bg-slate-950/60 border-t border-darkBorder flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing <strong className="text-slate-200">{filteredStudents.length}</strong> of{' '}
            <strong className="text-slate-200">{classStudents.length}</strong> candidates in {currentClass}
          </span>
          <button className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors text-xs font-semibold">
            <FileSpreadsheet className="w-3.5 h-3.5 text-brand" />
            <span>Export Roster CSV</span>
          </button>
        </div>
      </div>
    </div>
  );
}
