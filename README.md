# Anthony Whitebridge Academy - Offline LAN CBT Examination Engine (v3.4)

An enterprise-grade, air-gapped Computer-Based Testing (CBT) platform engineered specifically for local area network (LAN) deployments. Built to deliver zero-latency exam rendering, real-time candidate monitoring, robust anti-cheat protections, and high-concurrency database throughput without requiring an internet connection.

---

## 🏛️ System Architecture & Technology Stack

The platform is constructed on a decoupled 3-tier Full-Stack React + Express + SQLite architecture:

```mermaid
graph TD
    subgraph Client Tier (Workstations & Admin)
        A[Student CBT Portal / React 18 + Vite] -->|Real-time Exam Telemetry| C[Backend Core Engine / Express 5]
        B[Admin Management Console / React 18 + Vite] -->|REST Management API| C
    end
    subgraph Core Engine & Data Tier
        C -->|SQLite WAL High-Concurrency Connection| D[(cbt_database.db)]
    end
```

- **Student CBT Portal (`student_client_react/`)**:
  - React 18, Vite, Tailwind CSS, Lucide Icons.
  - Features real-time answer autosave to `localStorage` and background HTTP persistence, dynamic question palette, built-in scientific calculator, anti-cheat tab visibility detection, and automatic exam submission on timer expiration.
- **Admin Management Console (`admin-dashboard/`)**:
  - React 18, Vite, Tailwind CSS, Lucide Icons.
  - Live candidate telemetry dashboard, real-time workstation status monitoring, DOCX/XLSX question bank parser, instant subject exam activation toggle, score sheet generation, and 5-column PDF/Excel export.
- **Backend Core Engine (`backend/`)**:
  - Node.js, Express 5, SQLite3 with Write-Ahead Logging (WAL Mode) & 10,000ms busy timeout.
  - Serves compiled production bundles for both Student and Admin portals concurrently from a single unified server instance.
- **Network Topology**:
  - Air-gapped 100% offline LAN deployment. No external web access required.

---

## 📚 Curriculum Streams & Subject Allocations

The CBT engine manages subject enrollments across 27 distinct class arms via normalized database mappings:

| Stream Tier | Class Arms | Subject Curriculum | Total Subjects |
| :--- | :--- | :--- | :---: |
| **Junior Secondary** | JSS 1 - JSS 3 (Gold, Silver, Diamond) | Mathematics, English Language, Yoruba, French, Fine Art, Music, Basic Science, Basic Technology, PHE, Digital Technology, Social Studies, Civic Education, Home Economics, Agricultural Science, Business Studies, History | **16 Subjects** |
| **Senior Science** | SS 1 - SS 3 Science | Mathematics, English Language, Biology, Chemistry, Physics, Civic Education, Further Mathematics, Economics, Digital Technology | **9 Subjects** |
| **Senior Arts** | SS 1 - SS 3 Art | Mathematics, English Language, Civic Education, Economics, Digital Technology, Government, CRS, Literature in English | **8 Subjects** |
| **Senior Commercial** | SS 1 - SS 3 Commercial | Mathematics, English Language, Civic Education, Further Mathematics, Economics, Digital Technology, Account, Commerce, Government | **9 Subjects** |

---

## 🚀 Step-by-Step Installation & Deployment Guide

### 1. Server Machine Setup

Execute the following commands on the primary server computer connected to the examination LAN switch:

```bash
# 1. Install dependencies for all workspace components
cd admin-dashboard && npm install
cd ../student_client_react && npm install
cd ../backend && npm install

# 2. Seed curriculum database schema & class subject allocations
node scripts/seed_curriculum.js

# 3. Compile optimized production distribution assets
cd ../admin-dashboard && npm run build
cd ../student_client_react && npm run build

# 4. Launch the unified LAN examination server
cd ../backend && npm start
```

### 2. Candidate Workstation Access

On student examination computers connected via LAN:
1. Open any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Apple Safari).
2. Navigate to the server IP address on port `3000`:
   ```
   http://<SERVER_IP>:3000
   ```
   *Example:* `http://192.168.10.91:3000`
3. Enter Candidate Registration Number (e.g. `AWA26271050`) and Surname (e.g. `YAKUBU`) to begin.

### 3. Administrator Portal Access

On invigilator or admin workstations:
1. Navigate to:
   ```
   http://<SERVER_IP>:3000/admin
   ```
   *Example:* `http://192.168.10.91:3000/admin`
2. Access live telemetry analytics, manage question banks, toggle subject exam availability, or export printable score sheets.

---

## 🔥 Key Operational Features

1. **Unblocked Multi-Subject Authentication**:
   - Candidate authentication verifies identity without locking candidates out from taking subsequent subjects. Finishing Mathematics in the morning does not block afternoon Biology exams.
2. **Dynamic Subject Activation & 5:00 PM Auto-Reset**:
   - Exams are strictly `AVAILABLE` only if explicitly activated by the administrator in the Question Bank Hub AND questions > 0.
   - Server automatically resets active exam statuses to `INACTIVE` at 17:00 (5:00 PM) daily for exam security.
3. **Anti-Cheat Tab Tracking & Workstation Lock**:
   - Monitors candidate window blur/focus events. Tab switches trigger real-time invigilator alerts and lock overlays.
4. **Offline 5-Column Score Sheet & Excel Export**:
   - Clean, standardized official score sheet layout (`S/N | REG NO | CANDIDATE NAME | SCORE (/TOTAL) | STATUS`). Eliminates redundant columns while dynamically formatting total obtainable marks.

---

## 📄 License & Institutional Rights

© 2026 Anthony Whitebridge Academy. Proprietary software developed for internal Computer-Based Testing operations. All rights reserved.
