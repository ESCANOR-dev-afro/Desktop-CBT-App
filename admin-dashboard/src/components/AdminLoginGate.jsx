import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldAlert, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react';

export default function AdminLoginGate({ onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = (e) => {
    // Automatically transform input to uppercase
    const upperVal = e.target.value.toUpperCase();
    setPassword(upperVal);
    if (error) setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter the admin password.');
      return;
    }

    const inputPassword = password.trim().toUpperCase();

    if (inputPassword === 'AWAADMIN') {
      localStorage.setItem('awba_admin_authenticated', 'true');
      localStorage.setItem('awba_admin_auth', 'true');
      onLoginSuccess();
    } else {
      setError('Invalid Admin Passcode. Please try again.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-[#080E1A] via-[#0B132B] to-[#050811] text-slate-100 font-sans selection:bg-orange-500 selection:text-white">
      <div className="w-full max-w-4xl bg-[#0F192E] border border-[#1E293B] rounded-[24px] shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 z-10">
        
        {/* Left Brand Panel */}
        <div className="md:col-span-5 bg-gradient-to-b from-[#0B132B] to-[#0D1730] p-8 md:p-10 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#1E293B] relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute -top-16 -left-16 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 space-y-6">
            {/* School Logo Crest */}
            <div className="w-20 h-20 bg-slate-900/90 border-2 border-slate-700/60 rounded-2xl p-2 shadow-xl flex items-center justify-center">
              <img
                src="school_logo.jpg"
                alt="Anthony Whitebridge Academy Logo"
                className="w-full h-full object-contain rounded-xl"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>

            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white leading-tight uppercase">
                ANTHONY WHITEBRIDGE
              </h1>
              <p className="text-xs font-bold text-orange-400 tracking-widest uppercase mt-0.5">
                ACADEMY CBT PLATFORM
              </p>
              <p className="text-xs text-slate-400 font-medium italic mt-2">
                "...the future begins here"
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-8 space-y-4">
            {/* Restricted Badge */}
            <div className="inline-flex items-center space-x-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[11px] font-bold tracking-wider uppercase px-3.5 py-1.5 rounded-full">
              <Lock className="w-3.5 h-3.5" />
              <span>RESTRICTED ACCESS • ADMIN ONLY</span>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Authorized administrative control center for exam configuration, candidate roster management, and live score telemetry.
            </p>
          </div>
        </div>

        {/* Right Login Panel */}
        <div className="md:col-span-7 bg-[#0F192E] p-8 md:p-10 flex flex-col justify-between space-y-6">
          <div>
            {/* Header */}
            <div className="space-y-1 mb-8">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">
                  Welcome Admin
                </h2>
              </div>
              <p className="text-sm font-medium text-slate-400">
                Enter password to continue
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center space-x-3 animate-fadeIn">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Single Input Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Admin Passcode
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={handlePasswordChange}
                    placeholder="ENTER ADMIN PASSWORD"
                    autoFocus
                    required
                    className="w-full bg-[#080E1A] border border-[#1E293B] text-white text-sm font-mono tracking-wider placeholder-slate-600 rounded-xl pl-10 pr-10 py-3.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-slate-500 hover:text-slate-300 transition-colors p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="submit"
                disabled={loading || !password.trim()}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#EA580C] to-[#F97316] hover:from-[#D97706] hover:to-[#EA580C] text-white text-sm font-bold tracking-wide uppercase shadow-lg shadow-orange-500/20 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 group"
              >
                {loading ? (
                  <span className="flex items-center space-x-2">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>VERIFYING PASSCODE...</span>
                  </span>
                ) : (
                  <>
                    <span>UNLOCK DASHBOARD</span>
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-[#1E293B]/60 text-center">
            <p className="text-[11px] text-slate-500 font-medium flex items-center justify-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Session Protected • Local LAN Examination Engine</span>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
