/**
 * Overview.jsx
 * 
 * Dashboard Overview tab component displaying high-level CBT metrics,
 * active exam progress monitoring, and quick administrative actions.
 * Branded with Anthony White Bridge Academy (#F96302 orange) design system.
 */

import React from 'react';
import { Users, Activity, CheckCircle, BookOpen, UserPlus, FileUp, Download, ArrowRight, Laptop, ShieldCheck } from 'lucide-react';

export default function Overview({ stats, results, setActiveTab, onOpenAddStudent }) {
  const activeExamList = results ? results.filter(r => r.status === 'active') : [];

  return (
    <div className="overview-container">
      {/* Institutional Welcome Banner */}
      <div className="welcome-banner">
        <div className="welcome-text-group">
          <h2>Anthony White Bridge Academy CBT Control Center</h2>
          <p>Real-time LAN examination server monitoring, question paper distribution, and auto-graded results.</p>
        </div>
        <div className="welcome-badge">
          <ShieldCheck size={20} className="text-[#F96302]" />
          <span>OFFLINE LAN ACTIVE</span>
        </div>
      </div>

      {/* 4 Core Summary Metric Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon-box orange">
            <Users size={26} />
          </div>
          <div>
            <div className="metric-value">{stats?.total_students ?? 0}</div>
            <div className="metric-label">Registered Students</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-box amber">
            <Activity size={26} />
          </div>
          <div>
            <div className="metric-value text-amber-500">
              {stats?.active_exams ?? 0}
            </div>
            <div className="metric-label">Active Exams in Progress</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-box emerald">
            <CheckCircle size={26} />
          </div>
          <div>
            <div className="metric-value text-emerald-500">
              {stats?.submitted_exams ?? 0}
            </div>
            <div className="metric-label">Exams Submitted & Locked</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-box dark">
            <BookOpen size={26} />
          </div>
          <div>
            <div className="metric-value">{stats?.total_questions ?? 0}</div>
            <div className="metric-label">Question Bank Items</div>
          </div>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="panel-card mb-8">
        <div className="panel-header border-b-0 mb-0 pb-0">
          <div className="panel-title flex items-center gap-2">
            <span className="text-[#F96302] text-xl">⚡</span>
            <span>Quick Admin Actions</span>
          </div>
        </div>
        <div className="quick-actions-bar">
          <button className="btn-primary-orange" onClick={onOpenAddStudent}>
            <UserPlus size={18} />
            <span>Register New Student</span>
          </button>

          <button className="btn-secondary-card" onClick={() => setActiveTab('question-bank')}>
            <FileUp size={18} className="text-[#F96302]" />
            <span>Upload Question Paper</span>
          </button>

          <button className="btn-secondary-card" onClick={() => setActiveTab('results')}>
            <Download size={18} className="text-[#F96302]" />
            <span>View & Export Results</span>
          </button>
        </div>
      </div>

      {/* Active LAN Workstations Live Monitor */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <Laptop size={22} className="text-[#F96302]" />
            <span>Active Workstations Live Monitor ({activeExamList.length})</span>
          </div>
          <button className="btn-secondary-card py-1.5 px-3 text-xs" onClick={() => setActiveTab('results')}>
            <span>View All Sessions</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div className="table-wrapper">
          {activeExamList.length === 0 ? (
            <div className="empty-table-state">
              <Laptop size={42} className="mx-auto mb-3 text-slate-400 opacity-60" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">No Active Exam Sessions</p>
              <p className="text-xs text-slate-500 mt-1">No students are currently taking an active exam on the network workstations.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Student Name</th>
                  <th>Reg Number</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Workstation IP</th>
                  <th>Login Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeExamList.map((session) => (
                  <tr key={session.session_id}>
                    <td className="font-mono text-xs font-semibold text-[#F96302]">#{session.session_id}</td>
                    <td className="font-bold text-slate-900 dark:text-white">{session.surname}</td>
                    <td><code className="reg-badge">{session.reg_number}</code></td>
                    <td><span className="class-pill">{session.class}</span></td>
                    <td className="capitalize font-medium">{session.assigned_subject}</td>
                    <td><code>{session.workstation_ip}</code></td>
                    <td>{new Date(session.login_time).toLocaleTimeString()}</td>
                    <td>
                      <span className="badge badge-active">
                        <span className="pulse-dot"></span> Active Exam
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
