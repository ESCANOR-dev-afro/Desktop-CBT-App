import React, { useState, useEffect } from 'react';
import { IdCard, User, AlertCircle, ArrowRight, ShieldCheck, RefreshCw, Monitor } from 'lucide-react';
import { loginStudent } from '../api';
import storageService from '../services/storageService';
import ServerConfigModal from './ServerConfigModal';
import AdminPinModal from './AdminPinModal';

export default function LoginScreen({ onLoginSuccess, errorMessage }) {
  const [regNumber, setRegNumber] = useState('');
  const [surname, setSurname] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    regNumber: '',
    surname: '',
    general: errorMessage || ''
  });
  const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Clean Workstation Handover: Guarantee that mounting LoginScreen purges all residual session state
  useEffect(() => {
    try {
      storageService.clearAllExamData();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Storage purge on login mount error:', e);
    }
  }, []);

  useEffect(() => {
    if (errorMessage) {
      setFieldErrors(prev => ({ ...prev, general: errorMessage }));
    }
  }, [errorMessage]);

  const handleCredentialSubmit = async (e) => {
    e.preventDefault();
    const trimmedReg = regNumber.trim();
    const trimmedSurname = surname.trim();

    const errors = { regNumber: '', surname: '', general: '' };
    let hasError = false;

    if (!trimmedReg) {
      errors.regNumber = 'Please enter your Registration Number.';
      hasError = true;
    }

    if (!trimmedSurname) {
      errors.surname = 'Please enter your Surname.';
      hasError = true;
    }

    if (hasError) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    setFieldErrors({ regNumber: '', surname: '', general: '' });

    try {
      const data = await loginStudent(trimmedReg, trimmedSurname);
      if (data.success && data.student) {
        onLoginSuccess({
          student: data.student,
          sessionId: data.session_id,
          status: data.status,
          isResumed: Boolean(data.is_resumed || data.status === 'RESUMED'),
          savedAnswers: data.saved_answers || data.answers || null,
        });
      } else {
        const targetField = data.field || 'general';
        setFieldErrors(prev => ({
          ...prev,
          [targetField]: data.message || 'Invalid credentials. Please verify and try again.'
        }));
      }
    } catch (err) {
      console.error('Login error:', err);
      const errData = err.response?.data;
      const targetField = errData?.field || 'general';
      const msg = errData?.message || (err.message?.includes('Network') ? 'Server connection error. Please notify the invigilator.' : 'Invalid credentials. Please check and try again.');
      setFieldErrors(prev => ({
        ...prev,
        [targetField]: msg
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-[#1b0826] via-[#3b0764] to-[#c2410c]">
      {/* 2-COLUMN SPLIT CARD matching exact Flutter 920px container */}
      <div className="w-full max-w-[920px] bg-white rounded-[24px] flutter-card-shadow border border-slate-200/80 overflow-hidden grid grid-cols-1 md:grid-cols-11 min-h-[520px]">

        {/* LEFT PANEL: BRAND PANEL (Flex 5/11) */}
        <div className="md:col-span-5 bg-[#f97316] flutter-brand-panel-gradient text-white p-8 sm:p-10 flex flex-col justify-between items-center text-center relative overflow-hidden">
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
              &quot;...the future begins here&quot;
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

        {/* RIGHT PANEL: ACTION FORM PANEL (Flex 6/11) - Pure Clean Crisp White Card */}
        <div className="md:col-span-6 bg-white p-8 sm:p-10 flex flex-col justify-between z-10">
          <div>
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight">
                Welcome back,
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                Please sign in to your exam session below
              </p>
            </div>

            {/* General Server/Lockout Alert Banner */}
            {fieldErrors.general && (
              <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-semibold text-slate-800">{fieldErrors.general}</div>
              </div>
            )}

            {/* CREDENTIALS FORM */}
            <form noValidate onSubmit={handleCredentialSubmit} className="space-y-4">
              {/* Field 1: Registration Number */}
              <div>
                <label className="block text-[11px] font-bold tracking-wider text-slate-700 uppercase mb-1.5">
                  Registration Number
                </label>
                <div className="relative">
                  <IdCard className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${fieldErrors.regNumber ? 'text-red-500' : 'text-orange-500'}`} />
                  <input
                    type="text"
                    required
                    placeholder="ENTER REG NUMBER (E.G. AWA26270001)"
                    value={regNumber}
                    onChange={(e) => {
                      setRegNumber(e.target.value.toUpperCase());
                      if (fieldErrors.regNumber || fieldErrors.general) {
                        setFieldErrors(prev => ({ ...prev, regNumber: '', general: '' }));
                      }
                    }}
                    className={`w-full border rounded-xl pl-10 pr-4 py-2.5 sm:py-3 text-sm font-medium placeholder-slate-400 transition-all uppercase tracking-wider outline-none ${
                      fieldErrors.regNumber
                        ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-red-50/30 text-red-900'
                        : 'bg-slate-50 border-slate-200 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 text-slate-900'
                    }`}
                  />
                </div>
                {/* Field-specific inline error */}
                {fieldErrors.regNumber && (
                  <p className="text-red-500 text-xs font-semibold mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{fieldErrors.regNumber}</span>
                  </p>
                )}
              </div>

              {/* Field 2: Student Surname (Visible, unmasked text input) */}
              <div>
                <label className="block text-[11px] font-bold tracking-wider text-slate-700 uppercase mb-1.5">
                  Student Surname
                </label>
                <div className="relative">
                  <User className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${fieldErrors.surname ? 'text-red-500' : 'text-orange-500'}`} />
                  <input
                    type="text"
                    required
                    placeholder="ENTER SURNAME (E.G. SAMUEL / EKEH)"
                    value={surname}
                    onChange={(e) => {
                      setSurname(e.target.value.toUpperCase());
                      if (fieldErrors.surname || fieldErrors.general) {
                        setFieldErrors(prev => ({ ...prev, surname: '', general: '' }));
                      }
                    }}
                    className={`w-full border rounded-xl pl-10 pr-4 py-2.5 sm:py-3 text-sm font-medium placeholder-slate-400 transition-all uppercase tracking-wider outline-none ${
                      fieldErrors.surname
                        ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-red-50/30 text-red-900'
                        : 'bg-slate-50 border-slate-200 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 text-slate-900'
                    }`}
                  />
                </div>
                {/* Field-specific inline error */}
                {fieldErrors.surname && (
                  <p className="text-red-500 text-xs font-semibold mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{fieldErrors.surname}</span>
                  </p>
                )}
              </div>

              {/* Server Status Strip with Interactive Server Config Button Protected by PIN */}
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl mb-4 text-xs font-semibold text-slate-600">
                <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  Server Configuration (Locked)
                </span>
                <button
                  type="button"
                  onClick={() => setIsAdminPinModalOpen(true)}
                  className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 transition cursor-pointer flex items-center gap-1 bg-transparent border-none p-0"
                >
                  🔒 Server Config
                </button>
              </div>

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-60 text-white font-bold rounded-xl shadow-lg shadow-orange-600/30 transition duration-200 flex items-center justify-center gap-2 tracking-wide text-sm uppercase cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>START EXAM</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Subtitle Footer */}
          <div className="pt-4 text-center text-[11px] font-medium text-slate-400 border-t border-slate-100 mt-6">
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
