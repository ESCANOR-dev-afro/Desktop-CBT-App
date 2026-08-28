import React, { useState, useEffect } from 'react';
import { CheckCircle2, Hand, LogOut, LayoutDashboard } from 'lucide-react';

export default function CompletionScreen({ completionInfo, onReturnToHub, onLogout }) {
  const { studentName, regNumber, studentClass, subject, totalQuestions, answeredCount } = completionInfo || {};
  const [countdown, setCountdown] = useState(15);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onReturnToHub();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onReturnToHub]);

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="w-full max-w-[620px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] shadow-2xl p-6 sm:p-10 space-y-6 text-center z-10 transition-colors">

        {/* Green Checkmark Header Icon */}
        <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/40 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto shadow-inner">
          <CheckCircle2 className="w-12 h-12" />
        </div>

        {/* Headline */}
        <div>
          <h1 className="text-2xl font-bold text-[#1E242B] dark:text-white tracking-tight">Exam Submitted Successfully!</h1>
        </div>

        {/* Child-Friendly Supervisor Instruction Notice (NO SCORE SHOWN) */}
        <div className="p-4 bg-orange-50/80 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 rounded-xl text-left flex items-start gap-3.5">
          <div className="w-9 h-9 bg-[#F96302]/15 dark:bg-orange-500/20 rounded-full flex items-center justify-center text-[#F96302] shrink-0 mt-0.5 font-bold">
            <Hand className="w-5 h-5" />
          </div>
          <p className="text-xs sm:text-sm font-semibold text-[#1E242B] dark:text-slate-200 leading-relaxed">
            Thank you, Anthony Whitebridge Academy student. Please raise your hand and wait quietly for your supervisor.
          </p>
        </div>

        {/* Submission Details Summary Card */}
        <div className="bg-[#F4F6F9] dark:bg-slate-950/80 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-5 text-left space-y-3 font-semibold text-xs text-[#64748B] dark:text-slate-400">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
            <span>Student Name:</span>
            <span className="font-bold text-[#1E242B] dark:text-white text-sm">{studentName || 'Student'}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
            <span>Registration Number:</span>
            <span className="font-bold text-[#1E242B] dark:text-white font-mono text-sm">{regNumber || 'N/A'}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
            <span>Class:</span>
            <span className="font-bold text-[#1E242B] dark:text-white text-sm">{studentClass || 'N/A'}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
            <span>Subject Paper:</span>
            <span className="font-bold text-[#F96302] uppercase text-sm">{subject || 'N/A'}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
            <span>Questions Answered:</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono text-sm">{answeredCount || 0} / {totalQuestions || 0}</span>
          </div>

          <div className="flex items-center justify-between">
            <span>Session Status:</span>
            <span className="font-extrabold text-emerald-800 dark:text-emerald-300 text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/60 rounded">LOCKED & RECORDED</span>
          </div>
        </div>

        {/* Auto-Reset Countdown Banner */}
        <div className="text-xs text-[#64748B] dark:text-slate-400 font-semibold">
          Returning to Exam Portal Hub in <span className="font-mono text-[#F96302] font-bold text-sm">{countdown}</span> seconds...
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={onReturnToHub}
            className="w-full sm:flex-1 py-4 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg shadow-[#F96302]/30 transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>RETURN TO EXAM PORTAL HUB</span>
          </button>

          <button
            onClick={onLogout}
            className="w-full sm:w-auto px-5 py-4 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>LOG OUT</span>
          </button>
        </div>
      </div>
    </div>
  );
}
