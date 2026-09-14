const assert = require('assert');
const { parseMathScienceDocx } = require('../services/parsers/mathScienceParser');
const { ommlToLatex, transformDocxOmmlToLatex } = require('../services/parsers/common/mathOmmlConverter');
const { createDiagramContext } = require('../services/parsers/common/docxMediaExtractor');
const AdmZip = require('adm-zip');

console.log('======================================================================');
console.log('🧪 RUNNING TEST SUITE: MATH & SCIENCE PARSER STRATEGY');
console.log('======================================================================\n');

let passedTests = 0;
let failedTests = 0;

async function runTest(testName, testFn) {
  try {
    await testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runAll() {
  // TEST 1: OMML Fraction & Superscript AST conversion
  await runTest('OMML AST: Converts fractions, superscripts, subscripts to KaTeX', () => {
    const fractionOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:f>
        <m:num><m:r><m:t>d</m:t></m:r><m:r><m:t>y</m:t></m:r></m:num>
        <m:den><m:r><m:t>d</m:t></m:r><m:r><m:t>x</m:t></m:r></m:den>
      </m:f>
    </m:oMath>`;
    const latex = ommlToLatex(fractionOmml);
    assert.strictEqual(latex.trim(), '\\frac{dy}{dx}');

    const sSupOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:sSup>
        <m:e><m:r><m:t>x</m:t></m:r></m:e>
        <m:sup><m:r><m:t>2</m:t></m:r></m:sup>
      </m:sSup>
    </m:oMath>`;
    assert.strictEqual(ommlToLatex(sSupOmml).trim(), '{x}^{2}');

    const radOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:rad>
        <m:radPr><m:degHide m:val="1"/></m:radPr>
        <m:e><m:r><m:t>16</m:t></m:r></m:e>
      </m:rad>
    </m:oMath>`;
    assert.strictEqual(ommlToLatex(radOmml).trim(), '\\sqrt{16}');
  });

  // TEST 2: DOCX ZIP buffer with OMML transformed to $...$
  await runTest('DOCX ZIP transformation: Injects KaTeX delimiters into document.xml', () => {
    const zip = new AdmZip();
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <w:body>
        <w:p>
          <w:r><w:t>Evaluate </w:t></w:r>
          <m:oMath>
            <m:f>
              <m:num><m:r><m:t>1</m:t></m:r></m:num>
              <m:den><m:r><m:t>2</m:t></m:r></m:den>
            </m:f>
          </m:oMath>
          <w:r><w:t> + 5</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;
    zip.addFile('word/document.xml', Buffer.from(docXml, 'utf8'));
    zip.addFile('word/_rels/document.xml.rels', Buffer.from('<?xml version="1.0"?><Relationships/>', 'utf8'));
    
    const buffer = zip.toBuffer();
    const processed = transformDocxOmmlToLatex(buffer);
    
    const resZip = new AdmZip(processed);
    const updatedXml = resZip.readAsText('word/document.xml');
    assert.strictEqual(updatedXml.includes('$\\frac{1}{2}$'), true, 'Expected LaTeX $\\frac{1}{2}$ in transformed XML');
  });

  // TEST 3: Pure-equation question stem retention
  await runTest('Pure Equation Stem: Stems with no letters are fully preserved', async () => {
    const mathText = `
1. $\\lim_{x \\to 0} \\frac{\\sin x}{x}$
A. 0
B. 1
C. -1
D. $\\infty$
ANSWER: B

2. $\\int x^2 dx$
A. $\\frac{x^3}{3} + C$
B. $2x + C$
C. $x^3 + C$
D. $\\frac{x^2}{2} + C$
ANSWER: A
    `;

    const questions = await parseMathScienceDocx(mathText);
    assert.strictEqual(questions.length, 2);
    assert.strictEqual(questions[0].stem.includes('\\lim_{x \\to 0}'), true);
    assert.strictEqual(questions[0].answer, 'B');
    assert.strictEqual(questions[1].stem.includes('\\int x^2 dx'), true);
    assert.strictEqual(questions[1].answer, 'A');
  });

  // TEST 4: Physics calculation with diagram binding
  await runTest('Physics Calculation: Diagram binding to kinematic questions', async () => {
    const physicsText = `
1. A body of mass 10 kg moving with a velocity of 20 m/s is brought to rest in 5 seconds. Calculate the retarding force.
A. 20 N
B. 40 N
C. 50 N
D. 100 N
ANSWER: B

2. From the velocity-time graph above, find the total distance covered.
A. 150 m
B. 200 m
C. 250 m
D. 300 m
ANSWER: C
    `;

    const ctx = createDiagramContext();
    ctx.registerImage('/uploads/diagrams/vt_graph.png');
    
    const questions = await parseMathScienceDocx(physicsText, { diagramContext: ctx });
    assert.strictEqual(questions.length, 2);
    assert.strictEqual(questions[0].has_diagram, true);
    assert.strictEqual(questions[0].diagram_image_url, '/uploads/diagrams/vt_graph.png');
    assert.strictEqual(questions[1].has_diagram, false);
  });

  // TEST 5: Header metadata stripping in Further Mathematics (Zero bogus cloze Question 1)
  await runTest('Further Mathematics: Header metadata is stripped and Question 1 starts directly with surd equation', async () => {
    const rawText = `
ANTHONY WHITEBRIDGE ACADEMY
FIRST TERM EXAMINATION 2026/2027
<b>Subject:</b> Further Mathematics   CLASS: SS3   TIME: 1hr
INSTRUCTION: Answer all questions.

1. If 5/√2 - √8/8 = m√2, find the value of m
(a) 12/5 (b) 9/4 (c) 7/3 (d) 5/2
ANSWER: B

2. Evaluate the integral $\\int x^2 dx$
A. $x^3/3 + C$
B. $2x + C$
C. $x^3 + C$
D. $x^2/2 + C$
ANSWER: A
    `;

    const questions = await parseMathScienceDocx(rawText);
    assert.strictEqual(questions.length, 2, `Expected exactly 2 questions, got ${questions.length}`);

    // Question 1 MUST be the surd question, NOT a cloze question
    const q1 = questions[0];
    assert.strictEqual(q1.number || q1.question_number, 1);
    assert.strictEqual(q1.stem.includes('Choose the most appropriate word for gap'), false, 'Header must NOT be converted to a cloze question!');
    assert.ok(q1.stem.includes('5/√2') || q1.stem.includes('m√2'), `Q1 stem must be the surd equation, got: ${q1.stem}`);
    assert.strictEqual(q1.option_a, '12/5');
    assert.strictEqual(q1.option_b, '9/4');
    assert.strictEqual(q1.option_c, '7/3');
    assert.strictEqual(q1.option_d, '5/2');
    assert.strictEqual(q1.correct_answer || q1.answer, 'B');

    // Question 2
    const q2 = questions[1];
    assert.strictEqual(q2.number || q2.question_number, 2);
    assert.ok(q2.stem.includes('\\int x^2 dx'));
    assert.strictEqual(q2.correct_answer || q2.answer, 'A');
  });

  // TEST 6: DOCX Buffer with Header Attributes & OMML (Full End-to-End Ingestion)
  await runTest('DOCX Ingestion: Document header attributes do not create cloze gaps in Math & Science profile', async () => {
    const zip = new AdmZip();

    zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`, 'utf-8'));

    zip.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`, 'utf-8'));

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p><w:r><w:t>ANTHONY WHITEBRIDGE ACADEMY</w:t></w:r></w:p>
    <w:p><w:r><w:t>FIRST TERM EXAMINATION 2026/2027</w:t></w:r></w:p>
    <w:p><w:r><w:t>SUBJECT: FURTHER MATHEMATICS   CLASS: SS3   DURATION: 1HR</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: Answer all questions in this section.</w:t></w:r></w:p>
    
    <w:p><w:r><w:t>1. If </w:t></w:r>
      <m:oMath>
        <m:f>
          <m:num><m:r><m:t>5</m:t></m:r></m:num>
          <m:den><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:e><m:r><m:t>2</m:t></m:r></m:e></m:rad></m:den>
        </m:f>
        <m:r><m:t> - </m:t></m:r>
        <m:f>
          <m:num><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:e><m:r><m:t>8</m:t></m:r></m:e></m:rad></m:num>
          <m:den><m:r><m:t>8</m:t></m:r></m:den>
        </m:f>
        <m:r><m:t> = m</m:t></m:r>
        <m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:e><m:r><m:t>2</m:t></m:r></m:e></m:rad>
      </m:oMath>
      <w:r><w:t>, find the value of m</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>(a) 12/5 (b) 9/4 (c) 7/3 (d) 5/2</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ans: B</w:t></w:r></w:p>

    <w:p><w:r><w:t>2. Solve the quadratic equation x^2 - 5x + 6 = 0</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. 2, 3</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. -2, -3</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. 1, 6</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. -1, -6</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ans: A</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    zip.addFile('word/document.xml', Buffer.from(docXml, 'utf-8'));
    zip.addFile('word/_rels/document.xml.rels', Buffer.from('<?xml version="1.0"?><Relationships/>', 'utf-8'));

    const docxBuffer = zip.toBuffer();
    const parseResult = await parseMathScienceDocx(docxBuffer);

    assert.strictEqual(parseResult.questions.length, 2, `Expected 2 questions, got ${parseResult.questions.length}`);
    const q1 = parseResult.questions[0];
    assert.strictEqual(q1.number, 1);
    assert.strictEqual(q1.question_text.includes('Choose the most appropriate'), false);
    assert.strictEqual(q1.option_a, '12/5');
    assert.strictEqual(q1.option_b, '9/4');
    assert.strictEqual(q1.option_c, '7/3');
    assert.strictEqual(q1.option_d, '5/2');
    assert.strictEqual(q1.correct_answer, 'B');
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL MATH/SCIENCE TESTS PASSED PERFECTLY!\n');
  }
}

runAll();
