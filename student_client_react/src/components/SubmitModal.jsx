import React from 'react';
import { FileCheck, X } from 'lucide-react';

export default function SubmitModal({ isOpen, totalQuestions, answeredCount, onConfirm, onCancel, submitting }) {
  if (!isOpen) return null;

  const unansweredCount = totalQuestions - answeredCount;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
        {/* Title Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F96302]/12 rounded-full flex items-center justify-center text-[#F96302]">
              <FileCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[#1E242B]">Submit Examination?</h3>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Text */}
        <p className="text-sm text-[#1E242B] font-medium leading-relaxed">
          Are you sure you want to submit your test paper? You cannot change your answers after submission.
        </p>

        {/* Summary Stat Strip */}
        <div className="p-4 bg-[#F4F6F9] border border-[#E2E8F0] rounded-xl grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-2xl font-bold text-[#1E242B]">{totalQuestions}</p>
            <p className="text-[11px] font-semibold text-[#64748B]">Total Questions</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600">{answeredCount}</p>
            <p className="text-[11px] font-semibold text-[#64748B]">Answered</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#F96302]">{unansweredCount}</p>
            <p className="text-[11px] font-semibold text-[#64748B]">Unanswered</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="w-full sm:w-1/2 py-3 bg-white hover:bg-slate-100 border border-[#E2E8F0] text-[#64748B] font-bold text-xs rounded-xl transition-all uppercase tracking-wider"
          >
            CONTINUE TEST
          </button>

          <button
            onClick={onConfirm}
            disabled={submitting}
            className="w-full sm:w-1/2 py-3 bg-[#F96302] hover:bg-[#E05500] disabled:bg-[#F96302]/50 text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#F96302]/20 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
          >
            {submitting ? 'SUBMITTING...' : 'CONFIRM SUBMISSION'}
          </button>
        </div>
      </div>
    </div>
  );
}
