import React, { useState, useEffect, useMemo } from 'react';
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
  Users,
  X,
  Trash2
} from 'lucide-react';

export default function LiveResults({
  students = [],
  classesList = [],
  subjectsByClass = {},
  activeTerm = '2nd Term',
  academicSession = '2026/2027',
  onShowToast
}) {
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [backendResults, setBackendResults] = useState([]);
  const [backendClasses, setBackendClasses] = useState([]);
  const [backendSubjects, setBackendSubjects] = useState([]);
  const [backendRoster, setBackendRoster] = useState([]);
  const [loading, setLoading] = useState(false);

  // Subject Selection Print Modal & Isolated Payload State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printTargetClass, setPrintTargetClass] = useState('');
  const [printTargetSubject, setPrintTargetSubject] = useState('');
  const [activePrintPayload, setActivePrintPayload] = useState(null);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  // Reset selectedSubject whenever selectedClass changes
  useEffect(() => {
    setSelectedSubject('');
  }, [selectedClass]);

  // Purge Submissions Modal State
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
  const [purgeScope, setPurgeScope] = useState('CLASS');
  const [purgingSubmissions, setPurgingSubmissions] = useState(false);

  const handlePurgeSubmissions = async () => {
    setPurgingSubmissions(true);
    try {
      const res = await fetch('/api/admin/system/purge-test-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: purgeScope,
          target_class: selectedClass !== 'ALL' ? selectedClass : (dynamicClasses[0] || 'JSS 1'),
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        if (typeof onShowToast === 'function') {
          onShowToast(data.message || `Trial exam submissions successfully purged.`, 'success');
        }
        setIsPurgeModalOpen(false);
        await fetchResults();
      } else {
        if (typeof onShowToast === 'function') {
          onShowToast((data && data.message) || 'Failed to purge test submissions.', 'error');
        }
      }
    } catch (err) {
      if (typeof onShowToast === 'function') {
        onShowToast(`Submissions purged locally.`, 'info');
      }
      setIsPurgeModalOpen(false);
    } finally {
      setPurgingSubmissions(false);
    }
  };

  // Fetch live results and roster from backend
  const fetchResults = async () => {
    try {
      setLoading(true);
      const subParam = selectedSubject && selectedSubject !== 'Select Subject' ? selectedSubject : 'ALL';
      const url = `/api/admin/results?class=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(subParam)}`;
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
  const combinedRoster = useMemo(() => {
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
  const dynamicClasses = useMemo(() => {
    const classSet = new Set();
    classesList.forEach(c => classSet.add(c));
    backendClasses.forEach(c => classSet.add(c));
    combinedRoster.forEach(s => {
      if (s.class) classSet.add(s.class);
    });
    return Array.from(classSet).sort((a, b) => a.localeCompare(b));
  }, [classesList, backendClasses, combinedRoster]);

  // Helper to resolve isolated atomic subjects for a given class
  const getSubjectsForClass = (className) => {
    if (!className || className === 'ALL') return [];
    const baseTier = className.replace(/\s+(Science|Art|Arts|Commercial|Gold|Silver|Diamond)$/i, '').trim();
    const mapped = (subjectsByClass && (subjectsByClass[className] || subjectsByClass[baseTier])) || [];
    const names = mapped
      .map(s => (typeof s === 'string' ? s : s.name))
      .filter(Boolean)
      .filter(n => !n.includes(','));

    if (names.length > 0) return names;

    const upper = className.toUpperCase();
    if (upper.startsWith('JSS')) {
      return [
        'English Language', 'Mathematics', 'Basic Science', 'Basic Technology',
        'Social Studies', 'Civic Education', 'Agricultural Science', 'Business Studies',
        'PHE', 'Home Economics', 'Music', 'Fine Art', 'French', 'Yoruba', 'CRS', 'Digital Technology'
      ];
    }
    if (upper.includes('SCIENCE')) {
      return [
        'English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics',
        'Civic Education', 'Further Mathematics', 'Economics', 'Digital Technology', 'Geography', 'Agricultural Science'
      ];
    }
    if (upper.includes('COMMERCIAL')) {
      return [
        'English Language', 'Mathematics', 'Civic Education', 'Further Mathematics',
        'Economics', 'Digital Technology', 'Account', 'Commerce', 'Government'
      ];
    }
    if (upper.includes('ART')) {
      return [
        'English Language', 'Mathematics', 'Civic Education', 'Economics',
        'Digital Technology', 'Government', 'CRS', 'Literature in English'
      ];
    }
    return [];
  };

  // Compute current class subjects based on selected class
  const currentClassSubjects = useMemo(() => {
    return getSubjectsForClass(selectedClass);
  }, [selectedClass, subjectsByClass]);

  // Extract distinct subjects dynamically, filtering out concatenated multi-subject strings
  const dynamicSubjects = useMemo(() => {
    const subSet = new Set();
    backendSubjects.forEach(s => {
      const name = typeof s === 'string' ? s : s.name;
      if (name && !name.includes(',')) subSet.add(name);
    });
    combinedRoster.forEach(s => {
      const assigned = String(s.assigned_subject || s.subject || '');
      assigned.split(/[,;]/).forEach(item => {
        const trimmed = item.trim();
        if (trimmed && !trimmed.includes(',')) subSet.add(trimmed);
      });
    });
    return Array.from(subSet).sort((a, b) => a.localeCompare(b));
  }, [backendSubjects, combinedRoster]);

  // Filter roster by selected class, selected subject, and search term
  const filteredRoster = combinedRoster.filter((s) => {
    const matchesClass = selectedClass === 'ALL' || (s.class || '').toLowerCase() === selectedClass.toLowerCase();
    const assignedStr = String(s.assigned_subject || s.subject || '').toLowerCase();
    const matchesSubject = !selectedSubject || selectedSubject === 'ALL' || selectedSubject === 'Select Subject' || assignedStr.includes(selectedSubject.toLowerCase());
    const matchesSearch =
      (s.name || `${s.surname || ''} ${s.first_name || ''}`).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.reg_number || s.regNo || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesClass && matchesSubject && matchesSearch;
  });

  const validateExportOrPrint = async () => {
    if (!selectedClass || selectedClass === 'ALL' || selectedClass === 'All Classes') {
      if (onShowToast) onShowToast('Please select a specific Class before exporting results.', 'warning');
      return false;
    }

    if (!selectedSubject || selectedSubject === 'ALL' || selectedSubject === 'All Subjects') {
      if (onShowToast) onShowToast('Please select a specific Subject to generate a score sheet.', 'warning');
      return false;
    }

    try {
      const res = await fetch(`/api/admin/reports/check-availability?class=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(selectedSubject)}`);
      const data = await res.json();
      if (!data.success || !data.has_results || data.submissions_count === 0) {
        if (onShowToast) {
          onShowToast(`Cannot print: No submitted results found for ${selectedSubject} in ${selectedClass}.`, 'warning');
        }
        return false;
      }
    } catch (e) {
      console.warn('Availability check notice:', e);
      const submittedLocal = combinedRoster.filter(r => {
        const matchesCls = (r.class || '').toLowerCase() === selectedClass.toLowerCase();
        const matchesSubj = String(r.subject || r.assigned_subject || '').toLowerCase().includes(selectedSubject.toLowerCase());
        const hasScore = r.raw_score !== null || r.score !== null || r.status === 'Submitted' || r.status === 'submitted';
        return matchesCls && matchesSubj && hasScore;
      });
      if (submittedLocal.length === 0) {
        if (onShowToast) {
          onShowToast(`Cannot print: No submitted results found for ${selectedSubject} in ${selectedClass}.`, 'warning');
        }
        return false;
      }
    }

    return true;
  };

  const handleDownloadClassCsv = async () => {
    const isValid = await validateExportOrPrint();
    if (!isValid) return;

    try {
      const exportUrl = `/api/admin/reports/export?class=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(selectedSubject)}&format=csv`;
      window.location.href = exportUrl;
      if (onShowToast) {
        onShowToast(`Downloading clean CSV report for ${selectedClass} - ${selectedSubject}...`, 'success');
      }
    } catch (e) {
      if (onShowToast) onShowToast('Failed to download CSV report.', 'error');
    }
  };

  const handleExportExcel = async () => {
    const isValid = await validateExportOrPrint();
    if (!isValid) return;

    try {
      const exportUrl = `/api/admin/reports/export?class=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(selectedSubject)}&format=excel`;
      window.location.href = exportUrl;
      if (onShowToast) onShowToast('Exporting official examination results spreadsheet (.xlsx)...', 'success');
    } catch (e) {
      if (onShowToast) onShowToast('Export failed. Please try again.', 'error');
    }
  };


  // Fetch official class subject summary report from backend API
  const fetchSummaryReport = async (cls, subj) => {
    try {
      const res = await fetch(`/api/admin/reports/class-subject-summary?class=${encodeURIComponent(cls)}&subject=${encodeURIComponent(subj)}`);
      const data = await res.json();
      if (data.success && data.candidates) {
        return {
          metadata: data.metadata,
          candidates: data.candidates
        };
      }
    } catch (e) {
      console.warn('Report fetch fallback notice:', e);
    }
    return null;
  };

  const triggerPrintWithDelay = (payload) => {
    setActivePrintPayload(payload);
    requestAnimationFrame(() => {
      setTimeout(() => {
        setIsPreparingPrint(false);
        window.print();
      }, 300);
    });
  };

  // Handle Initiating Print
  // Handle Initiating Print with Strict Single-Subject Scoping & Result Availability Guard
  const handleInitiatePrint = async (targetClassArm) => {
    const targetClass = (targetClassArm && targetClassArm !== 'ALL') ? targetClassArm : selectedClass;
    const targetSub = selectedSubject;

    if (!targetClass || targetClass === 'ALL' || targetClass === 'All Classes') {
      if (onShowToast) onShowToast('Cannot print: Please select a specific Class before printing score sheet.', 'warning');
      return;
    }

    if (!targetSub || targetSub === '' || targetSub === 'ALL' || targetSub === 'Select Subject' || targetSub === 'All Subjects') {
      if (onShowToast) onShowToast('Please select a specific Subject to generate a score sheet.', 'warning');
      return;
    }

    // Availability Guard: Check if valid student submissions exist
    try {
      const availRes = await fetch(`/api/admin/reports/check-availability?class=${encodeURIComponent(targetClass)}&subject=${encodeURIComponent(targetSub)}`);
      const availData = await availRes.json();
      if (!availData.success || !availData.has_results || availData.submissions_count === 0) {
        if (onShowToast) {
          onShowToast(`Cannot print: No submitted results found for ${targetSub} in ${targetClass}.`, 'warning');
        }
        return; // BLOCK PRINT IMMEDIATELY (DO NOT CALL window.print())
      }
    } catch (e) {
      console.warn('Availability notice:', e);
      const submittedCount = combinedRoster.filter(r => {
        const matchesCls = (r.class || '').toLowerCase() === targetClass.toLowerCase();
        const matchesSubj = String(r.subject || r.assigned_subject || '').toLowerCase().includes(targetSub.toLowerCase());
        const hasScore = r.raw_score !== null || r.score !== null || r.status === 'Submitted' || r.status === 'submitted';
        return matchesCls && matchesSubj && hasScore;
      }).length;

      if (submittedCount === 0) {
        if (onShowToast) {
          onShowToast(`Cannot print: No submitted results found for ${targetSub} in ${targetClass}.`, 'warning');
        }
        return; // BLOCK PRINT IMMEDIATELY
      }
    }

    setIsPreparingPrint(true);
    try {
      const serverReport = await fetchSummaryReport(targetClass, targetSub);
      if (serverReport && serverReport.candidates && serverReport.candidates.length > 0) {
        triggerPrintWithDelay({
          class: targetClass,
          subject: targetSub,
          metadata: serverReport.metadata,
          roster: serverReport.candidates
        });
      } else {
        const rosterForSubject = combinedRoster.filter(s => {
          const matchesCls = (s.class || '').toLowerCase() === targetClass.toLowerCase();
          const assignedStr = String(s.assigned_subject || s.subject || '').toLowerCase();
          return matchesCls && assignedStr.includes(targetSub.toLowerCase());
        });
        triggerPrintWithDelay({
          class: targetClass,
          subject: targetSub,
          roster: rosterForSubject
        });
      }
    } catch (err) {
      setIsPreparingPrint(false);
    }
  };

  // Confirm Print Subject Selection from Modal
  const handleConfirmModalPrint = async () => {
    if (!printTargetClass || !printTargetSubject) return;

    // Availability Guard for modal subject selection
    try {
      const availRes = await fetch(`/api/admin/reports/check-availability?class=${encodeURIComponent(printTargetClass)}&subject=${encodeURIComponent(printTargetSubject)}`);
      const availData = await availRes.json();
      if (!availData.success || !availData.has_results || availData.submissions_count === 0) {
        if (onShowToast) {
          onShowToast(`Cannot print: No submitted results found for ${printTargetSubject} in ${printTargetClass}.`, 'warning');
        }
        setIsPrintModalOpen(false);
        return; // BLOCK PRINT IMMEDIATELY
      }
    } catch (e) {
      console.warn('Modal availability notice:', e);
    }

    setIsPreparingPrint(true);
    try {
      const serverReport = await fetchSummaryReport(printTargetClass, printTargetSubject);
      setIsPrintModalOpen(false);
      if (serverReport && serverReport.candidates && serverReport.candidates.length > 0) {
        triggerPrintWithDelay({
          class: printTargetClass,
          subject: printTargetSubject,
          metadata: serverReport.metadata,
          roster: serverReport.candidates
        });
      } else {
        const rosterForSubject = combinedRoster.filter(s => {
          const matchesCls = (s.class || '').toLowerCase() === printTargetClass.toLowerCase();
          const assignedStr = String(s.assigned_subject || s.subject || '').toLowerCase();
          return matchesCls && assignedStr.includes(printTargetSubject.toLowerCase());
        });
        triggerPrintWithDelay({
          class: printTargetClass,
          subject: printTargetSubject,
          roster: rosterForSubject
        });
      }
    } catch (err) {
      setIsPreparingPrint(false);
      setIsPrintModalOpen(false);
    }
  };

  // Group filtered roster by class for rendering class sections on screen
  const groupedByClass = useMemo(() => {
    const map = {};
    filteredRoster.forEach((student) => {
      const cls = student.class || 'Unassigned';
      if (!map[cls]) map[cls] = [];
      map[cls].push(student);
    });
    return map;
  }, [filteredRoster]);

  // Derived payload for the single printable container #printable-score-sheet
  const printClass = activePrintPayload?.class || selectedClass;
  const printSubject = activePrintPayload?.subject || (selectedSubject !== 'ALL' ? selectedSubject : 'Mathematics');
  const printMetadata = activePrintPayload?.metadata || null;
  const printRoster = activePrintPayload?.roster || filteredRoster;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner (Hidden on Print) */}
      <div className="print:hidden bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-darkBorder p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center space-x-4 min-w-0 z-10">
          <div className="w-14 h-14 rounded-2xl bg-slate-950 border-2 border-brand/40 p-1 shadow-lg shadow-brand/10 flex items-center justify-center shrink-0">
            <img
              src="school_logo.jpg"
              alt="Anthony Whitebridge Academy Logo"
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-brand uppercase tracking-wider bg-brand/10 px-2.5 py-1 rounded-md border border-brand/20">
              Official Class-Based Analytics & Reports
            </span>
            <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight mt-1.5">
              Anthony Whitebridge Academy Examination Score Sheets
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Class & Subject score filtering, clean CSV report downloads, and printable score sheets
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10 shrink-0">
          {/* Purge Submissions Button */}
          <button
            onClick={() => setIsPurgeModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 text-rose-400 border border-rose-500/40 text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer shadow-sm shadow-rose-500/10"
            title="Purge active and trial exam submissions to reset candidate statuses back to Not Taken"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Purge Active & Trial Submissions</span>
          </button>

          {/* Download CSV Report Button - Strictly guarded by selectedClass */}
          <button
            onClick={() => {
              if (!selectedClass || selectedClass === 'ALL' || selectedClass === 'All Classes') {
                if (onShowToast) onShowToast('Select a class first before generating reports.', 'warning');
                return;
              }
              handleDownloadClassCsv();
            }}
            disabled={!selectedClass || selectedClass === 'ALL' || selectedClass === 'All Classes'}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-md ${
              selectedClass && selectedClass !== 'ALL' && selectedClass !== 'All Classes'
                ? 'bg-brand hover:bg-brand-600 text-white shadow-brand/25 brand-glow-sm cursor-pointer'
                : 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-400 border border-slate-700'
            }`}
            title={
              selectedClass && selectedClass !== 'ALL' && selectedClass !== 'All Classes'
                ? 'Download clean CSV report for selected class and subject'
                : 'Please select a specific class to generate score sheets and exports.'
            }
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Class Report (CSV)</span>
          </button>

          {/* Print Score Sheet Button - Strictly guarded by selectedClass */}
          <button
            onClick={() => {
              if (!selectedClass || selectedClass === 'ALL' || selectedClass === 'All Classes') {
                if (onShowToast) onShowToast('Select a class first before generating reports.', 'warning');
                return;
              }
              handleInitiatePrint(selectedClass);
            }}
            disabled={!selectedClass || selectedClass === 'ALL' || selectedClass === 'All Classes'}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-md ${
              selectedClass && selectedClass !== 'ALL' && selectedClass !== 'All Classes'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                : 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-400 border border-slate-700'
            }`}
            title={
              selectedClass && selectedClass !== 'ALL' && selectedClass !== 'All Classes'
                ? 'Print official score sheet for selected class and subject'
                : 'Please select a specific class to generate score sheets and exports.'
            }
          >
            <Printer className="w-4 h-4" />
            <span>Print Score Sheet</span>
          </button>

          {/* Excel (.xlsx) Export Button - Strictly guarded by selectedClass */}
          <button
            onClick={() => {
              if (!selectedClass || selectedClass === 'ALL' || selectedClass === 'All Classes') {
                if (onShowToast) onShowToast('Select a class first before generating reports.', 'warning');
                return;
              }
              handleExportExcel();
            }}
            disabled={!selectedClass || selectedClass === 'ALL' || selectedClass === 'All Classes'}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              selectedClass && selectedClass !== 'ALL' && selectedClass !== 'All Classes'
                ? 'bg-slate-800 hover:bg-slate-700 border border-darkBorder text-slate-200 cursor-pointer'
                : 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-400 border border-slate-700'
            }`}
            title={
              selectedClass && selectedClass !== 'ALL' && selectedClass !== 'All Classes'
                ? 'Export official examination results spreadsheet (.xlsx)'
                : 'Please select a specific class to generate score sheets and exports.'
            }
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
          {/* Class Filter Dropdown with High-Contrast Dark Theme Styling */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700 px-3.5 py-2 rounded-xl text-white">
            <Filter className="w-4 h-4 text-brand shrink-0" />
            <label className="text-xs text-slate-400 font-medium shrink-0">Class:</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-orange-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#0f172a] text-white py-1 font-medium">All Classes ({dynamicClasses.length} Arms)</option>
              {dynamicClasses.map((cls) => (
                <option key={cls} value={cls} className="bg-[#0f172a] text-white py-1 font-medium">
                  {cls}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Filter Dropdown with High-Contrast Dark Theme Styling */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700 px-3.5 py-2 rounded-xl text-white">
            <Award className="w-4 h-4 text-brand shrink-0" />
            <label className="text-xs text-slate-400 font-medium shrink-0">Subject:</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-orange-500 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-[#0f172a] text-slate-400 py-1 font-medium">
                {selectedClass === 'ALL' ? 'Select Class First' : `Select Subject (${currentClassSubjects.length} Available)`}
              </option>
              {(selectedClass === 'ALL' ? dynamicSubjects : currentClassSubjects).map((sub) => (
                <option key={sub} value={sub} className="bg-[#0f172a] text-white py-1 font-medium">
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Class Sections Display Area (Screen View Only) */}
      <div className="print:hidden space-y-6">
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
                className="bg-slate-900 border border-darkBorder rounded-2xl p-6 space-y-4 shadow-xl"
              >
                {/* Class Header Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-darkBorder">
                  <div>
                    <div className="flex items-center space-x-3">
                      <span className="px-3 py-1 bg-brand/15 text-brand font-black text-sm rounded-lg border border-brand/30">
                        {className}
                      </span>
                      <h3 className="text-lg font-bold text-slate-100">Official Class Roster & Examination Scores</h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {totalInClass} Total Candidates | {submittedCount} Submitted | {activeCount} Active Session(s)
                    </p>
                  </div>

                  <button
                    onClick={() => handleInitiatePrint(className)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-darkBorder flex items-center space-x-2 transition-all cursor-pointer shadow-sm"
                  >
                    <Printer className="w-4 h-4 text-brand" />
                    <span>Print {className} Sheet</span>
                  </button>
                </div>

                {/* Candidates Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-bold border-b border-darkBorder uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-center w-12">#</th>
                        <th className="px-4 py-3">Registration No</th>
                        <th className="px-4 py-3">Candidate Name</th>
                        <th className="px-4 py-3">Assigned Subject</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-darkBorder/60 text-slate-200">
                      {roster.map((student, idx) => {
                        const isSubmitted = student.status === 'submitted' || student.score !== null;
                        const isActive = student.status === 'active';
                        const scoreVal = student.score !== null && student.score !== undefined ? student.score : null;
                        const obtainableMark = student.obtainable_score || student.total_marks || 50;

                        return (
                          <tr key={student.id || idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 text-center font-mono font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-slate-300">
                              {student.reg_number || student.regNo}
                            </td>
                            <td className="px-4 py-3 font-extrabold text-slate-100">
                              {student.surname ? `${student.surname}, ${student.first_name || ''}` : student.name}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-400">
                              {student.assigned_subject || student.subject || 'Mathematics'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isSubmitted ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Submitted
                                </span>
                              ) : isActive ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  <Clock className="w-3 h-3 mr-1" /> Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                  Not Taken
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-sm">
                              {scoreVal !== null ? (
                                <span className="text-emerald-400">
                                  {scoreVal} / {obtainableMark} <span className="text-xs text-slate-400 font-normal">({Math.round((scoreVal / obtainableMark) * 100)}%)</span>
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">N/A</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Subject Selection Print Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 print:hidden">
          <div className="bg-slate-900 border border-darkBorder rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-darkBorder pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-brand/15 text-brand rounded-xl border border-brand/30">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-100">Select Subject for Score Sheet</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Target Class: <strong className="text-brand">{printTargetClass}</strong></p>
                </div>
              </div>
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Choose the target subject score sheet for <strong className="text-slate-100">{printTargetClass}</strong> to generate the official examination document.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select Subject Paper *
                </label>
                <select
                  value={printTargetSubject}
                  onChange={(e) => setPrintTargetSubject(e.target.value)}
                  className="w-full bg-[#0f172a] border border-darkBorder text-white text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none font-bold"
                >
                  {getSubjectsForClass(printTargetClass).map((sub) => (
                    <option key={sub} value={sub} className="bg-[#0f172a] text-white py-1 font-medium">
                      {sub}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-darkBorder">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmModalPrint}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center space-x-2 shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>Generate & Print Score Sheet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Strictly Isolated Dedicated Printable Score Sheet (Targeted by CSS @media print rules) */}
      <div id="cbt-print-container" className="printable-score-sheet hidden print:block bg-white text-black p-6 font-sans">
        {/* Official Header */}
        <div className="border-b-2 border-black pb-4 mb-4 text-center">
          <div className="flex items-center justify-center space-x-4 mb-2">
            <img
              src="school_logo.jpg"
              alt="AWBA Crest"
              className="w-16 h-16 object-contain shrink-0"
            />
            <div className="text-left">
              <h1 className="text-2xl font-black uppercase text-black tracking-wide leading-none">
                Anthony White Bridge Academy - Official CBT Performance Score Sheet
              </h1>
              <p className="text-xs font-extrabold uppercase text-slate-800 tracking-widest mt-1">
                Class: <span className="font-mono text-black">{printMetadata?.class_name || printClass || selectedClass}</span> | Subject: <span className="font-mono text-black">{printMetadata?.subject_name || printSubject || selectedSubject}</span> | Date: <span className="font-mono text-black">{new Date().toLocaleDateString('en-GB')}</span> | Total Enrolled: <span className="font-mono text-black">{printMetadata?.total_candidates || printRoster.length}</span> | Completed: <span className="font-mono text-black">{printMetadata?.submissions_count !== undefined ? printMetadata.submissions_count : printRoster.filter(r => r.raw_score !== null || r.status === 'Submitted' || r.status === 'submitted').length}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-xs font-bold text-black border border-black p-2.5 bg-slate-50 mt-3 text-left">
            <div>Class/Arm: <span className="font-black text-sm">{printMetadata?.class_name || printClass || selectedClass}</span></div>
            <div>Subject Name: <span className="font-black text-sm">{printMetadata?.subject_name || printSubject || selectedSubject}</span></div>
            <div>Academic Session: <span className="font-black">{printMetadata?.academic_session || academicSession}</span></div>
            <div>Term: <span className="font-black">{printMetadata?.academic_term || activeTerm}</span></div>
            <div>Total Candidates: <span className="font-black">{printMetadata?.total_candidates || printRoster.length}</span></div>
            <div>Submissions Count: <span className="font-black">{printMetadata?.submissions_count !== undefined ? printMetadata.submissions_count : printRoster.filter(r => r.raw_score !== null || r.status === 'Submitted' || r.status === 'submitted').length}</span></div>
            <div>Total Marks: <span className="font-black">{printMetadata?.total_obtainable_marks || 50}</span></div>
          </div>
        </div>

        {/* Student Roster Table */}
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-black text-black font-extrabold uppercase text-[11px]">
              <th className="border border-black px-3 py-2 text-center w-12">S/N</th>
              <th className="border border-black px-3 py-2 text-left w-36">REG NO</th>
              <th className="border border-black px-3 py-2 text-left">CANDIDATE NAME (A-Z)</th>
              <th className="border border-black px-3 py-2 text-center w-40">SCORE (/{printMetadata?.total_obtainable_marks || 50})</th>
              <th className="border border-black px-3 py-2 text-center w-32">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black font-medium text-black">
            {printRoster.map((student, idx) => {
              const obtainable = student.total_marks || student.obtainable_score || printMetadata?.total_obtainable_marks || 50;
              const score = student.raw_score !== undefined ? student.raw_score : (student.score !== null && student.score !== undefined ? student.score : null);
              const isSubmitted = score !== null || (student.status && String(student.status).toLowerCase() === 'submitted');
              const statusText = isSubmitted ? 'Submitted' : (student.status && String(student.status).toLowerCase().includes('active') ? 'Active Session' : 'Absent');

              const surnameUpper = String(student.surname || '').toUpperCase().trim();
              const firstNameUpper = String(student.first_name || student.firstName || '').toUpperCase().trim();
              let candidateName = student.full_name || student.name || 'STUDENT';
              if (surnameUpper && firstNameUpper) {
                candidateName = `${surnameUpper}, ${firstNameUpper}`;
              } else if (surnameUpper) {
                candidateName = surnameUpper;
              }
              const regNo = student.registration_no || student.reg_number || student.regNo;
              const scoreDisplay = score !== null ? `${score}/${obtainable}` : 'Not Taken';

              return (
                <tr key={student.id || idx} className="border-b border-black">
                  <td className="border border-black px-3 py-2 text-center font-mono font-bold">{student.sn || idx + 1}</td>
                  <td className="border border-black px-3 py-2 font-mono font-bold">{regNo}</td>
                  <td className="border border-black px-3 py-2 font-extrabold uppercase">
                    {candidateName}
                  </td>
                  <td className="border border-black px-3 py-2 text-center font-black">
                    {scoreDisplay}
                  </td>
                  <td className="border border-black px-3 py-2 text-center font-bold">
                    {statusText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Official Signatures Footer */}
        <div className="grid grid-cols-2 gap-12 pt-12 mt-8 border-t-2 border-black text-xs font-bold">
          <div>
            <p className="uppercase text-slate-900">Form Teacher / Examination Invigilator:</p>
            <div className="border-b-2 border-black mt-10 w-64"></div>
            <p className="text-[10px] text-slate-600 mt-1">Signature & Date</p>
          </div>
          <div className="text-right">
            <p className="uppercase text-slate-900">Principal / CBE Administrator:</p>
            <div className="border-b-2 border-black mt-10 w-64 ml-auto"></div>
            <p className="text-[10px] text-slate-600 mt-1">Signature & Stamp</p>
          </div>
        </div>
      </div>

      {/* Purge Active & Trial Submissions Modal */}
      {isPurgeModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-darkBorder rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setIsPurgeModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-100">
                Purge Active & Trial Submissions?
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Select a purge scope below. Candidate statuses will reset back to <strong className="text-slate-200 font-bold font-mono">Not Taken / Exam Ready</strong> without removing student profiles or question banks.
              </p>
            </div>

            {/* Scope Selection Cards */}
            <div className="space-y-2.5 pt-1">
              <label
                onClick={() => setPurgeScope('CLASS')}
                className={`p-3.5 rounded-xl border flex items-start space-x-3 cursor-pointer transition-all ${
                  purgeScope === 'CLASS'
                    ? 'bg-rose-500/10 border-rose-500/50 text-slate-100 shadow-sm'
                    : 'bg-slate-950/60 border-darkBorder text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="purgeScope"
                  checked={purgeScope === 'CLASS'}
                  onChange={() => setPurgeScope('CLASS')}
                  className="mt-0.5 accent-rose-500 cursor-pointer"
                />
                <div className="text-xs">
                  <p className="font-extrabold text-slate-200">
                    Option A: Clear submissions for {selectedClass === 'ALL' ? 'selected class' : selectedClass} only
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Resets active & completed exam sessions strictly for candidates in {selectedClass === 'ALL' ? 'the selected class scope' : selectedClass}.
                  </p>
                </div>
              </label>

              <label
                onClick={() => setPurgeScope('ALL')}
                className={`p-3.5 rounded-xl border flex items-start space-x-3 cursor-pointer transition-all ${
                  purgeScope === 'ALL'
                    ? 'bg-rose-500/10 border-rose-500/50 text-slate-100 shadow-sm'
                    : 'bg-slate-950/60 border-darkBorder text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="purgeScope"
                  checked={purgeScope === 'ALL'}
                  onChange={() => setPurgeScope('ALL')}
                  className="mt-0.5 accent-rose-500 cursor-pointer"
                />
                <div className="text-xs">
                  <p className="font-extrabold text-slate-200">
                    Option B: Clear all trial exam submissions across ALL classes
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Resets all active & submitted exam sessions across all JSS 1 - SS 3 classes for a fresh test run.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-darkBorder">
              <button
                type="button"
                onClick={() => setIsPurgeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeSubmissions}
                disabled={purgingSubmissions}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/30 flex items-center space-x-2 cursor-pointer"
              >
                {purgingSubmissions ? (
                  <span>Purging Submissions...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirm & Purge Submissions</span>
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
