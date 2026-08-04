/**
 * Navbar.jsx
 * 
 * Header Navigation Bar for CBT Control Center Admin Dashboard.
 * Features institutional branding, current active view indicator,
 * live digital clock, and data refresh controls.
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, Clock, ShieldCheck, Cpu } from 'lucide-react';

export default function Navbar({ title, onRefresh, loading }) {
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="top-navbar">
      <div className="nav-title">
        <div className="nav-shield-badge">
          <ShieldCheck size={22} color="#F96302" />
        </div>
        <div>
          <h1 className="nav-heading-text">{title}</h1>
        </div>
      </div>

      <div className="nav-actions">
        {/* System Active Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F96302]/10 border border-[#F96302]/25 text-[#F96302] text-xs font-semibold">
          <Cpu size={14} />
          <span>LAN CBT Node</span>
        </div>

        {/* Live Digital Clock */}
        <div className="nav-clock">
          <Clock size={16} className="text-[#F96302]" />
          <span>{time}</span>
        </div>

        {/* Refresh Action Button */}
        <button 
          className="btn-primary-orange-outline" 
          onClick={onRefresh} 
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>{loading ? 'Refreshing...' : 'Refresh Data'}</span>
        </button>
      </div>
    </header>
  );
}
