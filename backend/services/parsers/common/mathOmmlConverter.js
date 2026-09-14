/**
 * mathOmmlConverter.js
 *
 * Converts Microsoft Word Office Math (OMML) XML trees into KaTeX-compatible LaTeX expressions ($...$).
 * 100% Offline — in-memory AST parser and buffer re-writer.
 */

const AdmZip = require('adm-zip');
const { escapeXml, decodeXml } = require('./textSanitizer');

/**
 * Fast XML parser tailored for Office Open XML (OMML) trees.
 * Returns an array of AST nodes.
 */
function parseOmmlXml(xmlString) {
    let pos = 0;
    const len = xmlString.length;

    function parseNodes() {
        const nodes = [];
        while (pos < len) {
            if (xmlString[pos] === '<') {
                if (xmlString[pos + 1] === '/') {
                    // Closing tag - stop parsing this level
                    break;
                }
                if (xmlString.startsWith('<!--', pos)) {
                    const endComment = xmlString.indexOf('-->', pos);
                    pos = endComment === -1 ? len : endComment + 3;
                    continue;
                }
                if (xmlString[pos + 1] === '?' || xmlString[pos + 1] === '!') {
                    const endPi = xmlString.indexOf('>', pos);
                    pos = endPi === -1 ? len : endPi + 1;
                    continue;
                }

                // Opening tag
                const tagEnd = xmlString.indexOf('>', pos);
                if (tagEnd === -1) break;

                const tagContent = xmlString.substring(pos + 1, tagEnd).trim();
                const isSelfClosing = tagContent.endsWith('/');
                const cleanTagContent = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent;

                const spaceIdx = cleanTagContent.search(/\s/);
                const tagName = spaceIdx === -1 ? cleanTagContent : cleanTagContent.substring(0, spaceIdx);
                const localName = tagName.includes(':') ? tagName.split(':')[1] : tagName;

                const attrString = spaceIdx === -1 ? '' : cleanTagContent.substring(spaceIdx);
                const attrs = {};
                const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
                let attrMatch;
                while ((attrMatch = attrRegex.exec(attrString)) !== null) {
                    const attrName = attrMatch[1].includes(':') ? attrMatch[1].split(':')[1] : attrMatch[1];
                    attrs[attrName] = attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3];
                }

                pos = tagEnd + 1;

                const node = {
                    tagName,
                    localName,
                    attrs,
                    children: [],
                    text: '',
                };

                if (!isSelfClosing) {
                    node.children = parseNodes();
                    if (xmlString[pos] === '<' && xmlString[pos + 1] === '/') {
                        const closeEnd = xmlString.indexOf('>', pos);
                        pos = closeEnd === -1 ? len : closeEnd + 1;
                    }
                }

                nodes.push(node);
            } else {
                const nextTag = xmlString.indexOf('<', pos);
                const textContent = nextTag === -1 ? xmlString.substring(pos) : xmlString.substring(pos, nextTag);
                pos = nextTag === -1 ? len : nextTag;
                if (textContent) {
                    nodes.push({
                        tagName: '#text',
                        localName: '#text',
                        attrs: {},
                        children: [],
                        text: textContent,
                    });
                }
            }
        }
        return nodes;
    }

    return parseNodes();
}

/**
 * Maps Unicode and ASCII math symbols to LaTeX macros
 */
function mapMathSymbols(text) {
    if (!text) return '';
    return text
        .replace(/-->/g, ' \\to ')
        .replace(/->/g, ' \\to ')
        .replace(/<->/g, ' \\leftrightarrow ')
        .replace(/<=>/g, ' \\Leftrightarrow ')
        .replace(/<=/g, ' \\le ')
        .replace(/>=/g, ' \\ge ')
        .replace(/!=/g, ' \\ne ')
        .replace(/→/g, ' \\to ')
        .replace(/←/g, ' \\gets ')
        .replace(/↔/g, ' \\leftrightarrow ')
        .replace(/⇒/g, ' \\Rightarrow ')
        .replace(/⇐/g, ' \\Leftarrow ')
        .replace(/⇔/g, ' \\Leftrightarrow ')
        .replace(/↦/g, ' \\mapsto ')
        .replace(/≤/g, ' \\le ')
        .replace(/≥/g, ' \\ge ')
        .replace(/≠/g, ' \\ne ')
        .replace(/≈/g, ' \\approx ')
        .replace(/±/g, ' \\pm ')
        .replace(/∓/g, ' \\mp ')
        .replace(/×/g, ' \\times ')
        .replace(/÷/g, ' \\div ')
        .replace(/·/g, ' \\cdot ')
        .replace(/∞/g, ' \\infty ')
        .replace(/°/g, '^{\\circ}')
        .replace(/∠/g, ' \\angle ')
        .replace(/⊥/g, ' \\perp ')
        .replace(/∥/g, ' \\parallel ')
        .replace(/∂/g, ' \\partial ')
        .replace(/∇/g, ' \\nabla ')
        .replace(/∈/g, ' \\in ')
        .replace(/∉/g, ' \\notin ')
        .replace(/⊂/g, ' \\subset ')
        .replace(/⊆/g, ' \\subseteq ')
        .replace(/∪/g, ' \\cup ')
        .replace(/∩/g, ' \\cap ')
        .replace(/∅/g, ' \\emptyset ')
        .replace(/∀/g, ' \\forall ')
        .replace(/∃/g, ' \\exists ')
        .replace(/√/g, ' \\sqrt ')
        .replace(/∑/g, ' \\sum ')
        .replace(/∫/g, ' \\int ')
        .replace(/∏/g, ' \\prod ')
        .replace(/α/g, ' \\alpha ')
        .replace(/β/g, ' \\beta ')
        .replace(/γ/g, ' \\gamma ')
        .replace(/δ/g, ' \\delta ')
        .replace(/ε/g, ' \\epsilon ')
        .replace(/θ/g, ' \\theta ')
        .replace(/λ/g, ' \\lambda ')
        .replace(/μ/g, ' \\mu ')
        .replace(/π/g, ' \\pi ')
        .replace(/σ/g, ' \\sigma ')
        .replace(/τ/g, ' \\tau ')
        .replace(/φ/g, ' \\phi ')
        .replace(/ω/g, ' \\omega ')
        .replace(/Δ/g, ' \\Delta ')
        .replace(/Ω/g, ' \\Omega ');
}

/**
 * Converts an OMML AST node to a LaTeX math string.
 */
function ommlNodeToLatex(node) {
    if (!node) return '';
    if (node.tagName === '#text') {
        return node.text;
    }

    const name = node.localName || node.tagName;
    const children = node.children || [];

    function childrenToLatex(list) {
        return (list || []).map(ommlNodeToLatex).join('');
    }

    function findChild(localName) {
        return children.find(c => c.localName === localName);
    }

    function findChildren(localName) {
        return children.filter(c => c.localName === localName);
    }

    switch (name) {
        case 'oMathPara':
        case 'oMath': {
            return childrenToLatex(children).trim();
        }

        case 't': {
            const raw = decodeXml(children.map(c => c.text || '').join('') || node.text || '');
            return mapMathSymbols(raw);
        }

        case 'r': {
            return childrenToLatex(children);
        }

        case 'f': {
            // Fraction: \frac{num}{den}
            const numNode = findChild('num');
            const denNode = findChild('den');
            const numLatex = numNode ? childrenToLatex(numNode.children).trim() : '';
            const denLatex = denNode ? childrenToLatex(denNode.children).trim() : '';
            return `\\frac{${numLatex}}{${denLatex}}`;
        }

        case 'rad': {
            // Radical / Square Root: \sqrt[deg]{e} or \sqrt{e}
            const degNode = findChild('deg');
            const eNode = findChild('e');
            const degLatex = degNode ? childrenToLatex(degNode.children).trim() : '';
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            if (degLatex) {
                return `\\sqrt[${degLatex}]{${eLatex}}`;
            }
            return `\\sqrt{${eLatex}}`;
        }

        case 'sSup': {
            // Superscript / Power: {base}^{sup}
            const eNode = findChild('e');
            const supNode = findChild('sup');
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            const supLatex = supNode ? childrenToLatex(supNode.children).trim() : '';
            return `{${eLatex}}^{${supLatex}}`;
        }

        case 'sSub': {
            // Subscript: {base}_{sub}
            const eNode = findChild('e');
            const subNode = findChild('sub');
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            const subLatex = subNode ? childrenToLatex(subNode.children).trim() : '';
            return `{${eLatex}}_{${subLatex}}`;
        }

        case 'sSubSup': {
            // Subscript + Superscript: {base}_{sub}^{sup}
            const eNode = findChild('e');
            const subNode = findChild('sub');
            const supNode = findChild('sup');
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            const subLatex = subNode ? childrenToLatex(subNode.children).trim() : '';
            const supLatex = supNode ? childrenToLatex(supNode.children).trim() : '';
            return `{${eLatex}}_{${subLatex}}^{${supLatex}}`;
        }

        case 'sPre': {
            // Pre-sub/superscript: {}_{sub}^{sup}{base}
            const eNode = findChild('e');
            const subNode = findChild('sub');
            const supNode = findChild('sup');
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            const subLatex = subNode ? childrenToLatex(subNode.children).trim() : '';
            const supLatex = supNode ? childrenToLatex(supNode.children).trim() : '';
            return `{}_{${subLatex}}^{${supLatex}}{${eLatex}}`;
        }

        case 'd': {
            // Delimiter: (e) or [e] or {e} or |e|
            const dPr = findChild('dPr');
            let begChr = '(';
            let endChr = ')';
            let sepChr = '';
            if (dPr) {
                const begNode = dPr.children.find(c => c.localName === 'begChr');
                const endNode = dPr.children.find(c => c.localName === 'endChr');
                const sepNode = dPr.children.find(c => c.localName === 'sepChr');
                if (begNode && begNode.attrs.val !== undefined) begChr = begNode.attrs.val;
                if (endNode && endNode.attrs.val !== undefined) endChr = endNode.attrs.val;
                if (sepNode && sepNode.attrs.val !== undefined) sepChr = sepNode.attrs.val;
            }
            const eNodes = findChildren('e');
            const contents = eNodes.map(e => childrenToLatex(e.children).trim()).join(sepChr ? ` ${sepChr} ` : ' ');

            const leftMap = { '(': '\\left(', '[': '\\left[', '{': '\\left\\{', '|': '\\left|', '': '' };
            const rightMap = { ')': '\\right)', ']': '\\right]', '}': '\\right\\}', '|': '\\right|', '': '' };
            const l = leftMap[begChr] !== undefined ? leftMap[begChr] : begChr;
            const r = rightMap[endChr] !== undefined ? rightMap[endChr] : endChr;
            return `${l}${contents}${r}`;
        }

        case 'nary': {
            // N-ary: \sum, \int, \prod
            const naryPr = findChild('naryPr');
            let opChr = '∑';
            if (naryPr) {
                const chrNode = naryPr.children.find(c => c.localName === 'chr');
                if (chrNode && chrNode.attrs.val) opChr = chrNode.attrs.val;
            }
            let opLatex = '\\sum';
            if (opChr === '∫' || opChr === 'int') opLatex = '\\int';
            else if (opChr === '∬') opLatex = '\\iint';
            else if (opChr === '∭') opLatex = '\\iiint';
            else if (opChr === '∮') opLatex = '\\oint';
            else if (opChr === '∏' || opChr === 'prod') opLatex = '\\prod';
            else if (opChr === '⋃') opLatex = '\\bigcup';
            else if (opChr === '⋂') opLatex = '\\bigcap';

            const subNode = findChild('sub');
            const supNode = findChild('sup');
            const eNode = findChild('e');

            const subLatex = subNode ? childrenToLatex(subNode.children).trim() : '';
            const supLatex = supNode ? childrenToLatex(supNode.children).trim() : '';
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';

            let res = opLatex;
            if (subLatex) res += `_{${subLatex}}`;
            if (supLatex) res += `^{${supLatex}}`;
            if (eLatex) res += ` {${eLatex}}`;
            return res;
        }

        case 'func': {
            // Function: fName(e)
            const fNameNode = findChild('fName');
            const eNode = findChild('e');
            const fName = fNameNode ? childrenToLatex(fNameNode.children).trim() : '';
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            return `${fName} ${eLatex}`;
        }

        case 'limLow': {
            const eNode = findChild('e');
            const limNode = findChild('lim');
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            const limLatex = limNode ? childrenToLatex(limNode.children).trim() : '';
            return `\\lim_{${limLatex}} {${eLatex}}`;
        }

        case 'limUpp': {
            const eNode = findChild('e');
            const limNode = findChild('lim');
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            const limLatex = limNode ? childrenToLatex(limNode.children).trim() : '';
            return `\\lim^{${limLatex}} {${eLatex}}`;
        }

        case 'm': {
            // Matrix
            const rows = findChildren('mr');
            const rowLatex = rows.map(r => {
                const cells = r.children.filter(c => c.localName === 'e');
                return cells.map(c => childrenToLatex(c.children).trim()).join(' & ');
            }).join(' \\\\ ');
            return `\\begin{matrix} ${rowLatex} \\end{matrix}`;
        }

        case 'bar': {
            const eNode = findChild('e');
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            return `\\overline{${eLatex}}`;
        }

        case 'acc': {
            const accPr = findChild('accPr');
            let chr = '^';
            if (accPr) {
                const chrNode = accPr.children.find(c => c.localName === 'chr');
                if (chrNode && chrNode.attrs.val) chr = chrNode.attrs.val;
            }
            const eNode = findChild('e');
            const eLatex = eNode ? childrenToLatex(eNode.children).trim() : '';
            if (chr === '→' || chr === '⃗') return `\\vec{${eLatex}}`;
            if (chr === '^' || chr === '̂') return `\\hat{${eLatex}}`;
            if (chr === '.' || chr === '̇') return `\\dot{${eLatex}}`;
            if (chr === '..' || chr === '̈') return `\\ddot{${eLatex}}`;
            if (chr === '~' || chr === '̃') return `\\tilde{${eLatex}}`;
            return `\\overline{${eLatex}}`;
        }

        case 'box':
        case 'borderBox':
        case 'groupChr':
        case 'e':
        case 'num':
        case 'den':
        case 'sup':
        case 'sub':
        case 'deg':
        case 'fName':
        case 'lim': {
            return childrenToLatex(children);
        }

        default: {
            return childrenToLatex(children);
        }
    }
}

/**
 * Converts a raw OMML XML fragment string to a clean KaTeX LaTeX string.
 */
function ommlToLatex(ommlXml) {
    if (!ommlXml || typeof ommlXml !== 'string') return '';
    const tree = parseOmmlXml(ommlXml);
    if (!tree || tree.length === 0) return '';
    const latex = ommlNodeToLatex(tree[0]).trim();
    return latex.replace(/\s+/g, ' ');
}

/**
 * Preprocesses a .docx buffer by transforming any embedded Office Math (OMML)
 * equations inside word/document.xml into KaTeX LaTeX text runs ($LaTeX$).
 *
 * @param {Buffer} docxBuffer - Raw input DOCX buffer
 * @returns {Buffer} Transformed DOCX buffer with OMML converted to text runs
 */
function transformDocxOmmlToLatex(docxBuffer) {
    if (!docxBuffer || !Buffer.isBuffer(docxBuffer)) {
        return docxBuffer;
    }

    try {
        const zip = new AdmZip(docxBuffer);
        const docEntry = zip.getEntry('word/document.xml');
        if (!docEntry) {
            return docxBuffer;
        }

        let docXml = zip.readAsText(docEntry);
        if (!docXml.includes('oMath') && !docXml.includes('m:oMath')) {
            // No Office Math markup present
            return docxBuffer;
        }

        // 1. Transform block equations: <m:oMathPara>...</m:oMathPara>
        docXml = docXml.replace(/<(?:\w+:)?oMathPara\b[^>]*>([\s\S]*?)<\/(?:\w+:)?oMathPara>/gi, (match) => {
            const latex = ommlToLatex(match);
            if (!latex) return '';
            const cleanLatex = latex.trim().replace(/^\$+|\$+$/g, '').trim();
            if (!cleanLatex) return '';
            const safeText = escapeXml(`$${cleanLatex}$`);
            return `<w:r><w:t xml:space="preserve">${safeText}</w:t></w:r>`;
        });

        // 2. Transform inline equations: <m:oMath>...</m:oMath>
        docXml = docXml.replace(/<(?:\w+:)?oMath\b[^>]*>([\s\S]*?)<\/(?:\w+:)?oMath>/gi, (match) => {
            const latex = ommlToLatex(match);
            if (!latex) return '';
            const cleanLatex = latex.trim().replace(/^\$+|\$+$/g, '').trim();
            if (!cleanLatex) return '';
            const safeText = escapeXml(`$${cleanLatex}$`);
            return `<w:r><w:t xml:space="preserve">${safeText}</w:t></w:r>`;
        });

        zip.updateFile('word/document.xml', Buffer.from(docXml, 'utf-8'));
        return zip.toBuffer();
    } catch (transformErr) {
        console.warn('⚠️ [OMML Math Preprocessor Notice]:', transformErr.message);
        return docxBuffer;
    }
}

/**
 * Determines whether a character index in a string falls inside KaTeX $...$ delimiters.
 */
function isInsideMath(text, index) {
    if (!text || index < 0 || index >= text.length) return false;
    let inside = false;
    for (let i = 0; i < index; i++) {
        if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) {
            inside = !inside;
        }
    }
    return inside;
}

module.exports = {
    parseOmmlXml,
    ommlToLatex,
    transformDocxOmmlToLatex,
    isInsideMath,
    mapMathSymbols,
};
