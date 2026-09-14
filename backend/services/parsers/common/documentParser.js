/**
 * documentParser.js
 *
 * Core document-level hard boundary question tokenizer and state machine.
 * Implements 2-step question segmentation, preamble parsing, tabular cloze matrices,
 * and context propagation.
 *
 * 100% Offline — Node.js native.
 */

const {
    sanitizeDocumentText,
    normalizeClozeGaps,
    isHeaderMetadata,
    cleanPreambleLine,
    DOCUMENT_HEADER_REGEX,
} = require('./textSanitizer');
const { isInsideMath } = require('./mathOmmlConverter');
const {
    QUESTION_NUMBER_RE,
    STACKED_OPTION_RE,
    INLINE_ANSWER_RE,
    TRAILING_ANS_REGEX,
    TRAILING_OPTION_ANSWER_RE,
    ANSWER_BLOCK_HEADER_RE,
    ANSWER_ENTRY_RE,
    extractInlineAnswer,
    extractAndStripOptionAnswer,
    parseAnswerBlock,
    convertFiveToFourOptions,
} = require('./optionConverter');
const {
    MULTI_Q_DIAGRAM_RE,
    createDiagramContext,
} = require('./docxMediaExtractor');

const SECTION_HEADER_RE = /^\s*(?:<[^>]+>)*\s*(?:SECTION|PART)\s+([A-Za-z0-9]+)(?:\s*[:.\-]\s*(.*?))?(?:\s*<\/[^>]+>)*\s*$/i;
const NON_COMPREHENSION_HEADER_RE = /^\s*(?:<[^>]+>)*\s*(?:LEXIS(?:\s+AND\s+STRUCTURE|\s+&\s+STRUCTURE)?|STRUCTURE|GRAMMAR|VOCABULARY(?:\s+DEVELOPMENT)?|ORAL\s+ENGLISH|SPEECH|TEST\s+OF\s+ORALS|CONTINUOUS\s+WRITING|COMPOSITION|LETTER\s+WRITING|ANTONYMS|SYNONYMS|IDIOMS(?:\s+AND\s+IDIOMATIC\s+EXPRESSIONS)?)\s*[:.\-]?\s*(?:<\/[^>]+>)*\s*$/i;
const INSTRUCTION_RE = /^\s*(?:<[^>]+>)*\s*(?:INSTRUCTION|INSTRUCTIONS|DIRECTION|DIRECTIONS|NOTE|GUIDELINE|GUIDELINES)\s*[:.\-]?\s*(.*?)(?:\s*<\/[^>]+>)*\s*$/i;
const PASSAGE_HEADER_RE = /^\s*(?:<[^>]+>)*\s*\[?(?:Read\s+(?:the\s+)?(?:following\s+)?passage(?:\s+carefully)?|PASSAGE(?:\s+[A-Za-z0-9]+)?|Passage(?:\s+[A-Za-z0-9]+)?)\b/i;
const QUESTIONS_TO_PASSAGE_RE = /^\s*(?:<[^>]+>)*\s*(?:Questions?\s+(?:to|on|for|under|based\s+on)\s+(?:the\s+)?passage\s*(\d+|[A-Za-z0-9]+)?|(?:Questions?|Nos?\.?)\s+(\d+)\s*(?:to|-|–|through)\s*(\d+)\s*(?:are\s+based\s+on|refer\s+to|under)?\s*(?:the\s+passage)?|Answer\s+questions?\s+(\d+)\s*(?:to|-|–|through)\s*(\d+)\s*(?:based\s+on\s+the\s+passage)?)\b\s*[:.\-]?\s*$/i;
const DIRECTIVE_PREFIX_RE = /^(?!\s*\d+[\.\)])\s*(?:<[^>]+>)*\s*(?:From\s+the\s+(?:words?|options?|phrases?|alternatives?|word\s+to\s+group|word\s+or\s+group)|In\s+each\s+of\s+the|In\s+questions?\b|In\s+the\s+following(?!\s+(?:passage|comprehension|story))|Choose\s+the\s+(?:word|option|group|interpretation|phrase|correct|alternative)|Select\s+the\s+(?:word|option|interpretation|correct|alternative)|Fill\s+in\s+the\s+(?:gap|blank)s?|Complete\s+the\s+following|After\s+each\s+(?:sentence|question))\b/i;

const SECTION_OR_INSTR_LINE_RE = /^(?!\s*\d+[\.\)])\s*(?:(?:<[^>]+>)*\s*(?:(?:SECTION|PART)\s+[A-Za-z0-9]+|(?:INSTRUCTION|INSTRUCTIONS|DIRECTION|DIRECTIONS|NOTE|GUIDELINE|GUIDELINES)\b|From\s+the\s+(?:words?|options?|phrases?|alternatives?|word\s+to\s+group|word\s+or\s+group)\b|In\s+each\s+of\s+the|In\s+questions?\b|In\s+the\s+following|Choose\s+the\s+(?:word|option|group|interpretation|phrase|correct|alternative)|Select\s+the\s+(?:word|option|interpretation|correct|alternative)|Fill\s+in\s+the\s+(?:gap|blank)s?|Complete\s+the\s+following|After\s+each\s+(?:sentence|question)|\[?(?:Read\s+(?:the\s+)?(?:following\s+)?passage|PASSAGE|Passage)|Questions?\s+(?:to|on|for|under|based\s+on)\s+(?:the\s+)?passage|Questions?\s+\d+\s*(?:to|-|–|through)\s*\d+|Answer\s+questions?\s+\d+|LEXIS|STRUCTURE|GRAMMAR|VOCABULARY|ORAL\s+ENGLISH|SPEECH|ANTONYMS|SYNONYMS)|(?:[A-E]\s+){3,}[A-E]|\(?A\)?\s+\(?B\)?\s+\(?C\)?\s+\(?D\)?)\b/i;

/**
 * Checks if a question number falls within the active passage scope.
 */
function isQuestionInPassageScope(qNumber, context) {
    if (!context || !context.activePassage) return false;
    const scope = context.passageScope;
    if (!scope) return true;

    if (qNumber === null || qNumber === undefined) return true;

    if (scope.minQ !== null && scope.minQ !== undefined && qNumber < scope.minQ) {
        return false;
    }
    if (scope.maxQ !== null && scope.maxQ !== undefined && qNumber > scope.maxQ) {
        return false;
    }
    return true;
}

/**
 * Splits a text block containing both an instruction directive and a passage narrative.
 * Reliably separates at keywords like "Passage", "<b>Passage</b>", "PASSAGE", "Read the following passage".
 */
function splitInstructionAndPassage(text) {
    if (!text || typeof text !== 'string') return { instruction: '', passage: '' };

    const cleanStr = text.trim();
    if (!cleanStr) return { instruction: '', passage: '' };

    // 1. Check for HTML-tagged or bracketed passage headers:
    // e.g. "<b>Passage</b>", "<strong>PASSAGE</strong>", "[PASSAGE]"
    const tagMatch = cleanStr.match(/(?:<[a-z0-9]+[^>]*>\s*)*\[?\b(?:PASSAGE|Passage)(?:\s+[A-Za-z0-9]+)?\s*[:.\-]?\]?(?:\s*<\/[a-z0-9]+>)+/i);
    if (tagMatch && tagMatch.index !== undefined && tagMatch.index > 0) {
        const idx = tagMatch.index;
        const matchLen = tagMatch[0].length;
        const instr = cleanStr.substring(0, idx).trim();
        const pass = cleanStr.substring(idx + matchLen).replace(/^[:.\-\s]+/, '').trim();
        return { instruction: instr, passage: pass };
    }

    // 2. Check for sentence-ending boundary followed by Passage header keyword:
    // e.g. "...in the passages. Passage The first modern..." or "...A – D. PASSAGE Technology..."
    const sentenceMatch = cleanStr.match(/([.?!;:]|\))\s+(?:<[^>]+>)*\s*\[?\b(?:PASSAGE|Passage)(?:\s+[A-Za-z0-9]+)?\s*[:.\-]?\]?(?:<\/[^>]+>)*\s+/i);
    if (sentenceMatch && sentenceMatch.index !== undefined) {
        const splitPos = sentenceMatch.index + sentenceMatch[1].length;
        const instr = cleanStr.substring(0, splitPos).trim();
        const passStart = sentenceMatch.index + sentenceMatch[0].length;
        const pass = cleanStr.substring(passStart).replace(/^[:.\-\s]+/, '').trim();
        return { instruction: instr, passage: pass };
    }

    // 3. Check for standalone PASSAGE header or "Read the following passage" line within text
    const lineMatch = cleanStr.match(/(?:^|\n)\s*(?:<[^>]+>)*\s*\[?(?:Read\s+the\s+(?:following\s+)?passage|PASSAGE(?:\s+[A-Za-z0-9]+)?|Passage(?:\s+[A-Za-z0-9]+)?)\s*[:.\-]?\]?(?:<\/[^>]+>)*\s*/i);
    if (lineMatch && lineMatch.index !== undefined && lineMatch.index > 0) {
        const instr = cleanStr.substring(0, lineMatch.index).trim();
        const passStart = lineMatch.index + lineMatch[0].length;
        const pass = cleanStr.substring(passStart).replace(/^[:.\-\s]+/, '').trim();
        return { instruction: instr, passage: pass };
    }

    return { instruction: cleanStr, passage: '' };
}

/**
 * Finds all question start boundaries across the document string.
 * Recognizes boundaries at line starts, after whitespace, or between questions.
 * Safely ignores numbers inside math equations ($...$).
 */
function findQuestionBoundaries(text) {
    const boundaries = [];
    const boundaryRe = /(?:^|\r?\n|\r)[^\S\r\n]*(\d{1,3})[\.\)][^\S\r\n]*/g;
    let m;
    while ((m = boundaryRe.exec(text)) !== null) {
        const matchFull = m[0];
        const numStr = m[1];
        const numOffset = m.index + matchFull.indexOf(numStr);

        // Ensure not inside KaTeX math equation
        if (isInsideMath(text, numOffset)) {
            continue;
        }

        // Ignore numbers inside instructions/directives (e.g. "questions 10 to 12.", "nos. 1 to 5")
        const precedingSlice = text.slice(Math.max(0, numOffset - 25), numOffset);
        if (/(?:questions?|no\.?|nos\.?|to|-|through)\s*$/i.test(precedingSlice)) {
            continue;
        }

        const qNum = parseInt(numStr, 10);
        if (isNaN(qNum) || qNum <= 0) continue;

        boundaries.push({
            qNum: qNum,
            matchStart: numOffset,
            contentStart: m.index + matchFull.length,
        });
    }

    return boundaries;
}

/**
 * Separates trailing section headers / instructions from the end of a question block.
 */
function extractTrailingPreamble(rawBlockText) {
    if (!rawBlockText) return { questionBlockText: '', trailingPreamble: null };

    const lines = rawBlockText.split('\n');
    let splitIndex = -1;
    let hasSeenOptions = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (STACKED_OPTION_RE.test(line) || /(?:^|[\s\t]+)[A-Ba-b][\.\):\-]\s+/.test(line)) {
            hasSeenOptions = true;
        }

        if (hasSeenOptions && i > 0 && SECTION_OR_INSTR_LINE_RE.test(line)) {
            splitIndex = i;
            break;
        }
    }

    if (splitIndex !== -1) {
        const questionBlockText = lines.slice(0, splitIndex).join('\n').trim();
        const trailingPreamble = lines.slice(splitIndex).join('\n').trim();
        return { questionBlockText, trailingPreamble };
    }

    return { questionBlockText: rawBlockText.trim(), trailingPreamble: null };
}

/**
 * Updates context ({ activeSection, activeInstruction, activePassage, passageScope, currentPassageLabel }) from a preamble text.
 */
function parsePreamble(preambleText, context, sectionsDetected = []) {
    if (!preambleText || typeof preambleText !== 'string') return context;

    const lines = preambleText.split('\n').map(l => l.trim()).filter(Boolean);
    let readingPassage = false;
    let readingInstruction = false;
    let instructionLines = [];
    let passageLines = [];

    for (const line of lines) {
        // 0. Skip Document Header Metadata (School name, Subject, Class, Term, Exam Type)
        const cleanText = cleanPreambleLine(line);
        if (!cleanText) {
            continue;
        }

        // 1. Check for Matrix Header (A B C D E or tabbed columns)
        if (/^\s*(?:(?:[A-E]\s+){3,}[A-E]|[A-E](?:\t+[A-E]){3,}|\(?A\)?\s+\(?B\)?\s+\(?C\)?\s+\(?D\)?(?:\s+\(?E\)?)?)\s*$/i.test(line)) {
            readingInstruction = false;
            readingPassage = false;
            continue;
        }

        // 2. Check for section header (e.g. SECTION 1, PART A, SECTION B)
        const sectionMatch = line.match(SECTION_HEADER_RE);
        if (sectionMatch) {
            context.activeSection = line.replace(/<[^>]+>/g, '').trim();
            if (!sectionsDetected.includes(context.activeSection)) {
                sectionsDetected.push(context.activeSection);
            }
            context.activeInstruction = null;
            context.activePassage = null;
            context.currentPassageLabel = null;
            context.passageScope = null;
            readingInstruction = false;
            readingPassage = false;
            instructionLines = [];
            passageLines = [];
            continue;
        }

        // 3. Non-Comprehension Section Marker (LEXIS, STRUCTURE, GRAMMAR, etc.)
        if (NON_COMPREHENSION_HEADER_RE.test(line)) {
            context.activeSection = line.replace(/<[^>]+>/g, '').trim();
            if (!sectionsDetected.includes(context.activeSection)) {
                sectionsDetected.push(context.activeSection);
            }
            context.activeInstruction = null;
            context.activePassage = null;
            context.currentPassageLabel = null;
            context.passageScope = null;
            readingInstruction = false;
            readingPassage = false;
            instructionLines = [];
            passageLines = [];
            continue;
        }

        // 4. Passage Target Anchor ("Questions to passage 1", "Questions 1 to 5", "Answer questions 1 - 5")
        const qToPassMatch = line.match(QUESTIONS_TO_PASSAGE_RE);
        if (qToPassMatch) {
            readingPassage = false;
            readingInstruction = false;
            const pLabel = qToPassMatch[1];
            const qMin = qToPassMatch[2] || qToPassMatch[4];
            const qMax = qToPassMatch[3] || qToPassMatch[5];
            if (qMin && qMax) {
                context.passageScope = {
                    minQ: parseInt(qMin, 10),
                    maxQ: parseInt(qMax, 10),
                    passageLabel: pLabel || context.currentPassageLabel || null,
                    explicitBinding: true,
                };
            } else if (pLabel) {
                context.passageScope = {
                    minQ: null,
                    maxQ: null,
                    passageLabel: pLabel,
                    explicitBinding: true,
                };
            }
            continue;
        }

        // 5. Check for inline Passage split inside the line: e.g. "In the following passage... <b>Passage</b> The first modern..."
        const inlineSplit = splitInstructionAndPassage(line);
        if (inlineSplit.passage) {
            if (inlineSplit.instruction) {
                instructionLines.push(inlineSplit.instruction);
            }
            passageLines.push(inlineSplit.passage);
            readingInstruction = false;
            readingPassage = true;
            continue;
        }

        // 6. Check for comprehension passage header line: e.g. "PASSAGE 1", "<b>Passage</b>", "Read the following passage:"
        if (PASSAGE_HEADER_RE.test(line)) {
            readingPassage = true;
            readingInstruction = false;
            context.activePassage = null;
            context.passageScope = null;
            const labelMatch = line.match(/PASSAGE(?:\s+([A-Za-z0-9]+))?/i);
            if (labelMatch && labelMatch[1]) {
                context.currentPassageLabel = labelMatch[1].trim();
            } else {
                context.currentPassageLabel = null;
            }
            const cleanPassageLine = line.replace(/^\s*(?:<[^>]+>)*\s*\[?(?:Read\s+(?:the\s+)?(?:following\s+)?passage(?:\s+carefully)?|PASSAGE(?:\s+[A-Za-z0-9]+)?|Passage(?:\s+[A-Za-z0-9]+)?)\s*[:.\-]?\]?\s*(?:<\/[^>]+>)*\s*/i, '').trim();
            if (cleanPassageLine) {
                passageLines.push(cleanPassageLine);
            }
            continue;
        }

        // 7. Check for explicit instruction line (INSTRUCTION: ...)
        const instrMatch = line.match(INSTRUCTION_RE);
        if (instrMatch) {
            const instrContent = instrMatch[1] ? instrMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            if (/passage|cloze|missing words|story/i.test(instrContent)) {
                readingInstruction = true;
                readingPassage = false;
                if (instrContent) {
                    instructionLines.push(instrContent);
                }
            } else {
                readingInstruction = true;
                readingPassage = false;
                context.activePassage = null;
                context.passageScope = null;
                context.currentPassageLabel = null;
                if (instrContent) {
                    instructionLines.push(instrContent);
                }
            }
            continue;
        }

        // 8. Check for standard Nigerian exam directives without "INSTRUCTION:" prefix
        if (DIRECTIVE_PREFIX_RE.test(line)) {
            readingInstruction = true;
            readingPassage = false;
            if (!/passage|cloze|missing words|story/i.test(line)) {
                context.activePassage = null;
                context.passageScope = null;
                context.currentPassageLabel = null;
            }
            const cleanDirective = line.replace(/<[^>]+>/g, '').trim();
            if (cleanDirective) {
                instructionLines.push(cleanDirective);
            }
            continue;
        }

        // Accumulate lines into active buffer
        if (readingPassage) {
            passageLines.push(line);
        } else {
            const cleanLine = line.replace(/<[^>]+>/g, '').trim();
            if (cleanLine) {
                instructionLines.push(cleanLine);
            }
        }
    }

    if (instructionLines.length > 0) {
        let joinedInstr = instructionLines.join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const postSplit = splitInstructionAndPassage(joinedInstr);
        if (postSplit.passage) {
            context.activeInstruction = postSplit.instruction;
            passageLines.unshift(postSplit.passage);
        } else {
            context.activeInstruction = joinedInstr;
        }
    }

    if (passageLines.length > 0) {
        let joinedPassage = passageLines.join(' ').trim();
        joinedPassage = joinedPassage
            .replace(/^\s*(?:<[^>]+>)*\s*\[?(?:Read\s+(?:the\s+)?(?:following\s+)?passage(?:\s+carefully)?|PASSAGE(?:\s+[A-Za-z0-9]+)?|Passage(?:\s+[A-Za-z0-9]+)?)\s*[:.\-]?\]?\s*(?:<\/[^>]+>)*\s*/i, '')
            .trim();
        const normPassage = normalizeClozeGaps(joinedPassage);
        context.activePassage = normPassage;
    }

    return context;
}

/**
 * Parses an individual question block string into structured stem, options, and answers.
 */
function parseQuestionBlock(blockText, qNumber, context = null) {
    if (!blockText || typeof blockText !== 'string') return null;

    let text = blockText.trim();
    if (!text) return null;

    // 1. Extract inline answer if present at the end or inside the block
    let inlineAnswer = null;
    const ansMatch = extractInlineAnswer(text);
    if (ansMatch) {
        inlineAnswer = ansMatch;
        if (TRAILING_OPTION_ANSWER_RE.test(text)) {
            text = text.replace(TRAILING_OPTION_ANSWER_RE, '').trim();
        } else {
            text = text.replace(INLINE_ANSWER_RE, '').trim();
        }
    }

    // 2. Tokenize candidate option keys A, B, C, D, E (requiring punctuation delimiter: ., ), :, -)
    const tokenRegex = /(?:^|\r?\n|\r|[\s\t]+|\()([A-Ea-e])(?:[\.\):\-]|(?<=\n|\r|^)[ \t]+(?=[A-Za-z0-9\$\\]))/g;
    const tokens = [];
    let m;

    while ((m = tokenRegex.exec(text)) !== null) {
        const letter = m[1].toUpperCase();
        const matchFull = m[0];
        const trimmedStart = matchFull.trimStart();
        let matchStart = m.index + matchFull.indexOf(m[1]);
        if (trimmedStart.startsWith('(')) {
            matchStart = m.index + matchFull.indexOf('(');
        }

        // Ensure not inside KaTeX math equation
        if (isInsideMath(text, matchStart)) {
            continue;
        }

        // Ensure character before match is valid boundary
        const prevChar = matchStart > 0 ? text[matchStart - 1] : '';
        if (prevChar && /[a-zA-Z0-9]/.test(prevChar) && !trimmedStart.startsWith('(')) {
            continue;
        }

        tokens.push({
            letter: letter,
            matchStart: matchStart,
            contentStart: m.index + matchFull.length,
        });
    }

    const candA = tokens.filter(t => t.letter === 'A');
    const candB = tokens.filter(t => t.letter === 'B');
    const candC = tokens.filter(t => t.letter === 'C');
    const candD = tokens.filter(t => t.letter === 'D');
    const candE = tokens.filter(t => t.letter === 'E');

    // ── CHECK FOR TABULAR / COLUMNAR CLOZE ROW ──
    if (tokens.length === 0) {
        const isClozeAllowed = context && (context.allowCloze === true || context.profileMode === 'english_languages');
        if (isClozeAllowed && !isHeaderMetadata(text)) {
            const isQuestionSentence = /^(?:Given|Evaluate|Solve|What|Which|Calculate|Find|Determine|How|Why|Where|When|If|State|Show|Prove|Let|In\s+the|For\s+what|An?\s+|The\s+)\b/i.test(text);
            if (!isQuestionSentence) {
                const clozeResult = parseClozeMatrixRow(text, qNumber, context);
                if (clozeResult) {
                    if (inlineAnswer) {
                        clozeResult.answer = inlineAnswer;
                    }
                    return clozeResult;
                }
            }
        }
        return null;
    }

    // ── STANDARD OR IMPLICIT OPTION A PARSING ──
    let tokenA = null;
    let tokenB = null;
    let tokenC = null;
    let tokenD = null;
    let tokenE = null;

    if (candB.length === 0) {
        return null;
    }

    if (candA.length > 0) {
        const firstB = candB[0];
        const validAs = candA.filter(a => a.matchStart < firstB.matchStart);
        if (validAs.length > 0) {
            tokenA = validAs[validAs.length - 1];
            tokenB = firstB;
        }
    }

    if (!tokenA && candB.length > 0 && candC.length > 0) {
        // Implicit Option A case (e.g. "...activities. decrees B. rules C. edicts D. constitution E. ordinance")
        tokenB = candB[0];
    }

    if (!tokenB) {
        return null;
    }

    if (candC.length > 0) {
        const firstC = candC.find(c => c.matchStart > tokenB.contentStart);
        if (firstC) {
            tokenC = firstC;
        }
    }

    const prevToken = tokenC || tokenB;
    if (prevToken && candD.length > 0) {
        const validDs = candD.filter(d => d.matchStart > prevToken.contentStart);
        if (validDs.length > 0) {
            tokenD = validDs[0];
        }
    }

    if (tokenD && candE.length > 0) {
        const validEs = candE.filter(e => e.matchStart > tokenD.contentStart);
        if (validEs.length > 0) {
            tokenE = validEs[0];
        }
    }

    let stem = '';
    let option_a = '';
    let option_b = '';
    let option_c = '';
    let option_d = '';
    let option_e = '';

    if (tokenA) {
        stem = text.substring(0, tokenA.matchStart).trim();
        option_a = text.substring(tokenA.contentStart, tokenB.matchStart).trim();
    } else {
        // Implicit Option A
        const preBText = text.substring(0, tokenB.matchStart).trim();
        const punctMatches = [...preBText.matchAll(/([.?!;:]|_+(?:\s*\d+\s*_+)?)[ \t]+/g)];
        if (punctMatches.length > 0) {
            const lastPunct = punctMatches[punctMatches.length - 1];
            const splitIdx = lastPunct.index + lastPunct[0].length;
            stem = preBText.substring(0, splitIdx).trim();
            option_a = preBText.substring(splitIdx).trim();
        } else {
            const lastSpaceIdx = preBText.lastIndexOf(' ');
            if (lastSpaceIdx !== -1) {
                stem = preBText.substring(0, lastSpaceIdx).trim();
                option_a = preBText.substring(lastSpaceIdx + 1).trim();
            } else {
                stem = preBText;
                option_a = preBText;
            }
        }
    }

    if (tokenC) {
        option_b = text.substring(tokenB.contentStart, tokenC.matchStart).trim();
        if (tokenD) {
            option_c = text.substring(tokenC.contentStart, tokenD.matchStart).trim();
            if (tokenE) {
                option_d = text.substring(tokenD.contentStart, tokenE.matchStart).trim();
                option_e = text.substring(tokenE.contentStart).trim();
            } else {
                option_d = text.substring(tokenD.contentStart).trim();
            }
        } else {
            option_c = text.substring(tokenC.contentStart).trim();
        }
    } else {
        option_b = text.substring(tokenB.contentStart).trim();
    }

    if (!option_a || !option_b) {
        return null;
    }

    const optionsObj = { A: option_a, B: option_b, C: option_c, D: option_d };
    if (option_e) optionsObj.E = option_e;

    // Check for inline answer inside option strings
    if (!inlineAnswer) {
        for (const key of ['E', 'D', 'C', 'B', 'A']) {
            if (optionsObj[key]) {
                const holder = {};
                const cleaned = extractAndStripOptionAnswer(optionsObj[key], holder);
                if (holder.correct_option) {
                    inlineAnswer = holder.correct_option;
                    optionsObj[key] = cleaned;
                    break;
                }
                const ans = extractInlineAnswer(optionsObj[key]);
                if (ans) {
                    inlineAnswer = ans;
                    optionsObj[key] = optionsObj[key].replace(INLINE_ANSWER_RE, '').trim();
                    break;
                }
            }
        }
    }

    // Clean any residual trailing answer keys or markers from all options
    for (const key of ['E', 'D', 'C', 'B', 'A']) {
        if (optionsObj[key]) {
            optionsObj[key] = extractAndStripOptionAnswer(optionsObj[key])
                .replace(INLINE_ANSWER_RE, '')
                .trim();
        }
    }

    const isInsidePassageScope = isQuestionInPassageScope(qNumber, context);
    const effectivePassage = (context && context.activePassage && isInsidePassageScope) ? context.activePassage.trim() : null;

    const cleanStem = (stem || '')
        .replace(/\[PASSAGE:\s*([\s\S]*?)\]/g, '')
        .replace(/\[INSTRUCTION:\s*([\s\S]*?)\]/g, '')
        .trim();

    // Apply active instruction / passage prefixes to stem
    if (effectivePassage && !stem.includes('[PASSAGE:')) {
        stem = `[PASSAGE: ${effectivePassage}] ${stem}`;
    }
    if (context && context.activeInstruction && !stem.includes('[INSTRUCTION:')) {
        stem = `[INSTRUCTION: ${context.activeInstruction}] ${stem}`;
    }

    const question = {
        number: qNumber,
        stem: stem,
        question_text: stem,
        clean_stem: cleanStem,
        instruction: (context && context.activeInstruction) ? context.activeInstruction.trim() : null,
        passage: effectivePassage,
        passage_text: effectivePassage,
        options: optionsObj,
        answer: inlineAnswer || null,
        correct_answer: inlineAnswer || null,
        correct_option: inlineAnswer || null,
        diagram_image_url: null,
        section: (context && context.activeSection) || null,
    };

    return question;
}

/**
 * Parses raw text lines using deterministic state machine.
 */
function parseLines(lines, imageBindings = new Map(), initialBlockAnswers = new Map(), diagramCtx = null) {
    const questions = [];
    const warnings = [];
    const sectionsDetected = [];
    const ctx = diagramCtx || createDiagramContext();

    let currentQuestion = null;
    let activeSection = null;
    let activeInstruction = null;
    let activePassage = null;
    let passageScope = null;
    let instructionLines = [];
    let passageLines = [];
    let answerBlockLines = [];
    let answerBlockAnswers = new Map(initialBlockAnswers);
    let isInAnswerBlock = false;
    let nextAutoNumber = 1;

    function finalizeQuestion() {
        if (!currentQuestion) return;

        currentQuestion.stem = (currentQuestion.stem || '').trim();
        if (!currentQuestion.stem) {
            currentQuestion = null;
            return;
        }

        const isInsidePassageScope = isQuestionInPassageScope(currentQuestion.number, { activePassage, passageScope });
        const effectivePassage = (activePassage && isInsidePassageScope) ? activePassage.trim() : null;

        if (activeInstruction && !currentQuestion.stem.includes('[INSTRUCTION:')) {
            currentQuestion.stem = `[INSTRUCTION: ${activeInstruction}] ${currentQuestion.stem}`;
        }
        if (effectivePassage && !currentQuestion.stem.includes('[PASSAGE:')) {
            currentQuestion.stem = `[PASSAGE: ${effectivePassage}] ${currentQuestion.stem}`;
        }
        currentQuestion.question_text = currentQuestion.stem;
        currentQuestion.instruction = activeInstruction ? activeInstruction.trim() : null;
        currentQuestion.passage = effectivePassage;
        currentQuestion.passage_text = effectivePassage;
        currentQuestion.clean_stem = (currentQuestion.stem || '')
            .replace(/\[PASSAGE:\s*([\s\S]*?)\]/g, '')
            .replace(/\[INSTRUCTION:\s*([\s\S]*?)\]/g, '')
            .trim();

        if (!currentQuestion.options.A || !currentQuestion.options.B) {
            currentQuestion = null;
            return;
        }

        if (!currentQuestion.number) {
            currentQuestion.number = nextAutoNumber++;
        } else {
            nextAutoNumber = Math.max(nextAutoNumber, currentQuestion.number + 1);
        }

        if (activeSection && !currentQuestion.section) {
            currentQuestion.section = activeSection;
        }

        if (currentQuestion.answer) {
            currentQuestion.correct_answer = currentQuestion.answer;
            currentQuestion.correct_option = currentQuestion.answer;
        }

        ctx.bindDiagramForQuestion(currentQuestion, currentQuestion.number, currentQuestion.diagram_image_url || null);
        questions.push(currentQuestion);
        currentQuestion = null;
    }

    function createQuestion(number, stemText) {
        return {
            number: number || null,
            stem: stemText || '',
            options: {},
            answer: null,
            correct_answer: null,
            correct_option: null,
            diagram_image_url: null,
            section: activeSection || null,
        };
    }

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        if (!line) continue;

        ctx.checkMultiQuestionDirective(line);

        if (ANSWER_BLOCK_HEADER_RE.test(line)) {
            finalizeQuestion();
            isInAnswerBlock = true;
            continue;
        }

        if (isInAnswerBlock) {
            answerBlockLines.push(line);
            continue;
        }

        // Section Header
        const sectionMatch = line.match(SECTION_HEADER_RE);
        if (sectionMatch) {
            finalizeQuestion();
            activeSection = line;
            if (!sectionsDetected.includes(line)) {
                sectionsDetected.push(line);
            }
            activeInstruction = null;
            activePassage = null;
            passageScope = null;
            instructionLines = [];
            passageLines = [];
            continue;
        }

        // Non-Comprehension Section Marker
        if (NON_COMPREHENSION_HEADER_RE.test(line)) {
            finalizeQuestion();
            activeSection = line;
            if (!sectionsDetected.includes(line)) {
                sectionsDetected.push(line);
            }
            activeInstruction = null;
            activePassage = null;
            passageScope = null;
            instructionLines = [];
            passageLines = [];
            continue;
        }

        // Standalone inline answer line
        if (currentQuestion) {
            const standaloneAns = extractInlineAnswer(line);
            if (standaloneAns && line.length < 40) {
                currentQuestion.answer = standaloneAns;
                currentQuestion.correct_answer = standaloneAns;
                currentQuestion.correct_option = standaloneAns;
                continue;
            }
        }

        // Stacked option line (A. Option 1)
        const optMatch = line.match(STACKED_OPTION_RE);
        if (optMatch) {
            if (!currentQuestion) {
                currentQuestion = createQuestion(null, '');
            }
            const letter = optMatch[1].toUpperCase();
            let optText = optMatch[2].trim();

            optText = extractAndStripOptionAnswer(optText, currentQuestion);

            currentQuestion.options[letter] = optText;
            if (imageBindings.has(i)) {
                currentQuestion.diagram_image_url = imageBindings.get(i);
            }
            continue;
        }

        // Numbered Line (1. ...)
        const qNumMatch = line.match(QUESTION_NUMBER_RE);
        if (qNumMatch) {
            finalizeQuestion();
            const qNum = parseInt(qNumMatch[1], 10);
            const remainder = line.substring(qNumMatch[0].length).trim();
            currentQuestion = createQuestion(qNum, remainder);
            if (imageBindings.has(i)) {
                currentQuestion.diagram_image_url = imageBindings.get(i);
            }
            continue;
        }

        // Unnumbered question continuation or stem
        if (currentQuestion && Object.keys(currentQuestion.options).length > 0 && currentQuestion.options.A && currentQuestion.options.B) {
            finalizeQuestion();
            currentQuestion = createQuestion(null, line);
            if (imageBindings.has(i)) {
                currentQuestion.diagram_image_url = imageBindings.get(i);
            }
            continue;
        }

        if (currentQuestion) {
            currentQuestion.stem += (currentQuestion.stem ? ' ' : '') + line;
            if (imageBindings.has(i)) {
                currentQuestion.diagram_image_url = imageBindings.get(i);
            }
        } else {
            currentQuestion = createQuestion(null, line);
            if (imageBindings.has(i)) {
                currentQuestion.diagram_image_url = imageBindings.get(i);
            }
        }
    }

    finalizeQuestion();

    if (answerBlockLines.length > 0) {
        const parsedBlock = parseAnswerBlock(answerBlockLines);
        for (const [k, v] of parsedBlock) {
            answerBlockAnswers.set(k, v);
        }
    }

    return {
        questions,
        answerBlockAnswers,
        sectionsDetected,
        warnings,
    };
}

/**
 * Document-level parser coordinating sections, instructions, passages,
 * boundaries, answer blocks, and diagram bindings.
 */
function parseDocument(rawText, imageBindings = new Map(), lineOffsets = [], diagramCtx = null, options = {}) {
    if (!rawText || typeof rawText !== 'string') {
        return {
            questions: [],
            answerBlockAnswers: new Map(),
            sectionsDetected: [],
            warnings: ['Empty document text.'],
        };
    }

    const ctx = diagramCtx || createDiagramContext();
    const sanitizedText = sanitizeDocumentText(rawText, options);
    const sectionsDetected = [];
    const warnings = [];

    // Extract bottom answer block before question splitting
    let workingText = sanitizedText;
    let answerBlockAnswers = new Map();

    const answerBlockHeaderMatch = workingText.match(/^\s*(?:ANSWERS(?:\s*KEY)?|ANSWER\s+KEY|KEY|MARKING\s*(?:GUIDE|SCHEME))\s*[:=\-]?\s*$/im);
    if (answerBlockHeaderMatch) {
        const headerIdx = answerBlockHeaderMatch.index;
        const answerBlockText = workingText.substring(headerIdx);
        workingText = workingText.substring(0, headerIdx).trim();

        const answerLines = answerBlockText.split('\n');
        answerBlockAnswers = parseAnswerBlock(answerLines);
    }

    const boundaries = findQuestionBoundaries(workingText);
    let questions = [];

    if (boundaries.length > 0) {
        let currentContext = {
            activeSection: null,
            activeInstruction: null,
            activePassage: null,
            allowCloze: options.allowCloze !== undefined ? options.allowCloze : (options.profileMode === 'english_languages'),
            profileMode: options.profileMode || 'standard_general',
        };

        let nextAutoNum = 1;

        // Process leading preamble before Question 1
        const leadingPreamble = workingText.substring(0, boundaries[0].matchStart).trim();
        if (leadingPreamble) {
            ctx.checkMultiQuestionDirective(leadingPreamble);

            if (boundaries[0].qNum === 1) {
                currentContext = parsePreamble(leadingPreamble, currentContext, sectionsDetected);
            } else {
                const preLines = leadingPreamble.split('\n').map(l => l.trim()).filter(Boolean);
                let currentPre = [];
                for (let i = 0; i < preLines.length; i++) {
                    const line = preLines[i];
                    if (isHeaderMetadata(line)) {
                        continue;
                    }
                    if (SECTION_OR_INSTR_LINE_RE.test(line)) {
                        currentPre.push(line);
                    } else {
                        const tempContext = currentPre.length > 0
                            ? parsePreamble(currentPre.join('\n'), { ...currentContext }, [])
                            : currentContext;
                        const qObj = parseQuestionBlock(line, nextAutoNum, tempContext);
                        if (qObj && qObj.options && qObj.options.A && qObj.options.B) {
                            if (currentPre.length > 0) {
                                currentContext = parsePreamble(currentPre.join('\n'), currentContext, sectionsDetected);
                                currentPre = [];
                            }
                            nextAutoNum++;
                            ctx.bindDiagramForQuestion(qObj, qObj.number, null);
                            questions.push(qObj);
                        } else {
                            currentPre.push(line);
                        }
                    }
                }
                if (currentPre.length > 0) {
                    currentContext = parsePreamble(currentPre.join('\n'), currentContext, sectionsDetected);
                }
            }
        }

        // Process each segmented question block
        for (let i = 0; i < boundaries.length; i++) {
            const b = boundaries[i];
            const nextB = i + 1 < boundaries.length ? boundaries[i + 1] : null;

            const rawBlockText = nextB
                ? workingText.substring(b.contentStart, nextB.matchStart)
                : workingText.substring(b.contentStart);

            const { questionBlockText, trailingPreamble } = extractTrailingPreamble(rawBlockText);
            
            // Check if questionBlockText contains multiple unnumbered questions
            const qLines = questionBlockText.split('\n').map(l => l.trim()).filter(Boolean);
            if (qLines.length > 1) {
                // First question is b.qNum
                let mainQLines = [];
                let inFirstQ = true;
                for (let k = 0; k < qLines.length; k++) {
                    const ql = qLines[k];
                    if (inFirstQ) {
                        mainQLines.push(ql);
                        const qObj = parseQuestionBlock(mainQLines.join('\n'), b.qNum, currentContext);
                        if (qObj && qObj.options && qObj.options.A && qObj.options.B) {
                            const nextQl = k + 1 < qLines.length ? qLines[k + 1] : '';
                            if (!nextQl || parseQuestionBlock(nextQl, nextAutoNum, currentContext)) {
                                nextAutoNum = Math.max(nextAutoNum, b.qNum + 1);
                                ctx.bindDiagramForQuestion(qObj, b.qNum, null);
                                questions.push(qObj);
                                inFirstQ = false;
                            }
                        }
                    } else {
                        const subQObj = parseQuestionBlock(ql, nextAutoNum, currentContext);
                        if (subQObj && subQObj.options && subQObj.options.A && subQObj.options.B) {
                            nextAutoNum++;
                            ctx.bindDiagramForQuestion(subQObj, subQObj.number, null);
                            questions.push(subQObj);
                        }
                    }
                }
                if (inFirstQ && mainQLines.length > 0) {
                    const qObj = parseQuestionBlock(mainQLines.join('\n'), b.qNum, currentContext);
                    if (qObj) {
                        nextAutoNum = Math.max(nextAutoNum, b.qNum + 1);
                        ctx.bindDiagramForQuestion(qObj, b.qNum, null);
                        questions.push(qObj);
                    }
                }
            } else {
                const qObj = parseQuestionBlock(questionBlockText, b.qNum, currentContext);
                if (qObj) {
                    nextAutoNum = Math.max(nextAutoNum, b.qNum + 1);
                    ctx.bindDiagramForQuestion(qObj, b.qNum, null);
                    questions.push(qObj);
                } else {
                    warnings.push(`Could not parse question block for Question ${b.qNum}`);
                }
            }

            if (trailingPreamble) {
                ctx.checkMultiQuestionDirective(trailingPreamble);
                currentContext = parsePreamble(trailingPreamble, currentContext, sectionsDetected);
            }
        }
    } else {
        // Fallback: Check if document is Aiken format or unnumbered single-line
        const lines = workingText.split('\n').map(l => l.trim()).filter(Boolean);
        const hasStacked = lines.some(l => STACKED_OPTION_RE.test(l));

        if (hasStacked) {
            const lineRes = parseLines(lines, imageBindings, answerBlockAnswers, ctx);
            questions = lineRes.questions;
            if (lineRes.answerBlockAnswers.size > 0) {
                for (const [k, v] of lineRes.answerBlockAnswers) {
                    answerBlockAnswers.set(k, v);
                }
            }
            sectionsDetected.push(...lineRes.sectionsDetected);
        } else {
            let nextAutoNum = 1;
            let currentContext = {
                activeSection: null,
                activeInstruction: null,
                activePassage: null,
                allowCloze: options.allowCloze !== undefined ? options.allowCloze : (options.profileMode === 'english_languages'),
                profileMode: options.profileMode || 'standard_general',
            };

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (isHeaderMetadata(line)) {
                    continue;
                }
                ctx.checkMultiQuestionDirective(line);

                if (SECTION_OR_INSTR_LINE_RE.test(line)) {
                    currentContext = parsePreamble(line, currentContext, sectionsDetected);
                } else {
                    const qObj = parseQuestionBlock(line, nextAutoNum, currentContext);
                    if (qObj && qObj.options && qObj.options.A && qObj.options.B) {
                        nextAutoNum++;
                        ctx.bindDiagramForQuestion(qObj, qObj.number, imageBindings.get(i) || null);
                        questions.push(qObj);
                    }
                }
            }
        }
    }

    return {
        questions,
        answerBlockAnswers,
        sectionsDetected,
        warnings,
    };
}

/**
 * Parses a tabular cloze row (e.g. "75) animal human mammal mortal primate")
 */
function parseClozeMatrixRow(line, qNumber = null, context = null) {
    if (!line || typeof line !== 'string') return null;
    if (context && context.allowCloze === false) return null;
    if (context && context.profileMode && context.profileMode !== 'english_languages') return null;
    if (isHeaderMetadata(line)) return null;
    const text = line.trim();
    if (!text) return null;

    let targetNum = qNumber;
    const colTokens = text.split(/\t+|\s{2,}/).map(t => t.trim()).filter(Boolean);

    // If first token starts with row label e.g. "75)" or "75." or "75"
    if (colTokens.length > 0 && /^\d+[\.\)]?$/.test(colTokens[0])) {
        targetNum = parseInt(colTokens[0], 10);
        colTokens.shift();
    } else if (colTokens.length > 0 && /^\d+[\.\)]/.test(colTokens[0])) {
        const m = colTokens[0].match(/^(\d+)[\.\)]/);
        if (m) {
            targetNum = parseInt(m[1], 10);
            const rest = colTokens[0].substring(m[0].length).trim();
            if (rest) {
                colTokens[0] = rest;
            } else {
                colTokens.shift();
            }
        }
    }

    if (colTokens.length >= 4 && colTokens.length <= 6 && colTokens.every(t => t.length < 50)) {
        const isInsidePassageScope = isQuestionInPassageScope(targetNum, context);
        const effectivePassage = (context && context.activePassage && isInsidePassageScope) ? context.activePassage.trim() : null;

        let cleanStem = `Choose the most appropriate word for gap (${targetNum || 1})`;
        let stem = cleanStem;
        if (effectivePassage && !stem.includes('[PASSAGE:')) {
            stem = `[PASSAGE: ${effectivePassage}] ${stem}`;
        }
        if (context && context.activeInstruction && !stem.includes('[INSTRUCTION:')) {
            stem = `[INSTRUCTION: ${context.activeInstruction}] ${stem}`;
        }

        const optionsObj = {
            A: colTokens[0] || '',
            B: colTokens[1] || '',
            C: colTokens[2] || '',
            D: colTokens[3] || '',
        };
        if (colTokens.length >= 5) {
            optionsObj.E = colTokens[4];
        }

        return {
            number: targetNum,
            stem: stem,
            question_text: stem,
            clean_stem: cleanStem,
            instruction: (context && context.activeInstruction) ? context.activeInstruction.trim() : null,
            passage: effectivePassage,
            passage_text: effectivePassage,
            options: optionsObj,
            answer: null,
            diagram_image_url: null,
            section: (context && context.activeSection) || null,
        };
    }
    return null;
}

module.exports = {
    cleanPreambleLine,
    DOCUMENT_HEADER_REGEX,
    findQuestionBoundaries,
    extractTrailingPreamble,
    parsePreamble,
    parseQuestionBlock,
    parseClozeMatrixRow,
    parseLines,
    parseDocument,
};
