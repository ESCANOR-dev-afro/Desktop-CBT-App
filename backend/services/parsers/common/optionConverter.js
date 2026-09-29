/**
 * optionConverter.js
 *
 * Option tokenization, answer extraction, and 5-to-4 option normalization for DOCX parsers.
 * 100% Offline — Node.js native.
 */

const { isInsideMath } = require('./mathOmmlConverter');

/**
 * Question number boundary detector.
 * Matches: "1.", "1)", "01.", "  1. ", etc.
 */
const QUESTION_NUMBER_RE = /^\s*(?:<[^>]+>)*\s*(\d{1,3})\s*(?:<\/[^>]+>)*[.)]\s*/;

/**
 * Capital-letter-safe stacked option detector.
 */
const STACKED_OPTION_RE = /^\s*(?:<[^>]+>)*\s*\(?([A-Ea-e])\)?(?:<\/[^>]+>)*[.):\-]\s+(.+)/;

/**
 * Capital-letter-safe inline option splitter.
 */
const INLINE_OPTIONS_RE = /(?:^|(?<=\s)|\()([A-Ea-e])[.):\-]\s+([\s\S]+?)(?=(?:\s|\()[A-Ea-e][.):\-]\s|$)/gi;

/**
 * Inline answer key detector (per-question).
 * Matches: "Ans: B", "Answer: C", "ANSWER = A", "ANS - D", "Ans B", "(Ans: A)", "[Ans: B]", "KEY: B"
 */
const INLINE_ANSWER_RE = /(?:\[|\(|\s)*(?:Ans(?:wer)?|ANSWER|ANS|Key|KEY)\s*[:=\.\s\-]+\(?([A-Ea-e])\)?(?!\w)(?:\)|\])*/i;

/**
 * Trailing option answer key detector (e.g. "D. 1675m Ans C", "D. None [Ans: B]", "D. were Ans D", "D. controversial Key C").
 * Matches trailing answer keys attached to the end of option text (A-E).
 */
const TRAILING_ANS_REGEX = /(?:\[|\(|\s)*(?:Ans(?:wer)?|Answer|Ans|Key|ANS|ANSWER|KEY)\s*[:\.\s=\-]+\(?([A-Ea-e])\)?(?:\b|\)|\])*\s*$/i;
const TRAILING_OPTION_ANSWER_RE = TRAILING_ANS_REGEX;

/**
 * Extracts and strips trailing option answer key from option text.
 * Assigns correct_option, correct_answer, answer, and has_answer on questionObj if matched.
 */
function extractAndStripOptionAnswer(optionText, questionObj = null) {
    if (!optionText || typeof optionText !== 'string') return '';
    const match = optionText.match(TRAILING_ANS_REGEX);
    if (match) {
        const key = match[1].toUpperCase();
        if (questionObj) {
            questionObj.correct_option = key;
            questionObj.correct_answer = key;
            questionObj.answer = key;
            questionObj.has_answer = true;
        }
        return optionText.replace(TRAILING_ANS_REGEX, '').trim();
    }
    return optionText.trim();
}

/**
 * Bottom-block answer key section header.
 * Matches: "ANSWERS:", "ANSWER KEY", "KEY:", "MARKING GUIDE", "MARKING SCHEME"
 */
const ANSWER_BLOCK_HEADER_RE = /^\s*(?:ANSWERS(?:\s*KEY)?|ANSWER\s+KEY|KEY|MARKING\s*(?:GUIDE|SCHEME))\s*[:=\-]?\s*$/i;

/**
 * Individual answer entry in a bottom-block answer key.
 * Matches: "1. A", "2) C", "3: B", "4-D", "5.A"
 */
const ANSWER_ENTRY_RE = /(\d{1,3})\s*[.):\-]\s*\(?([A-Ea-e])\)?/gi;

/**
 * Checks if a line matches the inline answer pattern and extracts the letter.
 * Returns the uppercase letter (A–E) or null.
 */
function extractInlineAnswer(text) {
    if (!text) return null;
    const trailingMatch = text.match(TRAILING_OPTION_ANSWER_RE);
    if (trailingMatch) {
        return trailingMatch[1].toUpperCase();
    }
    const match = text.match(INLINE_ANSWER_RE);
    if (match) {
        return match[1].toUpperCase();
    }
    return null;
}

/**
 * Extracts inline options from a single line containing all options.
 * Returns a Map of { letter → text } or null if no inline options found.
 */
function extractInlineOptions(text) {
    if (!text) return null;

    const options = new Map();
    let match;

    INLINE_OPTIONS_RE.lastIndex = 0;
    while ((match = INLINE_OPTIONS_RE.exec(text)) !== null) {
        const letter = match[1].toUpperCase();
        const optText = match[2].trim();
        if (optText) {
            options.set(letter, optText);
        }
    }

    if (options.has('A') && options.has('B')) {
        return options;
    }
    return null;
}

/**
 * Parses a single question block's text into structured stem, options, and answer.
 */
function parseQuestionBlock(blockText, qNumber = null, context = null) {
    if (!blockText || typeof blockText !== 'string') return null;

    let text = blockText.trim();
    if (!text) return null;

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

    // Tokenize candidate option keys A, B, C, D, E (with punctuation or whitespace delimiter)
    const tokenRegex = /(?<=^|\r?\n|\r|[\s\t(])([A-Ea-e])(?:([.):\-])|(?=[ \t]+[A-Za-z0-9\$\\\/\[\u0080-\uFFFFˈˌ_]))/gu;
    const tokens = [];
    let m;

    while ((m = tokenRegex.exec(text)) !== null) {
        const rawLetter = m[1];
        const letter = rawLetter.toUpperCase();
        const punct = m[2] || '';
        const hasPunct = !!punct;
        const isLowerNoPunct = (rawLetter >= 'a' && rawLetter <= 'e') && !hasPunct;

        // Skip standalone lowercase 'a' without punctuation inside sentences (English indefinite article)
        if (isLowerNoPunct && rawLetter === 'a') {
            continue;
        }

        const letterIdx = m.index;

        if (isInsideMath(text, letterIdx)) {
            continue;
        }

        let contentStart = letterIdx + m[0].length;
        while (contentStart < text.length && (text[contentStart] === ' ' || text[contentStart] === '\t')) {
            contentStart++;
        }

        tokens.push({
            letter: letter,
            rawLetter: rawLetter,
            matchStart: letterIdx,
            contentStart: contentStart,
            hasPunct: hasPunct,
        });
    }

    const candA = tokens.filter(t => t.letter === 'A');
    const candB = tokens.filter(t => t.letter === 'B');
    const candC = tokens.filter(t => t.letter === 'C');
    const candD = tokens.filter(t => t.letter === 'D');
    const candE = tokens.filter(t => t.letter === 'E');

    if (tokens.length === 0 || candB.length === 0) {
        const isClozeAllowed = context && (context.allowCloze === true || context.profileMode === 'english_languages');
        if (isClozeAllowed) {
            const isQuestionSentence = /^(?:Given|Evaluate|Solve|What|Which|Calculate|Find|Determine|How|Why|Where|When|If|State|Show|Prove|Let|In\s+the|For\s+what|An?\s+|The\s+)\b/i.test(text);
            if (!isQuestionSentence) {
                const colTokens = text.split(/\t+|\s{2,}/).map(t => t.trim()).filter(Boolean);
                if (colTokens.length >= 4 && colTokens.length <= 6 && colTokens.every(t => t.length < 35)) {
                    let stem = `Choose the most appropriate word for gap (${qNumber || 1})`;

                    const option_a = colTokens[0];
                    const option_b = colTokens[1];
                    const option_c = colTokens[2];
                    const option_d = colTokens[3];
                    const option_e = colTokens.length >= 5 ? colTokens[4] : '';

                    const optionsObj = { A: option_a, B: option_b, C: option_c, D: option_d };
                    if (option_e) optionsObj.E = option_e;

                    if (context && context.activePassage && !stem.includes('[PASSAGE:')) {
                        stem = `[PASSAGE: ${context.activePassage}] ${stem}`;
                    }
                    if (context && context.activeInstruction && !stem.includes('[INSTRUCTION:')) {
                        stem = `[INSTRUCTION: ${context.activeInstruction}] ${stem}`;
                    }

                    return {
                        number: qNumber,
                        stem: stem,
                        options: optionsObj,
                        answer: inlineAnswer || null,
                        diagram_image_url: null,
                        section: (context && context.activeSection) || null,
                    };
                }
            }
        }
        if (candB.length === 0) return null;
    }

    let tokenA = null;
    let tokenB = null;
    let tokenC = null;
    let tokenD = null;
    let tokenE = null;

    let bestChain = null;

    for (const b of candB) {
        const validCs = candC.filter(c => c.matchStart >= b.contentStart);
        if (validCs.length === 0) continue;

        for (const c of validCs) {
            const validDs = candD.filter(d => d.matchStart >= c.contentStart);
            if (validDs.length === 0) continue;

            for (const d of validDs) {
                const validEs = candE.filter(e => e.matchStart >= d.contentStart);
                const e = validEs.length > 0 ? validEs[0] : null;

                const validAs = candA.filter(a => a.matchStart < b.matchStart);
                let a = null;
                if (validAs.length > 0) {
                    const punctAs = validAs.filter(cand => cand.hasPunct);
                    a = punctAs.length > 0 ? punctAs[punctAs.length - 1] : validAs[validAs.length - 1];
                }

                const chain = { A: a, B: b, C: c, D: d, E: e };
                let score = 0;
                if (a) score += a.hasPunct ? 20 : 5;
                if (b.hasPunct) score += 20; else score += 5;
                if (c.hasPunct) score += 20; else score += 5;
                if (d.hasPunct) score += 20; else score += 5;
                if (e) score += e.hasPunct ? 20 : 5;

                const lenA = a ? b.matchStart - a.contentStart : 0;
                const lenB = c.matchStart - b.contentStart;
                const lenC = d.matchStart - c.contentStart;
                const lenD = e ? e.matchStart - d.contentStart : text.length - d.contentStart;

                if (a && lenA > 0 && lenA < 300) score += 10;
                if (lenB > 0 && lenB < 300) score += 10;
                if (lenC > 0 && lenC < 300) score += 10;
                if (lenD > 0 && lenD < 300) score += 10;

                // Penalize if lenA contains sentence-ending punctuation like '?' or '.'
                if (a && /[.?!]/.test(text.substring(a.contentStart, b.matchStart))) {
                    score -= 50;
                }

                if (!bestChain || score > bestChain.score) {
                    bestChain = { chain, score };
                }
            }
        }
    }

    if (bestChain) {
        tokenA = bestChain.chain.A;
        tokenB = bestChain.chain.B;
        tokenC = bestChain.chain.C;
        tokenD = bestChain.chain.D;
        tokenE = bestChain.chain.E;
    } else {
        tokenB = candB[0];
        const validAs = candA.filter(a => a.matchStart < tokenB.matchStart);
        if (validAs.length > 0) {
            tokenA = validAs[validAs.length - 1];
        }
        if (candC.length > 0) {
            tokenC = candC.find(c => c.matchStart > tokenB.contentStart) || null;
        }
        if (tokenC && candD.length > 0) {
            tokenD = candD.find(d => d.matchStart > tokenC.contentStart) || null;
        }
        if (tokenD && candE.length > 0) {
            tokenE = candE.find(e => e.matchStart > tokenD.contentStart) || null;
        }
    }

    if (!tokenB) {
        return null;
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

    if (context && context.activePassage && !stem.includes('[PASSAGE:')) {
        stem = `[PASSAGE: ${context.activePassage}] ${stem}`;
    }
    if (context && context.activeInstruction && !stem.includes('[INSTRUCTION:')) {
        stem = `[INSTRUCTION: ${context.activeInstruction}] ${stem}`;
    }

    return {
        number: qNumber,
        stem: stem,
        options: optionsObj,
        answer: inlineAnswer || null,
        correct_answer: inlineAnswer || null,
        correct_option: inlineAnswer || null,
        diagram_image_url: null,
        section: (context && context.activeSection) || null,
    };
}

/**
 * Attempts to split question stem from inline options on the same line.
 */
function splitStemAndInlineOptions(text) {
    if (!text) return null;

    const qObj = parseQuestionBlock(text, 1, null);
    if (qObj && qObj.options && qObj.options.A && qObj.options.B && !qObj.stem.includes('Choose the most appropriate word for gap')) {
        const optionsMap = new Map();
        for (const [k, v] of Object.entries(qObj.options)) {
            if (v) optionsMap.set(k, v);
        }
        return { stem: qObj.stem, options: optionsMap, answer: qObj.answer || null };
    }

    return null;
}

/**
 * Parses a bottom-block answer key section into a Map of { questionNumber → letter }.
 */
function parseAnswerBlock(lines) {
    const answers = new Map();
    for (const line of lines) {
        let match;
        ANSWER_ENTRY_RE.lastIndex = 0;
        while ((match = ANSWER_ENTRY_RE.exec(line)) !== null) {
            const qNum = parseInt(match[1], 10);
            const letter = match[2].toUpperCase();
            if (!isNaN(qNum) && ['A', 'B', 'C', 'D', 'E'].includes(letter)) {
                answers.set(qNum, letter);
            }
        }
    }
    return answers;
}

/**
 * Converts a 5-option (A–E) question to 4-option (A–D).
 */
function convertFiveToFourOptions(question) {
    if (!question.options || !question.options.E) return null;

    const conversion = {
        questionNumber: question.number,
        droppedOption: question.options.E,
        swapped: false,
    };

    const currentAns = question.correct_answer || question.answer;
    if (currentAns === 'E') {
        question.options.D = question.options.E;
        question.correct_answer = 'D';
        question.answer = 'D';
        conversion.swapped = true;
    }

    delete question.options.E;
    return conversion;
}

module.exports = {
    QUESTION_NUMBER_RE,
    STACKED_OPTION_RE,
    INLINE_OPTIONS_RE,
    INLINE_ANSWER_RE,
    TRAILING_ANS_REGEX,
    TRAILING_OPTION_ANSWER_RE,
    ANSWER_BLOCK_HEADER_RE,
    ANSWER_ENTRY_RE,
    extractInlineAnswer,
    extractAndStripOptionAnswer,
    extractInlineOptions,
    parseQuestionBlock,
    splitStemAndInlineOptions,
    parseAnswerBlock,
    convertFiveToFourOptions,
};
