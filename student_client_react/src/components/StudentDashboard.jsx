import React, { useState, useEffect } from 'react';
import { User, LogOut, Clock, FileText, CheckCircle2, Play, RefreshCw, AlertTriangle, ShieldCheck, BookOpen, Lock, Hourglass } from 'lucide-react';
import { getAssignedPapers, getExamQuestions, getSubjects } from '../api';

export default function StudentDashboard({ student, sessionId, onSelectSubject, onLogout }) {
  const [assignedExams, setAssignedExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingSubject, setFetchingSubject] = useState(null);
  const [errorModal, setErrorModal] = useState(null);

  const surname = (student?.surname || '').toUpperCase();
  const firstName = student?.first_name || '';
  const displayName = firstName ? `${surname}, ${firstName}` : (surname || 'Student Candidate');
  const regNumber = student?.reg_number || student?.registration_no || 'N/A';
  const studentClass = student?.class || 'N/A';

  const fetchPapers = async () => {
    setLoading(true);
    try {
      if (student?.id || student?.reg_number || student?.registration_no) {
        const res = await getAssignedPapers(student?.id, student?.reg_number || student?.registration_no, studentClass);
        const paperList = res?.exams || res?.activeExams || res?.data || res?.papers || res?.subjects;
        if (res && res.success && Array.isArray(paperList)) {
          setAssignedExams(paperList);
          setLoading(false);
          return;
        }
      }
      setAssignedExams([]);
    } catch (err) {
      console.warn('Error fetching candidate papers:', err);
      setAssignedExams([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignedPapers = fetchPapers;

  useEffect(() => {
    fetchPapers();
  }, [student?.id, studentClass]);

  const handleStartExam = async (exam) => {
    const subjectName = exam.subject || exam.name;
    if (!subjectName) return;

    const isSubmitted = exam.status === 'SUBMITTED' || exam.status === 'COMPLETED' || exam.isSubmitted === true;
    if (isSubmitted) return;

    const slot = exam.assessment_slot || exam.slot_name || exam.slot || 'midterm_ca';
    const paperSession = exam.session || exam.academic_session || '2026/2027';
    const paperTerm = exam.term || '1st Term';

    setFetchingSubject(subjectName);
    setErrorModal(null);

    try {
      const res = await getExamQuestions(
        subjectName,
        student?.id,
        sessionId,
        studentClass,
        paperSession,
        paperTerm,
        slot
      );

      if (!res || !res.success || !res.questions || res.questions.length === 0) {
        setFetchingSubject(null);
        setErrorModal(subjectName);
        return;
      }

      onSelectSubject({
        subject: subjectName,
        sessionId: res.session_id || sessionId,
        assessmentSlot: slot,
        session: paperSession,
        term: paperTerm,
        questions: res.questions,
        durationMinutes: res.duration_minutes || res.duration || exam.duration || exam.duration_minutes || 45,
        durationSeconds: res.duration_seconds || res.durationSeconds || ((res.duration_minutes || res.duration || exam.duration || exam.duration_minutes || 45) * 60),
      });

    } catch (err) {
      console.error('Error fetching questions:', err);
      setFetchingSubject(null);
      setErrorModal(subjectName);
    }
  };

  const handleTakeExam = handleStartExam;

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans select-none pb-12 transition-colors">
      
      {/* 1. TOP HEADER BAR */}
      <header className="w-full px-6 sm:px-10 py-5 flex items-center justify-between z-20">
        {/* Left: School Crest Logo & Header Titles */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-white rounded-full p-1 shadow-lg border-2 border-white flex items-center justify-center shrink-0">
            <img
              src="./school_logo.jpg"
              alt="Anthony Whitebridge Academy Crest"
              className="w-full h-full object-contain rounded-full"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white uppercase tracking-wider leading-tight">
              ANTHONY WHITEBRIDGE ACADEMY
            </h1>
            <p className="text-xs text-orange-600 dark:text-orange-200/90 font-semibold">
              CBT Examination Portal
            </p>
          </div>
        </div>

        {/* Right: Logout Action Button */}
        <button
          onClick={onLogout}
          className="px-4 py-2.5 bg-slate-900/10 hover:bg-slate-900/20 dark:bg-white/10 dark:hover:bg-white/20 text-slate-900 dark:text-white border border-slate-300 dark:border-white/30 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2 backdrop-blur-sm shadow-md uppercase tracking-wider cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>LOG OUT</span>
        </button>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-2 space-y-7 z-10">

        {/* 2. STUDENT PROFILE BANNER CARD */}
        <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 dark:bg-none dark:bg-slate-900 border border-orange-400/40 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl shadow-orange-500/15 dark:shadow-none flex items-center gap-5 transition-all text-white">
          {/* Avatar Circle: Crisp White in Light Mode with Brand Orange Text, Orange in Dark Mode */}
          <div className="w-16 h-16 bg-white dark:bg-orange-500 text-orange-600 dark:text-white font-extrabold text-2xl rounded-full shadow-md flex items-center justify-center shrink-0 border-2 border-white/80 dark:border-transparent">
            {surname[0] || 'S'}
          </div>

          {/* Student Metadata Text Area */}
          <div className="space-y-2 flex-1">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Welcome, {displayName}
            </h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 dark:bg-slate-950/60 backdrop-blur-md border border-white/30 dark:border-slate-800 text-white dark:text-slate-200 rounded-full shadow-xs">
                <span>🪪</span> Reg No: <strong className="font-mono text-white dark:text-slate-100">{regNumber}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 dark:bg-slate-950/60 backdrop-blur-md border border-white/30 dark:border-slate-800 text-white dark:text-slate-200 rounded-full shadow-xs">
                <span>📄</span> Class: <strong className="text-amber-200 dark:text-orange-400 font-bold">{studentClass}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 dark:bg-slate-950/60 backdrop-blur-md border border-white/30 dark:border-slate-800 text-white dark:text-slate-200 rounded-full shadow-xs">
                <span>🛡️</span> Status: <strong className="text-emerald-200 dark:text-emerald-400 font-bold">Verified Student</strong>
              </span>
            </div>
          </div>
        </div>

        {/* 3. ASSIGNED EXAM PAPERS SECTION */}
        <div className="space-y-4 pt-2">
          {/* Section Heading & Refresh */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Assigned Exam Papers
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-orange-100/90 font-normal mt-1">
                Click on an active exam paper below to begin your examination
              </p>
            </div>

            {/* Circular Refresh Icon Button (↻) */}
            <button
              onClick={fetchPapers}
              className="w-10 h-10 bg-slate-200/80 dark:bg-white/15 hover:bg-slate-300 dark:hover:bg-white/25 text-slate-800 dark:text-white rounded-full flex items-center justify-center transition-all border border-slate-300 dark:border-white/30 backdrop-blur-sm shadow-md self-end sm:self-auto cursor-pointer"
              title="Refresh Exam Papers"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Cards / Empty State Container */}
          {loading ? (
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-[20px] p-12 text-center space-y-3 shadow-xl">
              <RefreshCw className="w-9 h-9 text-[#F96302] animate-spin mx-auto" />
              <p className="text-base font-bold text-[#1E242B] dark:text-slate-100">Retrieving assigned examination papers...</p>
              <p className="text-xs text-[#64748B] dark:text-slate-400">Connecting to local CBT server database</p>
            </div>
          ) : assignedExams.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center shadow-sm max-w-xl mx-auto mt-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">No Active Exam Papers</h3>
              <p className="text-xs text-slate-500 mt-1">No examination is currently active for your class. Kindly reach out to your exam invigilator/admin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6 max-w-4xl mx-auto">
              {assignedExams.map((exam) => {
                const isSubmitted = exam.status === 'SUBMITTED' || exam.status === 'COMPLETED' || exam.isSubmitted === true;
                const isInProgress = !isSubmitted && (exam.status === 'IN_PROGRESS' || exam.status === 'active' || exam.hasActiveSession === true);
                const subName = exam.subject || exam.name || 'Subject Paper';
                const isBusy = fetchingSubject === subName;

                return (
                  <div 
                    key={exam.config_id || exam.id} 
                    className={`p-6 rounded-2xl border transition-all ${
                      isSubmitted 
                        ? 'bg-slate-50/90 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800' 
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:border-orange-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${isSubmitted ? 'bg-slate-200 text-slate-500' : 'bg-orange-50 dark:bg-orange-950/50 text-orange-600'}`}>
                          📖
                        </div>
                        <div>
                          <h4 className="font-bold text-base text-slate-900 dark:text-white">{exam.subject || exam.name}</h4>
                          <p className="text-xs text-slate-500">{exam.slot_name || exam.assessment_slot || 'Standard Assessment'}</p>
                        </div>
                      </div>
                      
                      {/* Status Pill */}
                      {isSubmitted ? (
                        <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                          ✓ SUBMITTED
                        </span>
                      ) : isInProgress ? (
                        <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-400 border border-orange-300 dark:border-orange-800">
                          • IN PROGRESS
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          • AVAILABLE
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-6">
                      <span>⏱ {exam.duration || exam.duration_minutes || 45} mins</span>
                      <span>📝 {exam.total_questions || exam.questions_count || exam.question_count || exam.custom_count || 30} Questions</span>
                    </div>

                    {/* Action Button */}
                    {isSubmitted ? (
                      <button 
                        disabled 
                        className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 font-bold text-xs cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        ✓ EXAMINATION COMPLETED
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleStartExam(exam)}
                        disabled={isBusy}
                        className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isBusy ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                            <span>Loading Exam...</span>
                          </>
                        ) : (
                          <>
                            <span>{isInProgress ? 'RESUME EXAM' : 'START EXAM'}</span>
                            <span>&rarr;</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

      {/* EMPTY / UNPUBLISHED QUESTIONS ALERT MODAL */}
      {errorModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-center transition-colors">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/50 rounded-full text-amber-600 dark:text-amber-400 mb-1">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold text-[#1E242B] dark:text-white tracking-tight">No Exam Questions Published</h3>
            
            <p className="text-sm text-[#1E242B] dark:text-slate-200 leading-relaxed bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-4 rounded-xl font-semibold">
              No exam questions have been published for <strong className="text-amber-900 dark:text-amber-300 uppercase">"{errorModal}"</strong> yet. Please contact your invigilator.
            </p>

            <button
              onClick={() => setErrorModal(null)}
              className="w-full py-3.5 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#F96302]/20 transition-all uppercase tracking-wider cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
