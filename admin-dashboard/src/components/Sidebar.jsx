/**
 * Sidebar.jsx
 * 
 * Navigation Sidebar component for CBT Admin Dashboard.
 * Branded for Anthony White Bridge Academy with official school logo,
 * primary orange (#F96302) active indicators, and real-time backend status.
 */

import React from 'react';
import { LayoutDashboard, FileText, Users, Award, Server, RefreshCw } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, serverStatus, onRefresh }) {
  const navItems = [
    { id: 'overview', label: 'Dashboard Overview', icon: LayoutDashboard },
    { id: 'question-bank', label: 'Question Bank Uploader', icon: FileText },
    { id: 'students', label: 'Student Roster', icon: Users },
    { id: 'results', label: 'Live Results Manager', icon: Award }
  ];

  return (
    <aside className="sidebar">
      <div>
        {/* School Logo & Title Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo-container">
            <img 
              src="/school_logo.jpg" 
              alt="Anthony White Bridge Academy Logo" 
              className="sidebar-logo-img"
              onError={(e) => {
                // Fallback to png or icon if jpg fails
                e.target.onerror = null;
                e.target.src = '/school_logo.png';
              }}
            />
          </div>
          <div className="sidebar-title-group">
            <div className="sidebar-institution-name">Anthony White Bridge Academy</div>
            <div className="sidebar-app-title">CBT Control Center</div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={19} className="nav-icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Server Status Footer */}
      <div className="sidebar-footer">
        <div className="server-card">
          <div className="server-card-header">
            <div className="server-label flex items-center gap-1.5">
              <Server size={14} className="text-[#F96302]" />
              <span>LAN Server</span>
            </div>
            <span className={`status-badge ${serverStatus ? 'connected' : 'offline'}`}>
              <span className="pulse-dot"></span>
              {serverStatus ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="server-ip-info">
            Host: <code>http://0.0.0.0:3000</code>
          </div>
          <button 
            className="btn-server-ping" 
            onClick={onRefresh}
          >
            <RefreshCw size={12} />
            <span>Ping Server Health</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
