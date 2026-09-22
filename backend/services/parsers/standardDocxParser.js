/**
 * standardDocxParser.js
 *
 * General / Standard parser strategy for Biology, Agric, Economics, Civic, and standard school MCQs.
 * Handles:
 *   - Stacked Aiken-style options (A., B., C., D.) and inline options
 *   - Universal diagram extraction with Biology & Agric multi-question diagram groups (e.g. Q14–Q16)
 *   - Preceding figure binding and clean diagram isolation
 *   - Bottom-block answer keys (ANSWERS: 1. A, 2. B...) and inline keys
 *   - Plaintext (.txt) and DOCX parsing
 *   - 100% Offline execution
 */

const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');
const { stripHtml, sanitizeDocumentText, extractParagraphsFromHtml } = require('./common/textSanitizer');
const { convertFiveToFourOptions } = require('./common/optionConverter');
const { extractDocxMedia, createDiagramContext, associateParagraphMedia, generateDocSlug, saveOptimizedDiagram } = require('./common/docxMediaExtractor');
const { parseDocument, parseQuestionBlock, findQuestionBoundaries } = require('./common/documentParser');

const IMG_TAG_RE = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

/**
 * Parses a plain text string into structured question objects.
 */
function parsePlainText(text, options = {}, profileMode = 'standard_general') {
    if (!text || typeof text !== 'string') {
        return {
            questions: [],
            images: [],
            warnings: ['Empty or invalid text input.'],
            metadata: {
                sourceFormat: 'txt',
                profileMode: profileMode || 'standard_general',
                totalParagraphs: 0,
                totalLinesProcessed: 0,
                sectionsDetected: [],
                answerKeyMode: 'none',
                fiveOptionConversions: [],
            },
        };
    }

    const diagramCtx = options.diagramContext || createDiagramContext();
    const parseResult = parseDocument(text, new Map(), [], diagramCtx, { profileMode: profileMode || 'standard_general', allowCloze: false });

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
    const warnings = [...parseResult.warnings];

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

        return {
            number: q.number,
            question_number: q.number,
            stem: q.stem,
            question_text: q.stem,
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
        images: [],
        warnings,
        metadata: {
            sourceFormat: 'txt',
            profileMode: profileMode || 'standard_general',
            profileApplied: 'General / Standard Profile',
            totalParagraphs: 0,
            totalLinesProcessed: text.split('\n').length,
            sectionsDetected: parseResult.sectionsDetected,
            answerKeyMode,
            fiveOptionConversions,
        },
    };
}

/**
 * Parses DOCX buffer using Standard & General strategy.
 */
async function parseStandardDocx(buffer, options = {}) {
    const diagramsDir = options.diagramsDir || path.join(__dirname, '../../uploads/diagrams');
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
        const res = parsePlainText(buffer, options, 'standard_general');
        return res.questions;
    }

    // Direct XML media extraction
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

    const html = mammothResult.value || '';
    const paragraphs = extractParagraphsFromHtml(html);
    const diagramCtx = createDiagramContext();
    const { textLines, lineOffsets } = associateParagraphMedia(paragraphs, diagramCtx, options.docContext || options, { diagramsDir, diagramsUrlPrefix });

    const documentText = textLines.join('\n');
    const parseResult = parseDocument(documentText, new Map(), lineOffsets, diagramCtx, { profileMode: 'standard_general', allowCloze: false });

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

        return {
            number: q.number,
            question_number: q.number,
            stem: q.stem,
            question_text: q.stem,
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
            profileMode: 'standard_general',
            profileApplied: 'General / Standard Profile',
            totalParagraphs: paragraphs.length,
            totalLinesProcessed: textLines.length,
            sectionsDetected: parseResult.sectionsDetected,
            answerKeyMode,
            fiveOptionConversions,
        },
    };
}

module.exports = {
    parseStandardDocx,
    parsePlainText,
};
