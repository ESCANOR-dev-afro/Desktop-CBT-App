import axios from 'axios';

/**
 * Gets the current active API base URL.
 * Checks localStorage for custom server host, or falls back to window.location.origin.
 */
export const getApiBaseUrl = () => {
  const customHost = localStorage.getItem('cbt_custom_server');
  if (customHost && customHost.trim()) {
    const cleanHost = customHost.trim().replace(/\/+$/, '');
    return cleanHost.endsWith('/api') ? cleanHost : `${cleanHost}/api`;
  }
  return `${window.location.origin}/api`;
};

const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Set custom server IP / host and update axios client defaults
 */
export const setCustomServer = (host) => {
  if (host && host.trim()) {
    const cleanHost = host.trim().replace(/\/+$/, '');
    localStorage.setItem('cbt_custom_server', cleanHost);
    apiClient.defaults.baseURL = cleanHost.endsWith('/api') ? cleanHost : `${cleanHost}/api`;
  } else {
    resetCustomServer();
  }
};

/**
 * Reset server settings back to automatic window.location.origin
 */
export const resetCustomServer = () => {
  localStorage.removeItem('cbt_custom_server');
  apiClient.defaults.baseURL = `${window.location.origin}/api`;
};

/**
 * Test connectivity against a target host
 */
export const testServerConnection = async (targetHost) => {
  try {
    let pingUrl = '';
    if (targetHost && targetHost.trim()) {
      const clean = targetHost.trim().replace(/\/+$/, '');
      pingUrl = clean.endsWith('/api') ? `${clean}/health` : `${clean}/api/health`;
    } else {
      pingUrl = `${window.location.origin}/api/health`;
    }

    const res = await axios.get(pingUrl, { timeout: 5000 });
    if (res.status === 200) {
      return { success: true, status: 200, message: 'Connected successfully (200 OK)' };
    }
    return { success: false, status: res.status, message: `Server returned HTTP ${res.status}` };
  } catch (err) {
    const msg = err.response ? `HTTP ${err.response.status}` : (err.message || 'Network Timeout / Unreachable');
    return { success: false, status: err.response?.status || 0, message: `Connection Failed: ${msg}` };
  }
};

/**
 * Fetch available subjects list dynamically
 */
export const getSubjects = async (className) => {
  const url = className ? `/subjects?class=${encodeURIComponent(className)}` : '/subjects';
  const response = await apiClient.get(url);
  return response.data;
};

/**
 * Authenticate student using reg_number and surname
 */
export const loginStudent = async (regNumber, surname) => {
  const response = await apiClient.post('/student/login', {
    registration_no: regNumber.trim().toUpperCase(),
    surname: surname.trim().toUpperCase(),
  });
  return response.data;
};

/**
 * Fetch assigned exam papers for student (strictly active and uncompleted)
 */
export const getAssignedPapers = async (studentId, regNumber) => {
  const params = new URLSearchParams();
  if (studentId) params.append('student_id', studentId);
  if (regNumber) params.append('registration_no', regNumber);
  try {
    const response = await apiClient.get(`/student/assigned-exams?${params.toString()}`);
    return response.data;
  } catch (e) {
    const fallbackResponse = await apiClient.get(`/student/assigned-papers?${params.toString()}`);
    return fallbackResponse.data;
  }
};

export const getAssignedExams = getAssignedPapers;

/**
 * Fetch question paper for selected subject, session, term, and assessment slot
 */
export const getExamQuestions = async (subject, studentId, sessionId, className, academicSession = '2026/2027', academicTerm = '1st Term', assessmentSlot = 'midterm_ca') => {
  const params = new URLSearchParams();
  if (studentId) params.append('student_id', studentId);
  if (sessionId) params.append('session_id', sessionId);
  if (className) params.append('class', className);
  if (academicSession) params.append('session', academicSession);
  if (academicTerm) params.append('term', academicTerm);
  if (assessmentSlot) params.append('assessment_slot', assessmentSlot);

  const response = await apiClient.get(`/exam/questions/${encodeURIComponent(subject)}?${params.toString()}`);
  return response.data;
};

/**
 * Background autosave choice
 */
export const autosaveAnswer = async (studentId, questionId, selectedOption) => {
  try {
    const response = await apiClient.post('/exam/autosave', {
      student_id: studentId,
      question_id: questionId,
      selected_option: selectedOption,
    });
    return response.data;
  } catch (err) {
    console.warn('Background autosave failed (retryable):', err.message);
  }
};

/**
 * Live heartbeat
 */
export const sendHeartbeat = async (studentId, sessionId) => {
  try {
    const response = await apiClient.post('/exam/heartbeat', {
      student_id: studentId,
      session_id: sessionId,
    });
    return response.data;
  } catch (err) {
    console.warn('Heartbeat update failed:', err.message);
  }
};

/**
 * Submit exam
 */
export const submitExam = async (studentId, sessionId, userAnswers) => {
  const response = await apiClient.post('/exam/submit', {
    student_id: studentId,
    session_id: sessionId,
    user_answers: userAnswers,
  });
  return response.data;
};

export default apiClient;
