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
// Static Directory Resolution
// ----------------------------------------------------
const studentDist = fs.existsSync(path.join(__dirname, '../student_client_react/dist/index.html'))
    ? path.join(__dirname, '../student_client_react/dist')
    : path.join(__dirname, 'public');

const adminDist = fs.existsSync(path.join(__dirname, '../admin-dashboard/dist/index.html'))
    ? path.join(__dirname, '../admin-dashboard/dist')
    : path.join(__dirname, 'public/admin');

// Ensure upload directory exists for question diagrams
const uploadsDir = path.join(__dirname, 'uploads/diagrams');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ----------------------------------------------------
// 1. API Endpoints & Static Uploads (FIRST PRIORITY)
// ----------------------------------------------------
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
        status: "success",
        message: "CBT Local Server is running smoothly",
        concurrency_mode: "WAL_ENABLED",
        workstations_supported: "90+"
    });
});

// ----------------------------------------------------
// 2. Admin Portal Static & SPA Fallback (/admin)
// ----------------------------------------------------
app.use('/admin', express.static(adminDist));

app.use('/admin', (req, res, next) => {
    if (req.originalUrl.startsWith('/api')) return next();
    const hasExtension = Boolean(path.extname(req.path));
    if (hasExtension) {
        return res.status(404).send(`Admin asset '${req.originalUrl}' not found.`);
    }

    const adminIndex = path.join(adminDist, 'index.html');
    if (fs.existsSync(adminIndex)) {
        return res.sendFile(adminIndex);
    }
    res.status(404).send('Admin Dashboard build not found. Please run "npm run build" in admin-dashboard directory.');
});

// ----------------------------------------------------
// 3. Student Portal Static & SPA Fallback (/)
// ----------------------------------------------------
app.use(express.static(studentDist, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        } else if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/admin')) {
        return next();
    }
    const hasExtension = Boolean(path.extname(req.path));
    if (hasExtension) {
        return res.status(404).send(`Static asset '${req.originalUrl}' not found.`);
    }

    const studentIndex = path.join(studentDist, 'index.html');
    if (fs.existsSync(studentIndex)) {
        return res.sendFile(studentIndex);
    }
    res.status(404).send('Student CBT Web App build not found. Please run "npm run build" in student_client_react directory.');
});

// ----------------------------------------------------
// Global Error Handling Middleware
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

process.on('uncaughtException', (err) => {
    console.error('💥 [Uncaught Exception Safeguard]:', err.stack || err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [Unhandled Promise Rejection Safeguard]:', reason);
});

// ----------------------------------------------------
// Start Unified CBT Server
// ----------------------------------------------------
if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('====================================================');
        console.log(`Server running on port ${PORT}`);
        console.log(`🚀 CBT Server running locally on http://localhost:${PORT}`);
        console.log(`🌐 LAN Network Student App: http://0.0.0.0:${PORT}/`);
        console.log(`🛡️ LAN Network Admin Dashboard: http://0.0.0.0:${PORT}/admin/`);
        console.log(`🏥 Health Check API: http://localhost:${PORT}/api/health`);
        console.log('====================================================');
    });
}

module.exports = app;
