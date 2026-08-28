import React, { useState } from 'react';
import { ShieldCheck, X, RefreshCw, CheckCircle2, AlertTriangle, RotateCcw, Server, Sun, Moon } from 'lucide-react';
import { getApiBaseUrl, setCustomServer, resetCustomServer, testServerConnection } from '../api';
import { useTheme } from '../context/ThemeContext';

export default function ServerConfigModal({ isOpen, onClose }) {
  const { theme, setTheme, isDark } = useTheme();
  const [hostInput, setHostInput] = useState(() => {
    return localStorage.getItem('cbt_custom_server') || window.location.origin;
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, message: string }

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    const res = await testServerConnection(hostInput);
    setTesting(false);
    setTestResult(res);
  };

  const handleSaveAndReconnect = () => {
    if (hostInput.trim() === window.location.origin || !hostInput.trim()) {
      resetCustomServer();
    } else {
      setCustomServer(hostInput);
    }
    onClose();
  };

  const handleResetDefault = () => {
    resetCustomServer();
    setHostInput(window.location.origin);
    setTestResult({ success: true, message: 'Reset to default window origin resolution.' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-6 transition-colors">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 rounded-full flex items-center justify-center text-[#F96302]">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1E242B] dark:text-slate-100">Server Connection Settings</h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400 font-medium">Configure CBT Server IP, Endpoint & Workstation Theme</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workstation Global Theme Mode Selector (Invigilator PIN Protected) */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-[#1E242B] dark:text-slate-200 uppercase tracking-wider block">
                Workstation Display Theme
              </span>
              <span className="text-[11px] text-[#64748B] dark:text-slate-400 font-medium">
                Set lab client appearance (persisted per workstation PC)
              </span>
            </div>
            <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider bg-orange-100 dark:bg-orange-950/60 text-[#F96302] border border-orange-200 dark:border-orange-900/50">
              {isDark ? 'Dark Mode' : 'Light Mode'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                theme === 'light'
                  ? 'bg-white text-[#F96302] border-[#F96302] shadow-sm ring-2 ring-[#F96302]/20 font-black'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Sun className={`w-4 h-4 ${theme === 'light' ? 'text-[#F96302]' : 'text-slate-500'}`} />
              <span>Light Theme</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                theme === 'dark'
                  ? 'bg-slate-900 text-[#F96302] border-[#F96302] shadow-sm ring-2 ring-[#F96302]/20 font-black'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Moon className={`w-4 h-4 ${theme === 'dark' ? 'text-[#F96302]' : 'text-slate-500'}`} />
              <span>Dark Theme</span>
            </button>
          </div>
        </div>

        {/* Current Active Info */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[#64748B] dark:text-slate-400 font-semibold">Current Active API Base:</span>
            <span className="font-mono font-bold text-[#1E242B] dark:text-slate-200">{getApiBaseUrl()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#64748B] dark:text-slate-400 font-semibold">Default Workstation Origin:</span>
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{window.location.origin}</span>
          </div>
        </div>

        {/* Custom Server Host Input */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[#1E242B] dark:text-slate-200 uppercase tracking-wider">
            Custom Server Host / IP Address
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="e.g. http://192.168.1.100:3000"
              value={hostInput}
              onChange={(e) => {
                setHostInput(e.target.value);
                setTestResult(null);
              }}
              className="w-full bg-[#F8FAFC] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 focus:border-[#F96302] focus:bg-white dark:focus:bg-slate-950 focus:ring-2 focus:ring-[#F96302]/20 rounded-xl px-4 py-3 text-[#1E242B] dark:text-white placeholder-[#94A3B8] font-mono text-sm transition-all"
            />
          </div>
          <p className="text-[11px] text-[#64748B] dark:text-slate-400 font-medium">
            Enter local server IP address if connecting from a remote LAN workstation PC.
          </p>
        </div>

        {/* Test Result Indicator */}
        {testResult && (
          <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 ${
            testResult.success
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
          }`}>
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <span className="flex-1 font-mono">{testResult.message}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-[#1E242B] dark:text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#F96302]" />
                  <span>Pinging Server...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-[#F96302]" />
                  <span>Test Connection</span>
                </>
              )}
            </button>

            <button
              onClick={handleSaveAndReconnect}
              className="flex-1 py-3 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#F96302]/20 transition-all uppercase tracking-wider cursor-pointer"
            >
              Save & Reconnect
            </button>
          </div>

          <button
            onClick={handleResetDefault}
            className="w-full py-2.5 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60 text-[#64748B] dark:text-slate-400 hover:text-[#1E242B] dark:hover:text-slate-200 font-semibold text-xs rounded-xl transition-all border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Automatic Window Origin ({window.location.origin})</span>
          </button>
        </div>

      </div>
    </div>
  );
}
