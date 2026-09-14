/**
 * docxMediaExtractor.js
 *
 * Universal offline media extractor and diagram-to-question association engine.
 * Inspects DOCX XML structures, extracts images to disk, and applies context-aware
 * binding for single questions, preceding figures, and Biology multi-question ranges.
 * 
 * Generates human-readable deterministic diagram filenames:
 * `${baseSlug}_q${questionNumber || 'unknown'}_${imgIndex}.${ext}`
 *
 * 100% Offline — Node.js native (`adm-zip`, `fs`, `path`).
 */

const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const { stripHtml } = require('./textSanitizer');
const { saveOptimizedDiagram } = require('./imageOptimizer');

/**
 * Regex for detecting multi-question diagram directives (e.g. Biology/Agric/Geography).
 * Matches:
 *   - "Study the diagram below and use it to answer questions 14 to 16"
 *   - "Use the figure below to answer question 3 to 5"
 *   - "Refer to the diagram above to answer questions 10-12"
 *   - "Use it to answer questions 14 to 16"
 */
const MULTI_Q_DIAGRAM_RE = /(?:study|refer\s+to|use)\s+(?:the\s+)?(?:[\w-]+\s+)*(?:diagram|figure|illustration|chart|graph|map|circuit|table)?\s*(?:below|above|shown)?\s*(?:and\s+use\s+(?:it|them|the\s+diagram|the\s+figure)\s+)?to\s+answer\s+questions?\s*(\d{1,3})\s*(?:to|-|through|and)\s*(\d{1,3})/i;

/**
 * Regex for detecting preceding figure captions or references.
 * Matches: "Fig. 12", "Figure 3", "Fig 4:", "Diagram below shows..."
 */
const FIGURE_CAPTION_RE = /^\s*(?:Fig(?:ure)?\.?\s*\d+|Diagram|Illustration|Graph|Circuit|Chart|Curve)\b/i;

/**
 * Regex for detecting diagram/figure references in stems, captions, and preambles.
 */
const DIAGRAM_REF_RE = /(?:(?:fig|figure)\.?\s*\d+|diagram\s+(?:above|below|shown|displayed)|shown\s+(?:above|below|in\s+the\s+diagram)|graph\s+(?:above|below|shown)|motion\s+is\s+graphically\s+displayed|circuit\s+(?:above|below|diagram)|chart\s+(?:above|below)|curve\s+(?:above|below)|illustration\s+(?:above|below)|table\s+(?:above|below)|refer\s+to\s+the\s+(?:fig|diagram|graph|figure)|use\s+the\s+(?:fig|diagram|graph|figure)|represented\s+in\s+the\s+graph)/i;

const IMG_TAG_RE = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

/**
 * Cleans the base document name or metadata into a safe filesystem slug.
 *
 * @param {Object|string} docContext - { originalFileName, targetSubject, classTier } or string
 * @returns {string} Safe filesystem slug (e.g. 'physics_sss_2')
 */
function generateDocSlug(docContext = {}) {
    let rawName = 'doc';
    if (typeof docContext === 'string') {
        rawName = docContext;
    } else if (docContext && typeof docContext === 'object') {
        rawName = docContext.originalFileName || docContext.filename || docContext.targetSubject || docContext.subject || 'doc';
    }
    const clean = String(rawName)
        .replace(/\.[^/.]+$/, '')          // strip .docx / .txt
        .replace(/[^a-zA-Z0-9_-]/g, '_')    // replace spaces/symbols
        .replace(/_+/g, '_')               // collapse multiple underscores
        .replace(/^_+|_+$/g, '')           // trim leading/trailing underscores
        .toLowerCase();
    return clean || 'doc';
}

/**
 * Generates a scoped deterministic diagram filename based on assessment scope:
 * `${cls}_${subj}_${slot}_${qNum}_${imgNum}.${ext}`
 *
 * @param {Object|string} scope - Assessment scope { classTier, subject, slot, session, term } or slug string
 * @param {number|string} [questionIndex='unknown'] - Question number or range (e.g. 21, '14_16', 'qunknown')
 * @param {number|string} [imgIndex=1] - Image index for question (e.g. 1, 2)
 * @param {string} [ext='jpeg'] - Image extension (e.g. 'jpeg', 'png', 'svg')
 * @returns {string} Fully scoped filename (e.g. 'ss2_physics_midterm_ca_q21_img1.jpeg')
 */
function generateScopedDiagramFilename(scope, questionIndex, imgIndex, ext = 'jpeg') {
    const sanitize = (val) => String(val || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

    let cls = 'general';
    let subj = 'subject';
    let slot = 'slot1';

    if (typeof scope === 'string' && scope.trim()) {
        cls = sanitize(scope) || 'general';
    } else if (scope && typeof scope === 'object') {
        const rawCls = scope.classTier || scope.class || scope.classId || '';
        const rawSubj = scope.subject || scope.targetSubject || scope.subjectId || '';
        const rawSlot = scope.slot || scope.assessment_slot || scope.assessmentSlot || '';

        if (rawCls || rawSubj || rawSlot) {
            cls = sanitize(rawCls) || 'general';
            subj = sanitize(rawSubj) || 'subject';
            slot = sanitize(rawSlot) || 'slot1';
        } else if (scope.originalFileName || scope.filename) {
            cls = sanitize(scope.originalFileName || scope.filename) || 'general';
        }
    }

    let qRaw = String(questionIndex !== null && questionIndex !== undefined ? questionIndex : 'unknown').trim();
    let qNum;
    if (qRaw.startsWith('q')) {
        qNum = qRaw;
    } else {
        qNum = `q${qRaw || 'unknown'}`;
    }

    let imgRaw = String(imgIndex !== null && imgIndex !== undefined ? imgIndex : 1).trim();
    let imgNum;
    if (imgRaw.startsWith('img')) {
        imgNum = imgRaw;
    } else {
        imgNum = `img${imgRaw || 1}`;
    }

    const cleanExt = (ext || 'jpeg').replace(/^\./, '').toLowerCase();
    const normExt = cleanExt === 'jpg' ? 'jpeg' : cleanExt;

    if (typeof scope === 'object' && scope !== null && (scope.classTier || scope.class || scope.subject || scope.targetSubject || scope.slot || scope.assessment_slot)) {
        return `${cls}_${subj}_${slot}_${qNum}_${imgNum}.${normExt}`;
    }

    if (typeof scope === 'string' && scope.trim()) {
        return `${cls}_${slot}_${qNum}_${imgNum}.${normExt}`;
    }

    return `${cls}_${subj}_${slot}_${qNum}_${imgNum}.${normExt}`;
}

/**
 * Parses word/_rels/document.xml.rels and builds a map of rId -> target media path.
 */
function parseDocxRelationships(relsXml) {
    const relsMap = new Map();
    if (!relsXml || typeof relsXml !== 'string') return relsMap;

    const relRegex = /<Relationship\b[^>]*Id=["']([^"']+)["'][^>]*Target=["']([^"']+)["'][^>]*\/?>(?:<\/Relationship>)?/gi;
    let match;
    while ((match = relRegex.exec(relsXml)) !== null) {
        const id = match[1];
        let target = match[2];
        if (/\.(png|jpe?g|gif|emf|wmf|svg|tiff|bmp)$/i.test(target) || target.includes('media/')) {
            target = target.replace(/^\.\.\//, '').replace(/^\/?word\//, '');
            if (!target.startsWith('media/')) {
                target = `media/${target.replace(/^media\//, '')}`;
            }
            relsMap.set(id, target);
        }
    }
    return relsMap;
}

/**
 * Extracts all embedded images from a DOCX buffer directly via XML traversal.
 * Saves files to diagramsDir and returns sequential paragraph/image events.
 *
 * @param {Buffer} docxBuffer - Raw DOCX file buffer
 * @param {Object} options
 * @param {string} [options.diagramsDir] - Absolute path to save extracted images
 * @param {string} [options.diagramsUrlPrefix='/uploads/diagrams'] - URL prefix for web references
 * @param {Object|string} [options.docContext] - Document metadata context for slug naming
 * @returns {{ extractedImages: Array, events: Array, relsMap: Map }}
 */
function extractDocxMedia(docxBuffer, options = {}) {
    const diagramsDir = options.diagramsDir || path.join(__dirname, '../../../uploads/diagrams');
    const diagramsUrlPrefix = options.diagramsUrlPrefix || '/uploads/diagrams';
    const baseSlug = generateDocSlug(options.docContext || options);
    const timestamp = Date.now();

    const extractedImages = [];
    const events = [];
    let imageCounter = 0;

    if (!docxBuffer || !Buffer.isBuffer(docxBuffer)) {
        return { extractedImages, events, relsMap: new Map() };
    }

    // Ensure storage directory exists
    if (!fs.existsSync(diagramsDir)) {
        fs.mkdirSync(diagramsDir, { recursive: true });
    }

    try {
        const zip = new AdmZip(docxBuffer);
        const relsEntry = zip.getEntry('word/_rels/document.xml.rels');
        const docEntry = zip.getEntry('word/document.xml');

        if (!docEntry) {
            return { extractedImages, events, relsMap: new Map() };
        }

        const relsXml = relsEntry ? zip.readAsText(relsEntry) : '';
        const relsMap = parseDocxRelationships(relsXml);
        const docXml = zip.readAsText(docEntry);

        // Cache of rId -> extracted image URL
        const rIdToUrlMap = new Map();

        function extractImageByRId(rId) {
            if (rIdToUrlMap.has(rId)) {
                return rIdToUrlMap.get(rId);
            }

            const targetPath = relsMap.get(rId);
            if (!targetPath) return null;

            const zipMediaPath = `word/${targetPath}`;
            const mediaEntry = zip.getEntry(zipMediaPath) || zip.getEntry(targetPath);
            if (!mediaEntry) return null;

            const rawBuffer = zip.readFile(mediaEntry);
            if (!rawBuffer || rawBuffer.length === 0) return null;

            const rawExt = path.extname(targetPath).replace('.', '') || 'png';
            const ext = rawExt.toLowerCase() === 'jpg' ? 'jpeg' : rawExt.toLowerCase();
            const counter = String(++imageCounter).padStart(3, '0');
            const filename = `${baseSlug}_raw_${timestamp}_img${counter}.${ext}`;
            const destPath = path.join(diagramsDir, filename);
            if (options.saveToDisk !== false) {
                saveOptimizedDiagram(rawBuffer, destPath).catch(err => {
                    console.warn('⚠️ [DocxMediaExtractor Optimization Notice]:', err.message);
                });
            }
            const finalUrl = `${diagramsUrlPrefix}/${filename}`;

            const imageRecord = {
                filename,
                contentType: `image/${ext}`,
                size: rawBuffer.length,
                url: finalUrl,
                rId,
            };

            extractedImages.push(imageRecord);
            rIdToUrlMap.set(rId, finalUrl);
            return finalUrl;
        }

        // Sequential paragraph traversal (<w:p>...</w:p>)
        const paraRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi;
        let pMatch;

        while ((pMatch = paraRegex.exec(docXml)) !== null) {
            const pXml = pMatch[1];

            // 1. Scan for DrawingML images: <a:blip r:embed="rIdX" />
            const blipRegex = /<a:blip\b[^>]*r:embed=["']([^"']+)["']/gi;
            let bMatch;
            const imagesInPara = [];

            while ((bMatch = blipRegex.exec(pXml)) !== null) {
                const rId = bMatch[1];
                const imgUrl = extractImageByRId(rId);
                if (imgUrl) imagesInPara.push(imgUrl);
            }

            // 2. Scan for VML images: <v:imagedata r:id="rIdX" /> or id="rIdX"
            const vmlRegex = /<v:imagedata\b[^>]*(?:r:id|id)=["']([^"']+)["']/gi;
            let vMatch;
            while ((vMatch = vmlRegex.exec(pXml)) !== null) {
                const rId = vMatch[1];
                const imgUrl = extractImageByRId(rId);
                if (imgUrl && !imagesInPara.includes(imgUrl)) {
                    imagesInPara.push(imgUrl);
                }
            }

            // 3. Extract text content inside <w:t> tags
            const textMatches = [...pXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)];
            const text = textMatches.map(m => m[1]).join('').trim();

            if (imagesInPara.length > 0) {
                for (const imgUrl of imagesInPara) {
                    events.push({
                        type: 'image',
                        url: imgUrl,
                        textPreceding: text || null,
                    });
                }
            }

            if (text) {
                events.push({
                    type: 'paragraph',
                    text: text,
                    images: imagesInPara,
                });
            }
        }

        return {
            extractedImages,
            events,
            relsMap,
        };
    } catch (err) {
        console.warn('⚠️ [docxMediaExtractor Notice]:', err.message);
        return { extractedImages, events, relsMap: new Map() };
    }
}

/**
 * Creates a stateful diagram tracking context for line-by-line or token-based parsers.
 */
function createDiagramContext() {
    return {
        latestOrPendingDiagram: null,
        pendingTargetQuestionNum: null,
        groupDiagramScope: null, // { imageUrl: string, startQ: number, endQ: number }
        consumedDiagrams: new Set(),
        questionDiagramMap: new Map(), // numeric questionNumber -> imageUrl

        /**
         * Explicitly binds an image to a specific question number.
         */
        setQuestionDiagram(qNum, imageUrl) {
            if (qNum !== null && !isNaN(qNum) && imageUrl) {
                this.questionDiagramMap.set(Number(qNum), imageUrl);
            }
        },

        /**
         * Registers an image encountered at the current stream position targeting a specific question.
         */
        registerImage(imageUrl, targetQNum = null) {
            if (!imageUrl) return;
            this.latestOrPendingDiagram = imageUrl;
            this.pendingTargetQuestionNum = targetQNum !== null && !isNaN(targetQNum) ? Number(targetQNum) : null;
        },

        /**
         * Checks if a line or preamble text contains a multi-question diagram directive.
         * If found, sets the active group diagram scope.
         */
        checkMultiQuestionDirective(text, fallbackImageUrl = null) {
            if (!text || typeof text !== 'string') return;
            const match = text.match(MULTI_Q_DIAGRAM_RE);
            if (match) {
                const startStr = match[1] || match[3];
                const endStr = match[2] || match[4];
                const startQ = parseInt(startStr, 10);
                const endQ = parseInt(endStr, 10);
                const targetImg = this.latestOrPendingDiagram || fallbackImageUrl;

                if (!isNaN(startQ) && !isNaN(endQ) && targetImg) {
                    this.groupDiagramScope = {
                        imageUrl: targetImg,
                        startQ: Math.min(startQ, endQ),
                        endQ: Math.max(startQ, endQ),
                    };
                    this.latestOrPendingDiagram = null;
                    this.pendingTargetQuestionNum = null;
                }
            }
        },

        /**
         * Resolves and binds the appropriate diagram URL for a given question.
         * Enforces strict scoping: will NEVER spill unconsumed or floating diagrams into Question 1.
         *
         * @param {Object} question - The question object being constructed
         * @param {number} qNumber - The numeric question number
         * @param {string} [inlineDiagramUrl] - Any diagram encountered directly inside the question
         * @returns {string|null} The resolved diagram URL
         */
        bindDiagramForQuestion(question, qNumber, inlineDiagramUrl = null) {
            const num = (qNumber !== null && !isNaN(qNumber)) ? Number(qNumber) : (question && question.number ? Number(question.number) : null);
            let boundUrl = null;

            // 1. Explicit pre-bound diagram for this specific question number
            if (num !== null && this.questionDiagramMap.has(num)) {
                boundUrl = this.questionDiagramMap.get(num);
            }
            // 2. Direct inline diagram takes highest priority
            else if (inlineDiagramUrl) {
                boundUrl = inlineDiagramUrl;
                this.latestOrPendingDiagram = null;
                this.pendingTargetQuestionNum = null;
            }
            // 3. Multi-question group range check (Biology/Agric)
            else if (this.groupDiagramScope && num !== null) {
                if (num >= this.groupDiagramScope.startQ && num <= this.groupDiagramScope.endQ) {
                    boundUrl = this.groupDiagramScope.imageUrl;
                } else if (num > this.groupDiagramScope.endQ) {
                    this.groupDiagramScope = null;
                }
            }
            // 4. Pending diagram targeting this specific question number
            else if (this.latestOrPendingDiagram && this.pendingTargetQuestionNum !== null) {
                if (num === this.pendingTargetQuestionNum) {
                    boundUrl = this.latestOrPendingDiagram;
                    this.latestOrPendingDiagram = null;
                    this.pendingTargetQuestionNum = null;
                }
            }
            // 5. Preceding diagram registered in stream immediately before this question
            else if (this.latestOrPendingDiagram) {
                boundUrl = this.latestOrPendingDiagram;
                this.latestOrPendingDiagram = null;
                this.pendingTargetQuestionNum = null;
            }

            if (boundUrl) {
                question.diagram_image_url = boundUrl;
                question.image_url = boundUrl;
                question.has_diagram = true;
            } else {
                question.diagram_image_url = null;
                question.image_url = null;
                question.has_diagram = false;
            }

            return boundUrl;
        },

        /**
         * Resets transient pointers at end of document or section.
         */
        reset() {
            this.latestOrPendingDiagram = null;
            this.pendingTargetQuestionNum = null;
            this.groupDiagramScope = null;
            this.questionDiagramMap.clear();
        },
    };
}

/**
 * Analyzes sequential HTML paragraphs from Mammoth and associates embedded diagrams
 * accurately to their respective questions (preceding, following, or inline).
 * Re-names extracted files on disk with human-readable deterministic question-bound names:
 * `${baseSlug}_q${questionNumber || 'unknown'}_${imgIndex}.${ext}`
 *
 * @param {string[]} paragraphs - Array of paragraph HTML strings
 * @param {Object} diagramCtx - Stateful diagram context
 * @param {Object|string} [docContext={}] - Document metadata context
 * @param {Object} [options={}] - Additional directory / url prefix options
 * @returns {{ textLines: string[], lineOffsets: number[] }}
 */
function associateParagraphMedia(paragraphs, diagramCtx, docContext = {}, options = {}) {
    if (!paragraphs || !Array.isArray(paragraphs)) {
        return { textLines: [], lineOffsets: [] };
    }

    const diagramsDir = options.diagramsDir || (typeof docContext === 'object' && docContext.diagramsDir) || path.join(__dirname, '../../../uploads/diagrams');
    const diagramsUrlPrefix = options.diagramsUrlPrefix || (typeof docContext === 'object' && docContext.diagramsUrlPrefix) || '/uploads/diagrams';
    const baseSlug = generateDocSlug(docContext || options.docContext || options);

    const textLines = [];
    const lineOffsets = [];
    let currentOffset = 0;

    // First pass: extract structured paragraph objects
    const parsed = [];
    for (let i = 0; i < paragraphs.length; i++) {
        const paraHtml = paragraphs[i];
        if (!paraHtml || !paraHtml.trim()) continue;

        const images = [];
        let imgMatch;
        IMG_TAG_RE.lastIndex = 0;
        while ((imgMatch = IMG_TAG_RE.exec(paraHtml)) !== null) {
            images.push(imgMatch[1]);
        }

        const rawText = stripHtml(paraHtml).trim();
        const qMatch = rawText.match(/^\s*(\d{1,3})[\.\)]/);
        const qNum = qMatch ? parseInt(qMatch[1], 10) : null;
        const isOption = /^\s*\(?[A-Ea-e]\)?[\.\):\-]\s+/.test(rawText);
        const isCaption = FIGURE_CAPTION_RE.test(rawText);
        const hasDiagramRef = DIAGRAM_REF_RE.test(rawText);

        parsed.push({
            pIdx: i,
            rawText,
            images,
            qNum,
            isOption,
            isCaption,
            hasDiagramRef,
        });
    }

    // Helper: find next question number in subsequent paragraphs within max distance
    function findNextQ(fromIndex, maxDistance = 3) {
        for (let k = fromIndex; k < Math.min(parsed.length, fromIndex + maxDistance); k++) {
            if (parsed[k].qNum !== null) {
                return { qNum: parsed[k].qNum, distance: k - fromIndex, targetP: parsed[k] };
            }
        }
        return null;
    }

    // Deterministic image renaming helper
    const qImgCounters = new Map();
    function renameImageForQuestion(oldUrl, qNumber) {
        if (!oldUrl || typeof oldUrl !== 'string') return oldUrl;

        let qKey;
        if (qNumber !== null && qNumber !== undefined && !isNaN(qNumber)) {
            qKey = `q${qNumber}`;
        } else if (typeof qNumber === 'string' && qNumber) {
            qKey = qNumber.startsWith('q') ? qNumber : `q${qNumber}`;
        } else {
            qKey = 'qunknown';
        }

        const imgIdx = (qImgCounters.get(qKey) || 0) + 1;
        qImgCounters.set(qKey, imgIdx);

        const oldFilename = path.basename(oldUrl.split('?')[0]);
        const extMatch = oldFilename.match(/\.(png|jpe?g|gif|svg|webp|bmp)$/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'jpeg';
        const normExt = ext === 'jpg' ? 'jpeg' : ext;
        const scopeObj = docContext || options.docContext || options;
        const newFilename = generateScopedDiagramFilename(scopeObj, qKey, imgIdx, normExt);
        const newUrl = `${diagramsUrlPrefix}/${newFilename}`;

        const oldDiskPath = path.join(diagramsDir, oldFilename);
        const newDiskPath = path.join(diagramsDir, newFilename);

        if (fs.existsSync(oldDiskPath) && oldDiskPath !== newDiskPath) {
            try {
                fs.renameSync(oldDiskPath, newDiskPath);
            } catch (err) {
                try {
                    fs.copyFileSync(oldDiskPath, newDiskPath);
                    fs.unlinkSync(oldDiskPath);
                } catch (copyErr) {
                    console.warn(`⚠️ [docxMediaExtractor] Rename failed:`, copyErr.message);
                }
            }
        }

        return newUrl;
    }

    let currentQNum = null;
    let seenOptionsForCurrentQ = false;

    // Second pass: map images to their questions with strict proximity & intent
    for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];

        if (p.qNum !== null) {
            currentQNum = p.qNum;
            seenOptionsForCurrentQ = false;
        } else if (p.isOption) {
            seenOptionsForCurrentQ = true;
        }

        if (p.rawText) {
            const match = p.rawText.match(MULTI_Q_DIAGRAM_RE);
            if (match) {
                const startQ = parseInt(match[1] || match[3], 10);
                const endQ = parseInt(match[2] || match[4], 10);
                if (!isNaN(startQ) && !isNaN(endQ)) {
                    const minQ = Math.min(startQ, endQ);
                    const maxQ = Math.max(startQ, endQ);
                    const rangeKey = `${minQ}_${maxQ}`;
                    if (p.images.length > 0) {
                        const renamedUrl = renameImageForQuestion(p.images[0], rangeKey);
                        p.images[0] = renamedUrl;
                        diagramCtx.groupDiagramScope = {
                            imageUrl: renamedUrl,
                            startQ: minQ,
                            endQ: maxQ,
                        };
                    }
                }
            }
        }

        if (p.images.length > 0) {
            const rawImg = p.images[0];

            // 1. Image in same paragraph as question start (e.g. "3. Fig 12... <img ...>")
            if (p.qNum !== null) {
                const finalUrl = renameImageForQuestion(rawImg, p.qNum);
                diagramCtx.setQuestionDiagram(p.qNum, finalUrl);
            }
            // 2. Image inside active question stem BEFORE options
            else if (currentQNum !== null && !seenOptionsForCurrentQ && !p.isCaption) {
                const nextQInfo = findNextQ(i + 1, 3);
                const nextP = i + 1 < parsed.length ? parsed[i + 1] : null;

                if (nextP && nextP.isOption) {
                    const finalUrl = renameImageForQuestion(rawImg, currentQNum);
                    diagramCtx.setQuestionDiagram(currentQNum, finalUrl);
                } else if (nextP && nextP.qNum !== null && (nextP.hasDiagramRef || p.isCaption)) {
                    const finalUrl = renameImageForQuestion(rawImg, nextP.qNum);
                    diagramCtx.setQuestionDiagram(nextP.qNum, finalUrl);
                } else if (nextQInfo && (p.isCaption || (nextP && nextP.qNum === nextQInfo.qNum))) {
                    const finalUrl = renameImageForQuestion(rawImg, nextQInfo.qNum);
                    diagramCtx.setQuestionDiagram(nextQInfo.qNum, finalUrl);
                } else {
                    const finalUrl = renameImageForQuestion(rawImg, currentQNum);
                    diagramCtx.setQuestionDiagram(currentQNum, finalUrl);
                }
            }
            // 3. Image is preceded by caption or immediately before a subsequent question
            else {
                const nextQInfo = findNextQ(i + 1, 3);
                const prevP = i > 0 ? parsed[i - 1] : null;
                const isPrecededByCaption = prevP && prevP.isCaption;

                if (nextQInfo && (p.isCaption || isPrecededByCaption || nextQInfo.targetP.hasDiagramRef || (nextQInfo.distance === 1 && nextQInfo.qNum !== 1))) {
                    const finalUrl = renameImageForQuestion(rawImg, nextQInfo.qNum);
                    diagramCtx.setQuestionDiagram(nextQInfo.qNum, finalUrl);
                } else if (nextQInfo && nextQInfo.distance === 1 && nextQInfo.qNum === 1 && (p.isCaption || isPrecededByCaption || nextQInfo.targetP.hasDiagramRef)) {
                    const finalUrl = renameImageForQuestion(rawImg, nextQInfo.qNum);
                    diagramCtx.setQuestionDiagram(nextQInfo.qNum, finalUrl);
                } else if (currentQNum !== null && p.hasDiagramRef) {
                    const finalUrl = renameImageForQuestion(rawImg, currentQNum);
                    diagramCtx.setQuestionDiagram(currentQNum, finalUrl);
                } else {
                    // Unassociated / floating image (e.g. header logo) — DO NOT assign to Question 1!
                    renameImageForQuestion(rawImg, 'unknown');
                }
            }
        }
    }

    // Third pass: assemble textLines and lineOffsets
    for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];
        if (p.rawText) {
            const subLines = p.rawText.split('\n').filter(l => l.trim());
            for (const subLine of subLines) {
                lineOffsets.push(currentOffset);
                currentOffset += subLine.length + 1;
                textLines.push(subLine);
            }
        }
    }

    return { textLines, lineOffsets };
}

/**
 * Deletes diagram image files from disk safely.
 * Path traversal protection: only deletes files within the uploads/diagrams directory.
 *
 * @param {string|string[]} imageUrls - URL or array of URLs (e.g. '/uploads/diagrams/physics_sss_2_q3_1.jpeg')
 * @param {string} [customDir] - Optional custom directory override
 * @returns {number} Count of files successfully deleted
 */
function deleteDiagramFiles(imageUrls = [], customDir = null) {
    if (!imageUrls) return 0;
    if (!Array.isArray(imageUrls)) imageUrls = [imageUrls];

    const diagramsDir = customDir || path.join(__dirname, '../../../uploads/diagrams');
    let deletedCount = 0;

    for (const url of imageUrls) {
        if (!url || typeof url !== 'string') continue;
        const filename = path.basename(url.split('?')[0]);
        if (!filename || filename === '.' || filename === '..' || filename.includes('/') || filename.includes('\\')) continue;

        const targetPath = path.join(diagramsDir, filename);
        try {
            if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
                deletedCount++;
            }
        } catch (err) {
            console.warn(`⚠️ [MediaCleanup] Failed to unlink ${targetPath}:`, err.message);
        }
    }

    return deletedCount;
}

/**
 * Scans disk uploads directory and deletes orphaned extracted images
 * that are no longer referenced by any question in the database.
 * Preserves static seed assets (e.g. bio_q5_amoeba.png, bio_q10_plant_cell.png).
 *
 * @param {string[]} referencedUrls - List of all diagram URLs currently referenced in database
 * @param {string} [customDir] - Optional directory override
 * @returns {number} Count of orphaned files deleted
 */
function cleanupOrphanedDiagramFiles(referencedUrls = [], customDir = null) {
    const diagramsDir = customDir || path.join(__dirname, '../../../uploads/diagrams');
    if (!fs.existsSync(diagramsDir)) return 0;

    const referencedBasenames = new Set(
        (referencedUrls || [])
            .filter(Boolean)
            .map(u => path.basename(String(u).split('?')[0]))
    );

    let removedCount = 0;
    try {
        const files = fs.readdirSync(diagramsDir);
        for (const file of files) {
            // Target auto-generated extracted files:
            // 1. docx_*
            // 2. [docSlug]_q[0-9]*_[0-9]*.[ext] (legacy)
            // 3. [docSlug]_q[0-9]*_img[0-9]*.[ext] (scoped)
            // 4. [docSlug]_qunknown_*.[ext]
            // 5. [docSlug]_raw_* / [docSlug]_tmp_*
            const isAutoExtracted = file.startsWith('docx_') ||
                /_q\d+(?:_\d+)?_(?:img\d+|\d+)\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(file) ||
                /_qunknown_(?:img\d+|\d+)\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(file) ||
                /_raw_\d+/i.test(file) ||
                /_tmp_\d+/i.test(file);

            if (isAutoExtracted && !referencedBasenames.has(file)) {
                const targetPath = path.join(diagramsDir, file);
                try {
                    fs.unlinkSync(targetPath);
                    removedCount++;
                } catch (err) {
                    console.warn(`⚠️ [MediaCleanup] Failed to delete orphaned file ${targetPath}:`, err.message);
                }
            }
        }
    } catch (err) {
        console.warn('⚠️ [MediaCleanup Error]:', err.message);
    }

    return removedCount;
}

/**
 * Scans uploads/diagrams and purges unreferenced staging diagram files
 * that are older than maxAgeMinutes (Staging TTL cleanup).
 *
 * @param {Object} dbInstance - SQLite database instance
 * @param {number} [maxAgeMinutes=60] - Age threshold in minutes
 * @param {string} [customDir] - Optional directory override
 * @returns {Promise<number>} Count of expired staging files deleted
 */
async function cleanupStalePreviewDiagrams(dbInstance, maxAgeMinutes = 60, customDir = null) {
    const diagramsDir = customDir || path.join(__dirname, '../../../uploads/diagrams');
    if (!fs.existsSync(diagramsDir)) return 0;

    try {
        const rows = await new Promise((resolve) => {
            if (!dbInstance) return resolve([]);
            dbInstance.all(
                `SELECT diagram_image_url FROM questions WHERE diagram_image_url IS NOT NULL AND diagram_image_url != ''`,
                [],
                (err, result) => resolve(result || [])
            );
        });

        const referencedBasenames = new Set(
            rows.map(r => path.basename(String(r.diagram_image_url || '').split('?')[0])).filter(Boolean)
        );

        const cutoffTime = Date.now() - maxAgeMinutes * 60 * 1000;
        let purgedCount = 0;

        const files = fs.readdirSync(diagramsDir);
        for (const file of files) {
            const isAutoExtracted = file.startsWith('docx_') ||
                /_q\d+(?:_\d+)?_(?:img\d+|\d+)\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(file) ||
                /_qunknown_(?:img\d+|\d+)\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(file) ||
                /_raw_\d+/i.test(file) ||
                /_tmp_\d+/i.test(file);

            if (isAutoExtracted && !referencedBasenames.has(file)) {
                const targetPath = path.join(diagramsDir, file);
                try {
                    const stat = fs.statSync(targetPath);
                    if (stat.mtimeMs < cutoffTime) {
                        fs.unlinkSync(targetPath);
                        purgedCount++;
                    }
                } catch (_) {}
            }
        }

        if (purgedCount > 0) {
            console.log(`🧹 [Staging TTL] Purged ${purgedCount} abandoned staging preview diagram(s) older than ${maxAgeMinutes} minutes.`);
        }
        return purgedCount;
    } catch (err) {
        console.warn('⚠️ [Staging TTL Cleanup Error]:', err.message);
        return 0;
    }
}

module.exports = {
    MULTI_Q_DIAGRAM_RE,
    FIGURE_CAPTION_RE,
    DIAGRAM_REF_RE,
    generateDocSlug,
    generateScopedDiagramFilename,
    parseDocxRelationships,
    extractDocxMedia,
    createDiagramContext,
    associateParagraphMedia,
    deleteDiagramFiles,
    cleanupOrphanedDiagramFiles,
    cleanupStalePreviewDiagrams,
    saveOptimizedDiagram,
};
