import React, { useState, useEffect } from 'react';
import { CheckCircle2, Hand, LogOut, LayoutDashboard } from 'lucide-react';

export default function CompletionScreen({ completionInfo, onFinishLogout }) {
  const { studentName, regNumber, studentClass, subject, totalQuestions, answeredCount } = completionInfo || {};
  const [countdown, setCountdown] = useState(15);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onFinishLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onFinishLogout]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-[620px] bg-white border border-[#E2E8F0] rounded-[24px] shadow-2xl p-6 sm:p-10 space-y-6 text-center z-10">

        {/* Green Checkmark Header Icon */}
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto shadow-inner">
          <CheckCircle2 className="w-12 h-12" />
        </div>

        {/* Headline */}
        <div>
          <h1 className="text-2xl font-bold text-[#1E242B] tracking-tight">Exam Submitted Successfully!</h1>
        </div>

        {/* Child-Friendly Supervisor Instruction Notice (NO SCORE SHOWN) */}
        <div className="p-4 bg-orange-50/80 border border-orange-200 rounded-xl text-left flex items-start gap-3.5">
          <div className="w-9 h-9 bg-[#F96302]/15 rounded-full flex items-center justify-center text-[#F96302] shrink-0 mt-0.5 font-bold">
            <Hand className="w-5 h-5" />
          </div>
          <p className="text-xs sm:text-sm font-semibold text-[#1E242B] leading-relaxed">
            Thank you, Anthony Whitebridge Academy student. Please raise your hand and wait quietly for your supervisor.
          </p>
        </div>

        {/* Submission Details Summary Card */}
        <div className="bg-[#F4F6F9] border border-[#E2E8F0] rounded-xl p-5 text-left space-y-3 font-semibold text-xs text-[#64748B]">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <span>Student Name:</span>
            <span className="font-bold text-[#1E242B] text-sm">{studentName || 'Student'}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <span>Registration Number:</span>
            <span className="font-bold text-[#1E242B] font-mono text-sm">{regNumber || 'N/A'}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <span>Class:</span>
            <span className="font-bold text-[#1E242B] text-sm">{studentClass || 'N/A'}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <span>Subject Paper:</span>
            <span className="font-bold text-[#F96302] uppercase text-sm">{subject || 'N/A'}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <span>Questions Answered:</span>
            <span className="font-bold text-emerald-700 font-mono text-sm">{answeredCount || 0} / {totalQuestions || 0}</span>
          </div>

          <div className="flex items-center justify-between">
            <span>Session Status:</span>
            <span className="font-extrabold text-emerald-800 text-xs px-2 py-0.5 bg-emerald-100 rounded">LOCKED & RECORDED</span>
          </div>
        </div>

        {/* Auto-Reset Countdown Banner */}
        <div className="text-xs text-[#64748B] font-semibold">
          Returning to Exam Portal Hub in <span className="font-mono text-[#F96302] font-bold text-sm">{countdown}</span> seconds...
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={onFinishLogout}
            className="w-full sm:flex-1 py-4 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg shadow-[#F96302]/30 transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>RETURN TO EXAM PORTAL HUB</span>
          </button>

          <button
            onClick={onFinishLogout}
            className="w-full sm:w-auto px-5 py-4 bg-white hover:bg-slate-100 border border-[#E2E8F0] text-[#64748B] font-bold text-xs rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>LOG OUT</span>
          </button>
        </div>
      </div>
    </div>
  );
}
