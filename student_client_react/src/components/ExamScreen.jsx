import React, { useState, useEffect, useRef } from 'react';
import { Clock, Bookmark, ChevronLeft, ChevronRight, Calculator, Send, CheckCircle2, AlertTriangle, X, Image as ImageIcon, ZoomIn, LogOut } from 'lucide-react';
import QuestionPalette from './QuestionPalette';
import CalculatorModal from './CalculatorModal';
import SubmitModal from './SubmitModal';
import { autosaveAnswer, submitExam } from '../api';
import storageService from '../services/storageService';
import heartbeatService from '../services/heartbeatService';

export default function ExamScreen({
  student,
  subject,
  sessionId,
  questions,
  durationSeconds: initialDurationSeconds,
  initialAnswers = {},
  initialFlagged = {},
  initialCurrentIndex = 0,
  onExamComplete,
}) {
  const regNo = student?.reg_number || student?.registration_no || 'CANDIDATE';
  
  // Hydrate initial state with storageService fallback for 100% crash recovery
  const cachedAnswers = storageService.getAnswers(regNo, subject);
  const cachedFlagged = storageService.getFlagged(regNo, subject);

  const [currentIndex, setCurrentIndex] = useState(initialCurrentIndex);
  const [answers, setAnswers] = useState({ ...cachedAnswers, ...initialAnswers });
  const [flagged, setFlagged] = useState({ ...cachedFlagged, ...initialFlagged });
  const [timeRemaining, setTimeRemaining] = useState(initialDurationSeconds || 2700);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  const activeQuestion = questions[currentIndex] || null;
  const totalQuestions = questions.length;
  const isAutoSubmitting = useRef(false);

  // 1. Dynamic Countdown Timer Effect
  useEffect(() => {
    if (timeRemaining <= 0) {
      if (!isAutoSubmitting.current) {
        handleAutoSubmit();
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!isAutoSubmitting.current) {
            handleAutoSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  // 2. Dynamic 5-Second Workstation Heartbeat & Live Sync
  useEffect(() => {
    if (!student?.id) return;

    heartbeatService.startHeartbeat({
      getPayload: () => ({
        regNumber: regNo,
        studentId: student?.id,
        subjectId: subject,
        subjectName: subject,
        classId: student?.class,
        currentQuestionIndex: currentIndex,
        answeredCount: Object.keys(answers).length,
        totalQuestions: totalQuestions,
        remainingSeconds: timeRemaining,
        status: 'LIVE',
      }),
      intervalMs: 5000,
    });

    return () => {
      heartbeatService.stopHeartbeat();
    };
  }, [student?.id, regNo, subject, currentIndex, answers, totalQuestions, timeRemaining]);

  // 3. LocalStorage Real-Time Persistence for 100% Session & Crash Resilience
  useEffect(() => {
    try {
      storageService.saveAnswers(regNo, subject, answers);
      storageService.saveFlagged(regNo, subject, flagged);
      localStorage.setItem('cbt_current_index', JSON.stringify(currentIndex));
      localStorage.setItem('cbt_time_remaining', JSON.stringify(timeRemaining));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, [currentIndex, answers, flagged, timeRemaining, regNo, subject]);

  const formatTime = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const mStr = String(mins).padStart(2, '0');
    const sStr = String(secs).padStart(2, '0');
    return `${mStr}:${sStr}`;
  };

  const handleSelectOption = (optionKey) => {
    if (!activeQuestion || submitting) return;

    const qId = activeQuestion.id;
    const newAnswers = { ...answers, [qId]: optionKey };
    setAnswers(newAnswers);
    storageService.saveAnswers(regNo, subject, newAnswers);

    if (student?.id) {
      autosaveAnswer(student.id, qId, optionKey);
    }
  };

  const handleClearSelection = (qId) => {
    if (!qId || submitting) return;
    const newAnswers = { ...answers };
    delete newAnswers[qId];
    setAnswers(newAnswers);
    storageService.saveAnswers(regNo, subject, newAnswers);
  };

  const handleToggleFlag = () => {
    if (!activeQuestion) return;
    const qId = activeQuestion.id;
    const newFlagged = {
      ...flagged,
      [qId]: !flagged[qId],
    };
    setFlagged(newFlagged);
    storageService.saveFlagged(regNo, subject, newFlagged);
  };

  const handleAutoSubmit = async () => {
    if (isAutoSubmitting.current || submitting) return;
    isAutoSubmitting.current = true;
    setSubmitting(true);
    heartbeatService.stopHeartbeat();

    try {
      await submitExam(student?.id, sessionId, answers);
    } catch (err) {
      console.warn('Auto-submit API warning:', err.message);
    } finally {
      storageService.clearAnswers(regNo, subject);
      storageService.clearFlagged(regNo, subject);
      onExamComplete({
        studentName: student?.first_name ? `${student.surname}, ${student.first_name}` : student?.surname,
        regNumber: regNo,
        studentClass: student?.class,
        subject: subject,
        totalQuestions: totalQuestions,
        answeredCount: Object.keys(answers).length,
        submitTime: new Date().toISOString(),
      });
    }
  };

  const handleConfirmManualSubmit = async () => {
    setSubmitting(true);
    heartbeatService.stopHeartbeat();
    try {
      await submitExam(student?.id, sessionId, answers);
    } catch (err) {
      console.warn('Submit API warning:', err.message);
    } finally {
      storageService.clearAnswers(regNo, subject);
      storageService.clearFlagged(regNo, subject);
      setIsSubmitModalOpen(false);
      onExamComplete({
        studentName: student?.first_name ? `${student.surname}, ${student.first_name}` : student?.surname,
        regNumber: regNo,
        studentClass: student?.class,
        subject,
        totalQuestions,
        answeredCount: Object.keys(answers).length,
        submitTime: new Date().toISOString(),
      });
    }
  };

  const isTimerLow = timeRemaining < 300; // Under 5 minutes remaining
  const activeQuestionId = activeQuestion?.id;
  const selectedOption = activeQuestionId ? answers[activeQuestionId] : null;
  const isQuestionFlagged = activeQuestionId ? Boolean(flagged[activeQuestionId]) : false;

  const getDiagramUrl = (question) => {
    if (!question) return null;
    const rawUrl = question.diagram_image_url || question.diagram_filename || question.diagram_url || question.diagram;
    if (!rawUrl || String(rawUrl).trim() === '') return null;
    const pathStr = String(rawUrl).trim();
    if (pathStr.startsWith('http://') || pathStr.startsWith('https://')) return pathStr;
    const cleanPath = pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
    return `${window.location.origin}${cleanPath}`;
  };

  const diagramUrl = getDiagramUrl(activeQuestion);

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#1E242B] flex flex-col font-sans select-none">
      {/* 1. TOP APP BAR WITH FLUTTER BRANDING (#F96302) */}
      <header className="bg-[#F96302] text-white px-4 sm:px-6 py-3 sticky top-0 z-30 flex items-center justify-between shadow-md">
        {/* Left: School Crest Logo Badge & Branding */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-full p-1 shadow-md flex items-center justify-center shrink-0 border border-white">
            <img
              src="./school_logo.jpg"
              alt="School Logo"
              className="w-full h-full object-contain rounded-full"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-bold leading-tight text-white tracking-tight">Anthony Whitebridge Academy</h1>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold text-white/90 tracking-wider">OFFLINE CBT EXAM PORTAL</span>
              <span className="px-1.5 py-0.5 bg-white/25 rounded text-[10px] font-bold text-white uppercase">{subject}</span>
            </div>
          </div>
          <div className="sm:hidden">
            <h1 className="text-xs font-bold uppercase text-white">{subject}</h1>
            <p className="text-[10px] text-white/80 font-bold">OFFLINE CBT PORTAL</p>
          </div>
        </div>

        {/* Right Controls: Timer Pill & Submit Button */}
        <div className="flex items-center gap-3">
          {/* 60-Minute Countdown Timer Display */}
          <div
            className={`px-3.5 py-1.5 rounded-full flex items-center gap-2 transition-all shadow-sm ${
              isTimerLow
                ? 'bg-[#DC2626] text-white animate-urgent-pulse shadow-red-600/50'
                : 'bg-white text-[#1E242B]'
            }`}
          >
            <Clock className={`w-4 h-4 ${isTimerLow ? 'text-white' : 'text-[#F96302]'}`} />
            <div className="flex flex-col text-left">
              <span className={`text-[9px] font-extrabold leading-none tracking-wider uppercase ${isTimerLow ? 'text-white/90' : 'text-[#64748B]'}`}>
                TIME REMAINING
              </span>
              <span className={`text-base font-bold font-mono leading-tight ${isTimerLow ? 'text-white' : 'text-[#1E242B]'}`}>
                {formatTime(timeRemaining)}
              </span>
            </div>
          </div>

          {/* Header Calculator Trigger */}
          <button
            onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}
            className="p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors hidden md:flex items-center gap-1.5 text-xs font-bold"
            title="Open Calculator"
          >
            <Calculator className="w-4 h-4 text-white" />
            <span>Calc</span>
          </button>

          {/* Header Submit Button */}
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="px-4 py-2.5 bg-[#1E242B] hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5 uppercase tracking-wider"
          >
            <Send className="w-4 h-4" />
            <span>SUBMIT EXAM</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN SPLIT LAYOUT (MAIN AREA + SIDEBAR) */}
      <div className="flex-1 max-w-[1280px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT COLUMN: QUESTION CONTENT & OPTIONS (8 COLS) */}
        <div className="lg:col-span-8 flex flex-col gap-4">

          {/* Question Index Indicator Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-[#F96302] text-white font-bold text-xs rounded-lg uppercase tracking-wider shadow-sm">
                Question {currentIndex + 1} of {totalQuestions}
              </span>
              <span className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 ${
                selectedOption
                  ? 'bg-emerald-100/80 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-[#64748B]'
              }`}>
                <CheckCircle2 className={`w-3.5 h-3.5 ${selectedOption ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{selectedOption ? `ANSWERED (${selectedOption})` : 'UNANSWERED'}</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleFlag}
                className={`px-3 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
                  isQuestionFlagged
                    ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Bookmark className={`w-3.5 h-3.5 ${isQuestionFlagged ? 'fill-current text-amber-600' : ''}`} />
                <span>{isQuestionFlagged ? 'Flagged' : 'Flag'}</span>
              </button>
              <span className="text-xs text-[#64748B] font-semibold font-mono hidden sm:inline">
                SESSION #{sessionId}
              </span>
            </div>
          </div>

          {/* Question Body Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 flex-1 flex flex-col justify-between shadow-md">
            <div>
              {/* Question Text */}
              {activeQuestion ? (
                <div className="space-y-4">
                  <h2 className="text-lg sm:text-xl font-bold text-[#1E242B] leading-relaxed tracking-tight">
                    {activeQuestion.question_text}
                  </h2>

                  {/* Question Diagram Asset */}
                  {diagramUrl && (
                    <div
                      onClick={() => setLightboxImage(diagramUrl)}
                      className="my-3 p-3 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:border-[#F96302] transition-colors relative group max-w-full inline-block"
                    >
                      <img
                        src={diagramUrl}
                        alt="Question Diagram"
                        className="max-h-56 rounded-lg object-contain"
                      />
                      <div className="absolute top-2 right-2 px-2 py-1 bg-slate-900/80 text-white rounded text-[10px] font-bold flex items-center gap-1 opacity-90 group-hover:opacity-100">
                        <ZoomIn className="w-3 h-3 text-[#F96302]" />
                        <span>Click to Expand</span>
                      </div>
                    </div>
                  )}

                  <hr className="border-slate-200 my-4" />

                  {/* Options A, B, C, D */}
                  <div className="space-y-3.5 pt-2">
                    {[
                      { key: 'A', text: activeQuestion.option_a },
                      { key: 'B', text: activeQuestion.option_b },
                      { key: 'C', text: activeQuestion.option_c },
                      { key: 'D', text: activeQuestion.option_d },
                    ].map((opt) => {
                      if (!opt.text) return null;
                      const selected = selectedOption === opt.key;

                      return (
                        <button
                          key={opt.key}
                          onClick={() => handleSelectOption(opt.key)}
                          className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4 group ${
                            selected
                              ? 'bg-orange-50/90 border-[#F96302] text-[#1E242B] shadow-md ring-2 ring-[#F96302]'
                              : 'bg-white border-[#E2E8F0] text-[#334155] hover:border-slate-300 hover:bg-slate-50 shadow-sm'
                          }`}
                        >
                          {/* Circle Option Indicator */}
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border transition-colors ${
                              selected
                                ? 'bg-[#F96302] border-[#F96302] text-white shadow-sm'
                                : 'bg-[#F1F5F9] border-[#CBD5E1] text-[#1E242B] group-hover:bg-slate-200'
                            }`}
                          >
                            {opt.key}
                          </div>

                          {/* Option Content Text */}
                          <div className="flex-1 font-semibold text-sm sm:text-base leading-relaxed">
                            {opt.text}
                          </div>

                          {selected && (
                            <CheckCircle2 className="w-5 h-5 text-[#F96302] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 py-10 text-center font-bold">No question data available.</div>
              )}
            </div>

            {/* ACTION TOOLBAR: Previous / Clear / Next */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-200 mt-6">
              <button
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="px-5 py-3.5 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-[#E2E8F0] text-[#1E242B] font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>PREVIOUS QUESTION</span>
              </button>

              {selectedOption && (
                <button
                  onClick={() => handleClearSelection(activeQuestionId)}
                  className="text-xs font-semibold text-[#64748B] hover:text-[#1E242B] transition-colors underline"
                >
                  Clear Selection
                </button>
              )}

              <button
                onClick={() => {
                  if (currentIndex < totalQuestions - 1) {
                    setCurrentIndex((prev) => prev + 1);
                  } else {
                    setIsSubmitModalOpen(true);
                  }
                }}
                className="px-6 py-3.5 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md shadow-[#F96302]/30 transition-all flex items-center gap-2 uppercase tracking-wider"
              >
                <span>{currentIndex < totalQuestions - 1 ? 'NEXT QUESTION' : 'FINISH & SUBMIT'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: QUESTION PALETTE SIDEBAR GRID (4 COLS) */}
        <div className="lg:col-span-4">
          <QuestionPalette
            totalQuestions={totalQuestions}
            currentIndex={currentIndex}
            answers={answers}
            flagged={flagged}
            questions={questions}
            student={student}
            onSelectQuestion={(idx) => setCurrentIndex(idx)}
            onSubmitTrigger={() => setIsSubmitModalOpen(true)}
          />
        </div>

      </div>

      {/* Lightbox Modal for Diagram Expansion */}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-4xl w-full bg-[#1E242B] border-2 border-[#F96302] rounded-2xl overflow-hidden shadow-2xl p-4 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <span className="text-white font-bold text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#F96302]" />
                Diagram Inspection Lightbox
              </span>
              <button onClick={() => setLightboxImage(null)} className="text-white hover:text-orange-400 p-1">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 p-4 flex items-center justify-center overflow-auto">
              <img src={lightboxImage} alt="Expanded Diagram" className="max-h-[70vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {/* Popover Calculator Modal */}
      <CalculatorModal isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />

      {/* Manual Submit Confirmation Modal */}
      <SubmitModal
        isOpen={isSubmitModalOpen}
        totalQuestions={totalQuestions}
        answeredCount={Object.keys(answers).length}
        submitting={submitting}
        onConfirm={handleConfirmManualSubmit}
        onCancel={() => setIsSubmitModalOpen(false)}
      />
    </div>
  );
}
