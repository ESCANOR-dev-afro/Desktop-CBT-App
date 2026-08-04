/**
 * LiveResults.jsx
 * 
 * Live Results & Export component for monitoring scores and downloading Excel sheets.
 * Styled with Anthony White Bridge Academy (#F96302 orange) design system.
 */

import React, { useState } from 'react';
import { Award, Download, CheckCircle, Clock } from 'lucide-react';

export default function LiveResults({ results, onRefresh }) {
  // Download MS Excel (.xlsx) spreadsheet directly from backend endpoint
  const handleExportExcel = () => {
    const downloadUrl = 'http://localhost:3000/api/admin/export-excel';
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', 'cbt_exam_results.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <Award size={22} className="text-[#F96302]" />
            <span>Live Examination Results & Export ({results.length})</span>
          </div>

          <div className="flex gap-3">
            <button className="btn-primary-orange text-xs py-2 px-4 flex items-center gap-2" onClick={handleExportExcel} disabled={results.length === 0}>
              <Download size={16} />
              <span>Export Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Results Table */}
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Student Surname</th>
                <th>Reg Number</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Workstation IP</th>
                <th>Login Time</th>
                <th>Status</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-12 text-slate-500">
                    No exam sessions recorded yet.
                  </td>
                </tr>
              ) : (
                results.map((item) => (
                  <tr key={item.session_id}>
                    <td className="font-mono text-xs font-semibold text-[#F96302]">#{item.session_id}</td>
                    <td className="font-bold text-slate-900 dark:text-white">{item.surname}</td>
                    <td><code className="reg-badge">{item.reg_number}</code></td>
                    <td><span className="class-pill">{item.class}</span></td>
                    <td className="capitalize font-medium">{item.assigned_subject}</td>
                    <td><code>{item.workstation_ip}</code></td>
                    <td>{new Date(item.login_time).toLocaleTimeString()}</td>
                    <td>
                      {item.status === 'submitted' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle size={12} />
                          Submitted & Locked
                        </span>
                      ) : (
                        <span className="badge-active">
                          <span className="pulse-dot"></span> Active
                        </span>
                      )}
                    </td>
                    <td className="font-bold text-base">
                      {item.score !== null ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                          {item.score} / 50
                        </span>
                      ) : (
                        <span className="text-xs font-normal text-slate-400 italic">
                          In Progress
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
