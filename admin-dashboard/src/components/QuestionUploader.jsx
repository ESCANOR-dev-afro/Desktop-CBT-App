/**
 * QuestionUploader.jsx
 * 
 * Modular Question Paper Upload & Parsing Component for CBT Admin Dashboard.
 * Supports MS Word (.docx) file uploads, dynamic subject selector with custom
 * subject addition, loading indicators, error handling, and success metrics.
 * Styled with Anthony White Bridge Academy (#F96302 orange) design system.
 */

import React, { useState } from 'react';
import { UploadCloud, FileText, Plus, CheckCircle2, AlertCircle, Loader2, BookOpen } from 'lucide-react';
import api from '../api';

const DEFAULT_SUBJECTS = [
  'Mathematics',
  'English Language',
  'Biology',
  'Chemistry',
  'Physics',
  'Civic Education',
  'Computer Studies',
  'Economics',
  'Government'
];

export default function QuestionUploader({ onUploadSuccess }) {
  const [subjects, setSubjects] = useState(DEFAULT_SUBJECTS);
  const [selectedSubject, setSelectedSubject] = useState('Mathematics');
  
  // Custom Subject Modal/Inline State
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  
  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', text, count }

  // Handle adding custom subject
  const handleAddCustomSubject = (e) => {
    e.preventDefault();
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;

    // Check if subject already exists (case-insensitive)
    const exists = subjects.some(s => s.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      const updatedList = [...subjects, trimmed];
      setSubjects(updatedList);
      setSelectedSubject(trimmed);
      setStatusMessage({ type: 'success', text: `Added custom subject "${trimmed}" to database list.` });
    } else {
      setSelectedSubject(subjects.find(s => s.toLowerCase() === trimmed.toLowerCase()));
    }

    setNewSubjectName('');
    setShowAddSubject(false);
  };

  // Validate and handle .docx file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
      setStatusMessage({
        type: 'error',
        text: 'Invalid file format. Please select an MS Word document (.docx).'
      });
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setStatusMessage(null);
  };

  // Drag and Drop file handling
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
      setStatusMessage({
        type: 'error',
        text: 'Invalid file format. Please drop an MS Word document (.docx).'
      });
      return;
    }

    setSelectedFile(file);
    setStatusMessage(null);
  };

  // Submit file and subject to backend API
  const handleSubmitUpload = async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      setStatusMessage({ type: 'error', text: 'Please select a .docx Word document to upload.' });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('subject', selectedSubject.toLowerCase());

      const response = await api.post('/admin/upload-questions', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data?.success) {
        const count = response.data.count || 0;
        setStatusMessage({
          type: 'success',
          text: `Questions uploaded and parsed successfully for ${selectedSubject}!`,
          count: count
        });

        setSelectedFile(null);
        // Reset file input element value if present
        const fileInput = document.getElementById('docx-file-input');
        if (fileInput) fileInput.value = '';

        if (onUploadSuccess) {
          onUploadSuccess();
        }
      }
    } catch (err) {
      console.error('Upload Error:', err);
      const errorMsg = err.response?.data?.message || 'Failed to upload and parse Word document. Please check backend connection.';
      setStatusMessage({
        type: 'error',
        text: errorMsg
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-card max-w-4xl mx-auto">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F96302]/10 text-[#F96302] flex items-center justify-center border border-[#F96302]/20">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Upload Question Paper</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Import MS Word (.docx) objective questions directly into SQLite database</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmitUpload} className="space-y-6 mt-4">
        {/* Subject Selector & Add Custom Subject Controls */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#F96302]" />
              Target Exam Subject
            </label>
            <button
              type="button"
              onClick={() => setShowAddSubject(!showAddSubject)}
              className="text-xs font-semibold text-[#F96302] hover:text-[#e05500] flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {showAddSubject ? 'Cancel Custom Subject' : 'Add New Subject'}
            </button>
          </div>

          {!showAddSubject ? (
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="form-control w-full py-3 px-4 text-sm font-medium cursor-pointer"
            >
              {subjects.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter custom subject name (e.g. Agricultural Science)..."
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                className="form-control flex-1 py-2.5 px-4 text-sm"
              />
              <button
                type="button"
                onClick={handleAddCustomSubject}
                className="btn-primary-orange text-xs py-3 px-4"
              >
                Add Subject
              </button>
            </div>
          )}
        </div>

        {/* .docx File Dropzone */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#F96302]" />
            MS Word Question Paper (.docx)
          </label>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById('docx-file-input')?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
              selectedFile
                ? 'border-[#F96302] bg-[#F96302]/5'
                : 'border-slate-300 dark:border-slate-700 hover:border-[#F96302]/60 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}
          >
            <input
              type="file"
              id="docx-file-input"
              accept=".docx"
              onChange={handleFileSelect}
              className="hidden"
            />

            <UploadCloud className="w-10 h-10 text-[#F96302] mx-auto mb-3" />

            {selectedFile ? (
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{selectedFile.name}</p>
                <p className="text-xs text-[#F96302] font-medium">{(selectedFile.size / 1024).toFixed(1)} KB — Ready to parse questions</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Click to select or drag & drop MS Word document (.docx)
                </p>
                <p className="text-xs text-slate-500">
                  Format requirement: Question text, Options A-D, Answer: X
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Status Banners */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl text-sm font-medium flex items-start gap-3 border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-500" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
            )}
            <div>
              <p>{statusMessage.text}</p>
              {statusMessage.count !== undefined && (
                <p className="text-xs mt-1 font-bold text-emerald-600 dark:text-emerald-300">
                  Total Questions Imported: {statusMessage.count}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !selectedFile}
          className="btn-primary-orange w-full py-3.5 px-6 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Parsing Word Document & Importing...</span>
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4" />
              <span>Upload & Parse Questions</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
