import React, { useState, useEffect } from 'react';
import { User, LogOut, Clock, FileText, CheckCircle2, Play, RefreshCw, AlertTriangle, ShieldCheck, BookOpen, Lock, Hourglass } from 'lucide-react';
import { getAssignedPapers, getExamQuestions, getSubjects } from '../api';

export default function StudentDashboard({ student, sessionId, onSelectSubject, onLogout }) {
  const [assignedPapers, setAssignedPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingSubject, setFetchingSubject] = useState(null);
  const [errorModal, setErrorModal] = useState(null);

  const surname = (student?.surname || '').toUpperCase();
  const firstName = student?.first_name || '';
  const displayName = firstName ? `${surname}, ${firstName}` : (surname || 'Student Candidate');
  const regNumber = student?.reg_number || 'N/A';
  const studentClass = student?.class || 'N/A';

  const fetchPapers = async () => {
    setLoading(true);
    try {
      if (student?.id) {
        const res = await getAssignedPapers(student.id, student.reg_number);
        if (res.success && Array.isArray(res.papers) && res.papers.length > 0) {
          setAssignedPapers(res.papers);
          setLoading(false);
          return;
        }
      }
      
      // Fallback to subjects for student's class
      const subRes = await getSubjects(studentClass);
      if (subRes.success && Array.isArray(subRes.subjects)) {
        const formatted = subRes.subjects.map(s => {
          const name = typeof s === 'string' ? s : (s.name || s.subject_name);
          return {
            name,
            subject: name,
            duration_minutes: s.duration_minutes || 45,
            total_questions: s.total_questions || 50,
            status: 'available',
          };
        });
        setAssignedPapers(formatted);
      }
    } catch (err) {
      console.warn('Error fetching candidate subjects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, [student?.id, studentClass]);

  const handleTakeExam = async (paper) => {
    const subjectName = paper.name || paper.subject;
    if (!subjectName) return;

    setFetchingSubject(subjectName);
    setErrorModal(null);

    try {
      const res = await getExamQuestions(subjectName, student?.id, sessionId, studentClass);

      if (!res || !res.success || !res.questions || res.questions.length === 0) {
        setFetchingSubject(null);
        setErrorModal(subjectName);
        return;
      }

      onSelectSubject({
        subject: subjectName,
        questions: res.questions,
        durationMinutes: res.duration_minutes || paper.duration_minutes || 45,
        durationSeconds: res.duration_seconds || (res.duration_minutes ? res.duration_minutes * 60 : 2700),
      });

    } catch (err) {
      console.error('Error fetching questions:', err);
      setFetchingSubject(null);
      setErrorModal(subjectName);
    }
  };

  return (
    <div className="min-h-screen w-full text-[#1E242B] flex flex-col font-sans select-none pb-12">
      
      {/* 2. TOP HEADER BAR (FLUTTER STYLE) */}
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
            <h1 className="text-lg sm:text-xl font-extrabold text-white uppercase tracking-wider leading-tight">
              ANTHONY WHITEBRIDGE ACADEMY
            </h1>
            <p className="text-xs text-orange-100/90 font-medium">
              CBT Examination Portal
            </p>
          </div>
        </div>

        {/* Right: Logout Action Button */}
        <button
          onClick={onLogout}
          className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2 backdrop-blur-sm shadow-md uppercase tracking-wider"
        >
          <LogOut className="w-4 h-4 text-white" />
          <span>LOG OUT</span>
        </button>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-2 space-y-7 z-10">

        {/* 3. STUDENT PROFILE BANNER CARD */}
        <div className="bg-white/95 backdrop-blur-md border border-white/40 rounded-[20px] p-6 sm:p-7 shadow-2xl flex items-center gap-5">
          {/* Prominent Round Orange Avatar Circle */}
          <div className="w-16 h-16 bg-gradient-to-br from-[#FF7417] via-[#F96302] to-[#E05500] text-white font-black text-2xl rounded-full shadow-lg shadow-[#F96302]/30 flex items-center justify-center shrink-0 border-2 border-white">
            {surname[0] || 'S'}
          </div>

          {/* Student Metadata Text Area */}
          <div className="space-y-2 flex-1">
            <h2 className="text-xl sm:text-2xl font-bold text-[#1E242B] tracking-tight">
              Welcome, {displayName}
            </h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-semibold text-[#1E242B]">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full shadow-xs">
                <span>🪪</span> Reg No: <strong className="font-mono text-[#1E242B]">{regNumber}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full shadow-xs">
                <span>📄</span> Class: <strong className="text-[#F96302]">{studentClass}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full shadow-xs">
                <span>🛡️</span> Status: <strong className="text-emerald-700">Verified Student</strong>
              </span>
            </div>
          </div>
        </div>

        {/* 4. ASSIGNED EXAM PAPERS SECTION */}
        <div className="space-y-4 pt-2">
          {/* Section Heading & Subtitle */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Assigned Exam Papers
              </h3>
              <p className="text-xs sm:text-sm text-orange-100/90 font-normal mt-1">
                Select an available paper below to launch your CBT session
              </p>
            </div>

            {/* Circular Refresh Icon Button (↻) */}
            <button
              onClick={fetchPapers}
              className="w-10 h-10 bg-white/15 hover:bg-white/25 text-white rounded-full flex items-center justify-center transition-all border border-white/30 backdrop-blur-sm shadow-md"
              title="Refresh Exam Papers"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Cards Container */}
          {loading ? (
            <div className="bg-white/90 backdrop-blur-md rounded-[20px] p-12 text-center space-y-3 shadow-2xl">
              <RefreshCw className="w-9 h-9 text-[#F96302] animate-spin mx-auto" />
              <p className="text-base font-bold text-[#1E242B]">Retrieving assigned examination papers...</p>
              <p className="text-xs text-[#64748B]">Connecting to local CBT server database</p>
            </div>
          ) : assignedPapers.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-md rounded-[20px] p-12 text-center space-y-3 shadow-2xl">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h4 className="text-lg font-bold text-[#1E242B]">No Examination Papers Scheduled</h4>
              <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto leading-relaxed font-medium">
                No active examination papers scheduled at this moment. Please wait for the invigilator/admin to activate your paper.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {assignedPapers.map((paper, index) => {
                const subName = paper.name || paper.subject || 'Subject Paper';
                const rawStatus = paper.status || 'available';
                const isCompleted = rawStatus === 'completed' || rawStatus === 'SUBMITTED';
                const isInProgress = !isCompleted && (rawStatus === 'in_progress' || rawStatus === 'active');
                const isAvailable = !isCompleted && !isInProgress && (rawStatus === 'available' || paper.is_active);
                const isNotScheduled = !isCompleted && !isInProgress && !isAvailable;
                const isBusy = fetchingSubject === subName;

                return (
                  <div
                    key={index}
                    className="bg-white rounded-[20px] p-6 shadow-2xl flex flex-col justify-between space-y-4 border border-white/40 hover:shadow-2xl transition-all"
                  >
                    <div>
                      {/* Card Header: Orange Subject Icon & Status Badge */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-50 border border-orange-100 rounded-full flex items-center justify-center text-[#F96302] shrink-0">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <h4 className="text-lg font-bold text-[#1E242B] leading-tight">
                            {subName}
                          </h4>
                        </div>

                        {/* Status Badge Pill */}
                        <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shrink-0 flex items-center gap-1.5 ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : isInProgress
                            ? 'bg-orange-100 text-orange-900 border border-orange-300'
                            : isAvailable
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}>
                          {isCompleted ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>COMPLETED</span>
                            </>
                          ) : isInProgress ? (
                            <>
                              <Hourglass className="w-3.5 h-3.5 text-orange-600" />
                              <span>IN PROGRESS</span>
                            </>
                          ) : isAvailable ? (
                            <>
                              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                              <span>AVAILABLE</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                              <span>NOT SCHEDULED</span>
                            </>
                          )}
                        </span>
                      </div>

                      {/* Card Body: Status Description Text */}
                      <div className="mt-3">
                        {isCompleted ? (
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Exam paper completed and submitted to server.</span>
                          </div>
                        ) : isInProgress ? (
                          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs font-semibold text-orange-900 flex items-center gap-2">
                            <Hourglass className="w-4 h-4 text-[#F96302] shrink-0" />
                            <span>Exam session active. Tap Resume to continue.</span>
                          </div>
                        ) : isAvailable ? (
                          <p className="text-xs font-medium text-[#64748B] py-1">
                            Status: Ready to launch examination paper.
                          </p>
                        ) : (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 flex items-center gap-2">
                            <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>Paper is not scheduled yet.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Action Button */}
                    <div className="pt-2">
                      {isCompleted ? (
                        <button
                          disabled
                          className="w-full py-3.5 border-2 border-emerald-500 text-emerald-700 font-extrabold text-xs rounded-xl cursor-not-allowed uppercase tracking-wider flex items-center justify-center gap-2 bg-emerald-50/50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>EXAM COMPLETED</span>
                        </button>
                      ) : isInProgress ? (
                        <button
                          onClick={() => handleTakeExam(paper)}
                          disabled={isBusy}
                          className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-orange-600/25 uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                        >
                          {isBusy ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin text-white" />
                              <span>Loading Session...</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 fill-current" />
                              <span>RESUME EXAM</span>
                            </>
                          )}
                        </button>
                      ) : isAvailable ? (
                        <button
                          onClick={() => handleTakeExam(paper)}
                          disabled={isBusy}
                          className="w-full py-3.5 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-xs rounded-xl shadow-lg shadow-[#F96302]/30 uppercase tracking-wider flex items-center justify-center gap-2 transition-all group"
                        >
                          {isBusy ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin text-white" />
                              <span>Fetching Paper...</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
                              <span>START EXAM</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="w-full py-3.5 border border-slate-300 text-slate-500 font-extrabold text-xs rounded-xl cursor-not-allowed uppercase tracking-wider flex items-center justify-center gap-2 bg-slate-50"
                        >
                          <Lock className="w-4 h-4" />
                          <span>NOT SCHEDULED YET</span>
                        </button>
                      )}
                    </div>
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
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-100 border border-amber-300 rounded-full text-amber-600 mb-1">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold text-[#1E242B] tracking-tight">No Exam Questions Published</h3>
            
            <p className="text-sm text-[#1E242B] leading-relaxed bg-amber-50/80 border border-amber-200 p-4 rounded-xl font-semibold">
              No exam questions have been published for <strong className="text-amber-900 uppercase">"{errorModal}"</strong> yet. Please contact your invigilator.
            </p>

            <button
              onClick={() => setErrorModal(null)}
              className="w-full py-3.5 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#F96302]/20 transition-all uppercase tracking-wider"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
