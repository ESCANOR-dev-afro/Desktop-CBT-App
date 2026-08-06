import React, { useState } from 'react';
import { X, BookPlus, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function AddSubjectModal({
  isOpen,
  onClose,
  classesList,
  currentClass,
  onAddSubject,
}) {
  if (!isOpen) return null;

  const [targetClass, setTargetClass] = useState(currentClass || 'SS 3');
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [teacher, setTeacher] = useState('');
  const [category, setCategory] = useState('Sciences');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!subjectName.trim() || !subjectCode.trim()) return;

    const newSub = {
      id: `${targetClass.toLowerCase().replace(/\s+/g, '')}-${Date.now()}`,
      code: subjectCode.trim().toUpperCase(),
      name: subjectName.trim(),
      teacher: teacher.trim() || 'Unassigned Instructor',
      questionsCount: 0,
      category,
    };

    onAddSubject(targetClass, newSub);
    setSubjectName('');
    setSubjectCode('');
    setTeacher('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-darkBorder w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Modal Header with Official School Logo Badge */}
        <div className="p-5 border-b border-darkBorder flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-brand/40 p-0.5 shadow-md shadow-brand/10 shrink-0 flex items-center justify-center">
              <img
                src="/school_logo.jpg"
                alt="AWBA Crest"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Add New Subject</h3>
              <p className="text-xs text-slate-400">Anthony White Bridge Academy • Subject Isolation Engine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Isolation Warning Banner */}
          <div className="p-3.5 rounded-xl bg-brand/10 border border-brand/30 flex items-start space-x-3 text-xs text-brand-200">
            <ShieldAlert className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="font-semibold text-brand">Subject Isolation Guarantee:</strong> Adding this subject will automatically propagate and restrict its visibility <span className="underline font-bold">exclusively to {targetClass}</span> across student rosters, question banks, and CBT exams.
            </p>
          </div>

          {/* Grid Layout for Form Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Class Scope *
              </label>
              <select
                value={targetClass}
                onChange={(e) => setTargetClass(e.target.value)}
                className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-semibold"
              >
                {classesList.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls} Class Workspace
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Subject Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="Core">Core Subjects</option>
                <option value="Sciences">Sciences</option>
                <option value="Humanities">Humanities / Arts</option>
                <option value="Commercial">Commercial</option>
                <option value="Technical">Technical / Vocational</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Subject Code *
              </label>
              <input
                type="text"
                placeholder="e.g. PHY301 or MTH101"
                required
                value={subjectCode}
                onChange={(e) => setSubjectCode(e.target.value)}
                className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Subject Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Further Mathematics"
                required
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Assigned Lead Instructor
            </label>
            <input
              type="text"
              placeholder="e.g. Dr. E. Okafor"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-darkBorder flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-darkBorder text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-lg shadow-brand/25 flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Isolate Subject</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
