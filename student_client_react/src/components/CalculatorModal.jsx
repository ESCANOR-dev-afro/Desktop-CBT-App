import React, { useState } from 'react';
import { Calculator, X, Delete } from 'lucide-react';

export default function CalculatorModal({ isOpen, onClose }) {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');

  if (!isOpen) return null;

  const handleNum = (val) => {
    if (display === '0' || display === 'Error') {
      setDisplay(String(val));
    } else {
      setDisplay(display + val);
    }
  };

  const handleOp = (op) => {
    setEquation(display + ' ' + op + ' ');
    setDisplay('0');
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
  };

  const handleDelete = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const handleEquals = () => {
    try {
      const fullExp = (equation + display).replace(/×/g, '*').replace(/÷/g, '/');
      const result = Function(`'use strict'; return (${fullExp})`)();
      setDisplay(String(Number(result.toFixed(6))));
      setEquation('');
    } catch (e) {
      setDisplay('Error');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-fade-in transition-colors">
      {/* Header Bar */}
      <div className="bg-slate-900 text-white px-4 py-3 border-b border-slate-800 flex items-center justify-between select-none">
        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-orange-300">
          <Calculator className="w-4 h-4" />
          <span>Standard Calculator</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Screen Display */}
      <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-right">
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono h-4 overflow-hidden">{equation}</div>
        <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white tracking-wider truncate mt-0.5">{display}</div>
      </div>

      {/* Calculator Buttons */}
      <div className="p-3 grid grid-cols-4 gap-2 bg-slate-100 dark:bg-slate-900/90">
        <button onClick={handleClear} className="col-span-2 py-2.5 bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 font-bold text-xs rounded-xl hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors cursor-pointer">Clear</button>
        <button onClick={handleDelete} className="py-2.5 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors flex items-center justify-center cursor-pointer"><Delete className="w-4 h-4" /></button>
        <button onClick={() => handleOp('÷')} className="py-2.5 bg-[#F96302] hover:bg-[#E05500] text-white font-bold text-sm rounded-xl transition-colors cursor-pointer">÷</button>

        <button onClick={() => handleNum('7')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">7</button>
        <button onClick={() => handleNum('8')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">8</button>
        <button onClick={() => handleNum('9')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">9</button>
        <button onClick={() => handleOp('×')} className="py-2.5 bg-[#F96302] hover:bg-[#E05500] text-white font-bold text-sm rounded-xl transition-colors cursor-pointer">×</button>

        <button onClick={() => handleNum('4')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">4</button>
        <button onClick={() => handleNum('5')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">5</button>
        <button onClick={() => handleNum('6')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">6</button>
        <button onClick={() => handleOp('-')} className="py-2.5 bg-[#F96302] hover:bg-[#E05500] text-white font-bold text-sm rounded-xl transition-colors cursor-pointer">-</button>

        <button onClick={() => handleNum('1')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">1</button>
        <button onClick={() => handleNum('2')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">2</button>
        <button onClick={() => handleNum('3')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">3</button>
        <button onClick={() => handleOp('+')} className="py-2.5 bg-[#F96302] hover:bg-[#E05500] text-white font-bold text-sm rounded-xl transition-colors cursor-pointer">+</button>

        <button onClick={() => handleNum('0')} className="col-span-2 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">0</button>
        <button onClick={() => handleNum('.')} className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">.</button>
        <button onClick={handleEquals} className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer">=</button>
      </div>
    </div>
  );
}
