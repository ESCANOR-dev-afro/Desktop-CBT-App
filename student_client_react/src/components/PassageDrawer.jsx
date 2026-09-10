import React, { useState, useEffect } from 'react';
import { BookOpen, X, ZoomIn, ZoomOut } from 'lucide-react';
import MathRenderer from './MathRenderer';

/**
 * PassageDrawer — Slide-over Drawer for Reading Comprehension Passages
 *
 * Provides an accessible, full-height slide-over panel on the right side of the screen
 * for reading lengthy English/Literature comprehension passages during exams.
 * Features customizable font sizing (16px, 18px, 20px), backdrop dismissal,
 * and Escape key support without interrupting student timer or answer state.
 */
export default function PassageDrawer({ isOpen, onClose, passage }) {
  // Font sizes: 0 = 16px (text-base), 1 = 18px (text-lg), 2 = 20px (text-xl)
  const [fontSizeLevel, setFontSizeLevel] = useState(1);

  const fontClasses = [
    'text-base leading-relaxed',
    'text-lg leading-relaxed',
    'text-xl leading-loose',
  ];

  const fontSizeLabels = ['16px', '18px', '20px'];

  // Handle Escape key to close the drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      {/* Semi-transparent Backdrop Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
        aria-label="Close comprehension passage drawer backdrop"
      />

      {/* Slide Panel */}
      <div
        className="relative z-50 h-full w-full sm:w-[650px] md:w-[700px] bg-slate-900 text-slate-100 shadow-2xl flex flex-col border-l border-slate-700/80 transform transition-transform duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="passage-drawer-title"
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 shadow-sm">
          {/* Title & Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#F96302]/20 border border-[#F96302]/40 flex items-center justify-center text-[#F96302] shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h3 id="passage-drawer-title" className="text-sm sm:text-base font-bold text-white leading-tight truncate">
                Reading Comprehension Passage
              </h3>
              <p className="text-[11px] text-slate-400">Read carefully before answering questions</p>
            </div>
          </div>

          {/* Header Actions: Font Zoom & Close Button */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Font Zoom Controls */}
            <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-lg p-0.5 shadow-inner">
              <button
                type="button"
                onClick={() => setFontSizeLevel((prev) => Math.max(0, prev - 1))}
                disabled={fontSizeLevel === 0}
                className="px-2 py-1 rounded text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Decrease font size"
              >
                A-
              </button>
              <span className="px-1.5 text-[10px] font-mono text-slate-400 font-bold select-none">
                {fontSizeLabels[fontSizeLevel]}
              </span>
              <button
                type="button"
                onClick={() => setFontSizeLevel((prev) => Math.min(fontClasses.length - 1, prev + 1))}
                disabled={fontSizeLevel === fontClasses.length - 1}
                className="px-2 py-1 rounded text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Increase font size"
              >
                A+
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Close passage (Esc)"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Close</span>
              <kbd className="hidden sm:inline px-1 py-0.5 text-[9px] bg-slate-900 border border-slate-700 rounded font-mono text-slate-400">Esc</kbd>
            </button>
          </div>
        </div>

        {/* Scrollable Passage Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-4 select-text">
          {passage ? (
            <div className={`text-slate-100 font-normal tracking-wide whitespace-pre-line ${fontClasses[fontSizeLevel]}`}>
              <MathRenderer content={passage} />
            </div>
          ) : (
            <div className="text-slate-500 py-12 text-center font-medium text-sm">
              No passage text found for this question.
            </div>
          )}
        </div>

        {/* Drawer Footer Banner */}
        <div className="px-6 py-3 bg-slate-950/90 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Exam in progress
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#F96302] hover:underline font-bold text-xs cursor-pointer"
          >
            Back to Questions &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
