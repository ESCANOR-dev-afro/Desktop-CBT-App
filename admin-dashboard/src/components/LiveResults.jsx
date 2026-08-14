import React, { useState, useEffect } from 'react';
import {
  Printer,
  FileSpreadsheet,
  Search,
  Filter,
  Trophy,
  CheckCircle2,
  Clock,
  AlertCircle,
  Award,
  Users
} from 'lucide-react';

export default function LiveResults({ students = [], classesList = [], onShowToast }) {
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [backendResults, setBackendResults] = useState([]);
  const [backendClasses, setBackendClasses] = useState([]);
  const [backendSubjects, setBackendSubjects] = useState([]);
  const [backendRoster, setBackendRoster] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch live results and roster from backend
  const fetchResults = async () => {
    try {
      setLoading(true);
      const url = `/api/admin/results?class=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(selectedSubject)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setBackendResults(data.results || []);
        if (Array.isArray(data.classes)) setBackendClasses(data.classes);
        if (Array.isArray(data.subjects)) setBackendSubjects(data.subjects);
        if (Array.isArray(data.studentRoster)) setBackendRoster(data.studentRoster);
      }
    } catch (err) {
      console.warn('Backend results fetch notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [selectedClass, selectedSubject]);

  // Merge students from props with backend roster for universal coverage
  const combinedRoster = React.useMemo(() => {
    if (backendRoster.length > 0) return backendRoster;
    return students.map((s) => ({
      id: s.id,
      reg_number: s.regNo || s.reg_number || 'N/A',
      surname: s.surname || (s.name ? s.name.split(',')[0].trim() : 'STUDENT'),
      first_name: s.firstName || s.first_name || '',
      name: s.name || `${s.surname || ''}, ${s.firstName || ''}`,
      class: s.class || 'Unassigned',
      assigned_subject: Array.isArray(s.assignedSubjects) ? s.assignedSubjects.join(', ') : (s.assigned_subject || 'Mathematics'),
      subject: s.assigned_subject || 'Mathematics',
      status: s.status === 'Submitted' ? 'submitted' : (s.status === 'Active' ? 'active' : 'not_taken'),
      score: s.recentScore && s.recentScore !== 'N/A' ? parseInt(s.recentScore, 10) || 40 : null
    }));
  }, [backendRoster, students]);

  // Extract all distinct classes dynamically from student roster and classesList
  const dynamicClasses = React.useMemo(() => {
    const classSet = new Set();
    classesList.forEach(c => classSet.add(c));
    backendClasses.forEach(c => classSet.add(c));
    combinedRoster.forEach(s => {
      if (s.class) classSet.add(s.class);
    });
    return Array.from(classSet).sort((a, b) => a.localeCompare(b));
  }, [classesList, backendClasses, combinedRoster]);

  // Extract distinct subjects dynamically
  const dynamicSubjects = React.useMemo(() => {
    const subSet = new Set();
    backendSubjects.forEach(s => subSet.add(s));
    combinedRoster.forEach(s => {
      const assigned = String(s.assigned_subject || s.subject || '');
      assigned.split(/[,;]/).forEach(item => {
        const trimmed = item.trim();
        if (trimmed) subSet.add(trimmed);
      });
    });
    return Array.from(subSet).sort((a, b) => a.localeCompare(b));
  }, [backendSubjects, combinedRoster]);

  // Filter roster by selected class, selected subject, and search term
  const filteredRoster = combinedRoster.filter((s) => {
    const matchesClass = selectedClass === 'ALL' || (s.class || '').toLowerCase() === selectedClass.toLowerCase();
    const assignedStr = String(s.assigned_subject || s.subject || '').toLowerCase();
    const matchesSubject = selectedSubject === 'ALL' || assignedStr.includes(selectedSubject.toLowerCase());
    const matchesSearch =
      (s.name || `${s.surname || ''} ${s.first_name || ''}`).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.reg_number || s.regNo || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesClass && matchesSubject && matchesSearch;
  });

  const handleDownloadClassCsv = () => {
    try {
      const exportUrl = `/api/admin/export-csv?class=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(selectedSubject)}`;
      window.location.href = exportUrl;
      if (onShowToast) {
        onShowToast(`Downloading clean CSV report for ${selectedClass} - ${selectedSubject}...`, 'success');
      }
    } catch (e) {
      if (onShowToast) onShowToast('Failed to download CSV report.', 'error');
    }
  };

  const handleExportExcel = async () => {
    try {
      const exportUrl = `/api/admin/export-excel?class=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(selectedSubject)}`;
      window.location.href = exportUrl;
      if (onShowToast) onShowToast('Exporting official CBT results spreadsheet (.xlsx)...', 'success');
    } catch (e) {
      if (onShowToast) onShowToast('Export failed. Please try again.', 'error');
    }
  };

  const handlePrintClassResults = () => {
    window.print();
  };

  // Group filtered roster by class for rendering class sections
  const groupedByClass = React.useMemo(() => {
    const map = {};
    filteredRoster.forEach((student) => {
      const cls = student.class || 'Unassigned';
      if (!map[cls]) map[cls] = [];
      map[cls].push(student);
    });
    return map;
  }, [filteredRoster]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner (Hidden on Print) */}
      <div className="print:hidden bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-darkBorder p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center space-x-4 min-w-0 z-10">
          <div className="w-14 h-14 rounded-2xl bg-slate-950 border-2 border-brand/40 p-1 shadow-lg shadow-brand/10 flex items-center justify-center shrink-0">
            <img
              src="school_logo.jpg"
              alt="Anthony White Bridge Academy Logo"
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-brand uppercase tracking-wider bg-brand/10 px-2.5 py-1 rounded-md border border-brand/20">
              Official Class-Based Analytics & Reports
            </span>
            <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight mt-1.5">
              Anthony White Bridge Academy Class Score Sheets
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Class & Subject score filtering, clean CSV report downloads, and printable score sheets
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10 shrink-0">
          <button
            onClick={handleDownloadClassCsv}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md shadow-brand/25 flex items-center space-x-2 brand-glow-sm cursor-pointer"
            title="Download clean CSV report for selected class and subject"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Class Report (CSV)</span>
          </button>

          <button
            onClick={handlePrintClassResults}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md flex items-center space-x-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Score Sheet</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-darkBorder text-slate-200 text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Screen Control Bar (Hidden on Print) */}
      <div className="print:hidden bg-slate-900 border border-darkBorder rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-xl">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search candidate name or reg number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 text-xs pl-10 pr-4 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-brand text-slate-200"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Class Filter Dropdown */}
          <div className="flex items-center space-x-2 bg-slate-950 border border-darkBorder px-3.5 py-2 rounded-xl">
            <Filter className="w-4 h-4 text-brand shrink-0" />
            <label className="text-xs text-slate-400 font-medium shrink-0">Class:</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Classes ({dynamicClasses.length} Arms)</option>
              {dynamicClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Filter Dropdown */}
          <div className="flex items-center space-x-2 bg-slate-950 border border-darkBorder px-3.5 py-2 rounded-xl">
            <Award className="w-4 h-4 text-brand shrink-0" />
            <label className="text-xs text-slate-400 font-medium shrink-0">Subject:</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Subjects ({dynamicSubjects.length})</option>
              {dynamicSubjects.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Class Sections Display Area */}
      {Object.keys(groupedByClass).length === 0 ? (
        <div className="bg-slate-900 border border-darkBorder rounded-2xl p-12 text-center text-slate-400">
          <Users className="w-12 h-12 mx-auto text-slate-600 mb-3" />
          <p className="text-base font-bold text-slate-300">No candidates found for the selected class scope.</p>
          <p className="text-xs text-slate-500 mt-1">Try selecting "All School Classes" or clearing search criteria.</p>
        </div>
      ) : (
        Object.entries(groupedByClass).map(([className, roster]) => {
          const totalInClass = roster.length;
          const submittedCount = roster.filter((r) => r.status === 'submitted' || r.score !== null).length;
          const activeCount = roster.filter((r) => r.status === 'active').length;

          return (
            <div
              key={className}
              className="bg-slate-900 border border-darkBorder rounded-2xl p-6 space-y-4 shadow-xl page-break-after-always print:bg-white print:text-black print:p-0 print:border-none print:shadow-none"
            >
              {/* Printable Official Header (Only Visible on Print) */}
              <div className="hidden print:block mb-6 border-b-2 border-black pb-4 text-center">
                <h1 className="text-2xl font-black uppercase tracking-wide text-black">ANTHONY WHITE BRIDGE ACADEMY</h1>
                <h2 className="text-sm font-bold text-slate-700 uppercase mt-0.5">Official CBT Performance Score Sheet</h2>
                <div className="flex justify-between items-center text-xs font-semibold text-slate-600 mt-3 pt-2 border-t border-slate-300">
                  <span>Class: <strong>{className}</strong></span>
                  <span>Total Enrolled: <strong>{totalInClass} Candidates</strong></span>
                  <span>Completed: <strong>{submittedCount} / {totalInClass}</strong></span>
                  <span>Date: <strong>{new Date().toLocaleDateString()}</strong></span>
                </div>
              </div>

              {/* Class Header Bar (Screen View) */}
              <div className="print:hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-darkBorder">
                <div>
                  <div className="flex items-center space-x-3">
                    <span className="px-3 py-1 bg-brand/15 text-brand font-black text-sm rounded-lg border border-brand/30">
                      {className}
                    </span>
                    <h3 className="text-lg font-bold text-slate-100">Official Class Roster & Exam Scores</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {totalInClass} Total Candidates | {submittedCount} Submitted | {activeCount} Active Session(s)
                  </p>
                </div>

                <button
                  onClick={handlePrintClassResults}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-darkBorder flex items-center space-x-2 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-brand" />
                  <span>Print {className} Sheet</span>
                </button>
              </div>

              {/* Candidates Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs print:text-black print:border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-bold border-b border-darkBorder uppercase text-[10px] tracking-wider print:bg-slate-100 print:text-black print:border-b-2 print:border-black">
                    <tr>
                      <th className="px-4 py-3 text-center w-12 print:border print:border-slate-300">#</th>
                      <th className="px-4 py-3 print:border print:border-slate-300">Registration No</th>
                      <th className="px-4 py-3 print:border print:border-slate-300">Candidate Name</th>
                      <th className="px-4 py-3 print:border print:border-slate-300">Assigned Subject</th>
                      <th className="px-4 py-3 text-center print:border print:border-slate-300">Status</th>
                      <th className="px-4 py-3 text-right print:border print:border-slate-300">Score (/50)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-darkBorder/60 text-slate-200 print:divide-slate-300 print:text-black">
                    {roster.map((student, idx) => {
                      const isSubmitted = student.status === 'submitted' || student.score !== null;
                      const isActive = student.status === 'active';
                      const scoreVal = student.score !== null && student.score !== undefined ? student.score : null;

                      return (
                        <tr key={student.id || idx} className="hover:bg-slate-800/40 transition-colors print:hover:bg-transparent">
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-400 print:text-black print:border print:border-slate-300">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-300 print:text-black print:border print:border-slate-300">
                            {student.reg_number || student.regNo}
                          </td>
                          <td className="px-4 py-3 font-extrabold text-slate-100 print:text-black print:border print:border-slate-300">
                            {student.surname ? `${student.surname}, ${student.first_name || ''}` : student.name}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-400 print:text-black print:border print:border-slate-300">
                            {student.assigned_subject || student.subject || 'Mathematics'}
                          </td>
                          <td className="px-4 py-3 text-center print:border print:border-slate-300">
                            {isSubmitted ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 print:border-none print:bg-transparent print:text-black">
                                <CheckCircle2 className="w-3 h-3 mr-1 print:hidden" /> Submitted
                              </span>
                            ) : isActive ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 print:border-none print:bg-transparent print:text-black">
                                <Clock className="w-3 h-3 mr-1 print:hidden" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 print:border-none print:bg-transparent print:text-black">
                                Not Taken
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-sm print:border print:border-slate-300">
                            {scoreVal !== null ? (
                              <span className="text-emerald-400 print:text-black">
                                {scoreVal} / 50 <span className="text-xs text-slate-400 print:text-slate-700 font-normal">({Math.round((scoreVal / 50) * 100)}%)</span>
                              </span>
                            ) : (
                              <span className="text-slate-500 italic print:text-black">N/A</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Printable Official Signatures Footer (Only Visible on Print) */}
              <div className="hidden print:grid grid-cols-2 gap-8 pt-12 mt-8 border-t border-black text-xs font-bold">
                <div>
                  <p>Form Teacher / Exam Supervisor:</p>
                  <div className="border-b border-black mt-8 w-48"></div>
                  <p className="text-[10px] text-slate-600 mt-1">Signature & Date</p>
                </div>
                <div className="text-right">
                  <p>Principal / CBT Administrator:</p>
                  <div className="border-b border-black mt-8 w-48 ml-auto"></div>
                  <p className="text-[10px] text-slate-600 mt-1">Signature & Stamp</p>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
