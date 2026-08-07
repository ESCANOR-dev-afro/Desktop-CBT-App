import React, { useState } from 'react';
import {
  FileText,
  UploadCloud,
  Plus,
  CheckCircle,
  HelpCircle,
  AlertCircle,
  Search,
  Sparkles,
  BookOpen,
  Filter,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function QuestionBankTab({
  currentClass,
  subjectsByClass,
  questionsData,
  onAddQuestion,
  onShowToast,
}) {
  const availableSubjects = subjectsByClass[currentClass] || [];
  const [selectedSubject, setSelectedSubject] = useState(
    availableSubjects[0]?.name || ''
  );
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);

  // Get questions for current class and selected subject
  const currentSubjectQuestions =
    questionsData[currentClass]?.[selectedSubject] || [];

  const filteredQuestions = currentSubjectQuestions.filter((q) =>
    q.stem.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSimulatedDocxUpload = (fileName = 'Physics_Mock_Exam_Paper.docx') => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      // Simulate adding 2 parsed questions from file
      const parsed1 = {
        id: `Q-${Date.now()}-1`,
        stem: 'Calculated from imported DOCX: What is the unit of Electric Current in SI units?',
        options: ['A) Ampere (A)', 'B) Volt (V)', 'C) Ohm (Ω)', 'D) Joule (J)'],
        correctIndex: 0,
        difficulty: 'Easy',
        marks: 1,
      };
      const parsed2 = {
        id: `Q-${Date.now()}-2`,
        stem: 'Calculated from imported DOCX: State Hooke’s Law regarding elasticity of solid bodies.',
        options: [
          'A) F = ma',
          'B) Force is directly proportional to extension provided elastic limit is not exceeded',
          'C) Energy can neither be created nor destroyed',
          'D) Pressure is inversely proportional to volume'
        ],
        correctIndex: 1,
        difficulty: 'Medium',
        marks: 2,
      };

      if (selectedSubject) {
        onAddQuestion(currentClass, selectedSubject, parsed1);
        onAddQuestion(currentClass, selectedSubject, parsed2);
      }
      onShowToast(
        `Successfully extracted and validated 2 questions from "${fileName}" for ${selectedSubject || currentClass}!`,
        'success'
      );
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Subject Selector & Docx Dropzone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Isolated Subject Selector Card */}
        <div className="bg-slate-900 border border-darkBorder p-5 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center space-x-2 text-brand font-bold text-xs uppercase tracking-wider mb-1">
              <BookOpen className="w-4 h-4" />
              <span>Isolated Subject Scope</span>
            </div>
            <h3 className="text-base font-bold text-slate-100">
              {currentClass} Question Bank
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Select subject to view or upload questions isolated exclusively to {currentClass}.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Target Subject *
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full bg-slate-950 border border-darkBorder text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-bold"
            >
              {availableSubjects.map((sub) => (
                <option key={sub.id} value={sub.name}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 border-t border-darkBorder flex items-center justify-between text-xs text-slate-400">
            <span>Questions Count:</span>
            <span className="font-bold text-slate-100 bg-brand/10 px-2.5 py-0.5 rounded-full border border-brand/20 text-brand">
              {currentSubjectQuestions.length} Questions
            </span>
          </div>
        </div>

        {/* Modern Docx File Uploader Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleSimulatedDocxUpload(file.name);
          }}
          className={`lg:col-span-2 border-2 border-dashed rounded-2xl p-6 transition-all flex flex-col items-center justify-center text-center ${
            isDragging
              ? 'border-brand bg-brand/10 scale-[0.99]'
              : 'border-slate-800 hover:border-brand/50 bg-slate-900/60'
          }`}
        >
          <div className="p-3.5 bg-brand/15 border border-brand/30 rounded-2xl text-brand mb-3">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-100 mb-1">
            Drag & Drop MS Word (.docx) Question Paper
          </h4>
          <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
            Our automated CBT parser will parse stems, options A-D, answer keys, and images from your MS Word document and map them strictly to <strong className="text-brand">{selectedSubject || currentClass}</strong>.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => handleSimulatedDocxUpload()}
              disabled={uploading}
              className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md shadow-brand/20 flex items-center space-x-2 brand-glow-sm"
            >
              {uploading ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Parsing Docx File...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Upload & Parse Docx File</span>
                </>
              )}
            </button>
            <span className="text-xs text-slate-500 font-medium">Supported: .docx, .doc</span>
          </div>
        </div>
      </div>

      {/* Question List Section */}
      <div className="bg-slate-900 border border-darkBorder rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-darkBorder">
          <div className="flex items-center space-x-3">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search questions by stem keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 text-xs pl-9 pr-4 py-2 rounded-xl border border-darkBorder focus:outline-none focus:border-brand text-slate-200"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs text-slate-400">
              Showing <strong className="text-slate-200">{filteredQuestions.length}</strong> items
            </span>
          </div>
        </div>

        {/* Questions Listing */}
        {filteredQuestions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-brand/30 p-1 mx-auto mb-3 opacity-60 flex items-center justify-center">
              <img src="school_logo.jpg" alt="AWBA Crest" className="w-full h-full object-contain rounded-xl" />
            </div>
            <p className="text-sm font-semibold text-slate-400">No questions found</p>
            <p className="text-xs text-slate-500">
              Upload a .docx question paper or select a different subject above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredQuestions.map((q, idx) => {
              const isExpanded = expandedQuestionId === q.id;
              return (
                <div
                  key={q.id}
                  className="bg-slate-950 border border-darkBorder rounded-xl overflow-hidden hover:border-slate-700 transition-all"
                >
                  <div
                    onClick={() =>
                      setExpandedQuestionId(isExpanded ? null : q.id)
                    }
                    className="p-4 flex items-start justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-start space-x-3">
                      <span className="w-6 h-6 rounded-full bg-slate-900 border border-darkBorder font-bold text-xs text-brand flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <h5 className="text-xs font-semibold text-slate-200 leading-relaxed">
                          {q.stem}
                        </h5>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                            {q.difficulty}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {q.marks} Mark{q.marks > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button className="text-slate-500 hover:text-slate-300 p-1">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Accordion Options Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-darkBorder/60 bg-slate-900/40 space-y-2">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Options & Verified Answer Key:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, oIdx) => {
                          const isCorrect = oIdx === q.correctIndex;
                          return (
                            <div
                              key={oIdx}
                              className={`p-2.5 rounded-lg text-xs font-medium border flex items-center justify-between ${
                                isCorrect
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-semibold'
                                  : 'bg-slate-950 border-darkBorder text-slate-400'
                              }`}
                            >
                              <span>{opt}</span>
                              {isCorrect && (
                                <span className="flex items-center space-x-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                                  <Check className="w-3 h-3" />
                                  <span>CORRECT</span>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
