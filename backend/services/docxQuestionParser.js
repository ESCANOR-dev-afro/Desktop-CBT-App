/**
 * docxQuestionParser.js
 *
 * Offline Question Parsing Facade & Strategy Pattern Integration.
 * Seamlessly delegates to specialized profile parsers (Maths/Science, English/Languages, General/Standard)
 * while preserving 100% backward compatibility for existing routes and test suites.
 *
 * 100% Offline — Zero external API calls, zero cloud dependencies.
 */

const {
    parseDocxBuffer,
    parsePlainText,
    parseMathScienceDocx,
    parseEnglishPassageDocx,
    parseStandardDocx,
    resolveProfile,
} = require('./parsers/index');

const {
    CLOZE_GAP_RE,
    escapeXml,
    decodeXml,
    stripHtml,
    normalizeClozeGaps,
    sanitizeDocumentText,
} = require('./parsers/common/textSanitizer');

const {
    parseOmmlXml,
    ommlToLatex,
    transformDocxOmmlToLatex,
    isInsideMath,
    mapMathSymbols,
} = require('./parsers/common/mathOmmlConverter');

const {
    QUESTION_NUMBER_RE,
    STACKED_OPTION_RE,
    INLINE_OPTIONS_RE,
    INLINE_ANSWER_RE,
    TRAILING_OPTION_ANSWER_RE,
    TRAILING_ANS_REGEX,
    ANSWER_BLOCK_HEADER_RE,
    ANSWER_ENTRY_RE,
    extractInlineAnswer,
    extractAndStripOptionAnswer,
    extractInlineOptions,
    parseQuestionBlock,
    splitStemAndInlineOptions,
    parseAnswerBlock,
    convertFiveToFourOptions,
} = require('./parsers/common/optionConverter');

const {
    MULTI_Q_DIAGRAM_RE,
    FIGURE_CAPTION_RE,
    parseDocxRelationships,
    extractDocxMedia,
    createDiagramContext,
    deleteDiagramFiles,
    cleanupOrphanedDiagramFiles,
    cleanupStalePreviewDiagrams,
    generateDocSlug,
    generateScopedDiagramFilename,
} = require('./parsers/common/docxMediaExtractor');

const { extractTrailingPreamble, parsePreamble } = require('./parsers/englishPassageParser');
const { parseLines } = require('./parsers/standardDocxParser');

const SECTION_HEADER_RE = /^\s*(?:SECTION|PART)\s+([A-Za-z0-9]+)(?:\s*[:.\-]\s*(.*))?$/i;
const INSTRUCTION_RE = /^\s*(?:INSTRUCTION|INSTRUCTIONS|DIRECTION|DIRECTIONS|NOTE)\s*[:.\-]?\s*(.*)/i;
const PASSAGE_HEADER_RE = /^\s*\[?(?:Read\s+the\s+(?:following\s+)?passage|PASSAGE(?:\s+[A-Za-z0-9]+)?)\b/i;

/**
 * Parses Aiken-format text into structured question objects.
 */
function parseAikenFormat(text) {
    const result = parsePlainText(text);
    if (result && result.metadata) {
        result.metadata.sourceFormat = 'aiken';
    }
    return result;
}

/**
 * Backward-compatible helper for document parsing
 */
function parseDocument(rawText, imageBindings = new Map(), lineOffsets = []) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    return parseLines(lines, imageBindings, new Map());
}

module.exports = {
    parseDocxBuffer,
    parsePlainText,
    parseAikenFormat,
    resolveProfile,
    deleteDiagramFiles,
    cleanupOrphanedDiagramFiles,
    cleanupStalePreviewDiagrams,
    generateDocSlug,
    generateScopedDiagramFilename,
    // Exported for backward-compatibility & testing
    _internal: {
        generateDocSlug,
        generateScopedDiagramFilename,
        ommlToLatex,
        parseOmmlXml,
        transformDocxOmmlToLatex,
        sanitizeDocumentText,
        extractTrailingPreamble,
        parsePreamble,
        parseQuestionBlock,
        parseDocument,
        extractInlineOptions,
        splitStemAndInlineOptions,
        extractInlineAnswer,
        extractAndStripOptionAnswer,
        parseAnswerBlock,
        normalizeClozeGaps,
        convertFiveToFourOptions,
        parseLines,
        stripHtml,
        isInsideMath,
        createDiagramContext,
        extractDocxMedia,
        deleteDiagramFiles,
        cleanupOrphanedDiagramFiles,
        cleanupStalePreviewDiagrams,
        QUESTION_NUMBER_RE,
        STACKED_OPTION_RE,
        INLINE_OPTIONS_RE,
        INLINE_ANSWER_RE,
        TRAILING_OPTION_ANSWER_RE,
        TRAILING_ANS_REGEX,
        DOCUMENT_HEADER_REGEX: require('./parsers/common/textSanitizer').DOCUMENT_HEADER_REGEX,
        cleanPreambleLine: require('./parsers/common/textSanitizer').cleanPreambleLine,
        ANSWER_BLOCK_HEADER_RE,
        ANSWER_ENTRY_RE,
        SECTION_HEADER_RE,
        INSTRUCTION_RE,
        PASSAGE_HEADER_RE,
        CLOZE_GAP_RE,
        MULTI_Q_DIAGRAM_RE,
        FIGURE_CAPTION_RE,
    },
};
