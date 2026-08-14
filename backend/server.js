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
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Bind to all network interfaces for local LAN access

// ----------------------------------------------------
// Middleware Setup & Stress Resilience
// ----------------------------------------------------
app.use(cors()); // Allow Cross-Origin Resource Sharing for desktop & LAN client workstations
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

// ----------------------------------------------------
// Routes & SPA Static Web Hosting
// ----------------------------------------------------

// Resolve static directories for builds
const backendPublicPath = path.join(__dirname, 'public');
const flutterBuildPath = path.join(__dirname, '../student_client/build/web');
const adminDistPath = path.join(__dirname, 'public/admin');
const adminFallbackPath = path.join(__dirname, '../admin-dashboard/dist');

// 1. API Endpoints
app.use('/api', authRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/questions', questionRoutes);

/**
 * Health Check Endpoint
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: "success",
        message: "CBT Local Server is running smoothly",
        concurrency_mode: "WAL_ENABLED",
        workstations_supported: "90+"
    });
});

// 2. Admin Dashboard Static Assets (/admin)
const activeAdminPath = fs.existsSync(path.join(adminDistPath, 'index.html'))
    ? adminDistPath
    : adminFallbackPath;

app.use('/admin', express.static(activeAdminPath));

// Admin Dashboard SPA Wildcard Fallback (/admin/*)
app.use('/admin', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const adminIndex = path.join(activeAdminPath, 'index.html');
    res.sendFile(adminIndex, (err) => {
        if (err) {
            console.error('⚠️ Could not serve Admin index.html:', err.message);
            res.status(404).send('Admin Dashboard build not found. Please run "npm run build" in admin-dashboard directory.');
        }
    });
});

// 3. Student Client Static Web Assets (/)
const activeStudentPath = fs.existsSync(path.join(backendPublicPath, 'index.html'))
    ? backendPublicPath
    : flutterBuildPath;

app.use(express.static(activeStudentPath));

// Student Client SPA Wildcard Fallback (/*)
app.use((req, res, next) => {
    // If request path begins with /api, return JSON 404
    if (req.path.startsWith('/api')) {
        return res.status(404).json({
            status: "error",
            message: `API route '${req.originalUrl}' not found.`
        });
    }

    // Serve Student Web index.html for all student web navigation
    const studentIndex = path.join(activeStudentPath, 'index.html');
    res.sendFile(studentIndex, (err) => {
        if (err) {
            console.error('⚠️ Could not serve Student web index.html:', err.message);
            res.status(404).send('Student CBT Web App build not found. Please run "flutter build web" in student_client directory.');
        }
    });
});

// ----------------------------------------------------
// Global Error Handling Middleware (Crash-Proof Safeguards)
// ----------------------------------------------------
app.use((err, req, res, next) => {
    console.error('❌ [Unhandled Server Error]:', err.stack || err.message || err);
    if (!res.headersSent) {
        res.status(err.status || 500).json({
            status: "error",
            message: err.message || "An unexpected internal server error occurred."
        });
    }
});

// Handle uncaught process exceptions gracefully without crashing the server process
process.on('uncaughtException', (err) => {
    console.error('💥 [Uncaught Exception Safeguard]:', err.stack || err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [Unhandled Promise Rejection Safeguard]:', reason);
});

// ----------------------------------------------------
// Start Unified CBT Server
// ----------------------------------------------------
app.listen(3000, '0.0.0.0', () => {
    console.log('====================================================');
    console.log('Server running on port 3000');
    console.log('🚀 CBT Server running locally on http://localhost:3000');
    console.log('🌐 LAN Network Student App: http://0.0.0.0:3000/');
    console.log('🛡️ LAN Network Admin Dashboard: http://0.0.0.0:3000/admin/');
    console.log('🏥 Health Check API: http://localhost:3000/api/health');
    console.log('====================================================');
});
