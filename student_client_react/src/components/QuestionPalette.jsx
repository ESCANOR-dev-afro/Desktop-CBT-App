import React from 'react';
import { User, CheckCircle2, Send } from 'lucide-react';

export default function QuestionPalette({
  totalQuestions,
  currentIndex,
  answers,
  flagged,
  questions,
  student,
  onSelectQuestion,
  onSubmitTrigger,
}) {
  const answeredCount = Object.keys(answers).length;
  const flaggedCount = Object.values(flagged).filter(Boolean).length;
  const unansweredCount = totalQuestions - answeredCount;
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  const surname = (student?.surname || '').toUpperCase();
  const firstName = student?.first_name || '';
  const displayName = firstName ? `${surname}, ${firstName}` : (surname || 'Student Candidate');

  return (
    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl flex flex-col h-full shadow-md overflow-hidden transition-colors">
      {/* 1. Student Header Profile Summary */}
      <div className="p-4 bg-[#F4F6F9] dark:bg-slate-950/80 border-b border-[#E2E8F0] dark:border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#F96302]/15 rounded-full flex items-center justify-center text-[#F96302] shrink-0 font-bold">
          <User className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-xs sm:text-sm text-[#1E242B] dark:text-slate-100 truncate">{displayName}</h4>
          <p className="text-[11px] text-[#64748B] dark:text-slate-400 font-semibold truncate">
            Reg: <span className="font-mono text-slate-900 dark:text-slate-200">{student?.reg_number || 'N/A'}</span> • Class: {student?.class || 'N/A'}
          </p>
        </div>
      </div>

      {/* 2. Progress Bar Tracker */}
      <div className="p-4 border-b border-[#E2E8F0] dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-[#1E242B] dark:text-slate-200">
          <span>Question Grid Navigator</span>
          <span className="text-[#F96302] font-mono">{answeredCount} / {totalQuestions}</span>
        </div>
        <div className="w-full bg-[#E2E8F0] dark:bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-[#F96302] h-full transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-1 pt-2 text-[10px] font-bold text-[#1E242B] dark:text-slate-300">
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/40 p-1 rounded border border-orange-200 dark:border-orange-900/50">
            <span className="w-2.5 h-2.5 rounded bg-[#F96302]"></span>
            <span>Answered</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded border border-slate-200 dark:border-slate-700 text-[#64748B] dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded bg-[#E2E8F0] dark:bg-slate-700 border border-slate-300 dark:border-slate-600"></span>
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 p-1 rounded border border-amber-200 dark:border-amber-900/50">
            <span className="w-2.5 h-2.5 rounded bg-[#F59E0B]"></span>
            <span>Flagged</span>
          </div>
        </div>
      </div>

      {/* 3. 5-Column Quick Jump Grid (1 to 50) */}
      <div className="flex-1 overflow-y-auto max-h-[380px] p-4">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: totalQuestions }, (_, i) => {
            const q = questions[i];
            const qId = q ? q.id : i + 1;
            const isAnswered = answers[qId] !== undefined && answers[qId] !== null;
            const isFlagged = Boolean(flagged[qId]);
            const isCurrent = currentIndex === i;

            let tileStyle = 'bg-[#F1F5F9] dark:bg-slate-800 border-[#CBD5E1] dark:border-slate-700 text-[#1E242B] dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold';

            if (isFlagged) {
              tileStyle = 'bg-[#F59E0B] border-amber-600 text-white font-extrabold shadow-sm';
            } else if (isAnswered) {
              tileStyle = 'bg-[#F96302] border-[#F96302] text-white font-extrabold shadow-sm';
            }

            if (isCurrent) {
              tileStyle += ' border-2 border-[#F96302] ring-2 ring-[#F96302]/30 font-black';
            }

            return (
              <button
                key={i}
                onClick={() => onSelectQuestion(i)}
                className={`relative aspect-square rounded-xl text-xs flex items-center justify-center transition-all cursor-pointer ${tileStyle}`}
                title={`Question ${i + 1}${isAnswered ? ' (Answered)' : ''}${isFlagged ? ' (Flagged)' : ''}`}
              >
                <span>{i + 1}</span>
                {isFlagged && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-600 rounded-full ring-2 ring-white dark:ring-slate-900"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Bottom Sidebar Submit Action */}
      <div className="p-4 border-t border-[#E2E8F0] dark:border-slate-800">
        <button
          onClick={onSubmitTrigger}
          className="w-full py-3 border-2 border-[#F96302] text-[#F96302] hover:bg-orange-50 dark:hover:bg-orange-950/30 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>SUBMIT PAPER</span>
        </button>
      </div>
    </div>
  );
}
