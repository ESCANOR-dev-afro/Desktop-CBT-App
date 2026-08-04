import React, { useState } from 'react';
import { FileText, CheckCircle2, Filter } from 'lucide-react';
import QuestionUploader from './QuestionUploader';

export default function QuestionBank({ questions, onUploadSuccess }) {
  const [selectedSubject, setSelectedSubject] = useState('all');

  const filteredQuestions = selectedSubject === 'all'
    ? questions
    : questions.filter(q => q.subject.toLowerCase() === selectedSubject.toLowerCase());

  return (
    <div className="flex flex-col gap-6">
      {/* Upload Question Paper Component */}
      <QuestionUploader onUploadSuccess={onUploadSuccess} />

      {/* Question Bank Explorer */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <FileText size={20} className="text-[#F96302]" />
            <span>Question Inventory ({filteredQuestions.length})</span>
          </div>

          <div className="flex items-center gap-3">
            <Filter size={16} className="text-slate-400" />
            <select 
              className="form-control text-xs font-semibold py-1.5 px-3"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
            >
              <option value="all">All Subjects</option>
              <option value="mathematics">Mathematics</option>
              <option value="english">English Language</option>
              <option value="physics">Physics</option>
              <option value="chemistry">Chemistry</option>
              <option value="biology">Biology</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {filteredQuestions.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No questions found for the selected subject filter.
            </div>
          ) : (
            filteredQuestions.map((q, idx) => (
              <div key={q.id || idx} className="question-card">
                <div className="question-header">
                  <div className="question-text">
                    <span className="text-[#F96302] font-bold mr-2">Q{idx + 1}.</span>
                    {q.question_text}
                  </div>
                  <span className="badge-orange capitalize">
                    {q.subject}
                  </span>
                </div>

                <div className="options-grid">
                  <div className={`option-box ${q.correct_answer === 'A' ? 'correct' : ''}`}>
                    <strong>A.</strong> {q.option_a}
                    {q.correct_answer === 'A' && <CheckCircle2 size={14} className="ml-auto text-emerald-500" />}
                  </div>
                  <div className={`option-box ${q.correct_answer === 'B' ? 'correct' : ''}`}>
                    <strong>B.</strong> {q.option_b}
                    {q.correct_answer === 'B' && <CheckCircle2 size={14} className="ml-auto text-emerald-500" />}
                  </div>
                  <div className={`option-box ${q.correct_answer === 'C' ? 'correct' : ''}`}>
                    <strong>C.</strong> {q.option_c}
                    {q.correct_answer === 'C' && <CheckCircle2 size={14} className="ml-auto text-emerald-500" />}
                  </div>
                  <div className={`option-box ${q.correct_answer === 'D' ? 'correct' : ''}`}>
                    <strong>D.</strong> {q.option_d}
                    {q.correct_answer === 'D' && <CheckCircle2 size={14} className="ml-auto text-emerald-500" />}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
