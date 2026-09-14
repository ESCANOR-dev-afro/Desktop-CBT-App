/**
 * englishPassageParser.js
 *
 * Specialized parser strategy for English Language, Literature, Oral English, and Language exams.
 * Handles:
 *   - Section directive preservation ([INSTRUCTION: ...]) across question bank shuffling
 *   - Comprehension and cloze narrative passages ([PASSAGE: ...])
 *   - Tabular / Columnar cloze matrices (e.g. Q71–Q80 multi-column tables)
 *   - Unnumbered continuous paragraphs with implicit Option A
 *   - Sequential question auto-numbering
 *   - 100% Offline execution
 */

const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');
const { stripHtml, extractParagraphsFromHtml } = require('./common/textSanitizer');
const { convertFiveToFourOptions } = require('./common/optionConverter');
const { extractDocxMedia, createDiagramContext, associateParagraphMedia, generateDocSlug, saveOptimizedDiagram } = require('./common/docxMediaExtractor');
const {
    findQuestionBoundaries,
    extractTrailingPreamble,
    parsePreamble,
    parseDocument,
} = require('./common/documentParser');

const IMG_TAG_RE = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

/**
 * Parses DOCX buffer using English & Languages strategy.
 */
async function parseEnglishPassageDocx(buffer, options = {}) {
    const diagramsDir = options.diagramsDir || path.join(__dirname, '../../../uploads/diagrams');
    const diagramsUrlPrefix = options.diagramsUrlPrefix || '/uploads/diagrams';
    const baseSlug = generateDocSlug(options.docContext || options);
    const warnings = [];
    const extractedImages = [];
    const timestamp = Date.now();
    let imageCounter = 0;

    if (diagramsDir && !fs.existsSync(diagramsDir)) {
        fs.mkdirSync(diagramsDir, { recursive: true });
    }

    if (typeof buffer === 'string') {
        const diagramCtx = options.diagramContext || createDiagramContext();
        const parseResult = parseDocument(buffer, new Map(), [], diagramCtx, { profileMode: 'english_languages', allowCloze: true });
        if (parseResult.answerBlockAnswers && parseResult.answerBlockAnswers.size > 0) {
            for (const q of parseResult.questions) {
                if (!q.answer && parseResult.answerBlockAnswers.has(q.number)) {
                    q.answer = parseResult.answerBlockAnswers.get(q.number);
                }
            }
        }
        for (const q of parseResult.questions) {
            convertFiveToFourOptions(q);
            q.question_text = q.stem;
            q.passage = q.passage || null;
            q.passage_text = q.passage_text || q.passage || null;
            q.option_a = q.options ? (q.options.A || '').trim() : '';
            q.option_b = q.options ? (q.options.B || '').trim() : '';
            q.option_c = q.options ? (q.options.C || '').trim() : '';
            q.option_d = q.options ? (q.options.D || '').trim() : '';
            q.answer = q.answer;
            q.correct_answer = q.answer;
            q.correct_option = q.answer;
            q.has_answer = !!q.answer;
            q.clean_stem = q.clean_stem || (q.stem || '')
                .replace(/\[PASSAGE:\s*([\s\S]*?)\]/g, '')
                .replace(/\[INSTRUCTION:\s*([\s\S]*?)\]/g, '')
                .trim();
        }
        return parseResult.questions;
    }

    const directMedia = extractDocxMedia(buffer, { diagramsDir, diagramsUrlPrefix, docContext: options.docContext || options, saveToDisk: false });

    const mammothResult = await mammoth.convertToHtml(
        { buffer },
        {
            styleMap: ["u => u", "b => b", "i => i", "strike => s", "sup => sup", "sub => sub"],
            convertImage: mammoth.images.imgElement(async (image) => {
                try {
                    const rawExt = (image.contentType || 'image/png').split('/')[1] || 'png';
                    const ext = (rawExt.replace(/[^a-z0-9]/gi, '') || 'png').toLowerCase();
                    const normExt = ext === 'jpg' ? 'jpeg' : ext;
                    const counter = String(++imageCounter).padStart(3, '0');
                    const filename = `${baseSlug}_tmp_${timestamp}_img${counter}.${normExt}`;
                    const imgBuffer = await image.read();

                    if (diagramsDir) {
                        const destPath = path.join(diagramsDir, filename);
                        await saveOptimizedDiagram(imgBuffer, destPath);
                    }

                    const finalUrl = `${diagramsUrlPrefix}/${filename}`;
                    if (!extractedImages.some(img => img.url === finalUrl)) {
                        extractedImages.push({
                            filename,
                            contentType: image.contentType || 'image/png',
                            size: imgBuffer.length,
                            url: finalUrl,
                        });
                    }
                    return { src: finalUrl };
                } catch (err) {
                    warnings.push(`Image conversion failed: ${err.message}`);
                    return { src: '' };
                }
            }),
        }
    );

    if (mammothResult.messages && mammothResult.messages.length > 0) {
        mammothResult.messages.forEach(msg => {
            if (msg.type === 'warning' || msg.type === 'error') {
                warnings.push(`Mammoth: ${msg.message}`);
            }
        });
    }

    const html = mammothResult.value || '';
    const paragraphs = extractParagraphsFromHtml(html);
    const diagramCtx = createDiagramContext();
    const { textLines, lineOffsets } = associateParagraphMedia(paragraphs, diagramCtx, options.docContext || options, { diagramsDir, diagramsUrlPrefix });

    const documentText = textLines.join('\n');
    const parseResult = parseDocument(documentText, new Map(), lineOffsets, diagramCtx, { profileMode: 'english_languages', allowCloze: true });

    let answerKeyMode = 'none';
    const hasInlineAnswers = parseResult.questions.some(q => q.answer !== null);
    const hasBlockAnswers = parseResult.answerBlockAnswers.size > 0;

    if (hasInlineAnswers && hasBlockAnswers) {
        answerKeyMode = 'mixed';
    } else if (hasBlockAnswers) {
        answerKeyMode = 'bottom_block';
    } else if (hasInlineAnswers) {
        answerKeyMode = 'inline';
    }

    if (hasBlockAnswers) {
        for (const q of parseResult.questions) {
            if (!q.answer && parseResult.answerBlockAnswers.has(q.number)) {
                q.answer = parseResult.answerBlockAnswers.get(q.number);
            }
        }
    }

    const fiveOptionConversions = [];
    for (const q of parseResult.questions) {
        const conversion = convertFiveToFourOptions(q);
        if (conversion) {
            fiveOptionConversions.push(conversion);
            warnings.push(
                `Question ${q.number}: Had 5 options (A–E). ` +
                (conversion.swapped
                    ? `Option E was the correct answer — swapped E→D.`
                    : `Option E dropped (not the correct answer).`)
            );
        }
    }

    const finalQuestions = parseResult.questions.map(q => {
        const rawAns = q.answer ? String(q.answer).toUpperCase().trim() : null;
        const has_answer = rawAns !== null && ['A', 'B', 'C', 'D'].includes(rawAns);
        const correct_answer = has_answer ? rawAns : null;
        const diagramUrl = q.diagram_image_url || null;

        if (!has_answer) {
            warnings.push(`Question ${q.number}: No answer key detected.`);
        }

        const cleanStem = q.clean_stem || (q.stem || '')
            .replace(/\[PASSAGE:\s*([\s\S]*?)\]/g, '')
            .replace(/\[INSTRUCTION:\s*([\s\S]*?)\]/g, '')
            .trim();

        return {
            number: q.number,
            question_number: q.number,
            question_text: q.stem,
            stem: cleanStem,
            clean_stem: cleanStem,
            instruction: q.instruction || null,
            passage: q.passage || null,
            passage_text: q.passage_text || q.passage || null,
            options: q.options,
            option_a: (q.options.A || '').trim(),
            option_b: (q.options.B || '').trim(),
            option_c: (q.options.C || '').trim(),
            option_d: (q.options.D || '').trim(),
            answer: correct_answer,
            correct_answer,
            correct_option: correct_answer,
            marks: 1,
            diagram_image_url: diagramUrl,
            image_url: diagramUrl,
            has_diagram: !!diagramUrl,
            has_answer,
            section: q.section || null,
        };
    });

    return {
        questions: finalQuestions,
        images: extractedImages,
        warnings: [...warnings, ...parseResult.warnings],
        metadata: {
            sourceFormat: 'docx',
            profileMode: 'english_languages',
            profileApplied: 'English & Languages Profile',
            totalParagraphs: paragraphs.length,
            totalLinesProcessed: textLines.length,
            sectionsDetected: parseResult.sectionsDetected,
            answerKeyMode,
            fiveOptionConversions,
        },
    };
}

module.exports = {
    parseEnglishPassageDocx,
    extractTrailingPreamble,
    parsePreamble,
};
