import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const { message, type = 'success' } = toast;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-brand shrink-0" />,
  };

  const borderColors = {
    success: 'border-emerald-500/40 bg-slate-900/95',
    error: 'border-rose-500/40 bg-slate-900/95',
    info: 'border-brand/40 bg-slate-900/95',
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-bounce-in max-w-md">
      <div className={`flex items-center space-x-3 px-4 py-3.5 rounded-xl border shadow-2xl backdrop-blur-md ${borderColors[type]} text-slate-100`}>
        {icons[type]}
        <div className="text-sm font-medium pr-2 leading-snug">{message}</div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
