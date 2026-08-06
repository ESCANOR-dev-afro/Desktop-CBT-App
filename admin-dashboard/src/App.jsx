import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardOverview from './components/DashboardOverview';
import LiveResults from './components/LiveResults';
import ClassWorkspace from './components/ClassWorkspace';
import AddSubjectModal from './components/AddSubjectModal';
import AddStudentModal from './components/AddStudentModal';
import Toast from './components/Toast';

import {
  initialSubjectsByClass,
  initialStudents,
  initialQuestions,
  initialWorkstations,
  activityLogs as initialActivityLogs
} from './data/mockData';

export default function App() {
  const classesList = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'];

  // Global State
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' | 'live-results' | 'class-workspace'
  const [selectedClass, setSelectedClass] = useState('SS 3');

  // Dynamic Subjects state grouped strictly per class
  const [subjectsByClass, setSubjectsByClass] = useState(initialSubjectsByClass);
  const [students, setStudents] = useState(initialStudents);
  const [questionsData, setQuestionsData] = useState(initialQuestions);
  const [workstations, setWorkstations] = useState(initialWorkstations);
  const [activityLogs, setActivityLogs] = useState(initialActivityLogs);

  // Modals state
  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);

  // Toast Notification state
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Dynamic Class-Specific Subject Isolation Handler
  const handleAddSubject = (targetClass, newSubject) => {
    setSubjectsByClass((prev) => {
      const existingList = prev[targetClass] || [];
      return {
        ...prev,
        [targetClass]: [...existingList, newSubject],
      };
    });

    // Add activity log entry
    const newLog = {
      id: String(Date.now()),
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      event: `New Subject "${newSubject.name}" (${newSubject.code}) created & strictly isolated to ${targetClass}`,
      category: 'IsolationEngine',
    };
    setActivityLogs((prev) => [newLog, ...prev]);

    showToast(
      `Subject "${newSubject.name}" successfully added and isolated strictly to ${targetClass}!`,
      'success'
    );
  };

  // Student registration handler
  const handleAddStudent = (newStudent) => {
    setStudents((prev) => [newStudent, ...prev]);
    showToast(
      `Candidate ${newStudent.name} (${newStudent.regNo}) registered for ${newStudent.class}!`,
      'success'
    );
  };

  // Question addition handler
  const handleAddQuestion = (targetClass, subjectName, newQuestion) => {
    setQuestionsData((prev) => {
      const classQuestions = prev[targetClass] || {};
      const subjectQuestions = classQuestions[subjectName] || [];
      return {
        ...prev,
        [targetClass]: {
          ...classQuestions,
          [subjectName]: [newQuestion, ...subjectQuestions],
        },
      };
    });
  };

  // Student deletion handler
  const handleDeleteStudent = (studentId) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
    showToast('Candidate record removed from database', 'info');
  };

  return (
    <div className="flex h-screen bg-darkBg text-slate-100 font-sans antialiased overflow-hidden selection:bg-brand selection:text-white">
      {/* Fixed Left Sidebar */}
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        selectedClass={selectedClass}
        setSelectedClass={setSelectedClass}
        classesList={classesList}
        subjectsByClass={subjectsByClass}
      />

      {/* Main Workspace Layout Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <Header
          activeView={activeView}
          selectedClass={selectedClass}
          onOpenAddSubject={() => setIsAddSubjectOpen(true)}
          onOpenAddStudent={() => setIsAddStudentOpen(true)}
        />

        {/* Scrollable Viewport Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {activeView === 'dashboard' && (
            <DashboardOverview
              classesList={classesList}
              subjectsByClass={subjectsByClass}
              students={students}
              activityLogs={activityLogs}
              onSelectClass={(cls) => {
                setSelectedClass(cls);
                setActiveView('class-workspace');
              }}
            />
          )}

          {activeView === 'live-results' && (
            <LiveResults
              students={students}
              classesList={classesList}
              onShowToast={showToast}
            />
          )}

          {activeView === 'class-workspace' && selectedClass && (
            <ClassWorkspace
              currentClass={selectedClass}
              subjectsByClass={subjectsByClass}
              students={students}
              questionsData={questionsData}
              workstations={workstations}
              onOpenAddSubject={() => setIsAddSubjectOpen(true)}
              onOpenAddStudent={() => setIsAddStudentOpen(true)}
              onAddQuestion={handleAddQuestion}
              onDeleteStudent={handleDeleteStudent}
              onUpdateWorkstations={setWorkstations}
              onShowToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Modals & Notifications */}
      <AddSubjectModal
        isOpen={isAddSubjectOpen}
        onClose={() => setIsAddSubjectOpen(false)}
        classesList={classesList}
        currentClass={selectedClass}
        onAddSubject={handleAddSubject}
      />

      <AddStudentModal
        isOpen={isAddStudentOpen}
        onClose={() => setIsAddStudentOpen(false)}
        classesList={classesList}
        currentClass={selectedClass}
        subjectsByClass={subjectsByClass}
        onAddStudent={handleAddStudent}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
