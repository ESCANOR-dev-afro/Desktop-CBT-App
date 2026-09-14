/**
 * textSanitizer.js
 *
 * Shared text cleaning and normalization utilities for DOCX question parsers.
 * 100% Offline — Node.js native.
 */

/**
 * REFINEMENT 2: Flexible cloze/gap-filling blank detector.
 *
 * Handles variable underscore counts and alternative dot markers:
 *   - __71__         (standard double underscore)
 *   - ___71___       (triple underscore)
 *   - ______ 71 ___  (wide underscore with spaces)
 *   - ...71...       (dot-style markers)
 *   - __ 71 __       (underscores with inner spaces)
 *
 * STRICT PRESERVATION: This regex is used ONLY for detection and normalization.
 * The original gap numbers are ALWAYS preserved. Matched gaps are normalized to
 * the uniform token __${gapNumber}__ for consistent student UI rendering.
 */
const CLOZE_GAP_RE = /(?:_{2,}|\.{3,})\s*(\d+)\s*(?:_{2,}|\.{3,})/g;

/**
 * XML entity escaper for inserting text into Word XML
 */
function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * XML entity decoder for reading text from Word XML
 */
function decodeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

/**
 * Strips HTML tags from text while preserving line breaks and semantic inline formatting (<u>, <b>, <i>, <sub>, <sup>).
 */
function stripHtml(html, preserveFormatting = true) {
    if (!html || typeof html !== 'string') return '';
    let text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n');

    if (preserveFormatting) {
        // Strip everything EXCEPT <u>, </u>, <b>, </b>, <strong>, </strong>, <i>, </i>, <em>, </em>, <sub>, </sub>, <sup>, </sup>
        text = text.replace(/<(?!(\/?(u|b|i|em|strong|sub|sup)\b))[^>]+>/gi, '');
    } else {
        text = text.replace(/<[^>]+>/g, '');
    }

    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

/**
 * Normalizes cloze/gap blanks to a uniform __N__ format.
 * Preserves the original gap numbers. Never removes or solves blanks.
 */
function normalizeClozeGaps(text) {
    if (!text) return text;
    return text.replace(CLOZE_GAP_RE, (match, gapNumber) => {
        return `__${gapNumber}__`;
    });
}

/**
 * Converts Mammoth HTML output into an array of paragraph strings,
 * resolving ordered lists (<ol><li>...</li></ol>) and unordered lists into discrete
 * numbered/bulleted paragraphs so that Word automatic numbering (<w:numPr>) is preserved.
 */
function extractParagraphsFromHtml(rawHtml) {
    if (!rawHtml || typeof rawHtml !== 'string') return [];
    let processedHtml = rawHtml;

    // 1. Resolve ordered lists: <ol><li>...</li></ol> -> <p>${index}. ...</p>
    processedHtml = processedHtml.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (match, olContent) => {
        let itemNum = 1;
        return olContent.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (liMatch, liContent) => {
            const cleanText = liContent.replace(/<[^>]+>/g, '').trim();
            if (/^\d{1,3}[\.\)]/.test(cleanText)) {
                return `<p>${liContent}</p>`;
            }
            return `<p>${itemNum++}. ${liContent}</p>`;
        });
    });

    // 2. Resolve unordered lists: <ul><li>...</li></ul> -> <p>...</p>
    processedHtml = processedHtml.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (match, ulContent) => {
        return ulContent.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (liMatch, liContent) => {
            return `<p>${liContent}</p>`;
        });
    });

    // 3. Split on </p>, <br>, and </li>
    return processedHtml
        .split(/<\/p>|<br\s*\/?>|<\/li>/gi)
        .map(p => p.trim())
        .filter(Boolean);
}

/**
 * Document header metadata detector:
 * Discards school headers, subject lines, class lines, term/session lines, and exam type markers.
 */
const DOCUMENT_HEADER_REGEX = /^(?:SUBJECT|CLASS|TERM|SESSION|SEMESTER|DURATION|TIME\s+ALLOWED|TIME|DATE|NAME|CANDIDATE(?:\'S)?\s+NAME|STUDENT(?:\'S)?\s+NAME|PAPER|TYPE)\s*:|(?:SECONDARY\s+SCHOOL|GRAMMAR\s+SCHOOL|HIGH\s+SCHOOL|ACADEMY|COLLEGE|POLYTECHNIC|UNIVERSITY)\b|^\s*(?:FIRST|SECOND|THIRD|1ST|2ND|3RD)?\s*(?:TERM)?\s*(?:MID-?TERM|EXAM|EXAMINATION|TEST|CA\s+TEST|CA|MOCK)/i;

/**
 * Checks and cleans a preamble line, returning null if it is document header metadata or empty.
 */
function cleanPreambleLine(line) {
    if (!line || typeof line !== 'string') return null;
    const trimmed = line.replace(/<[^>]+>/g, '').trim();
    if (!trimmed || DOCUMENT_HEADER_REGEX.test(trimmed)) {
        return null;
    }
    // Double-check with full metadata detector
    if (isHeaderMetadata(line)) {
        return null;
    }
    return trimmed;
}

/**
 * Detects document metadata lines at the top of an exam paper:
 *   - School name (e.g. ANTHONY WHITEBRIDGE ACADEMY, ...ACADEMY, ...COLLEGE, ...HIGH SCHOOL)
 *   - Term / Examination titles (e.g. FIRST TERM EXAMINATION, MID-TERM TEST, 2026/2027 ACADEMIC SESSION)
 *   - Attribute key-value pairs (e.g. Subject: ..., Class: ..., Duration: ..., Time: ..., Date: ..., Name: ...)
 */
function isHeaderMetadata(line) {
    if (!line || typeof line !== 'string') return false;
    const clean = line.replace(/<[^>]+>/g, '').trim();
    if (!clean) return true;

    // Must NOT be a numbered question (e.g. "1. If 5/√2..." or "1) Evaluate...")
    if (/^\d{1,3}[\.\)]/.test(clean)) return false;

    // Must NOT be an MCQ line containing options (e.g., has B. and C. or (b) and (c))
    if (/(?:^|[\s\t]+|\()(?:\(?[A-Ea-e]\)?[\.\):\-]|[A-Ea-e]\b)[\s\S]+(?:^|[\s\t]+|\()(?:\(?[B-Eb-e]\)?[\.\):\-]|[B-Eb-e]\b)/i.test(clean)) {
        return false;
    }

    if (DOCUMENT_HEADER_REGEX.test(clean)) {
        return true;
    }

    // School names & institutions (e.g., "ANTHONY WHITEBRIDGE ACADEMY", "KING'S COLLEGE", "GOVERNMENT SECONDARY SCHOOL")
    if (/(?:\b(?:academy|college|grammar\s+school|high\s+school|international\s+school|secondary\s+school|polytechnic|university)\b|\b(?:community|model|comprehensive|memorial|catholic|anglican|baptist|government|federal|state|hallmark|grace|anthony|whitebridge)\s+(?:school|college|academy|institution)\b)/i.test(clean)) {
        if (!/(?:were|was|is|are|been|has|have|had|destroyed|criticized|calculate|evaluate|find|solve|following|question|sentence|underlined|meaning|opposite|choose|select)\b/i.test(clean)) {
            return true;
        }
    }

    // Examination titles, sessions, terms, papers
    if (/(?:first|second|third|1st|2nd|3rd)\s+term\s+(?:examination|exam|test|assessment|ca)/i.test(clean)) return true;
    if (/(?:mid-?term|continuous\s+assessment|mock|terminal|annual|promotion)\s+(?:examination|exam|test|ca|assessment)/i.test(clean)) return true;
    if (/\b\d{4}\s*[\/\-]\s*\d{4}\s*(?:academic\s+session|session)?/i.test(clean) && /(?:term|exam|assessment|school|session|examination|class|subject)/i.test(clean)) return true;
    if (/^\s*(?:examination|mid-?term\s+test|terminal\s+exam|mock\s+exam|general\s+instructions?)\b/i.test(clean)) return true;

    // Attribute lines matching Subject:, Class:, Duration:, Time:, Date:, Name:, etc.
    const attrRe = /^\s*(?:(?:subject|class|duration|time\s+allowed|time|date|name|candidate(?:'s)?\s+name|student(?:'s)?\s+name|paper|session|term)\s*[:.\-])/i;
    const inlineAttrRe = /\b(?:subject\s*:\s*|class\s*:\s*|duration\s*:\s*|time\s*:\s*|candidate\s*name\s*:\s*|date\s*:\s*)/i;
    if (attrRe.test(clean) || inlineAttrRe.test(clean)) {
        if (!/^(?:Given|Evaluate|Solve|What|Which|Calculate|Find|Determine|How|Why|Where|When|If|State|Show|Prove|Let|In\s+the|For\s+what|An?\s+|The\s+|Read\s+the)\b/i.test(clean)) {
            return true;
        }
    }

    return false;
}

/**
 * Strips leading document header metadata lines from the top of the text.
 */
function stripHeaderMetadata(text) {
    if (!text || typeof text !== 'string') return '';
    const lines = text.split('\n');
    let firstContentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const clean = rawLine.replace(/<[^>]+>/g, '').trim();
        if (!clean) {
            firstContentIndex = i + 1;
            continue;
        }

        // If line is header metadata, skip it
        if (isHeaderMetadata(rawLine) || DOCUMENT_HEADER_REGEX.test(clean)) {
            firstContentIndex = i + 1;
            continue;
        }

        // Once we hit a question, instruction, section, or passage, stop stripping
        break;
    }

    return lines.slice(firstContentIndex).join('\n');
}

/**
 * Pre-sanitizes document text before question splitting and parsing:
 *   - Strips leading document header metadata (school name, subject/class headers)
 *   - Normalizes line breaks (\r\n -> \n, \r -> \n)
 *   - Replaces all tab characters \t with two spaces to preserve column separations
 *   - Corrects common typos like "(d0 production" -> "(d) production"
 *   - Normalizes lowercase parenthesized options (a), (b), (c), (d), (e) to standard A., B., C., D., E.
 *   - Inserts space before option letters when glued to sentence-ending punctuation or cloze markers
 *     (e.g., "...uncle.A. whom" -> "...uncle. A. whom", "_____A." -> "_____ A.")
 *   - Inserts space after option delimiter if glued to option text (e.g. "A.whom" -> "A. whom")
 *   - Normalizes variable cloze/gap blanks to __N__
 */
function sanitizeDocumentText(text, options = {}) {
    if (!text || typeof text !== 'string') return '';

    let sanitized = text;

    // 0. Strip leading document header metadata
    sanitized = stripHeaderMetadata(sanitized);

    // 1. Normalize line endings
    sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. Replace all tab characters \t with two spaces to preserve column separations for tabular cloze rows
    sanitized = sanitized.replace(/\t/g, '  ');

    // 3. Fix common OCR/typo errors like "(d0 production" -> "(d) production"
    sanitized = sanitized.replace(/\(([A-Ea-e])0\s+/g, '($1) ');

    // 4. Normalize lowercase parenthesized options: (a) -> A., (b) -> B.
    sanitized = sanitized.replace(/(?<=[ \t\n\r]|^)\(([a-e])\)\s*/gi, (match, letter) => {
        return `${letter.toUpperCase()}. `;
    });

    // 5. Separate glued punctuation before option letters
    sanitized = sanitized.replace(/([.?!;:]|_+(?:\s*\d+\s*_+)?|\))([A-Ea-e])([.):\-])[ \t]*/g, '$1 $2$3 ');

    // 6. Ensure option letters glued to option text also get separated (including Unicode / IPA symbols)
    sanitized = sanitized.replace(/(?<=[ \t]|\()([A-Ea-e][.):\-])([A-Za-z0-9\$\\\/\[\u0080-\uFFFFˈˌ])/gu, '$1 $2');
    sanitized = sanitized.replace(/(?<=[ \t]|\()(\([A-Ea-e]\))([A-Za-z0-9\$\\\/\[\u0080-\uFFFFˈˌ])/gu, '$1 $2');

    // 7. Ensure section directives glued to previous punctuation/answer key get a newline boundary
    sanitized = sanitized.replace(/(?<=[a-zA-Z][.?!:;\]\)]|__|\b(?:Ans|ANSWER|ANS)\s*[:=\-]?\s*[A-E])[ \t]+(?=(?:SECTION|PART)\s+[A-Za-z0-9]+|(?:INSTRUCTION|INSTRUCTIONS|DIRECTION|DIRECTIONS|NOTE|GUIDELINE)\b|\[?PASSAGE\b|\[?Read\s+the\s+(?:following\s+)?passage)\b/gi, '\n');
    sanitized = sanitized.replace(/(?<=[a-zA-Z][.?!:;\]\)]|__|\b(?:Ans|ANSWER|ANS)\s*[:=\-]?\s*[A-E])[ \t]+(?=(?:From\s+the\s+(?:words?|options?|phrases?|word\s+to\s+group|word\s+or\s+group)|In\s+each\s+of\s+the|Choose\s+the|Select\s+the))\b/gi, '\n');

    // 8. Normalize cloze gaps
    if (options.allowCloze !== false) {
        sanitized = normalizeClozeGaps(sanitized);
    }

    return sanitized;
}

module.exports = {
    CLOZE_GAP_RE,
    DOCUMENT_HEADER_REGEX,
    escapeXml,
    decodeXml,
    stripHtml,
    extractParagraphsFromHtml,
    normalizeClozeGaps,
    cleanPreambleLine,
    isHeaderMetadata,
    stripHeaderMetadata,
    sanitizeDocumentText,
};
