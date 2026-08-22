/**
 * server.js
 * 
 * Main Express.js server for offline Desktop CBT Application.
 * Configured for LAN network accessibility and database integration.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database'); // Initialize and import SQLite database

const app = express();

// ----------------------------------------------------
// Middleware Setup & Stress Resilience
// ----------------------------------------------------
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // High-concurrency body parser limit
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Disable x-powered-by header for security and speed
app.disable('x-powered-by');

// Log incoming API requests
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
    }
    next();
});

const authRoutes = require('./authRoutes');
const examRoutes = require('./examRoutes');
const adminRoutes = require('./adminRoutes');
const questionRoutes = require('./questionRoutes');

// Ensure upload directory exists for question diagrams
const uploadsDir = path.join(__dirname, 'uploads/diagrams');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ----------------------------------------------------
// 1. API Endpoints & Static Uploads (FIRST PRIORITY)
// ----------------------------------------------------
// ==========================================
// ADMIN AUTHENTICATION HANDLER (TOP PRIORITY)
// ==========================================
const handleAdminLogin = (req, res) => {
  const code = (req.body?.passcode || req.body?.password || '').toString().trim().toUpperCase();
  if (code === 'AWAADMIN') {
    return res.status(200).json({
      success: true,
      message: 'Access granted',
      token: 'AWA_ADMIN_VALID_SESSION'
    });
  }
  return res.status(401).json({
    success: false,
    message: 'Invalid Admin Passcode. Please try again.'
  });
};

app.post('/api/admin/login', handleAdminLogin);
app.post('/admin/api/admin/login', handleAdminLogin);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/exam', examRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api', examRoutes);
app.use('/api', authRoutes);

/**
 * Health Check Endpoint
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: "ok",
        timestamp: Date.now(),
        port: process.env.PORT || 3000,
        message: "CBT Local Server is running smoothly",
        concurrency_mode: "WAL_ENABLED",
    });
});

// ==========================================
// STATIC ASSET SERVING & SPA ROUTING
// ==========================================

// Dist / Public folder paths
const adminStaticPath = fs.existsSync(path.join(__dirname, '../admin-dashboard/dist'))
  ? path.join(__dirname, '../admin-dashboard/dist')
  : path.join(__dirname, 'public/admin');

const studentStaticPath = fs.existsSync(path.join(__dirname, '../student_client_react/dist'))
  ? path.join(__dirname, '../student_client_react/dist')
  : path.join(__dirname, 'public');

// 1. Serve Admin Static Files (Must be declared before general static files)
app.use('/admin', express.static(adminStaticPath, {
  etag: false,
  maxAge: '0',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Ensure /admin redirects to /admin/ so relative Vite paths resolve
app.get('/admin', (req, res) => {
  res.redirect('/admin/');
});

// Admin SPA Fallback (handles sub-routes like /admin/classes, /admin/scores, etc.)
app.get('/admin/*splat', (req, res) => {
  res.sendFile(path.join(adminStaticPath, 'index.html'));
});

// 2. Serve Student Static Files
app.use(express.static(studentStaticPath, {
  etag: false,
  maxAge: '0',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// 3. API 404 Guard (prevents API calls from returning React HTML)
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

// 4. Student SPA Fallback Handler
app.use((req, res) => {
  res.sendFile(path.join(studentStaticPath, 'index.html'));
});

// ==========================================
// SERVER INITIALIZATION (LAN BINDING)
// ==========================================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`AWBA CBT Offline Server running on http://${HOST}:${PORT}`);
    console.log(`Admin Portal: http://${HOST}:${PORT}/admin/`);
    console.log(`Student Portal: http://${HOST}:${PORT}/`);
  });
}

module.exports = app;
