import React, { useState } from 'react';
import { ShieldCheck, X, RefreshCw, CheckCircle2, AlertTriangle, RotateCcw, Server } from 'lucide-react';
import { getApiBaseUrl, setCustomServer, resetCustomServer, testServerConnection } from '../api';

export default function ServerConfigModal({ isOpen, onClose }) {
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
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 border border-orange-200 rounded-full flex items-center justify-center text-[#F96302]">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1E242B]">Server Connection Settings</h3>
              <p className="text-xs text-[#64748B] font-medium">Configure CBT Server IP & Connection Endpoint</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Info */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[#64748B] font-semibold">Current Active API Base:</span>
            <span className="font-mono font-bold text-[#1E242B]">{getApiBaseUrl()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#64748B] font-semibold">Default Workstation Origin:</span>
            <span className="font-mono font-semibold text-slate-700">{window.location.origin}</span>
          </div>
        </div>

        {/* Custom Server Host Input */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[#1E242B] uppercase tracking-wider">
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
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#F96302] focus:bg-white focus:ring-2 focus:ring-[#F96302]/20 rounded-xl px-4 py-3 text-[#1E242B] placeholder-[#94A3B8] font-mono text-sm transition-all"
            />
          </div>
          <p className="text-[11px] text-[#64748B] font-medium">
            Enter local server IP address if connecting from a remote LAN workstation PC.
          </p>
        </div>

        {/* Test Result Indicator */}
        {testResult && (
          <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 ${
            testResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[#1E242B] font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
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
              className="flex-1 py-3 bg-[#F96302] hover:bg-[#E05500] text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#F96302]/20 transition-all uppercase tracking-wider"
            >
              Save & Reconnect
            </button>
          </div>

          <button
            onClick={handleResetDefault}
            className="w-full py-2.5 bg-transparent hover:bg-slate-50 text-[#64748B] hover:text-[#1E242B] font-semibold text-xs rounded-xl transition-all border border-dashed border-slate-300 flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Automatic Window Origin ({window.location.origin})</span>
          </button>
        </div>

      </div>
    </div>
  );
}
