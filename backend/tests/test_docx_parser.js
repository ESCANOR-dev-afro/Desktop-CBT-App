/**
 * test_docx_parser.js
 * 
 * Comprehensive Test Suite for docxQuestionParser.js
 * Validates regex refinements, edge cases, OMML math equation conversion,
 * and end-to-end DOCX parser functionality.
 */

const assert = require('assert');
const AdmZip = require('adm-zip');
const { parseDocxBuffer, parsePlainText, parseAikenFormat, _internal } = require('../services/docxQuestionParser');

console.log('🧪 Starting docxQuestionParser Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runAllTests() {
  // ────────────────────────────────────────────────────────────
  // TEST 1: Refinement 1 — Capital Letter Collision (Americium / Vitamin A)
  // ────────────────────────────────────────────────────────────
  await runTest('Refinement 1: Inline options with capital letters (Americium, Vitamin A)', () => {
    const text = `1. Americium is a synthetic chemical element with the symbol Am. Which of the following is true?
A. Americium is an actinide element
B. Vitamin A contains Americium
C. Calcium is more reactive than Americium
D. None of the above
Ans: A`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 1);
    const q = result.questions[0];
    assert.strictEqual(q.number, 1);
    assert.ok(q.question_text.includes('Americium is a synthetic chemical element'));
    assert.strictEqual(q.option_a, 'Americium is an actinide element');
    assert.strictEqual(q.option_b, 'Vitamin A contains Americium');
    assert.strictEqual(q.option_c, 'Calcium is more reactive than Americium');
    assert.strictEqual(q.option_d, 'None of the above');
    assert.strictEqual(q.correct_answer, 'A');
    assert.strictEqual(q.has_answer, true);
  });

  // ────────────────────────────────────────────────────────────
  // TEST 2: Refinement 1 — Single-line inline options with capital letters
  // ────────────────────────────────────────────────────────────
  await runTest('Refinement 1: Single-line inline options with internal capital words', () => {
    const text = `1. What is the source of Vitamin C? A. Ascorbic acid in citrus B. Americium C. Boron D. Vitamin D
Ans: A`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 1);
    const q = result.questions[0];
    assert.strictEqual(q.option_a, 'Ascorbic acid in citrus');
    assert.strictEqual(q.option_b, 'Americium');
    assert.strictEqual(q.option_c, 'Boron');
    assert.strictEqual(q.option_d, 'Vitamin D');
    assert.strictEqual(q.correct_answer, 'A');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 3: Refinement 2 — Cloze Blank Preservation (varying underscores)
  // ────────────────────────────────────────────────────────────
  await runTest('Refinement 2: Cloze passage with numbered and unnumbered blanks', () => {
    const text = `[PASSAGE: The boy went to the __71__ and bought some ____ bread. He then saw a __________ dog.]
1. Choose the word for __71__
A. market
B. school
C. hospital
D. church
Ans: A`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 1);
    const q = result.questions[0];
    assert.ok(q.question_text.includes('__71__'));
    assert.ok(q.question_text.includes('____'));
    assert.ok(q.question_text.includes('__________'));
    assert.strictEqual(q.option_a, 'market');
    assert.strictEqual(q.correct_answer, 'A');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 4: Stacked Standard 4-Option MCQs
  // ────────────────────────────────────────────────────────────
  await runTest('Standard 4-option stacked MCQ with Ans suffix', () => {
    const text = `1. What is the capital of Nigeria?
A. Lagos
B. Abuja
C. Kano
D. Ibadan
Ans: B

2. Which planet is closest to the Sun?
A. Venus
B. Earth
C. Mercury
D. Mars
Answer: C`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 2);
    assert.strictEqual(result.questions[0].correct_answer, 'B');
    assert.strictEqual(result.questions[0].option_b, 'Abuja');
    assert.strictEqual(result.questions[1].correct_answer, 'C');
    assert.strictEqual(result.questions[1].option_c, 'Mercury');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 5: 5-Option (A–E) conversion — Option E not correct
  // ────────────────────────────────────────────────────────────
  await runTest('5-option conversion: Option E dropped when E is not answer', () => {
    const text = `1. Which element has atomic number 6?
A. Hydrogen
B. Helium
C. Carbon
D. Nitrogen
E. Oxygen
Ans: C`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 1);
    const q = result.questions[0];
    assert.strictEqual(q.option_a, 'Hydrogen');
    assert.strictEqual(q.option_c, 'Carbon');
    assert.strictEqual(q.option_d, 'Nitrogen');
    assert.strictEqual(q.correct_answer, 'C');
    assert.strictEqual(result.metadata.fiveOptionConversions.length, 1);
    assert.strictEqual(result.metadata.fiveOptionConversions[0].swapped, false);
  });

  // ────────────────────────────────────────────────────────────
  // TEST 6: 5-Option (A–E) conversion — Option E IS correct (swapped to D)
  // ────────────────────────────────────────────────────────────
  await runTest('5-option conversion: Option E swapped to D when E is correct answer', () => {
    const text = `1. Which gas is most abundant in Earth atmosphere?
A. Oxygen
B. Carbon dioxide
C. Argon
D. Hydrogen
E. Nitrogen
Ans: E`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 1);
    const q = result.questions[0];
    assert.strictEqual(q.option_d, 'Nitrogen'); // Swapped!
    assert.strictEqual(q.correct_answer, 'D'); // Answer promoted to D
    assert.strictEqual(result.metadata.fiveOptionConversions.length, 1);
    assert.strictEqual(result.metadata.fiveOptionConversions[0].swapped, true);
  });

  // ────────────────────────────────────────────────────────────
  // TEST 7: Bottom-Block Answer Key Resolution
  // ────────────────────────────────────────────────────────────
  await runTest('Bottom-block answer key resolution', () => {
    const text = `1. First question
A. Opt A
B. Opt B
C. Opt C
D. Opt D

2. Second question
A. Opt A
B. Opt B
C. Opt C
D. Opt D

3. Third question
A. Opt A
B. Opt B
C. Opt C
D. Opt D

ANSWERS:
1. B
2. D
3. A`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 3);
    assert.strictEqual(result.questions[0].correct_answer, 'B');
    assert.strictEqual(result.questions[0].has_answer, true);
    assert.strictEqual(result.questions[1].correct_answer, 'D');
    assert.strictEqual(result.questions[1].has_answer, true);
    assert.strictEqual(result.questions[2].correct_answer, 'A');
    assert.strictEqual(result.questions[2].has_answer, true);
    assert.strictEqual(result.metadata.answerKeyMode, 'bottom_block');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 8: Section Directive Propagation
  // ────────────────────────────────────────────────────────────
  await runTest('Section directive propagation across questions', () => {
    const text = `SECTION A: COMPREHENSION
INSTRUCTION: Read the questions carefully.

1. Question in Section A
A. Opt 1
B. Opt 2
C. Opt 3
D. Opt 4
Ans: A

SECTION B: LEXIS AND STRUCTURE
INSTRUCTION: Choose the nearest in meaning.

2. Question in Section B
A. Opt 1
B. Opt 2
C. Opt 3
D. Opt 4
Ans: B`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 2);
    assert.ok(result.questions[0].question_text.includes('[INSTRUCTION: Read the questions carefully.]'));
    assert.ok(result.questions[1].question_text.includes('[INSTRUCTION: Choose the nearest in meaning.]'));
  });

  // ────────────────────────────────────────────────────────────
  // TEST 9: LaTeX Math Preservation
  // ────────────────────────────────────────────────────────────
  await runTest('LaTeX math equation preservation in plaintext', () => {
    const text = `1. Solve for $x$ in $2x^2 + 5x - 3 = 0$:
A. $x = \\frac{1}{2}$ or $x = -3$
B. $x = 1$ or $x = -2$
C. $x = 0$
D. $x = \\sqrt{5}$
Ans: A`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 1);
    const q = result.questions[0];
    assert.ok(q.question_text.includes('$2x^2 + 5x - 3 = 0$'));
    assert.strictEqual(q.option_a, '$x = \\frac{1}{2}$ or $x = -3$');
    assert.strictEqual(q.correct_answer, 'A');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 10: Aiken Format Parser Wrapper
  // ────────────────────────────────────────────────────────────
  await runTest('Aiken format parser wrapper', () => {
    const aikenText = `What is the speed of light?
A. 300,000 km/s
B. 150,000 km/s
C. 1,000 km/s
D. 500,000 km/s
ANSWER: A

What is Newton's second law?
A. F = ma
B. E = mc^2
C. V = IR
D. P = IV
ANSWER: A`;

    const result = parseAikenFormat(aikenText);
    assert.strictEqual(result.questions.length, 2);
    assert.strictEqual(result.metadata.sourceFormat, 'aiken');
    assert.strictEqual(result.questions[0].correct_answer, 'A');
    assert.strictEqual(result.questions[1].correct_answer, 'A');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 11: Continuous Unnumbered Single-Line Format (Real School Exam Format)
  // ────────────────────────────────────────────────────────────
  await runTest('Continuous unnumbered single-line format', () => {
    const text = `
Subject: Intermediate Science
Class: JSS2

An element is a pure substance containing A. two types of mixtures B. one type of atom C. different compounds D. several mixtures
The chemical symbol for oxygen is A. Ox B. O C. Om D. Og
The first element in the periodic table is A. Helium B. Hydrogen C. Lithium D. Oxygen
The chemical symbol Na represents A. Nitrogen B. Neon C. Sodium D. Nickel
`;
    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 4);
    assert.strictEqual(result.questions[0].number, 1);
    assert.strictEqual(result.questions[0].question_text, 'An element is a pure substance containing');
    assert.strictEqual(result.questions[0].option_a, 'two types of mixtures');
    assert.strictEqual(result.questions[0].option_b, 'one type of atom');
    assert.strictEqual(result.questions[0].option_c, 'different compounds');
    assert.strictEqual(result.questions[0].option_d, 'several mixtures');
    assert.strictEqual(result.questions[0].correct_answer, null);
    assert.strictEqual(result.questions[0].has_answer, false);
    assert.strictEqual(result.questions[1].number, 2);
    assert.strictEqual(result.questions[1].question_text, 'The chemical symbol for oxygen is');
    assert.strictEqual(result.questions[1].option_a, 'Ox');
    assert.strictEqual(result.questions[1].option_b, 'O');
    assert.strictEqual(result.questions[1].option_c, 'Om');
    assert.strictEqual(result.questions[1].option_d, 'Og');
    assert.strictEqual(result.questions[1].correct_answer, null);
    assert.strictEqual(result.questions[1].has_answer, false);
    assert.strictEqual(result.questions[2].number, 3);
    assert.strictEqual(result.questions[2].question_text, 'The first element in the periodic table is');
    assert.strictEqual(result.questions[2].option_b, 'Hydrogen');
    assert.strictEqual(result.questions[2].correct_answer, null);
    assert.strictEqual(result.questions[2].has_answer, false);
    assert.strictEqual(result.questions[3].number, 4);
    assert.strictEqual(result.questions[3].question_text, 'The chemical symbol Na represents');
    assert.strictEqual(result.questions[3].option_c, 'Sodium');
    assert.strictEqual(result.questions[3].correct_answer, null);
    assert.strictEqual(result.questions[3].has_answer, false);
  });

  // ────────────────────────────────────────────────────────────
  // TEST 12: Continuous Unnumbered Single-Line with Inline Answers
  // ────────────────────────────────────────────────────────────
  await runTest('Continuous unnumbered single-line with inline answers', () => {
    const text = `
The chemical symbol for Gold is A. Ag B. Au C. Fe D. Pb Ans: B
Water is formed from hydrogen and oxygen in ratio A. 1:1 B. 2:1 C. 1:2 D. 3:1 Ans: B
`;
    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 2);
    assert.strictEqual(result.questions[0].question_text, 'The chemical symbol for Gold is');
    assert.strictEqual(result.questions[0].option_b, 'Au');
    assert.strictEqual(result.questions[0].correct_answer, 'B');
    assert.strictEqual(result.questions[0].has_answer, true);
    assert.strictEqual(result.questions[1].question_text, 'Water is formed from hydrogen and oxygen in ratio');
    assert.strictEqual(result.questions[1].option_b, '2:1');
    assert.strictEqual(result.questions[1].correct_answer, 'B');
    assert.strictEqual(result.questions[1].has_answer, true);
  });

  // ────────────────────────────────────────────────────────────
  // TEST 13: Continuous Unnumbered with Parentheses & Colons
  // ────────────────────────────────────────────────────────────
  await runTest('Continuous unnumbered with parentheses (A) and colons A:', () => {
    const text = `
An atom consists of (A) protons (B) neutrons (C) electrons (D) all of the above
The process of plant water loss is A: Respiration B: Transpiration C: Photosynthesis D: Osmosis
`;
    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 2);
    assert.strictEqual(result.questions[0].question_text, 'An atom consists of');
    assert.strictEqual(result.questions[0].option_a, 'protons');
    assert.strictEqual(result.questions[0].option_d, 'all of the above');
    assert.strictEqual(result.questions[0].correct_answer, null);
    assert.strictEqual(result.questions[0].has_answer, false);
    assert.strictEqual(result.questions[1].question_text, 'The process of plant water loss is');
    assert.strictEqual(result.questions[1].option_b, 'Transpiration');
    assert.strictEqual(result.questions[1].correct_answer, null);
    assert.strictEqual(result.questions[1].has_answer, false);
  });

  // ────────────────────────────────────────────────────────────
  // TEST 14: OMML Math XML to LaTeX Conversion (Fractions, Radicals, Powers)
  // ────────────────────────────────────────────────────────────
  await runTest('OMML to LaTeX conversion: fractions, radicals, powers, and symbols', () => {
    const { ommlToLatex } = _internal;

    // 1. Fraction: \frac{12}{5}
    const fractionXml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:f>
        <m:num><m:r><m:t>12</m:t></m:r></m:num>
        <m:den><m:r><m:t>5</m:t></m:r></m:den>
      </m:f>
    </m:oMath>`;
    assert.strictEqual(ommlToLatex(fractionXml), '\\frac{12}{5}');

    // 2. Radical: \sqrt{x}
    const radicalXml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:rad>
        <m:deg/>
        <m:e><m:r><m:t>x</m:t></m:r></m:e>
      </m:rad>
    </m:oMath>`;
    assert.strictEqual(ommlToLatex(radicalXml), '\\sqrt{x}');

    // 3. Power / Superscript: 25 - x^2
    const powerXml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:r><m:t>25 - </m:t></m:r>
      <m:sSup>
        <m:e><m:r><m:t>x</m:t></m:r></m:e>
        <m:sup><m:r><m:t>2</m:t></m:r></m:sup>
      </m:sSup>
    </m:oMath>`;
    assert.strictEqual(ommlToLatex(powerXml), '25 - {x}^{2}');

    // 4. Arrow mapping: f:x -> \sqrt{x}
    const arrowXml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:r><m:t>f:x -&gt; </m:t></m:r>
      <m:rad><m:deg/><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad>
    </m:oMath>`;
    assert.strictEqual(ommlToLatex(arrowXml), 'f:x \\to \\sqrt{x}');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 15: Pure-Math Question Stem Retention (Question 1 Not Dropped)
  // ────────────────────────────────────────────────────────────
  await runTest('Pure-math question stem retention (Equation-only stem)', () => {
    const text = `1. $\\frac{d}{dx}(x^3 + 2x)$
A. $3x^2 + 2$
B. $3x^2$
C. $x^2 + 2$
D. $6x$
Ans: A

2. Given that $f:x \\to \\sqrt{x}$ and $g:x \\to 25 - x^2$, find the value of $fog(3)$
A. $\\frac{12}{5}$
B. $\\frac{9}{4}$
C. 4
D. 16
Ans: C`;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 2);

    // Question 1 must not be dropped
    const q1 = result.questions[0];
    assert.strictEqual(q1.number, 1);
    assert.strictEqual(q1.question_text, '$\\frac{d}{dx}(x^3 + 2x)$');
    assert.strictEqual(q1.option_a, '$3x^2 + 2$');
    assert.strictEqual(q1.correct_answer, 'A');

    // Question 2
    const q2 = result.questions[1];
    assert.strictEqual(q2.number, 2);
    assert.ok(q2.question_text.includes('$f:x \\to \\sqrt{x}$'));
    assert.ok(q2.question_text.includes('$g:x \\to 25 - x^2$'));
    assert.strictEqual(q2.option_a, '$\\frac{12}{5}$');
    assert.strictEqual(q2.option_b, '$\\frac{9}{4}$');
    assert.strictEqual(q2.correct_answer, 'C');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 16: End-to-End DOCX Buffer Parsing with OMML Word Equations
  // ────────────────────────────────────────────────────────────
  await runTest('End-to-End DOCX parsing with OMML Word equations (Further Mathematics)', async () => {
    // Construct a minimal valid .docx buffer with OMML equations in word/document.xml
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

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t>1. Evaluate </w:t></w:r>
      <m:oMath>
        <m:f>
          <m:num><m:r><m:t>d</m:t></m:r></m:num>
          <m:den><m:r><m:t>dx</m:t></m:r></m:den>
        </m:f>
        <m:d>
          <m:e><m:r><m:t>x^3 + 2x</m:t></m:r></m:e>
        </m:d>
      </m:oMath>
    </w:p>
    <w:p>
      <w:r><w:t>A. 3x^2 + 2</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>B. 3x^2</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>C. x^2 + 2</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>D. 6x</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Ans: A</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>2. Given that </w:t></w:r>
      <m:oMath>
        <m:r><m:t>f:x -&gt; </m:t></m:r>
        <m:rad><m:deg/><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad>
      </m:oMath>
      <w:r><w:t> and </w:t></w:r>
      <m:oMath>
        <m:r><m:t>g:x -&gt; 25 - </m:t></m:r>
        <m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>
      </m:oMath>
      <w:r><w:t>, find the value of </w:t></w:r>
      <m:oMath><m:r><m:t>fog(3)</m:t></m:r></m:oMath>
    </w:p>
    <w:p>
      <w:r><w:t>A. </w:t></w:r>
      <m:oMath><m:f><m:num><m:r><m:t>12</m:t></m:r></m:num><m:den><m:r><m:t>5</m:t></m:r></m:den></m:f></m:oMath>
    </w:p>
    <w:p>
      <w:r><w:t>B. </w:t></w:r>
      <m:oMath><m:f><m:num><m:r><m:t>9</m:t></m:r></m:num><m:den><m:r><m:t>4</m:t></m:r></m:den></m:f></m:oMath>
    </w:p>
    <w:p>
      <w:r><w:t>C. 4</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>D. 16</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Ans: C</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

    zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf-8'));
    const docxBuffer = zip.toBuffer();

    const parseResult = await parseDocxBuffer(docxBuffer);
    assert.strictEqual(parseResult.questions.length, 2);

    const q1 = parseResult.questions[0];
    assert.strictEqual(q1.number, 1);
    assert.ok(q1.question_text.includes('\\frac{d}{dx}'));
    assert.strictEqual(q1.option_a, '3x^2 + 2');
    assert.strictEqual(q1.correct_answer, 'A');

    const q2 = parseResult.questions[1];
    assert.strictEqual(q2.number, 2);
    assert.ok(q2.question_text.includes('f:x \\to \\sqrt{x}'));
    assert.ok(q2.question_text.includes('g:x \\to 25 - {x}^{2}'));
    assert.ok(q2.question_text.includes('fog(3)'));
    assert.strictEqual(q2.option_a, '$\\frac{12}{5}$');
    assert.strictEqual(q2.option_b, '$\\frac{9}{4}$');
    assert.strictEqual(q2.option_c, '4');
    assert.strictEqual(q2.option_d, '16');
    assert.strictEqual(q2.correct_answer, 'C');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 17: DOCX Buffer Without Answer Keys (No Auto-Select 'A' Fallback)
  // ────────────────────────────────────────────────────────────
  await runTest('DOCX parsing without answer keys leaves correct_answer null and has_answer false', async () => {
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

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>1. What is the chemical formula of water?</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. H2O</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. CO2</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. NaCl</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. O2</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf-8'));
    const docxBuffer = zip.toBuffer();

    const parseResult = await parseDocxBuffer(docxBuffer);
    assert.strictEqual(parseResult.questions.length, 1);

    const q1 = parseResult.questions[0];
    assert.strictEqual(q1.number, 1);
    assert.strictEqual(q1.question_text, 'What is the chemical formula of water?');
    assert.strictEqual(q1.option_a, 'H2O');
    assert.strictEqual(q1.option_b, 'CO2');
    assert.strictEqual(q1.option_c, 'NaCl');
    assert.strictEqual(q1.option_d, 'O2');
    assert.strictEqual(q1.correct_answer, null);
    assert.strictEqual(q1.has_answer, false);
  });

  // ────────────────────────────────────────────────────────────
  // TEST 18: Glued Sentence-Ending Punctuation & Cloze Underscores
  // ────────────────────────────────────────────────────────────
  await runTest('Glued punctuation (.A., ?A., _____A., (A.)) is cleanly separated and parsed', () => {
    const text = `
59. I saw my uncle.A. whom B. whose C. who D. which Ans: C
60. Did you see the boy?A. yes B. no C. maybe D. never Ans: A
61. He went to the _____A. market B. school C. church D. farm Ans: A
62. Choose the correct option (A. first B. second C. third D. fourth) Ans: B
`;
    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 4);

    const q59 = result.questions[0];
    assert.strictEqual(q59.number, 59);
    assert.strictEqual(q59.question_text, 'I saw my uncle.');
    assert.strictEqual(q59.option_a, 'whom');
    assert.strictEqual(q59.option_b, 'whose');
    assert.strictEqual(q59.option_c, 'who');
    assert.strictEqual(q59.option_d, 'which');
    assert.strictEqual(q59.correct_answer, 'C');

    const q60 = result.questions[1];
    assert.strictEqual(q60.number, 60);
    assert.strictEqual(q60.question_text, 'Did you see the boy?');
    assert.strictEqual(q60.option_a, 'yes');
    assert.strictEqual(q60.correct_answer, 'A');

    const q61 = result.questions[2];
    assert.strictEqual(q61.number, 61);
    assert.strictEqual(q61.question_text, 'He went to the _____');
    assert.strictEqual(q61.option_a, 'market');
    assert.strictEqual(q61.correct_answer, 'A');

    const q62 = result.questions[3];
    assert.strictEqual(q62.number, 62);
    assert.strictEqual(q62.question_text, 'Choose the correct option');
    assert.strictEqual(q62.option_a, 'first');
    assert.strictEqual(q62.correct_answer, 'B');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 19: Multi-Column Tab-Separated Options
  // ────────────────────────────────────────────────────────────
  await runTest('Tab-separated options (\\t) in multi-column layout are normalized and parsed', () => {
    const text = `
1. Identify the noun in the sentence.\tA. quickly\tB. house\tC. very\tD. under\nAns: B
2. Select the antonym of ancient.\tA. antique\tB. modern\tC. old\tD. historic\nAns: B
`;
    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 2);

    const q1 = result.questions[0];
    assert.strictEqual(q1.number, 1);
    assert.strictEqual(q1.question_text, 'Identify the noun in the sentence.');
    assert.strictEqual(q1.option_a, 'quickly');
    assert.strictEqual(q1.option_b, 'house');
    assert.strictEqual(q1.option_c, 'very');
    assert.strictEqual(q1.option_d, 'under');
    assert.strictEqual(q1.correct_answer, 'B');

    const q2 = result.questions[1];
    assert.strictEqual(q2.number, 2);
    assert.strictEqual(q2.question_text, 'Select the antonym of ancient.');
    assert.strictEqual(q2.option_b, 'modern');
    assert.strictEqual(q2.correct_answer, 'B');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 20: 70-Question English Midterm Paper with Multi-Column & Sections
  // ────────────────────────────────────────────────────────────
  await runTest('70-Question English exam paper: all 70 questions parsed with zero swallowed questions (Q59/60/61 isolated)', async () => {
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

    let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>SS3 FIRST TERM MIDTERM EXAMINATION 2026</w:t></w:r></w:p>
    <w:p><w:r><w:t>SUBJECT: ENGLISH LANGUAGE</w:t></w:r></w:p>
    
    <w:p><w:r><w:t>SECTION A: COMPREHENSION</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: Read the passage below carefully and answer the questions that follow.</w:t></w:r></w:p>
    <w:p><w:r><w:t>[PASSAGE: Technology has transformed modern education in unprecedented ways. Students today have access to vast repositories of knowledge at their fingertips.]</w:t></w:r></w:p>`;

    // Questions 1–10 (Comprehension with 5 options A-E)
    for (let i = 1; i <= 10; i++) {
      docXml += `
    <w:p><w:r><w:t>${i}. How has technology affected modern education? A. negatively B. positively C. unprecedented ways D. slightly E. not at all</w:t></w:r></w:p>`;
    }

    // Section B: Lexis & Structure (Questions 11–30 with glued punctuation .A.)
    docXml += `
    <w:p><w:r><w:t>SECTION B: LEXIS AND STRUCTURE</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: From the words lettered A to D, choose the word that best completes each sentence.</w:t></w:r></w:p>`;

    for (let i = 11; i <= 30; i++) {
      docXml += `
    <w:p><w:r><w:t>${i}. He was congratulated on his great achievement.A. for B. on C. with D. at</w:t></w:r></w:p>`;
    }

    // Section C: Synonyms & Antonyms (Questions 31–50 with tabs \t)
    docXml += `
    <w:p><w:r><w:t>SECTION C: SYNONYMS AND ANTONYMS</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: Choose the word opposite in meaning to the underlined word.</w:t></w:r></w:p>`;

    for (let i = 31; i <= 50; i++) {
      docXml += `
    <w:p><w:r><w:t>${i}. The boy was very arrogant.\tA. humble\tB. proud\tC. bold\tD. timid</w:t></w:r></w:p>`;
    }

    // Section D: Oral English (Questions 51–70 with multi-column question packing)
    docXml += `
    <w:p><w:r><w:t>SECTION D: ORAL ENGLISH</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: Choose the word that contains the sound represented by the phonetic symbol.</w:t></w:r></w:p>`;

    for (let i = 51; i <= 70; i++) {
      // Simulate multi-column layout where Question 59, 60, 61 have glued punctuation
      if (i === 59) {
        docXml += `<w:p><w:r><w:t>59. He saw my uncle.A. whom B. whose C. who D. which E. where</w:t></w:r></w:p>`;
      } else if (i === 60) {
        docXml += `<w:p><w:r><w:t>60. The phoneme /k/ is found in: A. knife B. cat C. church D. thought</w:t></w:r></w:p>`;
      } else if (i === 61) {
        docXml += `<w:p><w:r><w:t>61. The vowel /i:/ occurs in: A. sit B. seat C. set D. sat</w:t></w:r></w:p>`;
      } else {
        docXml += `<w:p><w:r><w:t>${i}. Choose the word with vowel /e/. A. bed B. bad C. bird D. bud</w:t></w:r></w:p>`;
      }
    }

    // Bottom answer block for all 70 questions
    docXml += `
    <w:p><w:r><w:t>ANSWERS:</w:t></w:r></w:p>`;
    for (let i = 1; i <= 70; i++) {
      const ansLetter = ['A', 'B', 'C', 'D'][i % 4];
      docXml += `
    <w:p><w:r><w:t>${i}. ${ansLetter}</w:t></w:r></w:p>`;
    }

    docXml += `
  </w:body>
</w:document>`;

    zip.addFile('word/document.xml', Buffer.from(docXml, 'utf-8'));
    const docxBuffer = zip.toBuffer();

    const parseResult = await parseDocxBuffer(docxBuffer);

    // 1. MUST extract exactly 70 questions
    assert.strictEqual(parseResult.questions.length, 70);

    // 2. Question 2 must be Question 2, not swallowing Question 59/60/61
    const q2 = parseResult.questions[1];
    assert.strictEqual(q2.number, 2);
    assert.ok(q2.question_text.includes('How has technology affected modern education?'));
    assert.ok(!q2.question_text.includes('59.'));
    assert.ok(!q2.question_text.includes('60.'));
    assert.ok(!q2.question_text.includes('61.'));
    assert.strictEqual(q2.option_a, 'negatively');
    assert.strictEqual(q2.option_b, 'positively');

    // 3. Question 59 must be individually parsed
    const q59 = parseResult.questions[58];
    assert.strictEqual(q59.number, 59);
    assert.ok(q59.question_text.includes('He saw my uncle.'));
    assert.strictEqual(q59.option_a, 'whom');
    assert.strictEqual(q59.option_b, 'whose');
    assert.strictEqual(q59.option_c, 'who');
    assert.strictEqual(q59.option_d, 'which');

    // 4. Question 60 must be individually parsed
    const q60 = parseResult.questions[59];
    assert.strictEqual(q60.number, 60);
    assert.ok(q60.question_text.includes('The phoneme /k/ is found in:'));
    assert.strictEqual(q60.option_b, 'cat');

    // 5. Question 61 must be individually parsed
    const q61 = parseResult.questions[60];
    assert.strictEqual(q61.number, 61);
    assert.ok(q61.question_text.includes('The vowel /i:/ occurs in:'));
    assert.strictEqual(q61.option_b, 'seat');

    // 6. Question 70 must be individually parsed
    const q70 = parseResult.questions[69];
    assert.strictEqual(q70.number, 70);
    assert.ok(q70.question_text.includes('Choose the word with vowel /e/.'));
    assert.strictEqual(q70.option_a, 'bed');

    // 7. Verify all 70 questions have valid answers resolved from the bottom block
    for (let i = 0; i < 70; i++) {
      const q = parseResult.questions[i];
      assert.ok(['A', 'B', 'C', 'D'].includes(q.correct_answer), `Question ${q.number} should have a valid answer`);
      assert.strictEqual(q.has_answer, true);
    }
  });

  // ────────────────────────────────────────────────────────────
  // TEST 21: 40-Question Further Mathematics Exam (Limits, Equations, Q31, No Option D Swallowing)
  // ────────────────────────────────────────────────────────────
  await runTest('40-Question Further Mathematics paper: Option D of Q1 never swallows Q2..Q40 (including Q31 limits)', async () => {
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

    let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p><w:r><w:t>SS3 FURTHER MATHEMATICS FIRST TERM EXAMINATION</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: Answer all questions.</w:t></w:r></w:p>`;

    // Generate 40 Further Mathematics questions
    for (let i = 1; i <= 40; i++) {
      if (i === 1) {
        docXml += `
    <w:p>
      <w:r><w:t>1. Evaluate </w:t></w:r>
      <m:oMath><m:f><m:num><m:r><m:t>d</m:t></m:r></m:num><m:den><m:r><m:t>dx</m:t></m:r></m:den></m:f><m:d><m:e><m:r><m:t>x^3 + 2x</m:t></m:r></m:e></m:d></m:oMath>
    </w:p>
    <w:p><w:r><w:t>A. 3x^2 + 2</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. 3x^2</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. x^2 + 2</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. 6x</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ans: A</w:t></w:r></w:p>`;
      } else if (i === 31) {
        docXml += `
    <w:p>
      <w:r><w:t>31. Evaluate the limit: </w:t></w:r>
      <m:oMath><m:limLow><m:e><m:f><m:num><m:r><m:t>sin x</m:t></m:r></m:num><m:den><m:r><m:t>x</m:t></m:r></m:den></m:f></m:e><m:lim><m:r><m:t>x -&gt; 0</m:t></m:r></m:lim></m:limLow></m:oMath>
    </w:p>
    <w:p><w:r><w:t>A. 0</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. 1</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. \\infty</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. undefined</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ans: B</w:t></w:r></w:p>`;
      } else {
        docXml += `
    <w:p>
      <w:r><w:t>${i}. Find the value of x when </w:t></w:r>
      <m:oMath><m:sSup><m:e><m:r><m:t>2</m:t></m:r></m:e><m:sup><m:r><m:t>x</m:t></m:r></m:sup></m:sSup><m:r><m:t> = 16</m:t></m:r></m:oMath>
    </w:p>
    <w:p><w:r><w:t>A. 2</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. 3</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. 4</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. 5</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ans: C</w:t></w:r></w:p>`;
      }
    }

    docXml += `
  </w:body>
</w:document>`;

    zip.addFile('word/document.xml', Buffer.from(docXml, 'utf-8'));
    const docxBuffer = zip.toBuffer();

    const parseResult = await parseDocxBuffer(docxBuffer);

    // 1. MUST extract exactly 40 questions
    assert.strictEqual(parseResult.questions.length, 40);

    // 2. Question 1 must have its own concise stem and options
    const q1 = parseResult.questions[0];
    assert.strictEqual(q1.number, 1);
    assert.ok(q1.question_text.includes('\\frac{d}{dx}'));
    assert.strictEqual(q1.option_a, '3x^2 + 2');
    assert.strictEqual(q1.option_b, '3x^2');
    assert.strictEqual(q1.option_c, 'x^2 + 2');
    assert.strictEqual(q1.option_d, '6x');
    assert.strictEqual(q1.correct_answer, 'A');

    // 3. Question 2 must not be swallowed into Question 1's Option D
    const q2 = parseResult.questions[1];
    assert.strictEqual(q2.number, 2);
    assert.ok(q2.question_text.includes('Find the value of x'));
    assert.strictEqual(q2.option_c, '4');
    assert.strictEqual(q2.correct_answer, 'C');

    // 4. Question 31 (limits) must be individually parsed
    const q31 = parseResult.questions[30];
    assert.strictEqual(q31.number, 31);
    assert.ok(q31.question_text.includes('limit'));
    assert.strictEqual(q31.option_a, '0');
    assert.strictEqual(q31.option_b, '1');
    assert.strictEqual(q31.option_c, '\\infty');
    assert.strictEqual(q31.option_d, 'undefined');
    assert.strictEqual(q31.correct_answer, 'B');

    // 5. Question 40 must be cleanly parsed
    const q40 = parseResult.questions[39];
    assert.strictEqual(q40.number, 40);
    assert.strictEqual(q40.option_c, '4');
    assert.strictEqual(q40.correct_answer, 'C');
  });

  // ────────────────────────────────────────────────────────────
  // TEST 22: Complete 80-Question English Exam Paper (Section Instructions & Tabular Cloze Q71-80)
  // ────────────────────────────────────────────────────────────
  await runTest('80-Question English exam paper: Section instructions prepended & Section 5 Tabular Cloze (Q71-80) extracted', async () => {
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

    let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>SS3 FIRST TERM EXAMINATION 2026</w:t></w:r></w:p>
    <w:p><w:r><w:t>SUBJECT: ENGLISH LANGUAGE</w:t></w:r></w:p>
    
    <w:p><w:r><w:t>SECTION 1: COMPREHENSION</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: Read the passage below carefully and answer the questions that follow.</w:t></w:r></w:p>
    <w:p><w:r><w:t>[PASSAGE: Technology has transformed modern education in unprecedented ways. Students today have access to vast repositories of knowledge at their fingertips.]</w:t></w:r></w:p>`;

    // Questions 1–10 (Comprehension)
    for (let i = 1; i <= 10; i++) {
      docXml += `
    <w:p><w:r><w:t>${i}. How has technology affected modern education? A. negatively B. positively C. unprecedented ways D. slightly</w:t></w:r></w:p>`;
    }

    // Section 2: Lexis & Structure (Questions 11–30 with glued punctuation .A.)
    docXml += `
    <w:p><w:r><w:t>SECTION 2: LEXIS AND STRUCTURE</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: From the words lettered A to D, choose the word that best completes each sentence.</w:t></w:r></w:p>`;

    for (let i = 11; i <= 30; i++) {
      docXml += `
    <w:p><w:r><w:t>${i}. He was congratulated on his great achievement.A. for B. on C. with D. at</w:t></w:r></w:p>`;
    }

    // Section 3: Synonyms (Questions 31–50) with multi-line section & instruction headers
    docXml += `
    <w:p><w:r><w:t>SECTION 3</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION</w:t></w:r></w:p>
    <w:p><w:r><w:t>From the words lettered A to D, choose the word that is nearest in meaning to the underlined word in each of the following sentences.</w:t></w:r></w:p>`;

    for (let i = 31; i <= 50; i++) {
      if (i === 31) {
        docXml += `
    <w:p><w:r><w:t>31. It is imperative that we attend the meeting.\tA. necessary\tB. optional\tC. doubtful\tD. trivial</w:t></w:r></w:p>`;
      } else {
        docXml += `
    <w:p><w:r><w:t>${i}. The speaker gave a lucid presentation.\tA. clear\tB. dark\tC. vague\tD. confusing</w:t></w:r></w:p>`;
      }
    }

    // Section 4: Oral English (Questions 51–70)
    docXml += `
    <w:p><w:r><w:t>SECTION 4: ORAL ENGLISH</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: Choose the word that contains the sound represented by the phonetic symbol.</w:t></w:r></w:p>`;

    for (let i = 51; i <= 70; i++) {
      docXml += `
    <w:p><w:r><w:t>${i}. Choose the word with vowel /e/. A. bed B. bad C. bird D. bud</w:t></w:r></w:p>`;
    }

    // Section 5: Cloze Passage with Tabular Columnar Matrix (Questions 71–80)
    docXml += `
    <w:p><w:r><w:t>SECTION 5</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION</w:t></w:r></w:p>
    <w:p><w:r><w:t>In the following passage, the numbered gaps indicate missing words. Against each number in the list below the passage, five options are given in columns lettered A to E. Choose the word that is the most suitable to fill each numbered gap.</w:t></w:r></w:p>
    <w:p><w:r><w:t>PASSAGE</w:t></w:r></w:p>
    <w:p><w:r><w:t>Technology and humanity are intertwined. Early humans used simple __71__, but modern science has evolved into complex __72__ that shape our daily lives. Many people join __73__ to learn new skills. With __74__ thinking, people solve hard problems __75__. Today, modern __76__ brings __77__ to communities. When faced with a __78__, we __79__ a path towards a bright __80__.</w:t></w:r></w:p>
    <w:p><w:r><w:t>    A\tB\tC\tD\tE</w:t></w:r></w:p>
    <w:p><w:r><w:t>71) animal kingdom\thuman beings\tmammal group\tmortal body\tprimate family</w:t></w:r></w:p>
    <w:p><w:r><w:t>72) clubs\tclusters\tgangs\tgroups\tteams</w:t></w:r></w:p>
    <w:p><w:r><w:t>73) tool\tgadget\tdevice\timplement\tutensil</w:t></w:r></w:p>
    <w:p><w:r><w:t>74) basic\tadvanced\tprimitive\tmodern\tsimple</w:t></w:r></w:p>
    <w:p><w:r><w:t>75) slowly\trapidly\tgradually\tsteadily\tswiftly</w:t></w:r></w:p>
    <w:p><w:r><w:t>76) science\tart\tculture\tnature\thistory</w:t></w:r></w:p>
    <w:p><w:r><w:t>77) danger\tsafety\tpeace\tconflict\tharmony</w:t></w:r></w:p>
    <w:p><w:r><w:t>78) problem\tsolution\tquestion\triddle\tpuzzle</w:t></w:r></w:p>
    <w:p><w:r><w:t>79) create\tdestroy\tbuild\tproduce\tmake</w:t></w:r></w:p>
    <w:p><w:r><w:t>80) future\tpast\tpresent\thistory\tdestiny</w:t></w:r></w:p>`;

    // Bottom answer block for all 80 questions
    docXml += `
    <w:p><w:r><w:t>ANSWERS:</w:t></w:r></w:p>`;
    for (let i = 1; i <= 80; i++) {
      const ansLetter = ['A', 'B', 'C', 'D'][i % 4];
      docXml += `
    <w:p><w:r><w:t>${i}. ${ansLetter}</w:t></w:r></w:p>`;
    }

    docXml += `
  </w:body>
</w:document>`;

    zip.addFile('word/document.xml', Buffer.from(docXml, 'utf-8'));
    const docxBuffer = zip.toBuffer();

    const parseResult = await parseDocxBuffer(docxBuffer);

    // 1. MUST extract exactly 80 questions
    assert.strictEqual(parseResult.questions.length, 80, `Expected 80 questions, got ${parseResult.questions.length}`);

    // 2. Section 3 (Q31) must have multi-line instruction prepended to stem
    const q31 = parseResult.questions[30];
    assert.strictEqual(q31.number, 31);
    assert.ok(
      q31.question_text.includes('[INSTRUCTION: From the words lettered A to D, choose the word that is nearest in meaning'),
      `Q31 should contain Section 3 instruction, got: ${q31.question_text}`
    );
    assert.ok(q31.question_text.includes('It is imperative that we attend the meeting.'));
    assert.strictEqual(q31.option_a, 'necessary');
    assert.strictEqual(q31.option_b, 'optional');
    assert.strictEqual(q31.option_c, 'doubtful');
    assert.strictEqual(q31.option_d, 'trivial');

    // 3. Section 5 Cloze Questions (Q71–80) must be fully extracted
    const q71 = parseResult.questions[70];
    assert.strictEqual(q71.number, 71);
    assert.ok(
      q71.question_text.includes('[INSTRUCTION: In the following passage, the numbered gaps indicate missing words.'),
      `Q71 should contain Section 5 instruction, got: ${q71.question_text}`
    );
    assert.ok(
      q71.question_text.includes('[PASSAGE: Technology and humanity are intertwined.'),
      `Q71 should contain Section 5 passage, got: ${q71.question_text}`
    );
    assert.ok(q71.question_text.includes('gap (71)'));
    // Multi-word options must be preserved without splitting on single space
    assert.strictEqual(q71.option_a, 'animal kingdom');
    assert.strictEqual(q71.option_b, 'human beings');
    assert.strictEqual(q71.option_c, 'mammal group');
    assert.strictEqual(q71.option_d, 'mortal body');

    // 4. Verify Q72 through Q80
    const q72 = parseResult.questions[71];
    assert.strictEqual(q72.number, 72);
    assert.strictEqual(q72.option_a, 'clubs');
    assert.strictEqual(q72.option_b, 'clusters');
    assert.strictEqual(q72.option_c, 'gangs');
    assert.strictEqual(q72.option_d, 'groups');

    const q80 = parseResult.questions[79];
    assert.strictEqual(q80.number, 80);
    assert.strictEqual(q80.option_a, 'future');
    assert.strictEqual(q80.option_b, 'past');
    assert.strictEqual(q80.option_c, 'present');
    assert.strictEqual(q80.option_d, 'history');

    // 5. Verify all 80 questions have answers mapped
    for (let i = 0; i < 80; i++) {
      const q = parseResult.questions[i];
      assert.ok(['A', 'B', 'C', 'D'].includes(q.correct_answer), `Question ${q.number} should have a valid answer`);
      assert.strictEqual(q.has_answer, true);
    }
  });

  // ────────────────────────────────────────────────────────────
  // TEST 23: Real School Format: Unnumbered Questions (Q1-52, Q54-70) + Numbered Q53 + Cloze Matrix (Q71-80)
  // ────────────────────────────────────────────────────────────
  await runTest('Real School Paper: Unnumbered paragraphs (Q1-52, Q54-70) + Numbered Q53 + Cloze Matrix (Q71-80) auto-numbered 1-80', async () => {
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

    let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>SS3 FIRST TERM MIDTERM EXAMINATION 2026</w:t></w:r></w:p>
    <w:p><w:r><w:t>SUBJECT: ENGLISH LANGUAGE</w:t></w:r></w:p>
    
    <w:p><w:r><w:t>SECTION 1</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION</w:t></w:r></w:p>
    <w:p><w:r><w:t>From the words lettered A to E, choose the word that best completes each of the following sentences.</w:t></w:r></w:p>`;

    // Questions 1 to 52: Unnumbered paragraphs with implicit Option A and glued .A.
    // Q1: Implicit Option A
    docXml += `
    <w:p><w:r><w:t>The association has a set of ____ governing its activities. decrees  B. rules  C. edicts  D. constitution  E. ordinance</w:t></w:r></w:p>`;
    // Q2: Glued .A.
    docXml += `
    <w:p><w:r><w:t>Some crops were destroyed by a __________ of locusts.A. band  B. shoal  C. swarm  D. school  E. troupe</w:t></w:r></w:p>`;
    // Q3: Glued .A.
    docXml += `
    <w:p><w:r><w:t>The economic policy of the government has been criticized by the opposition.A. overruled  B. rejected  C. appreciated  D. condemned  E. commended</w:t></w:r></w:p>`;

    // Q4 to Q52: Mix of unnumbered paragraphs
    for (let i = 4; i <= 52; i++) {
      if (i % 2 === 0) {
        docXml += `
    <w:p><w:r><w:t>The principal commended the students for their exemplary conduct.A. praised  B. scolded  C. warned  D. ignored  E. punished</w:t></w:r></w:p>`;
      } else {
        docXml += `
    <w:p><w:r><w:t>He is an expert in the field of modern biology. specialist  B. novice  C. amateur  D. student  E. teacher</w:t></w:r></w:p>`;
      }
    }

    // Section 2: Q53 is explicitly numbered, Q54-70 are unnumbered
    docXml += `
    <w:p><w:r><w:t>SECTION 2: LEXIS AND STRUCTURE</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION: Choose the word opposite in meaning to the underlined word.</w:t></w:r></w:p>
    <w:p><w:r><w:t>53. His hostility towards the new plan was very obvious.\tA. friendliness\tB. enmity\tC. anger\tD. hatred\tE. malice</w:t></w:r></w:p>`;

    for (let i = 54; i <= 70; i++) {
      docXml += `
    <w:p><w:r><w:t>The judge was known for his impartial rulings.A. biased  B. fair  C. just  D. neutral  E. honest</w:t></w:r></w:p>`;
    }

    // Section 3: Section 5 Cloze Passage with Tabular Columnar Matrix (Questions 71–80)
    docXml += `
    <w:p><w:r><w:t>SECTION 3: CLOZE PASSAGE</w:t></w:r></w:p>
    <w:p><w:r><w:t>INSTRUCTION</w:t></w:r></w:p>
    <w:p><w:r><w:t>In the following passage, the numbered gaps indicate missing words. Against each number in the list below the passage, five options are given in columns lettered A to E. Choose the word that is the most suitable to fill each numbered gap.</w:t></w:r></w:p>
    <w:p><w:r><w:t>PASSAGE</w:t></w:r></w:p>
    <w:p><w:r><w:t>Agriculture remains the backbone of the economy. Farmers cultivate __71__ using traditional __72__ and modern __73__. With proper __74__, crop yield rises __75__. Storage __76__ prevent waste. Healthy __77__ ensures food security for all __78__. Investment in __79__ creates sustainable __80__.</w:t></w:r></w:p>
    <w:p><w:r><w:t>    A\tB\tC\tD\tE</w:t></w:r></w:p>
    <w:p><w:r><w:t>71) crops\tseeds\tplants\ttrees\tgrains</w:t></w:r></w:p>
    <w:p><w:r><w:t>72) methods\ttools\thabits\tcustoms\ttraits</w:t></w:r></w:p>
    <w:p><w:r><w:t>73) equipment\tdevices\tgears\tmachines\tengines</w:t></w:r></w:p>
    <w:p><w:r><w:t>74) irrigation\tdrainage\twatering\tflooding\tsoaking</w:t></w:r></w:p>
    <w:p><w:r><w:t>75) greatly\tslightly\tpartly\tmerely\thardly</w:t></w:r></w:p>
    <w:p><w:r><w:t>76) facilities\thouses\tbarns\tsilos\tsheds</w:t></w:r></w:p>
    <w:p><w:r><w:t>77) harvest\tplanting\tsowing\treaping\tgathering</w:t></w:r></w:p>
    <w:p><w:r><w:t>78) citizens\tpeople\tnations\tfamilies\tvillages</w:t></w:r></w:p>
    <w:p><w:r><w:t>79) farming\tforestry\tfishing\thunting\tranching</w:t></w:r></w:p>
    <w:p><w:r><w:t>80) development\tgrowth\tprogress\tsuccess\tfuture</w:t></w:r></w:p>`;

    // Bottom answer block for all 80 questions
    docXml += `
    <w:p><w:r><w:t>ANSWERS:</w:t></w:r></w:p>`;
    for (let i = 1; i <= 80; i++) {
      const ansLetter = ['A', 'B', 'C', 'D'][i % 4];
      docXml += `
    <w:p><w:r><w:t>${i}. ${ansLetter}</w:t></w:r></w:p>`;
    }

    docXml += `
  </w:body>
</w:document>`;

    zip.addFile('word/document.xml', Buffer.from(docXml, 'utf-8'));
    const docxBuffer = zip.toBuffer();

    const parseResult = await parseDocxBuffer(docxBuffer);

    // 1. MUST extract exactly 80 questions (zero questions dropped!)
    assert.strictEqual(parseResult.questions.length, 80, `Expected 80 questions, got ${parseResult.questions.length}`);

    // 2. Q1 should be auto-numbered as 1, with instruction and implicit Option A extracted
    const q1 = parseResult.questions[0];
    assert.strictEqual(q1.number, 1);
    assert.ok(q1.question_text.includes('[INSTRUCTION: From the words lettered A to E, choose the word that best completes each of the following sentences.]'));
    assert.ok(q1.question_text.includes('The association has a set of ____ governing its activities.'));
    assert.strictEqual(q1.option_a, 'decrees');
    assert.strictEqual(q1.option_b, 'rules');
    assert.strictEqual(q1.option_c, 'edicts');
    assert.strictEqual(q1.option_d, 'constitution');

    // 3. Q2 should be auto-numbered as 2, with glued .A. separated
    const q2 = parseResult.questions[1];
    assert.strictEqual(q2.number, 2);
    assert.ok(q2.question_text.includes('Some crops were destroyed by a __________ of locusts.'));
    assert.strictEqual(q2.option_a, 'band');
    assert.strictEqual(q2.option_b, 'shoal');
    assert.strictEqual(q2.option_c, 'swarm');
    assert.strictEqual(q2.option_d, 'school');

    // 4. Q53 should maintain its explicit number 53
    const q53 = parseResult.questions[52];
    assert.strictEqual(q53.number, 53);
    assert.ok(q53.question_text.includes('His hostility towards the new plan was very obvious.'));
    assert.strictEqual(q53.option_a, 'friendliness');
    assert.strictEqual(q53.option_b, 'enmity');

    // 5. Q54 should be sequential 54
    const q54 = parseResult.questions[53];
    assert.strictEqual(q54.number, 54);
    assert.ok(q54.question_text.includes('The judge was known for his impartial rulings.'));
    assert.strictEqual(q54.option_a, 'biased');

    // 6. Q71-80 Cloze Matrix rows should be sequential 71-80
    const q71 = parseResult.questions[70];
    assert.strictEqual(q71.number, 71);
    assert.ok(q71.question_text.includes('[INSTRUCTION: In the following passage, the numbered gaps indicate missing words.'));
    assert.ok(q71.question_text.includes('[PASSAGE: Agriculture remains the backbone of the economy.'));
    assert.ok(q71.question_text.includes('gap (71)'));
    assert.strictEqual(q71.option_a, 'crops');
    assert.strictEqual(q71.option_b, 'seeds');

    const q80 = parseResult.questions[79];
    assert.strictEqual(q80.number, 80);
    assert.strictEqual(q80.option_a, 'development');
    assert.strictEqual(q80.option_b, 'growth');

    // 7. Verify all 80 questions have answers mapped from bottom block
    for (let i = 0; i < 80; i++) {
      const q = parseResult.questions[i];
      assert.ok(['A', 'B', 'C', 'D'].includes(q.correct_answer), `Question ${q.number} should have a valid answer`);
      assert.strictEqual(q.has_answer, true);
    }
  });

  // ────────────────────────────────────────────────────────────
  // SUMMARY
  // ────────────────────────────────────────────────────────────
  console.log(`\n========================================`);
  console.log(`Results: ${passedTests} / ${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    console.log('🎉 All parser unit tests passed perfectly!');
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

