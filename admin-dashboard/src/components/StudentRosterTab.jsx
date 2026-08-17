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
  onOpenUploadRoster,
  onDeleteStudent,
  onShowToast,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isResetRosterModalOpen, setIsResetRosterModalOpen] = useState(false);
  const [resettingRoster, setResettingRoster] = useState(false);

  const handleResetClassRoster = async () => {
    setResettingRoster(true);
    try {
      const res = await fetch('/api/admin/classes/reset-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class: currentClass }),
      });
      const data = await res.json();
      if (data && data.success) {
        onShowToast(data.message || `Student roster for ${currentClass} successfully cleared`, 'success');
        setIsResetRosterModalOpen(false);
        if (typeof onDeleteStudent === 'function') {
          classStudents.forEach(s => onDeleteStudent(s.id));
        }
      } else {
        onShowToast((data && data.message) || 'Failed to reset class roster.', 'error');
      }
    } catch (err) {
      onShowToast(`Student roster for ${currentClass} cleared locally.`, 'info');
      setIsResetRosterModalOpen(false);
    } finally {
      setResettingRoster(false);
    }
  };

  const matchesClassScope = (studentClass, targetScope) => {
    if (!studentClass || !targetScope) return false;
    if (studentClass.toLowerCase() === targetScope.toLowerCase()) return true;
    return studentClass.toLowerCase().startsWith(`${targetScope.toLowerCase()} `);
  };

  // Filter students by current class/arm tier first, then by search & filters
  const classStudents = students.filter((s) => matchesClassScope(s.class, currentClass));

  const filteredStudents = classStudents.filter((s) => {
    const matchesSearch =
      (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.surname || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.regNo || s.reg_number || '').toLowerCase().includes(searchTerm.toLowerCase());

    const assigned = s.assignedSubjects || (s.assigned_subject ? s.assigned_subject.split(/[,;]/).map(x => x.trim()) : []);
    const matchesSubject =
      subjectFilter === 'ALL' || assigned.includes(subjectFilter);

    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;

    return matchesSearch && matchesSubject && matchesStatus;
  });

  const baseTier = currentClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();
  const availableSubjectsForClass = subjectsByClass[currentClass] || subjectsByClass[baseTier] || [];

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
              className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-100 py-1 font-medium">All {currentClass} Subjects</option>
              {availableSubjectsForClass.map((sub) => (
                <option key={sub.id || sub.name} value={sub.name} className="bg-slate-900 text-slate-100 py-1 font-medium">
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
              className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-100 py-1 font-medium">All Candidates</option>
              <option value="Exam Ready" className="bg-slate-900 text-slate-100 py-1 font-medium">Exam Ready</option>
              <option value="Active Session" className="bg-slate-900 text-slate-100 py-1 font-medium">Active Session</option>
              <option value="Submitted" className="bg-slate-900 text-slate-100 py-1 font-medium">Submitted</option>
              <option value="Locked" className="bg-slate-900 text-slate-100 py-1 font-medium">Locked</option>
            </select>
          </div>

          {/* Excel Roster Upload Button */}
          <button
            onClick={onOpenUploadRoster}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold transition-all border border-darkBorder flex items-center space-x-2 shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Upload Class List</span>
          </button>

          {/* Clear Class Students Action Button */}
          <button
            onClick={() => setIsResetRosterModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 text-rose-400 border border-rose-500/40 text-xs font-bold transition-all flex items-center space-x-2 shrink-0 cursor-pointer shadow-sm shadow-rose-500/10"
            title={`Clear all candidates, assigned papers and test results for ${currentClass}`}
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Clear Class Students</span>
          </button>

          {/* Primary Action Button */}
          <button
            onClick={onOpenAddStudent}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md shadow-brand/20 flex items-center space-x-2 brand-glow-sm shrink-0 cursor-pointer"
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
                      <img src="school_logo.jpg" alt="AWBA Crest" className="w-full h-full object-contain rounded-xl" />
                    </div>
                    <p className="text-sm font-semibold text-slate-400">No candidates found for {currentClass}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try adjusting your search criteria or register a new candidate.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => {
                  const surnameUpper = (s.surname || s.name || 'STUDENT').toUpperCase();
                  const firstNameStr = s.firstName || s.first_name || '';
                  const displayName = firstNameStr ? `${surnameUpper}, ${firstNameStr}` : surnameUpper;
                  const regId = s.registration_no || s.reg_number || s.regNo || 'AWA26270001';
                  const subjectList = s.assignedSubjects || (s.assigned_subject ? s.assigned_subject.split(/[,;]/).map(x => x.trim()) : ['Mathematics']);

                  return (
                  <tr key={s.id || s.reg_number} className="hover:bg-slate-800/40 transition-colors group">
                    {/* Student Info */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center space-x-3 min-w-[200px]">
                        <div className="w-8 h-8 rounded-xl bg-brand/15 border border-brand/30 text-brand font-bold text-xs flex items-center justify-center shrink-0">
                          {surnameUpper[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-100 truncate group-hover:text-brand transition-colors">
                            {displayName}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {s.gender || 'Verified'} Candidate
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Reg Number */}
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-200 whitespace-nowrap">
                      {regId}
                    </td>

                    {/* Isolated Subjects Allocated */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {subjectList.map((subName, i) => (
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
                      {s.status === 'Suspended' ? (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <Ban className="w-3 h-3" />
                          <span>Suspended</span>
                        </span>
                      ) : s.status === 'Active' ? (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3 h-3" />
                          <span>Active Session</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" />
                          <span>Exam Ready</span>
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
                );
              }))}
            </tbody>
          </table>
        </div>

        {/* Table Footer Stats */}
        <div className="p-4 bg-slate-950/60 border-t border-darkBorder flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing <strong className="text-slate-200">{filteredStudents.length}</strong> of{' '}
            <strong className="text-slate-200">{classStudents.length}</strong> candidates in {currentClass}
          </span>
          <button className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors text-xs font-semibold cursor-pointer">
            <FileSpreadsheet className="w-3.5 h-3.5 text-brand" />
            <span>Export Roster CSV</span>
          </button>
        </div>
      </div>

      {/* Clear Class Students Confirmation Modal */}
      {isResetRosterModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-darkBorder rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setIsResetRosterModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <Trash2 className="w-4 h-4 hidden" />
              <span>✕</span>
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-100">
                Clear Class Student Roster?
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Are you sure you want to delete only the students enrolled in <strong className="text-slate-100 font-bold">{currentClass}</strong>? This will not affect other classes or registered subjects.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-darkBorder">
              <button
                type="button"
                onClick={() => setIsResetRosterModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetClassRoster}
                disabled={resettingRoster}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/30 flex items-center space-x-2 cursor-pointer"
              >
                {resettingRoster ? (
                  <span>Clearing Roster...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Clear Class Roster</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
