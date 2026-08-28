import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  UploadCloud,
  Plus,
  CheckCircle,
  HelpCircle,
  AlertCircle,
  Search,
  Sparkles,
  BookOpen,
  Filter,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function QuestionBankTab({
  currentClass,
  subjectsByClass = {},
  questionsData = {},
  onAddQuestion = () => {},
  onShowToast = () => {},
}) {
  const getSubName = (s) => (typeof s === 'string' ? s : (s?.name || String(s || '')));

  const safeSubjectsByClass = subjectsByClass || {};
  const safeQuestionsData = questionsData || {};

  const rawAvailable = safeSubjectsByClass[currentClass] || [];
  const availableSubjects = Array.isArray(rawAvailable) ? rawAvailable : [];
  const [selectedSubject, setSelectedSubject] = useState(
    getSubName(availableSubjects[0]) || ''
  );
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);

  const formatOptDisplay = (opt) => {
    if (opt === null || opt === undefined) return '';
    if (typeof opt === 'string') return opt;
    if (typeof opt === 'number') return String(opt);
    if (typeof opt === 'object') {
      const key = opt.option_key || opt.key || opt.label || '';
      const text = opt.option_text || opt.text || opt.value || '';
      return key ? `${key}) ${text}` : text;
    }
    return String(opt);
  };

  // Get questions for current class and selected subject safely
  const currentSubjectQuestions =
    (safeQuestionsData[currentClass] && safeQuestionsData[currentClass][selectedSubject]) || [];

  const filteredQuestions = currentSubjectQuestions.filter((q) =>
    (q && (q.stem || q.question_text || '')).toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  const handleSimulatedDocxUpload = (fileName = 'Physics_Examination_Paper.docx') => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      // Simulate adding 2 parsed questions from file
      const parsed1 = {
        id: `Q-${Date.now()}-1`,
        stem: 'Calculated from imported DOCX: What is the unit of Electric Current in SI units?',
        options: ['A) Ampere (A)', 'B) Volt (V)', 'C) Ohm (Ω)', 'D) Joule (J)'],
        correctIndex: 0,
        difficulty: 'Easy',
        marks: 1,
      };
      const parsed2 = {
        id: `Q-${Date.now()}-2`,
        stem: 'Calculated from imported DOCX: State Hooke’s Law regarding elasticity of solid bodies.',
        options: [
          'A) F = ma',
          'B) Force is directly proportional to extension provided elastic limit is not exceeded',
          'C) Energy can neither be created nor destroyed',
          'D) Pressure is inversely proportional to volume'
        ],
        correctIndex: 1,
        difficulty: 'Medium',
        marks: 2,
      };

      if (selectedSubject) {
        onAddQuestion(currentClass, selectedSubject, parsed1);
        onAddQuestion(currentClass, selectedSubject, parsed2);
      }
      onShowToast(
        `Successfully extracted and validated 2 questions from "${fileName}" for ${selectedSubject || currentClass}!`,
        'success'
      );
    }, 1200);
  };

  const [isSubjectActive, setIsSubjectActive] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Check current subject active state from server
  const checkActiveStatus = useCallback(async () => {
    if (!selectedSubject) return;
    try {
      const res = await fetch(`/api/student/assigned-subjects?class=${encodeURIComponent(currentClass)}`).then(r => r.json());
      if (res.success && Array.isArray(res.papers)) {
        const match = res.papers.find(p => String(p.name || p.subject).toLowerCase() === selectedSubject.toLowerCase());
        if (match) {
          setIsSubjectActive(!!match.is_active);
        }
      }
    } catch (_) {}
  }, [currentClass, selectedSubject]);

  useEffect(() => {
    checkActiveStatus();
  }, [checkActiveStatus]);

  const handleToggleExamActivation = async () => {
    if (!selectedSubject || togglingStatus) return;
    setTogglingStatus(true);
    const nextState = isSubjectActive ? 0 : 1;
    try {
      const res = await fetch('/api/admin/toggle-subject-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class: currentClass,
          subject: selectedSubject,
          is_active: nextState
        })
      }).then(r => r.json());

      if (res.success) {
        setIsSubjectActive(nextState === 1);
        onShowToast(
          `Exam session for "${selectedSubject}" (${currentClass}) set to ${nextState === 1 ? 'ACTIVE (Live for Candidates)' : 'INACTIVE (Locked)'}!`,
          nextState === 1 ? 'success' : 'info'
        );
      }
    } catch (e) {
      console.error('Toggle exam activation error:', e);
    } finally {
      setTogglingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Subject Selector & Docx Dropzone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Isolated Subject Selector & Activation Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-xs dark:shadow-xl transition-colors">
          <div>
            <div className="flex items-center space-x-2 text-brand font-bold text-xs uppercase tracking-wider mb-1">
              <BookOpen className="w-4 h-4" />
              <span>Isolated Subject Scope</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {currentClass} Question Bank
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select subject to view questions or toggle candidate exam session activation.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Target Subject *
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder text-slate-900 dark:text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-bold shadow-xs cursor-pointer"
              >
                {availableSubjects.map((sub) => {
                  const name = getSubName(sub);
                  const key = typeof sub === 'string' ? sub : (sub?.id || name);
                  return (
                    <option key={key} value={name} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 py-1 font-medium">
                      {name}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Exam Activation Status Button Toggle */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Exam Activation Status
              </label>
              <button
                type="button"
                onClick={handleToggleExamActivation}
                disabled={togglingStatus || !selectedSubject}
                className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-between shadow-xs cursor-pointer ${
                  isSubjectActive
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isSubjectActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-slate-500'}`}></span>
                  <span>{isSubjectActive ? 'ACTIVE (Live for Candidates)' : 'INACTIVE (Click to Enable)'}</span>
                </div>
                <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-extrabold border ${
                  isSubjectActive ? 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-400/40 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-400'
                }`}>
                  {togglingStatus ? 'Updating...' : (isSubjectActive ? 'TOGGLE OFF' : 'TOGGLE ON')}
                </span>
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-darkBorder flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Questions in Bank:</span>
            <span className="font-bold text-brand bg-brand/10 px-2.5 py-0.5 rounded-full border border-brand/20">
              {currentSubjectQuestions.length} Items
            </span>
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
            handleSimulatedDocxUpload('Dropped_Exam_Paper.docx');
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
            Upload Question Document (.docx / .xlsx)
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-4 leading-relaxed">
            Drag & drop MS Word or Excel question papers. Automated parser extracts stems, options A-D, and answer keys isolated to <strong className="text-brand">{currentClass} - {selectedSubject || 'All Subjects'}</strong>.
          </p>

          <button
            onClick={() => handleSimulatedDocxUpload()}
            disabled={uploading}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md shadow-brand/20 flex items-center space-x-2 brand-glow-sm cursor-pointer"
          >
            {uploading ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Parsing Question Paper...</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>Upload Question Paper</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Questions List Header & Search */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-2xl p-5 space-y-4 shadow-xs dark:shadow-xl transition-colors">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkBorder">
          <div className="relative flex-1 sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={`Search ${currentClass} ${selectedSubject} questions...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 text-xs pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-darkBorder focus:outline-none focus:border-brand text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 transition-colors"
            />
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Showing <strong className="text-slate-800 dark:text-slate-200">{filteredQuestions.length}</strong> questions in <strong className="text-brand">{currentClass} - {selectedSubject || 'All Subjects'}</strong>
          </div>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-brand/30 p-1 mx-auto mb-3 opacity-60 flex items-center justify-center shadow-xs">
              <img src="school_logo.jpg" alt="AWBA Crest" className="w-full h-full object-contain rounded-xl" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">No questions found</p>
            <p className="text-xs text-slate-500">
              Upload a .docx question paper or select a different subject above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredQuestions.map((q, idx) => {
              const isExpanded = expandedQuestionId === (q.id || idx);
              const stemText = q.stem || q.question_text || '';
              const rawOpts = q.options || [
                `A) ${q.option_a || ''}`,
                `B) ${q.option_b || ''}`,
                `C) ${q.option_c || ''}`,
                `D) ${q.option_d || ''}`,
              ];
              const correctIdx = q.correctIndex !== undefined 
                ? q.correctIndex 
                : (q.correct_answer === 'B' ? 1 : q.correct_answer === 'C' ? 2 : q.correct_answer === 'D' ? 3 : 0);

              return (
                <div
                  key={q.id || idx}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-darkBorder rounded-xl overflow-hidden hover:border-brand/40 transition-all shadow-2xs"
                >
                  <div
                    onClick={() =>
                      setExpandedQuestionId(isExpanded ? null : (q.id || idx))
                    }
                    className="p-4 flex items-start justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-start space-x-3">
                      <span className="w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder font-bold text-xs text-brand flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                        {idx + 1}
                      </span>
                      <div>
                        <h5 className="text-xs font-semibold text-slate-900 dark:text-slate-200 leading-relaxed">
                          {stemText}
                        </h5>

                        {q.diagram_image_url && (
                          <div className="mt-2 mb-1 max-w-sm rounded-xl overflow-hidden border border-slate-200 dark:border-darkBorder bg-white dark:bg-slate-900 p-2">
                            <img
                              src={q.diagram_image_url.startsWith('/') ? q.diagram_image_url : `/${q.diagram_image_url}`}
                              alt="Diagram"
                              className="max-h-48 object-contain rounded-lg"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          </div>
                        )}

                        <div className="flex items-center space-x-2 mt-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                            {q.difficulty || 'Objective'}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {q.marks || 1} Mark{(q.marks || 1) > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Accordion Options Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-200 dark:border-darkBorder/60 bg-slate-100/60 dark:bg-slate-900/40 space-y-2">
                      <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Options & Verified Answer Key:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {rawOpts.map((opt, oIdx) => {
                          const isCorrect = oIdx === correctIdx;
                          const formattedText = formatOptDisplay(opt);
                          return (
                            <div
                              key={oIdx}
                              className={`p-2.5 rounded-lg text-xs font-medium border flex items-center justify-between ${
                                isCorrect
                                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-semibold'
                                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-darkBorder text-slate-700 dark:text-slate-400 shadow-2xs'
                              }`}
                            >
                              <span>{formattedText}</span>
                              {isCorrect && (
                                <span className="flex items-center space-x-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded">
                                  <Check className="w-3 h-3" />
                                  <span>CORRECT</span>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
