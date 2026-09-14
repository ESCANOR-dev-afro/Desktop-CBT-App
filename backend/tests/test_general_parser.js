const assert = require('assert');
const { parseStandardDocx, parsePlainText } = require('../services/parsers/standardDocxParser');
const { parseDocxWithStrategy } = require('../services/parsers/index');
const { parseDocxBuffer } = require('../services/docxQuestionParser');

console.log('======================================================================');
console.log('🧪 RUNNING TEST SUITE: GENERAL / STANDARD STRATEGY & DISPATCHER');
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
  // TEST 1: Standard 4-Option MCQs with inline answers
  await runTest('Standard MCQ: Inline answers with Answer: prefix', async () => {
    const text = `
1. What is the capital of Nigeria?
A. Lagos
B. Abuja
C. Kano
D. Ibadan
ANSWER: B

2. Which organ in the human body pumps blood?
A. Brain
B. Lungs
C. Heart
D. Liver
ANSWER: C
    `;

    const questions = await parseStandardDocx(text);
    assert.strictEqual(questions.length, 2);
    assert.strictEqual(questions[0].answer, 'B');
    assert.strictEqual(questions[0].has_answer, true);
    assert.strictEqual(questions[1].answer, 'C');
    assert.strictEqual(questions[1].has_answer, true);
  });

  // TEST 2: Missing Answer Keys leave null and has_answer: false
  await runTest('No Answer Key: Preserves null answer and has_answer: false', () => {
    const text = `
1. Which layer of the atmosphere contains the ozone layer?
A. Troposphere
B. Stratosphere
C. Mesosphere
D. Thermosphere

2. What is the chemical formula for table salt?
A. NaCl
B. KCl
C. CaCl2
D. Na2CO3
    `;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 2);
    assert.strictEqual(result.questions[0].correct_answer, null);
    assert.strictEqual(result.questions[0].has_answer, false);
    assert.strictEqual(result.questions[1].correct_answer, null);
    assert.strictEqual(result.questions[1].has_answer, false);
  });

  // TEST 3: Bottom-Block Answer Key resolution
  await runTest('Bottom-Block Answer Keys: Binds answers from grid at bottom', () => {
    const text = `
1. Soil erosion can be prevented by:
A. Overgrazing
B. Afforestation
C. Deforestation
D. Bush burning

2. The primary source of energy on Earth is:
A. Wind
B. The Sun
C. Fossil fuels
D. Geothermal

ANSWERS:
1. B
2. B
    `;

    const result = parsePlainText(text);
    assert.strictEqual(result.questions.length, 2);
    assert.strictEqual(result.questions[0].correct_answer, 'B');
    assert.strictEqual(result.questions[0].has_answer, true);
    assert.strictEqual(result.questions[1].correct_answer, 'B');
    assert.strictEqual(result.questions[1].has_answer, true);
  });

  // TEST 4: Dispatcher Strategy Selector with profile mode
  await runTest('Dispatcher Strategy Selector: Correctly routes explicit profileMode', async () => {
    const text = `
1. Solve 2x + 3 = 7.
A. 1
B. 2
C. 3
D. 4
ANSWER: B
    `;

    // Dispatcher with profileMode 'math_science'
    const mathResult = await parseDocxWithStrategy(text, { profileMode: 'math_science' });
    assert.strictEqual(mathResult.metadata.profileMode, 'math_science');
    assert.strictEqual(mathResult.questions.length, 1);

    // Dispatcher with profileMode 'english_languages'
    const englishResult = await parseDocxWithStrategy(text, { profileMode: 'english_languages' });
    assert.strictEqual(englishResult.metadata.profileMode, 'english_languages');
    assert.strictEqual(englishResult.questions.length, 1);

    // Dispatcher with profileMode 'standard_general'
    const standardResult = await parseDocxWithStrategy(text, { profileMode: 'standard_general' });
    assert.strictEqual(standardResult.metadata.profileMode, 'standard_general');
    assert.strictEqual(standardResult.questions.length, 1);
  });

  // TEST 5: Backward-compatible parseDocxBuffer Facade
  await runTest('Facade: parseDocxBuffer seamlessly works with profile_mode option', async () => {
    const text = `
1. Which continent is Nigeria located in?
A. Asia
B. Europe
C. Africa
D. Australia
ANSWER: C
    `;

    const result = await parseDocxBuffer(text, { profile_mode: 'standard_general' });
    assert.strictEqual(result.questions.length, 1);
    assert.strictEqual(result.questions[0].correct_answer, 'C');
    assert.strictEqual(result.metadata.profileMode, 'standard_general');
  });

  // TEST 6: Word Automatic Numbered Lists (<w:numPr> -> <ol><li>) with lowercase (a)-(d) options & typo fixes (aga.docx simulation)
  await runTest('Word Automatic Numbering: Resolves <ol><li> list items and normalizes (a)-(d) options (30 questions)', async () => {
    const { extractParagraphsFromHtml } = require('../services/parsers/common/textSanitizer');
    const { parseDocument } = require('../services/parsers/common/documentParser');

    // Build 30 agricultural science questions with <ol><li> and lowercase options
    let html = '<ol>';
    for (let i = 1; i <= 30; i++) {
      if (i === 13) {
        html += '<li>The main objective of agriculture is (a) food (b) raw materials (c) employment (d0 production</li>';
      } else if (i === 26) {
        html += '<li>An example of a ruminant animal is (a) goat (b) sheep (C) cattle (d) pig</li>';
      } else {
        html += `<li>Agricultural science question ${i} is about farm activities (a) Option A${i} (b) Option B${i} (c) Option C${i} (d) Option D${i}</li>`;
      }
    }
    html += '</ol>';

    const paragraphs = extractParagraphsFromHtml(html);
    assert.strictEqual(paragraphs.length, 30, 'Should extract 30 discrete paragraph lines from <ol><li>');
    assert.ok(paragraphs[0].includes('1. '), 'First item must have sequential number 1.');
    assert.ok(paragraphs[29].includes('30. '), 'Last item must have sequential number 30.');

    const docText = paragraphs.join('\n');
    const result = parseDocument(docText);
    assert.strictEqual(result.questions.length, 30, 'Should parse all 30 questions');

    // Verify Q1
    assert.strictEqual(result.questions[0].number, 1);
    assert.strictEqual(result.questions[0].options.A, 'Option A1');
    assert.strictEqual(result.questions[0].options.B, 'Option B1');
    assert.strictEqual(result.questions[0].options.C, 'Option C1');
    assert.strictEqual(result.questions[0].options.D, 'Option D1');

    // Verify Q13 with (d0 typo fix
    assert.strictEqual(result.questions[12].number, 13);
    assert.strictEqual(result.questions[12].options.A, 'food');
    assert.strictEqual(result.questions[12].options.B, 'raw materials');
    assert.strictEqual(result.questions[12].options.C, 'employment');
    assert.strictEqual(result.questions[12].options.D, 'production');

    // Verify Q26 with mixed case (C)
    assert.strictEqual(result.questions[25].number, 26);
    assert.strictEqual(result.questions[25].options.A, 'goat');
    assert.strictEqual(result.questions[25].options.B, 'sheep');
    assert.strictEqual(result.questions[25].options.C, 'cattle');
    assert.strictEqual(result.questions[25].options.D, 'pig');

    // Verify Q30
    assert.strictEqual(result.questions[29].number, 30);
    assert.strictEqual(result.questions[29].options.D, 'Option D30');
  });

  // TEST 7: Unnumbered plain-text questions with lowercase (a)-(d) options
  await runTest('Question Fallback: Assigns sequential numbers (1-30) to unnumbered lines with (a)-(d) options', () => {
    let rawText = '';
    for (let i = 1; i <= 30; i++) {
      if (i === 13) {
        rawText += 'The main objective of agriculture is (a) food (b) raw materials (c) employment (d0 production\n';
      } else if (i === 26) {
        rawText += 'An example of a ruminant animal is (a) goat (b) sheep (C) cattle (d) pig\n';
      } else {
        rawText += `Which of the following is an agricultural tool (a) Hoe (b) Cutlass (c) Tractor (d) Rake\n`;
      }
    }

    const result = parsePlainText(rawText);
    assert.strictEqual(result.questions.length, 30);
    assert.strictEqual(result.questions[0].number, 1);
    assert.strictEqual(result.questions[0].option_a, 'Hoe');
    assert.strictEqual(result.questions[0].option_d, 'Rake');
    assert.strictEqual(result.questions[12].number, 13);
    assert.strictEqual(result.questions[12].option_d, 'production');
    assert.strictEqual(result.questions[29].number, 30);
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL GENERAL / STRATEGY TESTS PASSED PERFECTLY!\n');
  }
}

runAll();
