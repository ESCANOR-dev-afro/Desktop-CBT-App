import React, { useState, useEffect, useRef } from 'react';
import { Lock, KeyRound, X, ArrowRight, AlertCircle } from 'lucide-react';

const VALID_PINS = ['0987'];

export default function AdminPinModal({ isOpen, onClose, onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (VALID_PINS.includes(pin.trim())) {
      setPin('');
      setError('');
      onSuccess();
    } else {
      setError('Invalid Authorization PIN. Access Denied.');
      setPin('');
      if (inputRef.current) inputRef.current.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 transition-colors">
        
        {/* Title Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 rounded-full flex items-center justify-center text-[#F96302]">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1E242B] dark:text-slate-100">Invigilator Authorization</h3>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400 font-medium">Enter master admin PIN to modify settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-red-700 dark:text-red-400 text-xs flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* PIN Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#1E242B] dark:text-slate-200 uppercase tracking-wider mb-2">
              Master Admin Security PIN
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#F96302]" />
              <input
                ref={inputRef}
                type="password"
                maxLength={6}
                required
                placeholder="••••"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                className="w-full bg-[#F8FAFC] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 focus:border-[#F96302] focus:bg-white dark:focus:bg-slate-950 focus:ring-2 focus:ring-[#F96302]/20 rounded-xl pl-10 pr-4 py-3 text-center text-[#1E242B] dark:text-white font-mono text-xl tracking-[0.5em] placeholder-slate-400 dark:placeholder-slate-600 transition-all font-bold"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-[#E2E8F0] dark:border-slate-700 text-[#64748B] dark:text-slate-300 font-bold text-xs rounded-xl transition-all uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#F96302]/20 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
            >
              <span>Unlock Config</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
