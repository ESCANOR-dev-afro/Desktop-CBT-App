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
    const saved = localStorage.getItem('cbt_duration_minutes');
    return saved && Number(saved) > 0 ? Number(saved) : 15;
  });

  const [assessmentSlot, setAssessmentSlot] = useState(() => {
    return localStorage.getItem('cbt_assessment_slot') || 'welcome_test';
  });

  const [academicSession, setAcademicSession] = useState(() => {
    return localStorage.getItem('cbt_academic_session') || '2026/2027';
  });

  const [academicTerm, setAcademicTerm] = useState(() => {
    return localStorage.getItem('cbt_academic_term') || '1st Term';
  });

  const [configId, setConfigId] = useState(() => {
    return localStorage.getItem('cbt_config_id') || null;
  });

  const [timeRemaining, setTimeRemaining] = useState(() => {
    const saved = localStorage.getItem('cbt_time_remaining');
    return saved && Number(saved) > 0 ? Number(saved) : (15 * 60);
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
      storageService.saveActiveSession({ student, sessionId, subject, stage, assessmentSlot, academicSession, academicTerm, configId });
    }
    if (student) localStorage.setItem('cbt_student', JSON.stringify(student));
    if (sessionId) localStorage.setItem('cbt_session_id', String(sessionId));
    if (subject) localStorage.setItem('cbt_subject', subject);
    if (assessmentSlot) localStorage.setItem('cbt_assessment_slot', assessmentSlot);
    if (academicSession) localStorage.setItem('cbt_academic_session', academicSession);
    if (academicTerm) localStorage.setItem('cbt_academic_term', academicTerm);
    if (configId) localStorage.setItem('cbt_config_id', String(configId));
    if (questions.length > 0) localStorage.setItem('cbt_questions', JSON.stringify(questions));
    localStorage.setItem('cbt_duration_minutes', String(durationMinutes));
    if (completionInfo) localStorage.setItem('cbt_completion_info', JSON.stringify(completionInfo));
  }, [stage, student, sessionId, subject, assessmentSlot, academicSession, academicTerm, configId, questions, durationMinutes, completionInfo]);

  // Step 1: Login Success -> Navigate to Full-Screen Student Dashboard
  const handleLoginSuccess = ({ student: std, sessionId: sessId }) => {
    setStudent(std);
    setSessionId(sessId);
    storageService.saveActiveSession({ student: std, sessionId: sessId, stage: 'DASHBOARD' });
    setStage('DASHBOARD');
  };

  // Step 2: Subject Selected on Dashboard -> Navigate to Pre-Exam Instructions
  const handleSelectSubject = ({ subject: sub, sessionId: sId, questions: qList, durationMinutes: dMins, durationSeconds: dSecs, assessmentSlot: aSlot, session: aSession, term: aTerm, configId: cId }) => {
    const validMinutes = Number(dMins) > 0 ? Number(dMins) : 15;
    const validSeconds = Number(dSecs) > 0 ? Number(dSecs) : validMinutes * 60;
    const resolvedSlot = aSlot || 'welcome_test';
    const resolvedSession = aSession || '2026/2027';
    const resolvedTerm = aTerm || '1st Term';

    if (sId) setSessionId(sId);
    setSubject(sub);
    setAssessmentSlot(resolvedSlot);
    setAcademicSession(resolvedSession);
    setAcademicTerm(resolvedTerm);
    if (cId) setConfigId(cId);
    setQuestions(qList);
    setDurationMinutes(validMinutes);
    setTimeRemaining(validSeconds);
    localStorage.setItem('cbt_assessment_slot', resolvedSlot);
    localStorage.setItem('cbt_academic_session', resolvedSession);
    localStorage.setItem('cbt_academic_term', resolvedTerm);
    if (cId) localStorage.setItem('cbt_config_id', String(cId));
    localStorage.setItem('cbt_duration_minutes', String(validMinutes));
    localStorage.setItem('cbt_time_remaining', String(validSeconds));

    const regNo = stdReg(student);
    const cachedAns = storageService.getAnswers(regNo, sub);
    const cachedFlg = storageService.getFlagged(regNo, sub);

    setAnswers(cachedAns);
    setFlagged(cachedFlg);
    setCurrentIndex(0);
    setStage('INSTRUCTIONS');
  };

  const stdReg = (st) => st?.reg_number || st?.registration_no || '';

  // Safe Session Reset / Logout (Only on explicit Logout action)
  const resetSessionState = () => {
    storageService.clearAllExamData();
    localStorage.removeItem('cbt_stage');
    localStorage.removeItem('cbt_student');
    localStorage.removeItem('cbt_session_id');
    localStorage.removeItem('cbt_subject');
    localStorage.removeItem('cbt_assessment_slot');
    localStorage.removeItem('cbt_academic_session');
    localStorage.removeItem('cbt_academic_term');
    localStorage.removeItem('cbt_config_id');
    localStorage.removeItem('cbt_questions');
    localStorage.removeItem('cbt_duration_minutes');
    localStorage.removeItem('cbt_time_remaining');
    localStorage.removeItem('cbt_answers');
    localStorage.removeItem('cbt_flagged');
    localStorage.removeItem('cbt_current_index');
    localStorage.removeItem('cbt_completion_info');
    setStudent(null);
    setSessionId(null);
    setSubject('');
    setAssessmentSlot('welcome_test');
    setAcademicSession('2026/2027');
    setAcademicTerm('1st Term');
    setConfigId(null);
    setQuestions([]);
    setAnswers({});
    setFlagged({});
    setCurrentIndex(0);
    setTimeRemaining(15 * 60);
    setCompletionInfo(null);
    setStage('LOGIN');
  };

  // Return to Dashboard from Instructions without logging out
  const handleReturnToDashboard = () => {
    setSubject('');
    setQuestions([]);
    setStage('DASHBOARD');
  };

  // Step 5: Submission Complete -> Return to Dashboard Hub without terminating student auth
  const handleReturnToDashboardHub = () => {
    setSubject('');
    setQuestions([]);
    setAnswers({});
    setFlagged({});
    setCurrentIndex(0);
    setTimeRemaining(15 * 60);
    setCompletionInfo(null);
    localStorage.removeItem('cbt_subject');
    localStorage.removeItem('cbt_assessment_slot');
    localStorage.removeItem('cbt_config_id');
    localStorage.removeItem('cbt_questions');
    localStorage.removeItem('cbt_duration_minutes');
    localStorage.removeItem('cbt_time_remaining');
    localStorage.removeItem('cbt_answers');
    localStorage.removeItem('cbt_flagged');
    localStorage.removeItem('cbt_current_index');
    localStorage.removeItem('cbt_completion_info');
    if (student && sessionId) {
      storageService.saveActiveSession({ student, sessionId, stage: 'DASHBOARD' });
    }
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
          assessmentSlot={assessmentSlot}
          academicSession={academicSession}
          academicTerm={academicTerm}
          configId={configId}
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
          onReturnToHub={handleReturnToDashboardHub}
          onLogout={resetSessionState}
        />
      )}
    </div>
  );
}
