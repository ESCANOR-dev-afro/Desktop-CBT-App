/**
 * StudentRoster.jsx
 * 
 * Student Roster component displaying registered students, login credentials,
 * search filters, and add student modal.
 * Styled with Anthony White Bridge Academy (#F96302 orange) design system.
 */

import React, { useState } from 'react';
import { Users, UserPlus, Search, ShieldCheck } from 'lucide-react';

export default function StudentRoster({ students, onAddStudent, showAddModal, setShowAddModal }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');

  const [regNumber, setRegNumber] = useState('');
  const [surname, setSurname] = useState('');
  const [studentClass, setStudentClass] = useState('SS3');
  const [assignedSubject, setAssignedSubject] = useState('mathematics');

  const filteredStudents = students.filter(s => {
    const matchesSearch = 
      s.surname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.reg_number.includes(searchTerm);
    const matchesClass = selectedClass === 'all' || s.class === selectedClass;
    return matchesSearch && matchesClass;
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!regNumber || !surname) return;
    
    onAddStudent({
      reg_number: regNumber,
      surname: surname.toUpperCase(),
      class: studentClass,
      assigned_subject: assignedSubject
    });

    setRegNumber('');
    setSurname('');
    setShowAddModal(false);
  };

  return (
    <div>
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title">
            <Users size={20} className="text-[#F96302]" />
            <span>Registered Student Roster ({filteredStudents.length})</span>
          </div>

          <div className="flex gap-3">
            <button className="btn-primary-orange" onClick={() => setShowAddModal(true)}>
              <UserPlus size={16} />
              <span>Register Student</span>
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
            <input 
              type="text" 
              className="form-control pl-10 w-full" 
              placeholder="Search by student surname or reg number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select 
            className="form-control sm:w-44" 
            value={selectedClass} 
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            <option value="all">All Classes</option>
            <option value="SS3">SS3</option>
            <option value="SS2">SS2</option>
            <option value="SS1">SS1</option>
          </select>
        </div>

        {/* Students Table */}
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Reg Number</th>
                <th>Surname (Upper)</th>
                <th>Class</th>
                <th>Assigned Subject</th>
                <th>Login Credential Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-slate-500">
                    No registered students match the specified search parameters.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id}>
                    <td className="font-mono text-xs text-slate-400">#{student.id}</td>
                    <td><code className="reg-badge">{student.reg_number}</code></td>
                    <td className="font-bold text-slate-900 dark:text-white">{student.surname}</td>
                    <td><span className="class-pill">{student.class}</span></td>
                    <td className="capitalize font-medium">{student.assigned_subject}</td>
                    <td>
                      <span className="badge-orange flex items-center gap-1 w-max">
                        <ShieldCheck size={12} />
                        Ready for Exam Login
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus size={20} className="text-[#F96302]" />
                Register New Student
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xl font-bold border-none bg-transparent cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-group">
                <label className="form-label">7-Digit Reg Number</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. 1009003"
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  maxLength={7}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Student Surname</label>
                <input 
                  type="text" 
                  className="form-control uppercase" 
                  placeholder="e.g. OKONKWO"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  required
                />
                <span className="text-xs text-slate-400 mt-1">
                  Will be saved strictly in UPPERCASE for student login verification.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Class</label>
                <select 
                  className="form-control" 
                  value={studentClass} 
                  onChange={(e) => setStudentClass(e.target.value)}
                >
                  <option value="SS3">SS3</option>
                  <option value="SS2">SS2</option>
                  <option value="SS1">SS1</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Assigned Subject</label>
                <select 
                  className="form-control" 
                  value={assignedSubject} 
                  onChange={(e) => setAssignedSubject(e.target.value)}
                >
                  <option value="mathematics">Mathematics</option>
                  <option value="english">English Language</option>
                  <option value="physics">Physics</option>
                  <option value="chemistry">Chemistry</option>
                  <option value="biology">Biology</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button type="button" className="btn-secondary-card" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-orange">
                  Save Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
