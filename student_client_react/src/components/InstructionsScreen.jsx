import React from 'react';
import { Clock, FileText, CheckCircle2, ShieldAlert, Play, ArrowLeft } from 'lucide-react';

export default function InstructionsScreen({ student, subject, questionCount, durationMinutes, onStartExam, onCancel }) {
  const surname = (student?.surname || '').toUpperCase();
  const firstName = student?.first_name || '';
  const fullName = firstName ? `${surname}, ${firstName}` : (surname || 'Candidate');

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[24px] shadow-2xl overflow-hidden z-10 transition-colors">
        {/* Header Bar with Crest Logo */}
        <div className="bg-[#F96302] text-white p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white rounded-full p-1.5 shadow-md flex items-center justify-center shrink-0 border-2 border-white">
              <img
                src="./school_logo.jpg"
                alt="School Logo"
                className="w-full h-full object-contain rounded-full"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-white">{fullName}</h2>
              <p className="text-xs text-orange-100 font-semibold">
                Reg No: <span className="font-mono text-white font-bold">{student?.reg_number}</span> | Class: <span className="text-white font-bold">{student?.class || 'N/A'}</span>
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-3.5 py-1.5 bg-white/20 border border-white/30 rounded-full text-xs font-extrabold text-white uppercase tracking-wider backdrop-blur-sm">
              {subject}
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Exam Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-orange-50/60 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 rounded-xl text-center shadow-sm">
              <FileText className="w-5 h-5 text-[#F96302] mx-auto mb-1.5" />
              <p className="text-xs text-[#64748B] dark:text-slate-400 font-bold uppercase tracking-wider">Total Questions</p>
              <p className="text-2xl font-extrabold text-[#1E242B] dark:text-white mt-0.5">{questionCount} <span className="text-xs text-[#64748B] dark:text-slate-400 font-normal">items</span></p>
            </div>

            <div className="p-4 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-center shadow-sm">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 mx-auto mb-1.5" />
              <p className="text-xs text-[#64748B] dark:text-slate-400 font-bold uppercase tracking-wider">Allocated Time</p>
              <p className="text-2xl font-extrabold text-[#1E242B] dark:text-white mt-0.5">{durationMinutes} <span className="text-xs text-[#64748B] dark:text-slate-400 font-normal">mins</span></p>
            </div>

            <div className="col-span-2 sm:col-span-1 p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-center shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mx-auto mb-1.5" />
              <p className="text-xs text-[#64748B] dark:text-slate-400 font-bold uppercase tracking-wider">Mode</p>
              <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">Computer Based</p>
            </div>
          </div>

          {/* Exam Instructions */}
          <div className="bg-[#F4F6F9] dark:bg-slate-950/80 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-extrabold text-[#1E242B] dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#F96302]" />
              Important Examination Guidelines & Rules
            </h3>
            <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-2 list-disc list-inside leading-relaxed font-semibold">
              <li>Read each question carefully before choosing your answer option.</li>
              <li>You can navigate freely between questions using the <span className="text-[#F96302] font-bold font-mono">Next</span>, <span className="text-[#F96302] font-bold font-mono">Previous</span> buttons or the Question Palette grid.</li>
              <li>Use the <span className="text-amber-700 dark:text-amber-400 font-bold font-mono">Flag for Review</span> feature to bookmark questions you wish to review later.</li>
              <li>Answers are <span className="text-emerald-700 dark:text-emerald-400 font-bold">automatically saved</span> in real time to the local server.</li>
              <li>When the timer expires, your examination will be <span className="text-red-700 dark:text-red-400 font-bold">automatically submitted</span>.</li>
              <li>Do NOT close the browser window or attempt to open external applications during the exam session.</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <button
              onClick={onCancel}
              className="w-full sm:w-auto px-5 py-3.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[#1E242B] dark:text-slate-200 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 border border-[#E2E8F0] dark:border-slate-700 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Change Subject
            </button>

            <button
              onClick={onStartExam}
              className="w-full flex-1 px-6 py-4 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-base rounded-xl shadow-lg shadow-[#F96302]/30 transition-all flex items-center justify-center gap-2 group uppercase tracking-wider cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
              <span>Start Examination Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
