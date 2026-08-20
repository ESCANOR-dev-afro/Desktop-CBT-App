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
    <div className="fixed bottom-6 right-6 z-50 w-72 bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
      {/* Header Bar */}
      <div className="bg-slate-900 text-white px-4 py-3 border-b border-slate-800 flex items-center justify-between select-none">
        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-blue-300">
          <Calculator className="w-4 h-4" />
          <span>Standard Calculator</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Screen Display */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 text-right">
        <div className="text-xs text-slate-500 font-mono h-4 overflow-hidden">{equation}</div>
        <div className="text-2xl font-bold font-mono text-slate-900 tracking-wider truncate mt-0.5">{display}</div>
      </div>

      {/* Calculator Buttons */}
      <div className="p-3 grid grid-cols-4 gap-2 bg-slate-100">
        <button onClick={handleClear} className="col-span-2 py-2.5 bg-red-100 border border-red-200 text-red-700 font-bold text-xs rounded-xl hover:bg-red-200 transition-colors">Clear</button>
        <button onClick={handleDelete} className="py-2.5 bg-slate-200 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-300 transition-colors flex items-center justify-center"><Delete className="w-4 h-4" /></button>
        <button onClick={() => handleOp('÷')} className="py-2.5 bg-blue-900 border border-blue-900 text-white font-bold text-sm rounded-xl hover:bg-blue-800 transition-colors">÷</button>

        <button onClick={() => handleNum('7')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">7</button>
        <button onClick={() => handleNum('8')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">8</button>
        <button onClick={() => handleNum('9')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">9</button>
        <button onClick={() => handleOp('×')} className="py-2.5 bg-blue-900 border border-blue-900 text-white font-bold text-sm rounded-xl hover:bg-blue-800 transition-colors">×</button>

        <button onClick={() => handleNum('4')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">4</button>
        <button onClick={() => handleNum('5')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">5</button>
        <button onClick={() => handleNum('6')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">6</button>
        <button onClick={() => handleOp('-')} className="py-2.5 bg-blue-900 border border-blue-900 text-white font-bold text-sm rounded-xl hover:bg-blue-800 transition-colors">-</button>

        <button onClick={() => handleNum('1')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">1</button>
        <button onClick={() => handleNum('2')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">2</button>
        <button onClick={() => handleNum('3')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">3</button>
        <button onClick={() => handleOp('+')} className="py-2.5 bg-blue-900 border border-blue-900 text-white font-bold text-sm rounded-xl hover:bg-blue-800 transition-colors">+</button>

        <button onClick={() => handleNum('0')} className="col-span-2 py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">0</button>
        <button onClick={() => handleNum('.')} className="py-2.5 bg-white border border-slate-200 text-slate-900 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">.</button>
        <button onClick={handleEquals} className="py-2.5 bg-emerald-600 text-white font-bold text-sm rounded-xl hover:bg-emerald-700 transition-colors">=</button>
      </div>
    </div>
  );
}
