import React, { useState, useEffect } from 'react';
import { X, UserPlus, ShieldCheck, Check, Info } from 'lucide-react';

export default function AddStudentModal({
  isOpen,
  onClose,
  classesList,
  currentClass,
  subjectsByClass,
  onAddStudent,
}) {
  if (!isOpen) return null;

  const [studentClass, setStudentClass] = useState(currentClass || 'SS 3');
  const [surname, setSurname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [gender, setGender] = useState('Male');
  const [selectedSubjects, setSelectedSubjects] = useState([]);

  // Auto-generate clean 7-digit RegNo recommendation when class changes
  useEffect(() => {
    const randomNum = Math.floor(1000000 + Math.random() * 9000000);
    setRegNo(String(randomNum));

    // Preselect all subjects belonging to this class or base tier
    const baseTier = studentClass.replace(/\s+(Science|Art|Commercial|Gold|Diamond)$/i, '').trim();
    const available = subjectsByClass[studentClass] || subjectsByClass[baseTier] || [];
    setSelectedSubjects(available.map((s) => s.name));
  }, [studentClass, subjectsByClass]);

  const handleToggleSubject = (subjName) => {
    if (selectedSubjects.includes(subjName)) {
      setSelectedSubjects(selectedSubjects.filter((s) => s !== subjName));
    } else {
      setSelectedSubjects([...selectedSubjects, subjName]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!surname.trim() || !firstName.trim() || !regNo.trim()) return;

    const sName = surname.trim();
    const fName = firstName.trim();
    const displayName = `${sName}, ${fName}`;

    const newStudent = {
      id: `STU-${Date.now()}`,
      regNo: regNo.trim(),
      surname: sName,
      firstName: fName,
      name: displayName,
      class: studentClass,
      gender,
      assignedSubjects: selectedSubjects,
      status: 'Exam Ready',
      recentScore: 'N/A',
    };

    onAddStudent(newStudent);
    setSurname('');
    setFirstName('');
    onClose();
  };

  const baseTier = studentClass.replace(/\s+(Science|Art|Commercial|Gold|Diamond)$/i, '').trim();
  const currentAvailableSubjects = subjectsByClass[studentClass] || subjectsByClass[baseTier] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-darkBorder w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header with Official School Logo Badge */}
        <div className="p-5 border-b border-darkBorder flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-brand/40 p-0.5 shadow-md shadow-brand/10 shrink-0 flex items-center justify-center">
              <img
                src="school_logo.jpg"
                alt="AWBA Crest"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Register CBT Candidate</h3>
              <p className="text-xs text-slate-400">Anthony White Bridge Academy • Class Enrollment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Class Assignment & Dynamic Isolation Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Class Allocation *
              </label>
              <select
                value={studentClass}
                onChange={(e) => setStudentClass(e.target.value)}
                className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-bold"
              >
                <optgroup label="Junior Secondary Arms">
                  <option value="JSS 1 Gold">JSS 1 Gold</option>
                  <option value="JSS 1 Diamond">JSS 1 Diamond</option>
                  <option value="JSS 2 Gold">JSS 2 Gold</option>
                  <option value="JSS 2 Diamond">JSS 2 Diamond</option>
                  <option value="JSS 3 Gold">JSS 3 Gold</option>
                  <option value="JSS 3 Diamond">JSS 3 Diamond</option>
                </optgroup>
                <optgroup label="Senior Secondary Streams">
                  <option value="SS 1 Science">SS 1 Science</option>
                  <option value="SS 1 Art">SS 1 Art</option>
                  <option value="SS 1 Commercial">SS 1 Commercial</option>
                  <option value="SS 2 Science">SS 2 Science</option>
                  <option value="SS 2 Art">SS 2 Art</option>
                  <option value="SS 2 Commercial">SS 2 Commercial</option>
                  <option value="SS 3 Science">SS 3 Science</option>
                  <option value="SS 3 Art">SS 3 Art</option>
                  <option value="SS 3 Commercial">SS 3 Commercial</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                CBT Registration Number (7-Digit) *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 1009001"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-mono font-bold text-brand"
              />
            </div>
          </div>

          {/* Strict Two-Field Name Schema: Surname & First Name Only */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Surname *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Samuel"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                First Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Patrick"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Gender *
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          {/* DYNAMIC SUBJECT ISOLATION SECTION */}
          <div className="space-y-2 pt-2 border-t border-darkBorder">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-brand" />
                <span>Isolated Subjects for {studentClass}</span>
              </label>
              <span className="text-[10px] text-brand font-semibold bg-brand/10 px-2 py-0.5 rounded-full border border-brand/30">
                Non-Leaking Scope ({selectedSubjects.length} selected)
              </span>
            </div>

            <p className="text-[11px] text-slate-400">
              Select which subjects configured specifically for <span className="text-slate-200 font-semibold">{studentClass}</span> this candidate will write in the CBT exam:
            </p>

            {currentAvailableSubjects.length === 0 ? (
              <div className="p-4 bg-slate-950 rounded-xl border border-darkBorder text-center text-xs text-slate-500">
                No subjects configured yet for {studentClass}. Please add subjects to this class first.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                {currentAvailableSubjects.map((sub) => {
                  const isChecked = selectedSubjects.includes(sub.name);
                  return (
                    <button
                      type="button"
                      key={sub.id}
                      onClick={() => handleToggleSubject(sub.name)}
                      className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all border text-left ${
                        isChecked
                          ? 'bg-brand/15 border-brand text-slate-100 shadow-sm'
                          : 'bg-slate-950 border-darkBorder text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="truncate">
                        <span className="block font-bold text-slate-200 truncate">{sub.name}</span>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-md flex items-center justify-center border transition-colors shrink-0 ml-2 ${
                          isChecked ? 'bg-brand border-brand text-white' : 'border-slate-700 bg-slate-900'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
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
              className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-lg shadow-brand/25"
            >
              Save & Enroll Candidate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

