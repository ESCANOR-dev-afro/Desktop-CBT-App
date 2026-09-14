import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardOverview from './components/DashboardOverview';
import LiveResults from './components/LiveResults';
import ClassWorkspace from './components/ClassWorkspace';
import QuestionBankMainView from './components/QuestionBankMainView';
import WorkstationMonitorView from './components/WorkstationMonitorView';
import AddSubjectModal from './components/AddSubjectModal';
import AddStudentModal from './components/AddStudentModal';
import UploadRosterModal from './components/UploadRosterModal';
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import AdminLoginGate from './components/AdminLoginGate';
import { useAcademicSession } from './context/AcademicSessionContext';

import {
  allClassArms,
  initialSubjectsByClass,
  initialStudents,
  initialQuestions,
  initialWorkstations,
  activityLogs as initialActivityLogs
} from './data/mockData';

export default function App() {
  // Authentication Guard State
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem('awba_admin_auth') === 'true' || localStorage.getItem('awba_admin_authenticated') === 'true'
  );

  const handleSignOut = () => {
    localStorage.removeItem('awba_admin_auth');
    localStorage.removeItem('awba_admin_authenticated');
    setIsAuthenticated(false);
  };

  const classesList = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3', ...allClassArms];

  // Global State
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' | 'live-results' | 'question-bank' | 'class-workspace'
  const [selectedClass, setSelectedClass] = useState('SS 3');

  // Dynamic Subjects state grouped strictly per class
  const [subjectsByClass, setSubjectsByClass] = useState(initialSubjectsByClass);
  const [students, setStudents] = useState(initialStudents);
  const [questionsData, setQuestionsData] = useState(initialQuestions);
  const [workstations, setWorkstations] = useState(initialWorkstations);
  const [activityLogs, setActivityLogs] = useState(initialActivityLogs);

  // Global Academic Term & Session State from Context
  const { currentSession, currentTerm, changeTerm, changeSession } = useAcademicSession();
  const activeTerm = currentTerm;
  const academicSession = currentSession;

  // Modals state
  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isUploadRosterOpen, setIsUploadRosterOpen] = useState(false);

  // Toast Notification state
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Dynamic Class Subjects mapping from database on load with state reconciliation
  useEffect(() => {
    // Cache-busting check for legacy curriculum cache
    try {
      const CURRICULUM_VERSION = 3;
      const storedVer = Number(localStorage.getItem('awba_curriculum_version')) || 0;
      if (storedVer < CURRICULUM_VERSION) {
        localStorage.removeItem('awba_curriculum');
        localStorage.removeItem('awba_class_subjects');
        localStorage.removeItem('cbt_curriculum');
        localStorage.setItem('awba_curriculum_version', String(CURRICULUM_VERSION));
      }
    } catch (_) {}

    fetch('/api/admin/class-subjects')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.classSubjects && Object.keys(data.classSubjects).length > 0) {
          // Authoritative state reconciliation:
          setSubjectsByClass((prev) => {
            const merged = { ...initialSubjectsByClass, ...prev };
            Object.entries(data.classSubjects).forEach(([cls, fetchedList]) => {
              const defaultList = initialSubjectsByClass[cls] || [];
              if (Array.isArray(fetchedList)) {
                const fetchedNames = new Set(fetchedList.map((s) => (s?.name || s).toLowerCase()));
                const missingDefaults = defaultList.filter(
                  (d) => !fetchedNames.has((d?.name || d).toLowerCase())
                );
                merged[cls] = [...fetchedList, ...missingDefaults];
              }
            });
            return merged;
          });
        }
      })
      .catch((err) => console.log('Notice: Class subjects API load fallback active', err));
  }, []);

  // Academic Term Switch Handler with Context & Activity Log
  const handleSelectAcademicTerm = async (newTerm) => {
    await changeTerm(newTerm);
    setActivityLogs((prev) => [
      {
        id: String(Date.now()),
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        event: `Academic Term switched to ${newTerm} (${currentSession})`,
        category: 'AcademicTermEngine',
      },
      ...prev,
    ]);
  };

  // Dynamic Class-Specific Subject Isolation Handler with Database Persistence
  const handleAddSubject = async (targetClass, newSubject) => {
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
      event: `New Subject "${newSubject.name}" created & strictly isolated to ${targetClass}`,
      category: 'IsolationEngine',
    };
    setActivityLogs((prev) => [newLog, ...prev]);

    // Persist new subject mapping to backend SQLite database
    try {
      await fetch('/api/admin/class-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class: targetClass,
          subject: newSubject.name,
        }),
      });
    } catch (e) {
      console.log('Notice: Subject backend sync notice', e);
    }

    showToast(
      `Subject "${newSubject.name}" successfully added and isolated strictly to ${targetClass}!`,
      'success'
    );
  };

  // Fetch database students on load to ensure persistence across page refreshes
  useEffect(() => {
    fetch('/api/admin/students')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.students)) {
          const formatted = data.students.map((s) => {
            const surnameUpper = String(s.surname || '').toUpperCase();
            const fName = s.first_name || '';
            return {
              id: s.id,
              regNo: s.reg_number,
              reg_number: s.reg_number,
              surname: surnameUpper,
              firstName: fName,
              first_name: fName,
              name: fName ? `${surnameUpper}, ${fName}` : surnameUpper,
              class: s.class,
              gender: 'Candidate',
              assignedSubjects: s.assigned_subject ? s.assigned_subject.split(/[,;]/).map((x) => x.trim()) : ['Mathematics'],
              assigned_subject: s.assigned_subject || 'Mathematics',
              status: 'Exam Ready',
              recentScore: 'N/A',
            };
          });
          setStudents(formatted);
        }
      })
      .catch((err) => console.log('Notice: DB students load fallback active', err));
  }, []);

  // Student registration handler with permanent SQLite database persistence
  const handleAddStudent = async (newStudent) => {
    try {
      const payload = {
        reg_number: newStudent.regNo || newStudent.reg_number,
        surname: newStudent.surname,
        first_name: newStudent.firstName || newStudent.first_name || '',
        class: newStudent.class,
        assigned_subject: Array.isArray(newStudent.assignedSubjects)
          ? newStudent.assignedSubjects.join(', ')
          : (newStudent.assigned_subject || 'Mathematics'),
      };

      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        const savedStudent = {
          ...newStudent,
          id: data.student_id || newStudent.id,
          surname: String(newStudent.surname).toUpperCase(),
        };
        setStudents((prev) => [savedStudent, ...prev]);
        showToast(
          `Candidate ${newStudent.name} (${newStudent.regNo}) registered and saved to database!`,
          'success'
        );
      } else {
        showToast(data.message || 'Failed to persist candidate to database.', 'error');
      }
    } catch (e) {
      // Offline / fallback state update
      setStudents((prev) => [newStudent, ...prev]);
      showToast(`Candidate ${newStudent.name} registered locally.`, 'info');
    }
  };

  // Bulk Excel Student Roster handler
  const handleUploadRosterSuccess = (targetClass, newStudentsList) => {
    const formatted = newStudentsList.map((s, idx) => ({
      id: s.id || `STU-EXCEL-${Date.now()}-${idx}`,
      regNo: s.reg_number || s.regNo,
      reg_number: s.reg_number || s.regNo,
      surname: String(s.surname).toUpperCase(),
      firstName: s.first_name || s.firstName || '',
      name: s.first_name ? `${String(s.surname).toUpperCase()}, ${s.first_name}` : String(s.surname).toUpperCase(),
      class: targetClass,
      gender: 'Candidate',
      assignedSubjects: typeof s.assigned_subject === 'string' ? s.assigned_subject.split(/[,;]/).map(x => x.trim()) : (s.assignedSubjects || ['Mathematics']),
      assigned_subject: typeof s.assigned_subject === 'string' ? s.assigned_subject : 'Mathematics',
      status: 'Exam Ready',
      recentScore: 'N/A',
    }));

    setStudents((prev) => {
      const existingRegs = new Set(formatted.map((x) => x.reg_number));
      const filteredPrev = prev.filter((m) => !existingRegs.has(m.regNo || m.reg_number));
      return [...formatted, ...filteredPrev];
    });

    showToast(`${formatted.length} Students successfully enrolled into ${targetClass}`, 'success');

    // Trigger reactive re-fetch of students list from backend
    fetch('/api/admin/students')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.students)) {
          const reloaded = data.students.map((s) => {
            const surnameUpper = String(s.surname || '').toUpperCase();
            const fName = s.first_name || '';
            return {
              id: s.id,
              regNo: s.reg_number,
              reg_number: s.reg_number,
              surname: surnameUpper,
              firstName: fName,
              first_name: fName,
              name: fName ? `${surnameUpper}, ${fName}` : surnameUpper,
              class: s.class,
              gender: 'Candidate',
              assignedSubjects: s.assigned_subject ? s.assigned_subject.split(/[,;]/).map((x) => x.trim()) : ['Mathematics'],
              assigned_subject: s.assigned_subject || 'Mathematics',
              status: 'Exam Ready',
              recentScore: 'N/A',
            };
          });
          setStudents(reloaded);
        }
      })
      .catch((err) => console.log('Notice: Refreshing students after upload fallback', err));
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

  // Student deletion handler — permanently removes from SQLite database via backend API
  const handleDeleteStudent = async (studentId) => {
    try {
      const res = await fetch(`/api/admin/students/${studentId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        setStudents((prev) => prev.filter((s) => s.id !== studentId && s.reg_number !== studentId));
        showToast(data.message || 'Candidate permanently deleted from database.', 'success');
      } else {
        showToast(data.message || 'Failed to delete candidate from database.', 'error');
      }
    } catch (e) {
      // Fallback: remove from local state even if network fails
      setStudents((prev) => prev.filter((s) => s.id !== studentId && s.reg_number !== studentId));
      showToast('Candidate removed locally. Backend sync may be pending.', 'info');
    }
  };

  if (!isAuthenticated) {
    return <AdminLoginGate onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-darkBg text-slate-900 dark:text-slate-100 font-sans antialiased overflow-hidden selection:bg-brand selection:text-white transition-colors">
      {/* Fixed Left Sidebar */}
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        selectedClass={selectedClass}
        setSelectedClass={setSelectedClass}
        classesList={classesList}
        subjectsByClass={subjectsByClass}
        onSignOut={handleSignOut}
      />

      {/* Main Workspace Layout Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <Header
          activeView={activeView}
          selectedClass={selectedClass}
          onOpenAddSubject={() => setIsAddSubjectOpen(true)}
          onOpenAddStudent={() => setIsAddStudentOpen(true)}
          activeTerm={activeTerm}
          academicSession={academicSession}
          onSelectAcademicTerm={handleSelectAcademicTerm}
          onShowToast={showToast}
        />

        {/* Scrollable Viewport Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          <ErrorBoundary key={`${activeView}-${selectedClass || 'all'}`}>
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
                selectedClass={selectedClass}
                onSelectClass={setSelectedClass}
                classesList={classesList}
                subjectsByClass={subjectsByClass}
                activeTerm={activeTerm}
                academicSession={academicSession}
                onShowToast={showToast}
              />
            )}

            {activeView === 'question-bank' && (
              <QuestionBankMainView
                selectedClass={selectedClass}
                classesList={classesList}
                subjectsByClass={subjectsByClass}
                questionsData={questionsData}
                onAddQuestion={handleAddQuestion}
                onShowToast={showToast}
              />
            )}

            {activeView === 'workstation-monitor' && (
              <WorkstationMonitorView onShowToast={showToast} />
            )}

            {activeView === 'class-workspace' && (
              <ClassWorkspace
                currentClass={selectedClass || 'SS 3'}
                subjectsByClass={subjectsByClass}
                students={students}
                questionsData={questionsData}
                workstations={workstations}
                onOpenAddSubject={() => setIsAddSubjectOpen(true)}
                onOpenAddStudent={() => setIsAddStudentOpen(true)}
                onOpenUploadRoster={() => setIsUploadRosterOpen(true)}
                onAddQuestion={handleAddQuestion}
                onDeleteStudent={handleDeleteStudent}
                onUpdateWorkstations={setWorkstations}
                onShowToast={showToast}
              />
            )}
          </ErrorBoundary>
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

      <UploadRosterModal
        isOpen={isUploadRosterOpen}
        onClose={() => setIsUploadRosterOpen(false)}
        currentClass={selectedClass || 'SS 3'}
        classesList={classesList}
        onUploadSuccess={handleUploadRosterSuccess}
        onShowToast={showToast}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
