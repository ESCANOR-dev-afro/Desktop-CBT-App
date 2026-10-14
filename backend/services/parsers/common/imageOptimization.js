/**
 * imageOptimization.js
 * 
 * Re-export wrapper and unified interface for Diagram Image Compression & Downscaling Pipeline.
 * Resizes question diagrams to max-width 800px and compresses using Sharp/WebP (under 50KB).
 */

const imageOptimizer = require('./imageOptimizer');

module.exports = {
    saveOptimizedDiagram: imageOptimizer.saveOptimizedDiagram,
    compressToWebP: imageOptimizer.compressToWebP,
    optimizeImageBuffer: imageOptimizer.optimizeImageBuffer,
    isSharpAvailable: imageOptimizer.isSharpAvailable,
    TARGET_MAX_BYTES: imageOptimizer.TARGET_MAX_BYTES,
    MAX_DIAGRAM_WIDTH: imageOptimizer.MAX_DIAGRAM_WIDTH,
};
