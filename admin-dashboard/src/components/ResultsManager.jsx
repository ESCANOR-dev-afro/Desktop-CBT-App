/**
 * ResultsManager.jsx
 * 
 * Live Results & Excel Export Management Component for CBT Admin Dashboard.
 * Features live score tracking table, search/filter controls, real-time 
 * auto-refresh polling toggle, and direct .xlsx Excel file streaming download.
 * Styled with Anthony White Bridge Academy (#F96302 orange) design system.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Award, Download, RefreshCw, Search, Filter, CheckCircle2, Laptop } from 'lucide-react';
import api from '../api';

export default function ResultsManager({ initialResults = [], onRefreshData }) {
  const [results, setResults] = useState(initialResults);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedClass, setSelectedClass] = useState('all');

  // Fetch updated live results from backend
  const fetchLiveResults = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/results');
      if (response.data?.success) {
        setResults(response.data.results || []);
      }
    } catch (err) {
      console.error('Failed to fetch live results:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync state if parent passes new initialResults
  useEffect(() => {
    if (initialResults && initialResults.length > 0) {
      setResults(initialResults);
    }
  }, [initialResults]);

  // Real-time auto-refresh polling loop (5s interval when enabled)
  useEffect(() => {
    let interval = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchLiveResults();
        if (onRefreshData) onRefreshData();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, fetchLiveResults, onRefreshData]);

  // Manual refresh click
  const handleManualRefresh = () => {
    fetchLiveResults();
    if (onRefreshData) onRefreshData();
  };

  // Trigger Excel file download from backend endpoint GET /api/admin/export-excel
  const handleDownloadExcel = () => {
    const downloadUrl = 'http://localhost:3000/api/admin/export-excel';
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `cbt_exam_results_${new Date().toISOString().split('T')[0]}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter & Search Logic
  const filteredResults = results.filter(r => {
    const matchesSearch = 
      r.surname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.reg_number.includes(searchTerm);
    const matchesSubject = selectedSubject === 'all' || r.assigned_subject.toLowerCase() === selectedSubject.toLowerCase();
    const matchesClass = selectedClass === 'all' || r.class === selectedClass;
    return matchesSearch && matchesSubject && matchesClass;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="panel-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#F96302]/10 text-[#F96302] flex items-center justify-center border border-[#F96302]/20">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              Live Exam Results & Performance
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#F96302]/10 text-[#F96302] font-bold border border-[#F96302]/20">
                {filteredResults.length} Sessions
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Real-time student score tracking and automatic result sheet export</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 text-xs font-semibold px-3.5 py-2.5 rounded-xl border transition-all ${
              autoRefresh 
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400' 
                : 'btn-secondary-card'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
            <span>{autoRefresh ? 'Live Polling Active (5s)' : 'Enable Auto-Refresh'}</span>
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="btn-secondary-card text-xs py-2.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#F96302]' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Export Excel (.xlsx) Button */}
          <button
            onClick={handleDownloadExcel}
            className="btn-primary-orange text-xs py-2.5 px-4 font-bold flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="panel-card flex flex-col md:flex-row items-center gap-4 py-4">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by student surname or reg number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control pl-10 w-full"
          />
        </div>

        {/* Subject Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 hidden md:block" />
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="form-control cursor-pointer w-full md:w-44 text-xs font-semibold"
          >
            <option value="all">All Subjects</option>
            <option value="mathematics">Mathematics</option>
            <option value="english">English Language</option>
            <option value="physics">Physics</option>
            <option value="chemistry">Chemistry</option>
            <option value="biology">Biology</option>
          </select>
        </div>

        {/* Class Filter */}
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="form-control cursor-pointer w-full md:w-36 text-xs font-semibold"
        >
          <option value="all">All Classes</option>
          <option value="SS3">SS3</option>
          <option value="SS2">SS2</option>
          <option value="SS1">SS1</option>
        </select>
      </div>

      {/* Results Table Card */}
      <div className="panel-card overflow-hidden p-0">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Reg Number</th>
                <th>Student Name</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Workstation IP</th>
                <th>Exam Status</th>
                <th className="text-right">Score (/50)</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-slate-500 text-sm">
                    No exam session records found matching the specified filter criteria.
                  </td>
                </tr>
              ) : (
                filteredResults.map((item) => (
                  <tr key={item.session_id}>
                    <td className="font-mono text-xs font-semibold text-[#F96302]">#{item.session_id}</td>
                    <td><code className="reg-badge">{item.reg_number}</code></td>
                    <td className="font-bold text-slate-900 dark:text-white">{item.surname}</td>
                    <td><span className="class-pill">{item.class}</span></td>
                    <td className="capitalize font-medium">{item.assigned_subject}</td>
                    <td>
                      <span className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
                        <Laptop className="w-3.5 h-3.5 text-slate-400" />
                        {item.workstation_ip}
                      </span>
                    </td>
                    <td>
                      {item.status === 'submitted' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Submitted & Locked
                        </span>
                      ) : (
                        <span className="badge-active">
                          <span className="pulse-dot"></span>
                          Active Exam
                        </span>
                      )}
                    </td>
                    <td className="text-right font-bold text-base">
                      {item.score !== null ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                          {item.score} <span className="text-xs font-medium text-slate-400">/ 50</span>
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
