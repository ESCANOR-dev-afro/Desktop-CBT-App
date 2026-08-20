import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import StudentDashboard from './components/StudentDashboard';
import InstructionsScreen from './components/InstructionsScreen';
import ExamScreen from './components/ExamScreen';
import CompletionScreen from './components/CompletionScreen';
import storageService from './services/storageService';

export default function App() {
  // Screen Stage: 'LOGIN' | 'DASHBOARD' | 'INSTRUCTIONS' | 'EXAM' | 'SUBMITTED'
  const [stage, setStage] = useState(() => {
    return localStorage.getItem('cbt_stage') || 'LOGIN';
  });

  const [student, setStudent] = useState(() => {
    try {
      const activeSes = storageService.getActiveSession();
      if (activeSes?.student) return activeSes.student;
      const saved = localStorage.getItem('cbt_student');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [sessionId, setSessionId] = useState(() => {
    const activeSes = storageService.getActiveSession();
    if (activeSes?.sessionId) return activeSes.sessionId;
    return localStorage.getItem('cbt_session_id') || null;
  });

  const [subject, setSubject] = useState(() => {
    return localStorage.getItem('cbt_subject') || '';
  });

  const [questions, setQuestions] = useState(() => {
    try {
      const saved = localStorage.getItem('cbt_questions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [durationMinutes, setDurationMinutes] = useState(() => {
    return Number(localStorage.getItem('cbt_duration_minutes')) || 45;
  });

  const [timeRemaining, setTimeRemaining] = useState(() => {
    return Number(localStorage.getItem('cbt_time_remaining')) || 2700;
  });

  const [answers, setAnswers] = useState(() => {
    try {
      const saved = localStorage.getItem('cbt_answers');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [flagged, setFlagged] = useState(() => {
    try {
      const saved = localStorage.getItem('cbt_flagged');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [currentIndex, setCurrentIndex] = useState(() => {
    return Number(localStorage.getItem('cbt_current_index')) || 0;
  });

  const [completionInfo, setCompletionInfo] = useState(() => {
    try {
      const saved = localStorage.getItem('cbt_completion_info');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Sync state changes to LocalStorage for 100% Refresh Resilience & Crash Recovery
  useEffect(() => {
    localStorage.setItem('cbt_stage', stage);
    if (student && sessionId) {
      storageService.saveActiveSession({ student, sessionId, subject, stage });
    }
    if (student) localStorage.setItem('cbt_student', JSON.stringify(student));
    if (sessionId) localStorage.setItem('cbt_session_id', String(sessionId));
    if (subject) localStorage.setItem('cbt_subject', subject);
    if (questions.length > 0) localStorage.setItem('cbt_questions', JSON.stringify(questions));
    localStorage.setItem('cbt_duration_minutes', String(durationMinutes));
    if (completionInfo) localStorage.setItem('cbt_completion_info', JSON.stringify(completionInfo));
  }, [stage, student, sessionId, subject, questions, durationMinutes, completionInfo]);

  // Step 1: Login Success -> Navigate to Full-Screen Student Dashboard
  const handleLoginSuccess = ({ student: std, sessionId: sessId }) => {
    setStudent(std);
    setSessionId(sessId);
    storageService.saveActiveSession({ student: std, sessionId: sessId, stage: 'DASHBOARD' });
    setStage('DASHBOARD');
  };

  // Step 2: Subject Selected on Dashboard -> Navigate to Pre-Exam Instructions
  const handleSelectSubject = ({ subject: sub, questions: qList, durationMinutes: dMins, durationSeconds: dSecs }) => {
    setSubject(sub);
    setQuestions(qList);
    setDurationMinutes(dMins);
    setTimeRemaining(dSecs);

    const regNo = stdReg(student);
    const cachedAns = storageService.getAnswers(regNo, sub);
    const cachedFlg = storageService.getFlagged(regNo, sub);

    setAnswers(cachedAns);
    setFlagged(cachedFlg);
    setCurrentIndex(0);
    setStage('INSTRUCTIONS');
  };

  const stdReg = (st) => st?.reg_number || st?.registration_no || '';

  // Safe Session Reset / Logout
  const resetSessionState = () => {
    storageService.clearAllExamData();
    localStorage.clear();
    setStudent(null);
    setSessionId(null);
    setSubject('');
    setQuestions([]);
    setAnswers({});
    setFlagged({});
    setCurrentIndex(0);
    setTimeRemaining(2700);
    setCompletionInfo(null);
    setStage('LOGIN');
  };

  // Return to Dashboard from Instructions without logging out
  const handleReturnToDashboard = () => {
    setSubject('');
    setQuestions([]);
    setStage('DASHBOARD');
  };

  // Start Live Exam
  const handleStartExam = () => {
    setStage('EXAM');
  };

  // Exam Submission Complete
  const handleExamComplete = (info) => {
    setCompletionInfo(info);
    setStage('SUBMITTED');
  };

  return (
    <div className="min-h-screen w-full flex flex-col selection:bg-[#F96302] selection:text-white">
      {/* STAGE 1: LOGIN SCREEN */}
      {stage === 'LOGIN' && (
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {/* STAGE 2: DEDICATED STUDENT DASHBOARD / SUBJECT SELECTION SCREEN */}
      {stage === 'DASHBOARD' && (
        <StudentDashboard
          student={student}
          sessionId={sessionId}
          onSelectSubject={handleSelectSubject}
          onLogout={resetSessionState}
        />
      )}

      {/* STAGE 3: PRE-EXAM INSTRUCTIONS & GUIDELINES */}
      {stage === 'INSTRUCTIONS' && (
        <InstructionsScreen
          student={student}
          subject={subject}
          questionCount={questions.length}
          durationMinutes={durationMinutes}
          onStartExam={handleStartExam}
          onCancel={handleReturnToDashboard}
        />
      )}

      {/* STAGE 4: LIVE EXAMINATION INTERFACE */}
      {stage === 'EXAM' && (
        <ExamScreen
          student={student}
          subject={subject}
          sessionId={sessionId}
          questions={questions}
          durationSeconds={timeRemaining}
          initialAnswers={answers}
          initialFlagged={flagged}
          initialCurrentIndex={currentIndex}
          onExamComplete={handleExamComplete}
        />
      )}

      {/* STAGE 5: SUBMISSION & COMPLETION SUMMARY */}
      {stage === 'SUBMITTED' && (
        <CompletionScreen
          completionInfo={completionInfo}
          onFinishLogout={resetSessionState}
        />
      )}
    </div>
  );
}
