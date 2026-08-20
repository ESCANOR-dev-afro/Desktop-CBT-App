import React, { useState, useEffect } from 'react';
import { IdCard, User, AlertCircle, ArrowRight, ShieldCheck, RefreshCw, Monitor } from 'lucide-react';
import { loginStudent } from '../api';
import ServerConfigModal from './ServerConfigModal';
import AdminPinModal from './AdminPinModal';

export default function LoginScreen({ onLoginSuccess, errorMessage }) {
  const [regNumber, setRegNumber] = useState('');
  const [surname, setSurname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(errorMessage || '');
  const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  useEffect(() => {
    if (errorMessage) {
      setError(errorMessage);
    }
  }, [errorMessage]);

  const handleCredentialSubmit = async (e) => {
    e.preventDefault();
    if (!regNumber.trim() || !surname.trim()) {
      setError('Please enter both your Registration Number and Surname.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await loginStudent(regNumber, surname);
      if (data.success && data.student) {
        onLoginSuccess({
          student: data.student,
          sessionId: data.session_id,
        });
      } else {
        setError(data.message || 'Invalid Registration Number or Surname. Please check and try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      const msg = err.response?.data?.message || 'Invalid Registration Number or Surname. Please check and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* 2-COLUMN SPLIT CARD matching exact Flutter 920px container */}
      <div className="w-full max-w-[920px] bg-white rounded-[24px] flutter-card-shadow overflow-hidden grid grid-cols-1 md:grid-cols-11 min-h-[520px]">

        {/* LEFT PANEL: BRAND PANEL (Flex 5/11) */}
        <div className="md:col-span-5 flutter-brand-panel-gradient text-white p-8 sm:p-10 flex flex-col justify-between items-center text-center relative overflow-hidden">
          {/* Subtle Architectural Circle Accents */}
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10 pointer-events-none"></div>
          <div className="absolute -left-12 -bottom-12 w-56 h-56 rounded-full bg-white/5 pointer-events-none"></div>

          {/* Center Brand Content */}
          <div className="w-full flex flex-col items-center my-auto py-4 z-10">
            {/* Circular School Logo Container */}
            <div className="w-[110px] h-[110px] bg-white rounded-full p-2 shadow-2xl flex items-center justify-center mx-auto mb-5 border-[3px] border-white transform hover:scale-105 transition-transform">
              <img
                src="./school_logo.jpg"
                alt="Anthony Whitebridge Academy Crest"
                className="w-full h-full object-contain rounded-full"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>

            {/* School Name */}
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white leading-tight">
              ANTHONY WHITEBRIDGE ACADEMY
            </h1>

            {/* Motto Tagline */}
            <p className="text-orange-100 italic text-sm font-normal mt-1.5">
              "...the future begins here"
            </p>

            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/20 border border-white/35 rounded-full text-white font-extrabold text-[11px] uppercase tracking-widest backdrop-blur-sm mt-7">
              <Monitor className="w-3.5 h-3.5" />
              <span>CBT EXAM PORTAL</span>
            </div>
          </div>

          {/* Footer Seal Indicator */}
          <div className="z-10 pt-4 border-t border-white/20 w-full text-center">
            <p className="text-xs text-white/80 font-medium flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-white" />
              <span>Official Student Exam Portal</span>
            </p>
          </div>
        </div>

        {/* RIGHT PANEL: ACTION FORM PANEL (Flex 6/11) */}
        <div className="md:col-span-6 bg-white p-8 sm:p-10 flex flex-col justify-between z-10">
          <div>
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl sm:text-[26px] font-bold text-[#1E242B] tracking-tight">
                Welcome back,
              </h2>
              <p className="text-sm text-[#64748B] font-medium mt-1">
                Please sign in to your exam session below
              </p>
            </div>

            {/* Error Message Alert */}
            {error && (
              <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
                <div className="flex-1 font-semibold text-[#1E242B]">{error}</div>
              </div>
            )}

            {/* CREDENTIALS FORM */}
            <form noValidate onSubmit={handleCredentialSubmit} className="space-y-4">
              {/* Field 1: Registration Number */}
              <div>
                <label className="block text-xs font-semibold text-[#1E242B] uppercase tracking-wider mb-1.5">
                  Registration Number
                </label>
                <div className="relative">
                  <IdCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#F96302]" />
                  <input
                    type="text"
                    required
                    placeholder="Enter Reg Number (e.g. AWA26270001)"
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value.toUpperCase())}
                    className="w-full bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#F96302] focus:bg-white focus:ring-2 focus:ring-[#F96302]/20 rounded-xl pl-11 pr-4 py-3.5 text-[#1E242B] placeholder-[#94A3B8] font-semibold text-sm transition-all uppercase tracking-wider"
                  />
                </div>
              </div>

              {/* Field 2: Student Surname (Visible, unmasked text input) */}
              <div>
                <label className="block text-xs font-semibold text-[#1E242B] uppercase tracking-wider mb-1.5">
                  Student Surname
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#F96302]" />
                  <input
                    type="text"
                    required
                    placeholder="Enter Surname (e.g. SAMUEL / EKEH)"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value.toUpperCase())}
                    className="w-full bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#F96302] focus:bg-white focus:ring-2 focus:ring-[#F96302]/20 rounded-xl pl-11 pr-4 py-3.5 text-[#1E242B] placeholder-[#94A3B8] font-semibold text-sm transition-all uppercase tracking-wider"
                  />
                </div>
              </div>

              {/* Server Status Strip with Interactive Server Config Button Protected by PIN */}
              <div className="bg-[#F4F6F9] border border-[#E2E8F0] rounded-xl p-3.5 flex items-center justify-between text-xs font-semibold text-[#64748B]">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Server Configuration (Locked)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdminPinModalOpen(true)}
                  className="text-[#F96302] hover:text-[#E05500] font-bold cursor-pointer hover:underline flex items-center gap-1 bg-transparent border-none p-0 transition-colors"
                >
                  🔒 Server Config
                </button>
              </div>

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#F96302] hover:bg-[#E05500] disabled:bg-[#F96302]/60 text-white font-extrabold py-4 px-6 rounded-xl shadow-lg shadow-[#F96302]/30 transition-all flex items-center justify-center gap-2 group text-base uppercase tracking-wider mt-4"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>START EXAM</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Subtitle Footer */}
          <div className="pt-6 text-center text-xs font-semibold text-[#94A3B8] border-t border-slate-100 mt-6">
            &copy; 2026 Anthony Whitebridge Academy. Local LAN Examination Engine.
          </div>
        </div>

      </div>

      {/* Admin Security Authorization PIN Dialog */}
      <AdminPinModal
        isOpen={isAdminPinModalOpen}
        onClose={() => setIsAdminPinModalOpen(false)}
        onSuccess={() => {
          setIsAdminPinModalOpen(false);
          setIsConfigModalOpen(true);
        }}
      />

      {/* Interactive Server Configuration Settings Modal */}
      <ServerConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
      />
    </div>
  );
}
