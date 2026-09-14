/**
 * index.js
 *
 * Master Strategy Dispatcher & Orchestrator for Desktop CBT Question Ingestion.
 * Routes parsing requests to specialized profile strategies based on subject
 * auto-detection or explicit administrator selection.
 *
 * 100% Offline — Zero cloud dependencies.
 */

const AdmZip = require('adm-zip');
const { parseMathScienceDocx } = require('./mathScienceParser');
const { parseEnglishPassageDocx } = require('./englishPassageParser');
const { parseStandardDocx, parsePlainText } = require('./standardDocxParser');

/**
 * Resolves the appropriate parsing strategy profile name.
 *
 * @param {string} [profileMode='auto'] - Explicit profile mode or 'auto'
 * @param {string} [targetSubject=''] - Subject name for auto-detection
 * @param {Buffer} [buffer=null] - DOCX buffer to inspect for OMML/English headers
 * @returns {'math_science'|'english_languages'|'standard_general'}
 */
function resolveProfile(profileMode = 'auto', targetSubject = '', buffer = null) {
    if (profileMode && profileMode !== 'auto') {
        const mode = String(profileMode).toLowerCase().trim();
        if (mode.includes('math') || mode.includes('physic') || mode.includes('science')) {
            return 'math_science';
        }
        if (mode.includes('english') || mode.includes('language') || mode.includes('passage')) {
            return 'english_languages';
        }
        if (mode.includes('standard') || mode.includes('general')) {
            return 'standard_general';
        }
    }

    const sub = String(targetSubject || '').toLowerCase().trim();
    if (/math|further|physic|chem|calculus|algebra|statistic|geometr/i.test(sub)) {
        return 'math_science';
    }
    if (/english|oral\s*english|comprehension|literature|oral|yoruba|french|igbo|hausa|language/i.test(sub)) {
        return 'english_languages';
    }

    if (buffer && Buffer.isBuffer(buffer)) {
        try {
            const zip = new AdmZip(buffer);
            const docEntry = zip.getEntry('word/document.xml');
            if (docEntry) {
                const xml = zip.readAsText(docEntry);
                if (xml.includes('oMath') || xml.includes('m:oMath')) {
                    return 'math_science';
                }
                if (/SECTION\s+[A-Za-z0-9]|COMPREHENSION|LEXIS|CLOZE|PASSAGE/i.test(xml)) {
                    return 'english_languages';
                }
            }
        } catch (e) {}
    }

    return 'standard_general';
}

/**
 * Primary DOCX parser entry point with profile routing and automatic fallback.
 *
 * @param {Buffer} buffer - DOCX binary buffer
 * @param {Object} options
 * @param {string} [options.profileMode='auto'] - 'auto', 'math_science', 'english_languages', 'standard_general'
 * @param {string} [options.targetSubject=''] - Subject name for auto-detection
 * @param {string} [options.diagramsDir] - Directory to persist extracted images
 * @param {string} [options.diagramsUrlPrefix] - URL prefix for diagrams
 * @returns {Promise<Object>} Unified ParseResult
 */
async function parseDocxBuffer(buffer, options = {}) {
    const profile = resolveProfile(
        options.profileMode || options.mode,
        options.targetSubject || options.subject,
        buffer
    );

    if (typeof buffer === 'string') {
        const plainResult = parsePlainText(buffer, options, profile);
        return plainResult;
    }

    let result = null;

    try {
        if (profile === 'math_science') {
            result = await parseMathScienceDocx(buffer, options);
        } else if (profile === 'english_languages') {
            result = await parseEnglishPassageDocx(buffer, options);
        } else {
            result = await parseStandardDocx(buffer, options);
        }

        // Graceful fallback: If specialized profile yielded 0 questions, retry with standard profile
        if ((!result || !result.questions || result.questions.length === 0) && profile !== 'standard_general') {
            console.warn(`[Parser Orchestrator]: Profile '${profile}' yielded 0 questions. Falling back to 'standard_general'.`);
            const fallbackResult = await parseStandardDocx(buffer, options);
            if (fallbackResult && fallbackResult.questions && fallbackResult.questions.length > 0) {
                fallbackResult.metadata.profileApplied = `General / Standard Profile (Fallback from ${profile})`;
                fallbackResult.warnings.push(`Auto-fallback applied: Parsed using General / Standard profile.`);
                return fallbackResult;
            }
        }

        return result;
    } catch (err) {
        console.warn(`[Parser Orchestrator Warning]: Profile '${profile}' encountered error: ${err.message}. Retrying with standard.`);
        if (profile !== 'standard_general') {
            try {
                const fallbackResult = await parseStandardDocx(buffer, options);
                fallbackResult.warnings.push(`Parser fallback invoked after: ${err.message}`);
                return fallbackResult;
            } catch (fallbackErr) {
                throw new Error(`DOCX Parsing failed across all profiles: ${err.message}`);
            }
        }
        throw err;
    }
}

module.exports = {
    resolveProfile,
    parseDocxBuffer,
    parseDocxWithStrategy: parseDocxBuffer,
    parsePlainText,
    parseMathScienceDocx,
    parseEnglishPassageDocx,
    parseStandardDocx,
};
