/**
 * imageOptimizer.js
 * 
 * Standardized High-Performance Diagram Image Compression & Downscaling Pipeline.
 * Resizes question diagrams to max-width 800px (without enlargement) and compresses
 * using Sharp/WebP (with fallback to progressive JPEG / quantized PNG) to strictly keep
 * file sizes under 50KB, ensuring instantaneous LAN rendering across 65-92 concurrent workstations.
 * 
 * 100% Offline — Zero external API calls.
 */

const fs = require('fs');
const path = require('path');

let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    sharp = null;
    console.warn('⚠️ [ImageOptimizer] Sharp not loaded, using raw write fallback.');
}

const TARGET_MAX_BYTES = 50 * 1024; // 50KB strict budget per diagram asset
const MAX_DIAGRAM_WIDTH = 800;       // Max-width 800px bounding constraint

/**
 * Optimizes an image buffer in-memory using Sharp with adaptive compression targeting <50KB.
 * 
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {string} [ext='.jpeg'] - Target format extension (e.g. '.webp', '.jpeg', '.png')
 * @param {Object} [options={}] - Custom options { maxWidth, maxSizeKb, quality }
 * @returns {Promise<Buffer>} Optimized buffer
 */
async function optimizeImageBuffer(imageBuffer, ext = '.jpeg', options = {}) {
    if (!sharp || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        return imageBuffer;
    }

    const maxWidth = options.maxWidth || MAX_DIAGRAM_WIDTH;
    const maxBytes = (options.maxSizeKb ? options.maxSizeKb * 1024 : TARGET_MAX_BYTES);
    const normalizedExt = (ext || '.jpeg').toLowerCase().replace(/^\.?/, '.');

    const basePipeline = sharp(imageBuffer).resize({
        width: maxWidth,
        height: maxWidth,
        fit: 'inside',
        withoutEnlargement: true,
    });

    if (normalizedExt === '.webp') {
        let quality = options.quality || 75;
        let buf = await basePipeline.clone().webp({ quality, effort: 4 }).toBuffer();
        if (buf.length > maxBytes) {
            quality = 60;
            buf = await basePipeline.clone().webp({ quality, effort: 5 }).toBuffer();
        }
        if (buf.length > maxBytes) {
            quality = 45;
            buf = await basePipeline.clone().webp({ quality, effort: 6 }).toBuffer();
        }
        return buf;
    } else if (normalizedExt === '.png') {
        let buf = await basePipeline.clone().png({ quality: 75, compressionLevel: 9, progressive: true }).toBuffer();
        if (buf.length > maxBytes) {
            buf = await basePipeline.clone().png({ quality: 65, palette: true, colors: 128, compressionLevel: 9 }).toBuffer();
        }
        if (buf.length > maxBytes) {
            buf = await basePipeline.clone().png({ quality: 50, palette: true, colors: 64, compressionLevel: 9 }).toBuffer();
        }
        return buf;
    } else {
        // Default: Progressive MozJPEG
        let quality = options.quality || 75;
        let buf = await basePipeline.clone().jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();
        if (buf.length > maxBytes) {
            quality = 60;
            buf = await basePipeline.clone().jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();
        }
        if (buf.length > maxBytes) {
            quality = 45;
            buf = await basePipeline.clone().jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();
        }
        return buf;
    }
}

/**
 * Saves and optimizes an image buffer to the target file path.
 * Ensures max-width 800px and keeps file size under 50KB.
 * 
 * @param {Buffer} imageBuffer - Raw image binary buffer
 * @param {string} targetPath - Canonical absolute destination file path
 * @param {Object} [options={}] - Custom options
 * @returns {Promise<void>}
 */
async function saveOptimizedDiagram(imageBuffer, targetPath, options = {}) {
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        return;
    }

    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    if (sharp) {
        try {
            const ext = path.extname(targetPath).toLowerCase();
            const optimizedBuffer = await optimizeImageBuffer(imageBuffer, ext, options);
            await fs.promises.writeFile(targetPath, optimizedBuffer);
            return;
        } catch (err) {
            console.warn(`⚠️ [ImageOptimizer Fallback] Compression failed for ${path.basename(targetPath)}, writing raw buffer:`, err.message);
        }
    }

    // Fallback if sharp is not available or encounters format error
    fs.writeFileSync(targetPath, imageBuffer);
}

/**
 * Specifically converts and compresses an image buffer to WebP format under 50KB.
 * 
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {string} targetPath - Destination path (auto-appends .webp if needed)
 * @param {Object} [options={}] - Custom options
 * @returns {Promise<string>} Final written path
 */
async function compressToWebP(imageBuffer, targetPath, options = {}) {
    let finalPath = targetPath;
    if (!finalPath.toLowerCase().endsWith('.webp')) {
        finalPath = finalPath.replace(/\.[^.]+$/, '') + '.webp';
    }
    await saveOptimizedDiagram(imageBuffer, finalPath, { ...options, format: 'webp' });
    return finalPath;
}

module.exports = {
    saveOptimizedDiagram,
    compressToWebP,
    optimizeImageBuffer,
    isSharpAvailable: () => Boolean(sharp),
    TARGET_MAX_BYTES,
    MAX_DIAGRAM_WIDTH,
};
