/**
 * server.js
 * 
 * Main Express.js server for offline Desktop CBT Application.
 * Configured for LAN network accessibility and database integration.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database'); // Initialize and import SQLite database

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Bind to all network interfaces for local LAN access

// ----------------------------------------------------
// Middleware Setup
// ----------------------------------------------------
app.use(cors()); // Allow Cross-Origin Resource Sharing for desktop & LAN client workstations
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true }));

// Log incoming API requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
    next();
});

const authRoutes = require('./authRoutes');
const examRoutes = require('./examRoutes');
const adminRoutes = require('./adminRoutes');

// ----------------------------------------------------
// Routes
// ----------------------------------------------------

// Authentication & Session Routes
app.use('/api', authRoutes);

// Exam Management Routes
app.use('/api/exam', examRoutes);

// Admin Control Routes
app.use('/api/admin', adminRoutes);

/**
 * Health Check Endpoint
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: "success",
        message: "CBT Local Server is running smoothly"
    });
});

// ----------------------------------------------------
// Global Error Handling Middleware
// ----------------------------------------------------
app.use((err, req, res, next) => {
    console.error('❌ [Unhandled Server Error]:', err.stack || err.message || err);
    res.status(err.status || 500).json({
        status: "error",
        message: err.message || "An unexpected internal server error occurred."
    });
});

// Handle uncaught process exceptions gracefully without immediately crashing
process.on('uncaughtException', (err) => {
    console.error('💥 [Uncaught Exception]:', err.stack || err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [Unhandled Promise Rejection]:', reason);
});

// ----------------------------------------------------
// Start Server
// ----------------------------------------------------
app.listen(PORT, HOST, () => {
    console.log('====================================================');
    console.log(`🚀 CBT Server running locally on http://localhost:${PORT}`);
    console.log(`🌐 LAN Network Address: http://${HOST}:${PORT} (Accessible by client workstations)`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
    console.log('====================================================');
});
