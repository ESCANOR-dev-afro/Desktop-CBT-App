import React, { useState } from 'react';
import {
  Users,
  BookOpen,
  Monitor,
  Plus,
  Layers,
  GraduationCap,
  ShieldCheck,
  CheckCircle2,
  FileCheck2
} from 'lucide-react';
import StudentRosterTab from './StudentRosterTab';
import QuestionBankTab from './QuestionBankTab';
import WorkstationMonitorTab from './WorkstationMonitorTab';

export default function ClassWorkspace({
  currentClass,
  subjectsByClass,
  students,
  questionsData,
  workstations,
  onOpenAddSubject,
  onOpenAddStudent,
  onAddQuestion,
  onDeleteStudent,
  onUpdateWorkstations,
  onShowToast,
}) {
  const [activeTab, setActiveTab] = useState('roster'); // 'roster' | 'questions' | 'monitor'

  const classSubjects = subjectsByClass[currentClass] || [];
  const classStudents = students.filter((s) => s.class === currentClass);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Class Workspace Header Summary Banner with Official School Logo Emblem & Watermark */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-darkBorder p-6 rounded-2xl shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative overflow-hidden">
        {/* Subtle Watermark School Logo in Background */}
        <img
          src="/school_logo.jpg"
          alt=""
          className="absolute right-4 top-1/2 -translate-y-1/2 w-44 h-44 opacity-[0.06] object-contain pointer-events-none filter drop-shadow-md"
        />

        <div className="flex items-center space-x-4 min-w-0 z-10">
          <div className="w-14 h-14 rounded-2xl bg-slate-950 border-2 border-brand/40 p-1 shadow-lg shadow-brand/10 flex items-center justify-center shrink-0">
            <img
              src="/school_logo.jpg"
              alt="Anthony White Bridge Academy Logo"
              className="w-full h-full object-contain rounded-xl"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight truncate">
                {currentClass} Workspace
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand/15 text-brand border border-brand/30">
                Active Session
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 truncate">
              Anthony White Bridge Academy • Class-Isolated CBT Administration
            </p>
          </div>
        </div>

        {/* Quick Metrics Pills Container */}
        <div className="flex flex-wrap items-center gap-3 z-10">
          <div className="bg-slate-950/80 border border-darkBorder px-4 py-2 rounded-xl flex items-center space-x-2.5">
            <Users className="w-4 h-4 text-brand" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Enrolled Candidates</p>
              <p className="text-sm font-extrabold text-slate-100">{classStudents.length} Students</p>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-darkBorder px-4 py-2 rounded-xl flex items-center space-x-2.5">
            <BookOpen className="w-4 h-4 text-brand" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Isolated Subjects</p>
              <p className="text-sm font-extrabold text-slate-100">{classSubjects.length} Registered</p>
            </div>
          </div>

          <button
            onClick={onOpenAddSubject}
            className="px-4 py-3 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-lg shadow-brand/25 flex items-center space-x-2 brand-glow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Subject for {currentClass}</span>
          </button>
        </div>
      </div>

      {/* Horizontally Scrollable Isolated Subjects Pills Bar */}
      <div className="bg-slate-900/90 border border-darkBorder p-3 rounded-2xl flex items-center space-x-2 overflow-x-auto">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 shrink-0 flex items-center space-x-1">
          <ShieldCheck className="w-3.5 h-3.5 text-brand" />
          <span>{currentClass} Scope:</span>
        </span>
        <div className="flex items-center space-x-2">
          {classSubjects.map((sub) => (
            <div
              key={sub.id}
              className="bg-slate-950 border border-darkBorder hover:border-brand/40 px-3 py-1.5 rounded-xl flex items-center space-x-2 shrink-0 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-brand" />
              <span className="text-xs font-bold text-slate-200">{sub.name}</span>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-darkBorder">
                {sub.code}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Modern Sub-Navigation Tabs */}
      <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-2xl border border-darkBorder shadow-inner max-w-fit">
        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center space-x-2.5 px-5 py-3 rounded-xl text-xs font-extrabold transition-all duration-200 ${
            activeTab === 'roster'
              ? 'bg-brand text-white shadow-lg shadow-brand/25 brand-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Class Student Roster</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              activeTab === 'roster' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {classStudents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('questions')}
          className={`flex items-center space-x-2.5 px-5 py-3 rounded-xl text-xs font-extrabold transition-all duration-200 ${
            activeTab === 'questions'
              ? 'bg-brand text-white shadow-lg shadow-brand/25 brand-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Question Bank & Docx Uploader</span>
        </button>

        <button
          onClick={() => setActiveTab('monitor')}
          className={`flex items-center space-x-2.5 px-5 py-3 rounded-xl text-xs font-extrabold transition-all duration-200 ${
            activeTab === 'monitor'
              ? 'bg-brand text-white shadow-lg shadow-brand/25 brand-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span>Live Workstation Monitor</span>
        </button>
      </div>

      {/* Tab Render Area */}
      <div className="pt-2">
        {activeTab === 'roster' && (
          <StudentRosterTab
            students={students}
            currentClass={currentClass}
            subjectsByClass={subjectsByClass}
            onOpenAddStudent={onOpenAddStudent}
            onDeleteStudent={onDeleteStudent}
            onShowToast={onShowToast}
          />
        )}

        {activeTab === 'questions' && (
          <QuestionBankTab
            currentClass={currentClass}
            subjectsByClass={subjectsByClass}
            questionsData={questionsData}
            onAddQuestion={onAddQuestion}
            onShowToast={onShowToast}
          />
        )}

        {activeTab === 'monitor' && (
          <WorkstationMonitorTab
            currentClass={currentClass}
            workstations={workstations}
            onUpdateWorkstations={onUpdateWorkstations}
            onShowToast={onShowToast}
          />
        )}
      </div>
    </div>
  );
}
