/**
 * App.jsx
 * 
 * Main Application Shell for CBT Control Center Admin Dashboard.
 * Integrates Sidebar layout shell, Navbar, dynamic tab navigation between 
 * Question Bank Uploader, Live Results Manager, Student Roster, and Overview.
 */

import React, { useState, useEffect, useCallback } from 'react';
import api from './api';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Overview from './components/Overview';
import QuestionBank from './components/QuestionBank';
import QuestionUploader from './components/QuestionUploader';
import StudentRoster from './components/StudentRoster';
import ResultsManager from './components/ResultsManager';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [serverStatus, setServerStatus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);

  const [stats, setStats] = useState(null);
  const [students, setStudents] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [results, setResults] = useState([]);

  // Fetch all dashboard data from local Node.js backend (http://localhost:3000/api)
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Health Check Ping
      const healthRes = await api.get('/health').catch(() => null);
      setServerStatus(Boolean(healthRes && healthRes.data?.status === 'success'));

      // 2. Overview Statistics
      const overviewRes = await api.get('/admin/overview').catch(() => null);
      if (overviewRes?.data?.success) {
        setStats(overviewRes.data.stats);
      }

      // 3. Registered Students Roster
      const studentsRes = await api.get('/admin/students').catch(() => null);
      if (studentsRes?.data?.success) {
        setStudents(studentsRes.data.students);
      }

      // 4. Question Bank Questions
      const questionsRes = await api.get('/admin/questions').catch(() => null);
      if (questionsRes?.data?.success) {
        setQuestions(questionsRes.data.questions);
      }

      // 5. Live Exam Results & Scores
      const resultsRes = await api.get('/admin/results').catch(() => null);
      if (resultsRes?.data?.success) {
        setResults(resultsRes.data.results);
      }

    } catch (err) {
      console.error('Error fetching backend data:', err);
      setServerStatus(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch and 10s automatic background polling
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Handler to register a new student via API
  const handleAddStudent = async (studentData) => {
    try {
      const res = await api.post('/admin/students', studentData);
      if (res.data?.success) {
        alert(`✅ Student #${studentData.reg_number} (${studentData.surname}) registered successfully!`);
        fetchDashboardData();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add student.';
      alert(`❌ ${msg}`);
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'overview': return 'CBT Executive Overview';
      case 'question-bank': return 'Question Bank & Docx Uploader';
      case 'students': return 'Student Registration & Roster';
      case 'results': return 'Live Results & Performance Analytics';
      default: return 'CBT Control Center';
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation Shell */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        serverStatus={serverStatus} 
        onRefresh={fetchDashboardData} 
      />

      {/* Main Content Area */}
      <div className="main-wrapper">
        <Navbar 
          title={getPageTitle()} 
          onRefresh={fetchDashboardData} 
          loading={loading} 
        />

        <main className="content-container">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <Overview 
              stats={stats} 
              results={results} 
              setActiveTab={setActiveTab} 
              onOpenAddStudent={() => {
                setActiveTab('students');
                setShowAddStudentModal(true);
              }}
            />
          )}

          {/* Question Bank & Word Doc Uploader Tab */}
          {activeTab === 'question-bank' && (
            <div className="space-y-8">
              <QuestionBank 
                questions={questions} 
                onUploadSuccess={fetchDashboardData} 
              />
            </div>
          )}

          {/* Student Roster Tab */}
          {activeTab === 'students' && (
            <StudentRoster 
              students={students} 
              onAddStudent={handleAddStudent} 
              showAddModal={showAddStudentModal}
              setShowAddModal={setShowAddStudentModal}
            />
          )}

          {/* Live Results Manager Tab */}
          {activeTab === 'results' && (
            <ResultsManager 
              initialResults={results} 
              onRefreshData={fetchDashboardData} 
            />
          )}
        </main>
      </div>
    </div>
  );
}
