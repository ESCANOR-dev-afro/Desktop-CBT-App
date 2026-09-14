/**
 * mathScienceParser.js
 *
 * Specialized parser strategy for Mathematics, Further Mathematics, Physics, Chemistry, and Physical Sciences.
 * Handles:
 *   - Native Word Office Math (OMML) conversion to KaTeX LaTeX ($...$)
 *   - Mathematical boundary protection (formula letters/numbers never mistaken for question keys)
 *   - Pure-equation question stems (e.g. "1. $\frac{d}{dx}(\sin^2 x)$")
 *   - Physical science diagram extraction & inline binding (Fig. X, velocity curves, circuit diagrams)
 *   - 100% Offline execution
 */

const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');
const { transformDocxOmmlToLatex } = require('./common/mathOmmlConverter');
const { stripHtml, extractParagraphsFromHtml } = require('./common/textSanitizer');
const { convertFiveToFourOptions } = require('./common/optionConverter');
const { extractDocxMedia, createDiagramContext, associateParagraphMedia, generateDocSlug, saveOptimizedDiagram } = require('./common/docxMediaExtractor');
const { parseDocument } = require('./common/documentParser');

const IMG_TAG_RE = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

/**
 * Parses DOCX buffer using Math & Physical Sciences strategy.
 */
async function parseMathScienceDocx(buffer, options = {}) {
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
        const parseResult = parseDocument(buffer, new Map(), [], diagramCtx, { profileMode: 'math_science', allowCloze: false });
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
            q.option_a = q.options ? (q.options.A || '').trim() : '';
            q.option_b = q.options ? (q.options.B || '').trim() : '';
            q.option_c = q.options ? (q.options.C || '').trim() : '';
            q.option_d = q.options ? (q.options.D || '').trim() : '';
            q.answer = q.answer;
            q.correct_answer = q.answer;
            q.correct_option = q.answer;
            q.has_answer = !!q.answer;
        }
        return parseResult.questions;
    }

    // 1. Preprocess OMML math equations to KaTeX LaTeX text runs
    const processedBuffer = transformDocxOmmlToLatex(buffer);

    // 2. Direct XML media extraction
    const directMedia = extractDocxMedia(buffer, { diagramsDir, diagramsUrlPrefix, docContext: options.docContext || options, saveToDisk: false });

    // 3. Convert DOCX → HTML with mammoth for sequential paragraph structure
    const mammothResult = await mammoth.convertToHtml(
        { buffer: processedBuffer },
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
    const parseResult = parseDocument(documentText, new Map(), lineOffsets, diagramCtx, { profileMode: 'math_science', allowCloze: false });

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
            profileMode: 'math_science',
            profileApplied: 'Maths & Physical Sciences Profile',
            totalParagraphs: paragraphs.length,
            totalLinesProcessed: textLines.length,
            sectionsDetected: parseResult.sectionsDetected,
            answerKeyMode,
            fiveOptionConversions,
        },
    };
}

module.exports = {
    parseMathScienceDocx,
};
