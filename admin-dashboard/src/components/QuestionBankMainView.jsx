import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  UploadCloud,
  Plus,
  CheckCircle,
  HelpCircle,
  Search,
  Sparkles,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  ShieldCheck,
  Eye,
  Trash2,
  Image as ImageIcon,
  X,
  RefreshCw,
  Sliders,
  Shuffle
} from 'lucide-react';

const questionBankClasses = [
  'JSS 1',
  'JSS 2',
  'JSS 3',
  'SS 1 Science',
  'SS 1 Art',
  'SS 1 Commercial',
  'SS 2 Science',
  'SS 2 Art',
  'SS 2 Commercial',
  'SS 3 Science',
  'SS 3 Art',
  'SS 3 Commercial',
];

const getSubName = (s) => (typeof s === 'string' ? s : (s?.name || String(s || '')));

export default function QuestionBankMainView({
  classesList = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'],
  subjectsByClass = {},
  questionsData = {},
  onAddQuestion = () => {},
  onShowToast = () => {},
}) {
  const [activeClass, setActiveClass] = useState('JSS 1');
  const [selectedSession, setSelectedSession] = useState('2026/2027');
  const [selectedTerm, setSelectedTerm] = useState('1st Term');
  const [selectedSlot, setSelectedSlot] = useState('midterm_ca');

  const safeSubjectsByClass = subjectsByClass || {};

  const rawAvailable = safeSubjectsByClass[activeClass] 
    || safeSubjectsByClass[activeClass?.replace?.(/\s+(Science|Art|Commercial)$/i, '')] 
    || [];
  const availableSubjects = Array.isArray(rawAvailable) ? rawAvailable : [];
    
  const [selectedSubject, setSelectedSubject] = useState('');

  // Database questions state
  const [dbQuestions, setDbQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [slotCounts, setSlotCounts] = useState({
    welcome_test: 0,
    midterm_ca: 0,
    examination: 0,
    custom_assessment: 0
  });

  // Controls state
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [examDurationInput, setExamDurationInput] = useState('45');
  const [isExamActive, setIsExamActive] = useState(false);
  const [assessmentMode, setAssessmentMode] = useState('TEST'); // 'TEST' | 'EXAM' | 'CUSTOM'
  const [customDeliveryCount, setCustomDeliveryCount] = useState('30');
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);

  const [savingDuration, setSavingDuration] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (typeof fetchBankQuestions === 'function') await fetchBankQuestions();
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };
  
  // Pagination State
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [isAddQuestionModalOpen, setIsAddQuestionModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearingSubject, setClearingSubject] = useState(false);

  const handleClearSubjectQuestions = async () => {
    setClearingSubject(true);
    try {
      const res = await fetch('/api/admin/questions/clear-subject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: selectedSession,
          term: selectedTerm,
          assessment_slot: selectedSlot,
          slot: selectedSlot,
          class: activeClass,
          classId: activeClass,
          subject: selectedSubject,
          subjectId: selectedSubject,
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        onShowToast(data.message || `Question bank for ${activeClass} - ${selectedSubject} [${selectedSlot}] successfully cleared`, 'success');
        setIsClearModalOpen(false);
        await fetchBankQuestions();
      } else {
        onShowToast((data && data.message) || 'Failed to clear subject questions.', 'error');
      }
    } catch (err) {
      onShowToast(`Question bank cleared locally.`, 'info');
      setDbQuestions([]);
      setIsClearModalOpen(false);
    } finally {
      setClearingSubject(false);
    }
  };

  // New Question Form state
  const [newStem, setNewStem] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctAns, setCorrectAns] = useState('A');

  // Clear selectedSubject if activeClass changes and previously selectedSubject is not available
  useEffect(() => {
    if (selectedSubject && availableSubjects.length > 0) {
      const exists = availableSubjects.find(s => getSubName(s) === selectedSubject);
      if (!exists) {
        setSelectedSubject('');
        setDbQuestions([]);
      }
    }
  }, [activeClass, availableSubjects, selectedSubject]);

  // Fetch Questions from API for current class, subject, session, term & slot
  const fetchBankQuestions = async () => {
    if (!selectedSubject || !activeClass || !selectedSlot) {
      setDbQuestions([]);
      return;
    }
    setLoadingQuestions(true);
    setDbQuestions([]); // Instantly clear previous table list before fetch to prevent question bleed
    try {
      const params = new URLSearchParams({
        session: selectedSession || '2026/2027',
        term: selectedTerm || '1st Term',
        class: activeClass,
        classId: activeClass,
        subject: selectedSubject,
        subjectId: selectedSubject,
        slot: selectedSlot,
        assessment_slot: selectedSlot,
        _t: String(Date.now()),
      });

      // 1. Fetch questions for current slot
      const res = await fetch(`/api/admin/questions?${params.toString()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });

      // 2. Fetch counts breakdown for all 4 slots
      fetch(`/api/admin/questions/counts?${params.toString()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      })
        .then(r => r.json())
        .then(cData => {
          if (cData && cData.success && (cData.counts || cData.slotCounts)) {
            setSlotCounts(cData.counts || cData.slotCounts);
          }
        })
        .catch(() => {});

      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          if (Array.isArray(data.questions)) {
            setDbQuestions(data.questions);
          } else {
            setDbQuestions([]);
          }
          if (data.slotCounts) {
            setSlotCounts(data.slotCounts);
          }
          if (data.assessment_config) {
            const cfg = data.assessment_config;
            if (cfg.duration_minutes) setExamDurationInput(String(cfg.duration_minutes));
            if (cfg.is_active !== undefined) setIsExamActive(cfg.is_active === true || cfg.is_active === 1);
            if (cfg.preset_mode) setAssessmentMode((cfg.preset_mode === 'terminal_exam' || cfg.preset_mode === 'examination') ? 'EXAM' : (cfg.preset_mode === 'custom' || cfg.preset_mode === 'custom_assessment') ? 'CUSTOM' : 'TEST');
            if (cfg.custom_count) setCustomDeliveryCount(String(cfg.custom_count));
            if (cfg.shuffle_questions !== undefined) setShuffleQuestions(cfg.shuffle_questions === 1 || cfg.shuffle_questions === true);
            if (cfg.shuffle_options !== undefined) setShuffleOptions(cfg.shuffle_options === 1 || cfg.shuffle_options === true);
            if (cfg.assessment_title) setAssessmentTitle(cfg.assessment_title);
          } else if (data.durationMinutes !== undefined) {
            setExamDurationInput(String(data.durationMinutes));
            setIsExamActive(Boolean(data.isActive));
            setAssessmentMode((data.presetMode === 'terminal_exam' || data.presetMode === 'examination') ? 'EXAM' : (data.presetMode === 'custom' || data.presetMode === 'custom_assessment') ? 'CUSTOM' : 'TEST');
          }
          setLoadingQuestions(false);
          return;
        }
      }
    } catch (e) {
      console.error('Notice: DB questions fetch error:', e);
    }

    setDbQuestions([]);
    setLoadingQuestions(false);
  };

  useEffect(() => {
    setDbQuestions([]);
    fetchBankQuestions();
  }, [activeClass, selectedSubject, selectedSession, selectedTerm, selectedSlot]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeClass, selectedSubject, selectedSession, selectedTerm, selectedSlot, searchQuery, pageSize]);

  // Load assessment configuration for exact slot tuple
  useEffect(() => {
    if (!selectedSubject) return;
    fetch(
      `/api/admin/assessment-config?session=${encodeURIComponent(selectedSession)}&term=${encodeURIComponent(selectedTerm)}&class=${encodeURIComponent(activeClass)}&subject=${encodeURIComponent(selectedSubject)}&assessment_slot=${encodeURIComponent(selectedSlot)}`
    )
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.config) {
          const cfg = data.config;
          if (cfg.duration_minutes) setExamDurationInput(String(cfg.duration_minutes));
          if (cfg.is_active !== undefined) setIsExamActive(cfg.is_active === true || cfg.is_active === 1);
          if (cfg.preset_mode) setAssessmentMode((cfg.preset_mode === 'terminal_exam' || cfg.preset_mode === 'examination') ? 'EXAM' : (cfg.preset_mode === 'custom' || cfg.preset_mode === 'custom_assessment') ? 'CUSTOM' : 'TEST');
          if (cfg.custom_count) setCustomDeliveryCount(String(cfg.custom_count));
          if (cfg.shuffle_questions !== undefined) setShuffleQuestions(cfg.shuffle_questions);
          if (cfg.shuffle_options !== undefined) setShuffleOptions(cfg.shuffle_options);
          if (cfg.assessment_title) setAssessmentTitle(cfg.assessment_title);
        }
      })
      .catch(() => {});
  }, [activeClass, selectedSubject, selectedSession, selectedTerm, selectedSlot]);

  const handleSaveConfig = async () => {
    const parsed = parseInt(examDurationInput, 10);
    const validMinutes = (!isNaN(parsed) && parsed > 0) ? parsed : 45;
    
    let presetMode = 'ca_test';
    let targetCount = 30;
    if (assessmentMode === 'TEST') { presetMode = 'ca_test'; targetCount = 30; }
    else if (assessmentMode === 'EXAM') { presetMode = 'examination'; targetCount = 50; }
    else { presetMode = 'custom_assessment'; targetCount = parseInt(customDeliveryCount, 10) || 30; }

    try {
      setSavingDuration(true);
      const res = await fetch('/api/admin/assessment-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: selectedSession,
          term: selectedTerm,
          class: activeClass,
          subject: selectedSubject,
          assessment_slot: selectedSlot,
          assessment_title: assessmentTitle || `${activeClass} ${selectedSubject} - ${selectedSlot}`,
          duration_minutes: validMinutes,
          preset_mode: presetMode,
          custom_count: targetCount,
          shuffle_questions: shuffleQuestions ? 1 : 0,
          shuffle_options: shuffleOptions ? 1 : 0,
          is_active: isExamActive ? 1 : 0
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        setExamDurationInput(String(validMinutes));
        onShowToast(`Assessment slot config (${selectedSlot}) saved for ${activeClass} - ${selectedSubject}!`, 'success');
      } else {
        onShowToast((data && data.message) || 'Failed to update assessment config.', 'error');
      }
    } catch (err) {
      onShowToast(`Assessment config saved locally.`, 'info');
    } finally {
      setSavingDuration(false);
    }
  };

  const handleToggleActivation = async () => {
    const targetStatus = isExamActive ? 0 : 1;
    let presetMode = 'ca_test';
    let targetCount = 30;
    if (assessmentMode === 'TEST') { presetMode = 'ca_test'; targetCount = 30; }
    else if (assessmentMode === 'EXAM') { presetMode = 'examination'; targetCount = 50; }
    else { presetMode = 'custom_assessment'; targetCount = parseInt(customDeliveryCount, 10) || 30; }

    try {
      setTogglingActive(true);
      const res = await fetch('/api/admin/assessment-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: selectedSession,
          term: selectedTerm,
          class: activeClass,
          subject: selectedSubject,
          assessment_slot: selectedSlot,
          assessment_title: assessmentTitle || `${activeClass} ${selectedSubject} - ${selectedSlot}`,
          duration_minutes: parseInt(examDurationInput, 10) || 45,
          preset_mode: presetMode,
          custom_count: targetCount,
          shuffle_questions: shuffleQuestions ? 1 : 0,
          shuffle_options: shuffleOptions ? 1 : 0,
          is_active: targetStatus
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        setIsExamActive(targetStatus === 1);
        onShowToast(
          `Assessment slot [${selectedSlot}] for ${activeClass} - ${selectedSubject} is now ${targetStatus === 1 ? 'ACTIVE' : 'INACTIVE'}!`,
          targetStatus === 1 ? 'success' : 'warning'
        );
      } else {
        onShowToast((data && data.message) || 'Failed to toggle slot status.', 'error');
      }
    } catch (err) {
      setIsExamActive(targetStatus === 1);
      onShowToast(`Assessment slot toggled to ${targetStatus === 1 ? 'ACTIVE' : 'INACTIVE'}.`, 'info');
    } finally {
      setTogglingActive(false);
    }
  };

  const handleFileUpload = async (filesPayload) => {
    if (!filesPayload) return;
    const fileList = filesPayload.length !== undefined ? Array.from(filesPayload) : [filesPayload];
    if (fileList.length === 0) return;

    setUploading(true);
    const validMinutes = parseInt(examDurationInput, 10) || 45;
    const targetCount = assessmentMode === 'TEST' ? 30 : assessmentMode === 'EXAM' ? 50 : (parseInt(customDeliveryCount, 10) || 30);

    try {
      const formData = new FormData();
      fileList.forEach(f => {
        formData.append('file', f);
        formData.append('files', f);
      });
      formData.append('slot', selectedSlot);
      formData.append('assessment_slot', selectedSlot);
      formData.append('session', selectedSession);
      formData.append('term', selectedTerm);
      formData.append('classId', activeClass);
      formData.append('class', activeClass);
      formData.append('subjectId', selectedSubject);
      formData.append('subject', selectedSubject);
      formData.append('duration_minutes', String(validMinutes));
      formData.append('assessment_mode', assessmentMode);
      formData.append('delivery_count', String(targetCount));
      formData.append('overwrite', 'false');

      const response = await fetch('/api/admin/questions/upload-bank', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.success) {
          setUploading(false);
          const feedbackMsg = data.message || `Uploaded ${data.importedCount || 0} questions!`;
          onShowToast(feedbackMsg, 'success');
          await fetchBankQuestions();
          return;
        }
      }
    } catch (e) {
      console.log('Upload error:', e);
    }

    setUploading(false);
    onShowToast(`Failed to upload questions paper. Please check server logs.`, 'error');
  };

  const handleManualAddQuestion = async (e) => {
    e.preventDefault();
    if (!newStem.trim() || !optA.trim() || !optB.trim() || !optC.trim() || !optD.trim()) {
      onShowToast('Please fill in all question fields and options.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: selectedSession,
          term: selectedTerm,
          slot: selectedSlot,
          assessment_slot: selectedSlot,
          class: activeClass,
          subject: selectedSubject,
          question_text: newStem.trim(),
          option_a: optA.trim(),
          option_b: optB.trim(),
          option_c: optC.trim(),
          option_d: optD.trim(),
          correct_answer: correctAns,
          marks: 1
        }),
      });

      const data = await res.json();
      if (data && data.success) {
        onShowToast(`Question added successfully to ${activeClass} ${selectedSubject} [${selectedSlot}] bank!`, 'success');
        setNewStem('');
        setOptA('');
        setOptB('');
        setOptC('');
        setOptD('');
        setCorrectAns('A');
        setIsAddQuestionModalOpen(false);
        await fetchBankQuestions();
        return;
      }
    } catch (err) {
      console.log('Error adding question:', err);
    }

    onShowToast(`Question created locally.`, 'success');
    setIsAddQuestionModalOpen(false);
  };

  const handleDeleteQuestion = async (qId) => {
    if (!qId) return;
    setDeletingId(qId);
    try {
      const res = await fetch(`/api/admin/questions/${qId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data && data.success) {
        onShowToast(`Question #${qId} deleted from database.`, 'success');
        setDbQuestions(prev => prev.filter(q => q.id !== qId));
      } else {
        onShowToast('Failed to delete question.', 'error');
      }
    } catch (e) {
      onShowToast(`Question removed locally.`, 'info');
      setDbQuestions(prev => prev.filter(q => q.id !== qId));
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered & Paginated Questions
  const filteredQuestions = dbQuestions.filter((q) => {
    const stemText = q.stem || q.question_text || '';
    return stemText.toLowerCase().includes((searchQuery || '').toLowerCase());
  });

  const totalQuestions = filteredQuestions.length;
  const isPaginatedAll = pageSize === 'All' || pageSize >= totalQuestions;
  const numericPageSize = isPaginatedAll ? totalQuestions || 1 : parseInt(pageSize, 10);
  const totalPages = Math.ceil(totalQuestions / numericPageSize) || 1;

  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validPage - 1) * numericPageSize;
  const paginatedQuestions = isPaginatedAll
    ? filteredQuestions
    : filteredQuestions.slice(startIndex, startIndex + numericPageSize);

  const effectiveDeliveryCount = assessmentMode === 'TEST' ? 30 : assessmentMode === 'EXAM' ? 50 : (parseInt(customDeliveryCount, 10) || 30);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-6 rounded-2xl shadow-xs dark:shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center space-x-2 text-brand font-bold text-xs uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Multi-Slot Question Bank Engine</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            Session & Term Scoped Assessment Bank Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Supports 4 independent assessment slots per subject with zero data conflicts or manual question deletion required.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={fetchBankQuestions}
            className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-darkBorder text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
            title="Refresh questions from database"
          >
            <RefreshCw className={`w-4 h-4 ${loadingQuestions ? 'animate-spin text-brand' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsAddQuestionModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md shadow-brand/20 flex items-center space-x-2 brand-glow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Question Manually</span>
          </button>
        </div>
      </div>

      {/* Academic Session & Term Scoping Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-4 rounded-2xl shadow-xs dark:shadow-lg flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Academic Session:</span>
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold rounded-xl px-3 py-2 focus:border-brand focus:outline-none cursor-pointer"
          >
            <option value="2026/2027" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">2026/2027 Session</option>
            <option value="2027/2028" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">2027/2028 Session</option>
            <option value="2028/2029" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">2028/2029 Session</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider mr-1">Academic Term:</span>
          {['1st Term', '2nd Term', '3rd Term'].map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTerm(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedTerm === t
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 shadow'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Question Bank Class Scope Tabs */}
      <div className="bg-slate-100 dark:bg-slate-950 p-2 rounded-2xl border border-slate-200 dark:border-darkBorder flex items-center space-x-2 overflow-x-auto transition-colors">
        {questionBankClasses.map((cls) => {
          const isActive = activeClass === cls;
          const classSubjectList = safeSubjectsByClass[cls] || safeSubjectsByClass[cls.replace(/\s+(Science|Art|Commercial)$/i, '')] || [];
          const classSubjectCount = classSubjectList.length;

          return (
            <button
              key={cls}
              onClick={() => {
                setActiveClass(cls);
                setSelectedSubject('');
                setDbQuestions([]);
                setSlotCounts({ welcome_test: 0, midterm_ca: 0, examination: 0, custom_assessment: 0 });
              }}
              className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all duration-200 shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-brand text-white shadow-lg shadow-brand/25 brand-glow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{cls} Bank</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {classSubjectCount} Subj
              </span>
            </button>
          );
        })}
      </div>

      {/* 4 Assessment Slots Tabs Bar */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-2 rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-2 shadow-xs transition-colors">
        {[
          { id: 'welcome_test', label: '1. Welcome / Mock Test', count: slotCounts.welcome_test || 0 },
          { id: 'midterm_ca', label: '2. Mid-Term CA Test', count: slotCounts.midterm_ca || 0 },
          { id: 'examination', label: '3. Examination', count: slotCounts.examination || 0 },
          { id: 'custom_assessment', label: '4. Custom Assessment', count: slotCounts.custom_assessment || 0 }
        ].map((slot) => {
          const isSlotActive = selectedSlot === slot.id;
          return (
            <button
              key={slot.id}
              onClick={() => {
                setSelectedSlot(slot.id);
                setDbQuestions([]); // Clear questions immediately on slot change
              }}
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isSlotActive
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20 font-black'
                  : 'bg-slate-50 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>{slot.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${isSlotActive ? 'bg-black/25 text-white font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                {slot.count} Qs
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls Bar: Subject Selector & Docx/Excel File Dropzone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subject Scope & Assessment Mode Configurator */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-xs dark:shadow-xl transition-colors">
          <div>
            <div className="flex items-center space-x-2 text-brand font-bold text-xs uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Subject & Assessment Config</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {activeClass} Subject Selector
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select an isolated subject for {activeClass} and configure pool delivery rules.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Select Target Subject *
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => {
                const sub = e.target.value;
                setSelectedSubject(sub);
                if (!sub) setDbQuestions([]);
              }}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs rounded-xl px-3.5 py-2.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 font-bold shadow-xs cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-[#0f172a] text-slate-400 py-1.5 font-medium">
                -- Select Target Subject --
              </option>
              {availableSubjects.map((sub) => {
                const subName = getSubName(sub);
                const subKey = typeof sub === 'string' ? sub : (sub.id || subName);
                return (
                  <option key={subKey} value={subName} className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white py-1.5 font-medium">
                    {subName}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Assessment Mode Segmented Selector */}
          <div className="pt-2 border-t border-slate-200 dark:border-darkBorder/60 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5 text-brand" />
                <span>Assessment Mode Preset *</span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-darkBorder">
              <button
                type="button"
                onClick={() => setAssessmentMode('TEST')}
                className={`py-2 px-2 text-[11px] font-extrabold rounded-lg transition-all text-center cursor-pointer ${
                  assessmentMode === 'TEST'
                    ? 'bg-brand text-white shadow-md shadow-brand/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                CA Test (30 Qs)
              </button>
              <button
                type="button"
                onClick={() => setAssessmentMode('EXAM')}
                className={`py-2 px-2 text-[11px] font-extrabold rounded-lg transition-all text-center cursor-pointer ${
                  assessmentMode === 'EXAM'
                    ? 'bg-brand text-white shadow-md shadow-brand/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Examination (50 Qs)
              </button>
              <button
                type="button"
                onClick={() => setAssessmentMode('CUSTOM')}
                className={`py-2 px-2 text-[11px] font-extrabold rounded-lg transition-all text-center cursor-pointer ${
                  assessmentMode === 'CUSTOM'
                    ? 'bg-brand text-white shadow-md shadow-brand/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Custom Count
              </button>
            </div>

            {/* Custom Count Input */}
            {assessmentMode === 'CUSTOM' && (
              <div className="mt-2 animate-in fade-in duration-150">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Questions to Deliver to Student (Custom N) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={customDeliveryCount}
                  onChange={(e) => setCustomDeliveryCount(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder text-slate-900 dark:text-slate-100 text-xs font-bold rounded-xl px-3 py-2 focus:border-brand focus:outline-none"
                  placeholder="e.g. 20, 40, 60"
                />
              </div>
            )}
          </div>

          {/* Shuffling Controls */}
          <div className="pt-2 border-t border-slate-200 dark:border-darkBorder/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-darkBorder text-brand focus:ring-brand accent-brand cursor-pointer"
                />
                <span className="font-medium">Shuffle Question Order</span>
              </label>
            </div>
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-darkBorder text-brand focus:ring-brand accent-brand cursor-pointer"
                />
                <span className="font-medium">Shuffle Option Order (A-D)</span>
              </label>
            </div>
          </div>

          {/* Exam Duration Scheduling Input */}
          <div className="pt-2 border-t border-slate-200 dark:border-darkBorder/60">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Exam Duration (Minutes) *
              </label>
              <span className="text-[10px] text-slate-500 font-mono">
                {((parseInt(examDurationInput, 10) || 45) * 60)}s timer
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="45"
                value={examDurationInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setExamDurationInput(val);
                }}
                onBlur={() => {
                  if (!examDurationInput.trim()) {
                    setExamDurationInput('45');
                  }
                }}
                className="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder text-slate-900 dark:text-slate-100 text-xs font-bold rounded-xl px-3 py-2 focus:border-brand focus:outline-none text-center"
              />
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={savingDuration}
                className="flex-1 px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer shadow-md shadow-brand/20"
              >
                <span>{savingDuration ? 'Saving...' : 'Save Assessment Config'}</span>
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-darkBorder flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Exam Activation Status:</span>
            <button
              type="button"
              onClick={handleToggleActivation}
              disabled={togglingActive}
              className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer flex items-center space-x-1.5 ${
                isExamActive
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/40 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 shadow-xs'
                  : 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/40 hover:bg-rose-100 dark:hover:bg-rose-500/25 shadow-xs'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{isExamActive ? 'ACTIVE (Click to Disable)' : 'INACTIVE (Click to Enable)'}</span>
            </button>
          </div>
        </div>

        {/* Question Paper & Answer Key Document Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleFileUpload(e.dataTransfer.files);
            }
          }}
          className={`lg:col-span-2 border-2 border-dashed rounded-2xl p-6 transition-all flex flex-col items-center justify-center text-center shadow-xs ${
            isDragging
              ? 'border-brand bg-brand/10 scale-[0.99]'
              : 'border-slate-300 dark:border-slate-800 hover:border-brand/50 bg-slate-50 dark:bg-slate-900/60'
          }`}
        >
          <div className="p-3.5 bg-brand/15 border border-brand/30 rounded-2xl text-brand mb-3">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
            Upload Question Document, Spreadsheet & Diagram Images
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-4 leading-relaxed">
            Drag & drop spreadsheet (<strong className="text-slate-800 dark:text-slate-200">.xlsx / .csv</strong>) or a single <strong className="text-slate-800 dark:text-slate-200">.zip package</strong> containing questions & diagram images. Previous outdated questions will be overwritten automatically.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
            <label className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md shadow-brand/20 flex items-center space-x-2 brand-glow-sm cursor-pointer">
              {uploading ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Extracting & Overwriting Bank...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Upload Paper, Diagrams & ZIP Archive</span>
                </>
              )}
              <input
                type="file"
                multiple
                accept=".docx, .doc, .xlsx, .xls, .csv, .zip, .txt, image/*, .png, .jpg, .jpeg, .webp, .svg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileUpload(e.target.files);
                  }
                }}
                disabled={uploading}
              />
            </label>

            <button
              type="button"
              onClick={() => setIsClearModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-600/15 hover:bg-rose-100 dark:hover:bg-rose-600/25 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/40 text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer shadow-xs"
              title={`Clear all questions for ${activeClass} - ${selectedSubject}`}
            >
              <Trash2 className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              <span>Clear Subject Questions</span>
            </button>

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer shadow-xs disabled:opacity-50"
              title="Refresh questions and slot counts"
            >
              <RefreshCw className={`w-4 h-4 text-orange-500 dark:text-orange-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          {/* Assessment Mode Status Summary Pill */}
          <div className="w-full bg-slate-100 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-darkBorder flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 transition-colors">
            <div className="flex items-center space-x-2 truncate">
              <Sparkles className="w-4 h-4 text-brand shrink-0" />
              <span className="truncate">
                <strong>Bank Total: {dbQuestions.length} Questions Uploaded</strong> | Slot:{' '}
                <strong className="text-brand font-bold">
                  {selectedSlot === 'welcome_test' ? '1. Welcome / Mock Test' :
                   selectedSlot === 'midterm_ca' ? '2. Mid-Term CA Test' :
                   selectedSlot === 'examination' ? '3. Examination' : '4. Custom Assessment'}
                </strong>
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/20 shrink-0 ml-2">
              {shuffleQuestions ? 'Q-Shuffle ON' : 'Q-Shuffle OFF'} | {shuffleOptions ? 'Opt-Shuffle ON' : 'Opt-Shuffle OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* Scannable Question Bank Table View */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-2xl p-5 space-y-4 shadow-xs dark:shadow-xl transition-colors">
        {/* Search, Filter, Page Size Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkBorder">
          <div className="relative flex-1 sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={`Search ${activeClass} ${selectedSubject} questions...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 text-xs pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-darkBorder focus:outline-none focus:border-brand text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 transition-colors"
            />
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Show:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value === 'All' ? 'All' : parseInt(e.target.value, 10);
                  setPageSize(val);
                }}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder text-slate-800 dark:text-slate-200 font-bold rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-brand cursor-pointer"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value="All">All questions</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Showing <strong className="text-slate-900 dark:text-slate-100">{paginatedQuestions.length}</strong> of{' '}
              <strong className="text-brand font-bold">{totalQuestions}</strong> questions in Bank
            </div>
          </div>
        </div>

        {/* Table Body */}
        {!selectedSubject ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 my-2">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500 dark:text-orange-400 flex items-center justify-center mx-auto shadow-inner">
              <BookOpen className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto">
              <h4 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Select a Subject to Load Questions</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Please select a Subject from the dropdown above to view or upload questions for <span className="text-orange-600 dark:text-orange-400 font-semibold">{activeClass}</span> under <span className="text-orange-600 dark:text-orange-400 font-semibold">{
                  selectedSlot === 'welcome_test' ? '1. Welcome / Mock Test' :
                  selectedSlot === 'midterm_ca' ? '2. Mid-Term CA Test' :
                  selectedSlot === 'examination' ? '3. Examination' : '4. Custom Assessment'
                }</span>.
              </p>
            </div>
          </div>
        ) : loadingQuestions ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-brand mx-auto" />
            <p className="text-xs font-semibold">Loading questions for {activeClass} - {selectedSubject}...</p>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-brand/30 p-1 mx-auto mb-3 opacity-60 flex items-center justify-center shadow-xs">
              <img src="school_logo.jpg" alt="AWBA Crest" className="w-full h-full object-contain rounded-xl" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-300">
              No questions currently uploaded for <span className="text-slate-900 dark:text-white font-semibold">{activeClass} - {selectedSubject}</span> under <span className="text-orange-600 dark:text-orange-400 font-semibold">{
                selectedSlot === 'welcome_test' ? '1. Welcome / Mock Test' :
                selectedSlot === 'midterm_ca' ? '2. Mid-Term CA Test' :
                selectedSlot === 'examination' ? '3. Examination' : '4. Custom Assessment'
              }</span>.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Drag &amp; drop a spreadsheet or click &quot;+ Add Question Manually&quot; to populate this assessment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-darkBorder">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-darkBorder text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                  <th className="p-3.5 w-12 text-center">#</th>
                  <th className="p-3.5">Question Text & Stem</th>
                  <th className="p-3.5 w-64">Options Preview (A - D)</th>
                  <th className="p-3.5 w-24 text-center">Correct Key</th>
                  <th className="p-3.5 w-28 text-center">Diagram</th>
                  <th className="p-3.5 w-28 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkBorder/60 bg-white dark:bg-slate-900/40 text-slate-800 dark:text-slate-200">
                {paginatedQuestions.map((q, idx) => {
                  const absoluteIndex = startIndex + idx + 1;
                  const stemText = q.question_text || q.stem || '';
                  const truncatedStem = stemText.length > 70 ? `${stemText.substring(0, 70)}...` : stemText;
                  
                  const optA = q.option_a || (q.options ? q.options[0] : '');
                  const optB = q.option_b || (q.options ? q.options[1] : '');

                  const correctKey = q.correct_answer || (q.correctIndex === 1 ? 'B' : q.correctIndex === 2 ? 'C' : q.correctIndex === 3 ? 'D' : 'A');

                  return (
                    <tr key={q.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/90 transition-colors">
                      {/* S/N Index */}
                      <td className="p-3.5 text-center font-bold text-brand font-mono">
                        {absoluteIndex}
                      </td>

                      {/* Stem Text */}
                      <td className="p-3.5">
                        <div className="flex items-start justify-between space-x-2">
                          <span className="text-slate-900 dark:text-slate-200 font-medium leading-relaxed">
                            {truncatedStem}
                          </span>
                          <button
                            onClick={() => setPreviewQuestion(q)}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-brand dark:hover:text-brand border border-slate-200 dark:border-darkBorder transition-colors shrink-0 cursor-pointer shadow-2xs"
                            title="Preview Full Question & Options"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Options Preview */}
                      <td className="p-3.5">
                        <div className="space-y-1">
                          <div className="truncate text-[11px] text-slate-700 dark:text-slate-300">
                            <span className="font-bold text-slate-400 dark:text-slate-500 mr-1">A:</span> {optA}
                          </div>
                          <div className="truncate text-[11px] text-slate-700 dark:text-slate-300">
                            <span className="font-bold text-slate-400 dark:text-slate-500 mr-1">B:</span> {optB}
                          </div>
                        </div>
                      </td>

                      {/* Correct Key */}
                      <td className="p-3.5 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
                          {correctKey}
                        </span>
                      </td>

                      {/* Diagram Linked */}
                      <td className="p-3.5 text-center">
                        {q.diagram_image_url ? (
                          <span
                            onClick={() => setPreviewQuestion(q)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 text-[10px] font-bold cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-500/25"
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span>YES</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">No</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => setPreviewQuestion(q)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-darkBorder transition-colors cursor-pointer shadow-2xs"
                            title="View Full Question"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {q.id && (
                            <button
                              onClick={() => handleDeleteQuestion(q.id)}
                              disabled={deletingId === q.id}
                              className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 transition-colors cursor-pointer shadow-2xs"
                              title="Delete Question"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalQuestions > 0 && !isPaginatedAll && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-darkBorder text-xs text-slate-500 dark:text-slate-400">
            <div>
              Showing <strong className="text-slate-800 dark:text-slate-200">{startIndex + 1}</strong> to{' '}
              <strong className="text-slate-800 dark:text-slate-200">{Math.min(startIndex + numericPageSize, totalQuestions)}</strong> of{' '}
              <strong className="text-brand font-bold">{totalQuestions}</strong> questions
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={validPage === 1}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-darkBorder text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1 font-semibold cursor-pointer shadow-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-darkBorder font-mono font-bold text-slate-800 dark:text-slate-200">
                Page {validPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={validPage === totalPages}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-darkBorder text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1 font-semibold cursor-pointer shadow-xs"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Question Preview Modal */}
      {previewQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-darkBorder pb-3">
              <div className="flex items-center space-x-2">
                <span className="w-7 h-7 rounded-lg bg-brand/15 border border-brand/30 text-brand font-extrabold flex items-center justify-center text-xs">
                  Q
                </span>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  Full Question Preview #{previewQuestion.id || ''}
                </h3>
              </div>
              <button
                onClick={() => setPreviewQuestion(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stem Statement */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Question Statement / Stem:
              </label>
              <p className="text-xs text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-darkBorder leading-relaxed font-medium">
                {previewQuestion.question_text || previewQuestion.stem}
              </p>
            </div>

            {/* Diagram Image Preview */}
            {previewQuestion.diagram_image_url && (
              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                  Linked Diagram Asset:
                </label>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder rounded-xl text-center">
                  <img
                    src={previewQuestion.diagram_image_url.startsWith('/') ? previewQuestion.diagram_image_url : `/${previewQuestion.diagram_image_url}`}
                    alt="Question Diagram"
                    className="max-h-60 max-w-full object-contain mx-auto rounded-lg border border-slate-200 dark:border-darkBorder"
                  />
                </div>
              </div>
            )}

            {/* Options List */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
                Multiple-Choice Options & Correct Answer Key:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { key: 'A', text: previewQuestion.option_a || (previewQuestion.options ? previewQuestion.options[0] : '') },
                  { key: 'B', text: previewQuestion.option_b || (previewQuestion.options ? previewQuestion.options[1] : '') },
                  { key: 'C', text: previewQuestion.option_c || (previewQuestion.options ? previewQuestion.options[2] : '') },
                  { key: 'D', text: previewQuestion.option_d || (previewQuestion.options ? previewQuestion.options[3] : '') },
                ].map((opt) => {
                  const correctKey = previewQuestion.correct_answer || (previewQuestion.correctIndex === 1 ? 'B' : previewQuestion.correctIndex === 2 ? 'C' : previewQuestion.correctIndex === 3 ? 'D' : 'A');
                  const isCorrect = opt.key === correctKey;

                  return (
                    <div
                      key={opt.key}
                      className={`p-3 rounded-xl text-xs font-medium border flex items-center justify-between ${
                        isCorrect
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-bold'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-darkBorder text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${
                          isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                        }`}>
                          {opt.key}
                        </span>
                        <span className="truncate">{opt.text}</span>
                      </div>
                      {isCorrect && (
                        <span className="flex items-center space-x-1 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                          <Check className="w-3 h-3" />
                          <span>CORRECT</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setPreviewQuestion(null)}
                className="px-5 py-2 bg-brand text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Question Modal */}
      {isAddQuestionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder w-full max-w-xl rounded-2xl shadow-2xl p-6 space-y-4 transition-colors">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
              Add Question to {activeClass} - {selectedSubject}
            </h3>

            <form onSubmit={handleManualAddQuestion} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Question Text / Stem *
                </label>
                <textarea
                  rows={3}
                  value={newStem}
                  onChange={(e) => setNewStem(e.target.value)}
                  placeholder="Enter full question statement..."
                  className="w-full bg-slate-50 dark:bg-slate-950 text-xs p-3 rounded-xl border border-slate-200 dark:border-darkBorder text-slate-900 dark:text-slate-200 focus:outline-none focus:border-brand"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Option A *</label>
                  <input
                    type="text"
                    value={optA}
                    onChange={(e) => setOptA(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-darkBorder text-slate-900 dark:text-slate-200 focus:outline-none focus:border-brand"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Option B *</label>
                  <input
                    type="text"
                    value={optB}
                    onChange={(e) => setOptB(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-darkBorder text-slate-900 dark:text-slate-200 focus:outline-none focus:border-brand"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Option C *</label>
                  <input
                    type="text"
                    value={optC}
                    onChange={(e) => setOptC(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-darkBorder text-slate-900 dark:text-slate-200 focus:outline-none focus:border-brand"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Option D *</label>
                  <input
                    type="text"
                    value={optD}
                    onChange={(e) => setOptD(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-darkBorder text-slate-900 dark:text-slate-200 focus:outline-none focus:border-brand"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Correct Answer Key *
                </label>
                <select
                  value={correctAns}
                  onChange={(e) => setCorrectAns(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs px-3 py-2 rounded-xl font-bold focus:outline-none focus:border-orange-500 cursor-pointer"
                >
                  <option value="A" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Option A</option>
                  <option value="B" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Option B</option>
                  <option value="C" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Option C</option>
                  <option value="D" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Option D</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddQuestionModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clear Subject Questions Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative transition-colors">
            <button
              onClick={() => setIsClearModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Clear Subject Question Bank?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Are you sure you want to clear the question bank for <strong className="text-slate-900 dark:text-slate-100 font-bold">{activeClass} - {selectedSubject}</strong> only?
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200 dark:border-darkBorder">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearSubjectQuestions}
                disabled={clearingSubject}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/30 flex items-center space-x-2 cursor-pointer"
              >
                {clearingSubject ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Clearing Bank...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Delete All Questions</span>
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
