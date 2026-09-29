/**
 * test_parser_resilience.js
 *
 * Dedicated verification suite for DOCX ingestion resilience:
 *   1. Inline options without periods (Q11: A text B text C text D text)
 *   2. Cloze / Fill-in-the-gap prompts preceding unpunctuated options (Q12: Had I known... A do B did...)
 *   3. Chemistry Q10 subscripts & unspaced answer keys (OxidationAns: B, CH3COOH Ans: B)
 *   4. Multi-section exams with restarted numbering and section boundaries
 *   5. Mammoth style mapping validity & internal library warning suppression
 *   6. Non-technical humanized warning translations for teachers
 */

const assert = require('assert');
const { parseDocxBuffer, parsePlainText, humanizeParserWarnings } = require('../services/parsers/index');
const { parseMathScienceDocx } = require('../services/parsers/mathScienceParser');
const { parseEnglishPassageDocx } = require('../services/parsers/englishPassageParser');
const { parseStandardDocx } = require('../services/parsers/standardDocxParser');

console.log('======================================================================');
console.log('🧪 RUNNING TEST SUITE: DOCX PARSER RESILIENCE & HUMANIZED WARNINGS');
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

async function runSuite() {
  // TEST 1: Inline unpunctuated options (JSS 1 English Q11)
  await runTest('Q11 Case: Inline unpunctuated options (A text B text C text D text)', async () => {
    const text = `
11. Which of the following is not a feature of an informal letter? A salutation B address of the addressee C title of the letter D signature
Ans: C
    `;
    const res = parsePlainText(text);
    assert.strictEqual(res.questions.length, 1);
    const q = res.questions[0];
    assert.strictEqual(q.number, 11);
    assert.strictEqual(q.stem, 'Which of the following is not a feature of an informal letter?');
    assert.strictEqual(q.option_a, 'salutation');
    assert.strictEqual(q.option_b, 'address of the addressee');
    assert.strictEqual(q.option_c, 'title of the letter');
    assert.strictEqual(q.option_d, 'signature');
    assert.strictEqual(q.correct_answer, 'C');
  });

  // TEST 2: Fill-in-the-gap sentence preceding unpunctuated options (JSS 1 English Q12)
  await runTest('Q12 Case: Fill-in-the-blank prompt preceding options without option shifting', async () => {
    const text = `
12. Had I known I would have -------- it A do B did C done D doing
Ans: C
    `;
    const res = parsePlainText(text);
    assert.strictEqual(res.questions.length, 1);
    const q = res.questions[0];
    assert.strictEqual(q.number, 12);
    assert.strictEqual(q.stem, 'Had I known I would have -------- it');
    assert.strictEqual(q.option_a, 'do');
    assert.strictEqual(q.option_b, 'did');
    assert.strictEqual(q.option_c, 'done');
    assert.strictEqual(q.option_d, 'doing');
    assert.strictEqual(q.correct_answer, 'C');
  });

  // TEST 3: Chemistry Q10 with subscripts, chemical formulas & unspaced answer key
  await runTest('Chemistry Q10: Subscripts & unspaced answer keys (OxidationAns: B, CH3COOH Ans: B)', async () => {
    const text = `
9. The process of losing electrons is called OxidationAns: B
A. Reduction
B. Oxidation
C. Electrolysis
D. Neutralization

10. Which of these is the weakest acid? A. H2SO4 B. HCl C. HNO3 D. CH3COOH Ans: D
    `;
    const res = await parseMathScienceDocx(text);
    assert.strictEqual(res.length, 2);

    const q9 = res[0];
    assert.strictEqual(q9.number, 9);
    assert.strictEqual(q9.answer, 'B');
    assert.ok(q9.stem.includes('Oxidation'));

    const q10 = res[1];
    assert.strictEqual(q10.number, 10);
    assert.strictEqual(q10.stem, 'Which of these is the weakest acid?');
    assert.strictEqual(q10.option_a, 'H2SO4');
    assert.strictEqual(q10.option_b, 'HCl');
    assert.strictEqual(q10.option_c, 'HNO3');
    assert.strictEqual(q10.option_d, 'CH3COOH');
    assert.strictEqual(q10.answer, 'D');
  });

  // TEST 4: Multi-section exam with section headings and restarted numbering
  await runTest('Multi-section exam: Preserves all questions across section boundaries', async () => {
    const text = `
SECTION A: OBJECTIVES
1. Capital of Nigeria is A. Lagos B. Abuja C. Kano D. Ibadan
Ans: B

2. Currency of Ghana is A. Naira B. Cedi C. Dollar D. Pound
Ans: B

SECTION B: GRAMMAR
1. He is interested _______ music. A. on B. at C. in D. for
Ans: C

2. She danced _______ the party. A. at B. on C. with D. by
Ans: A
    `;
    const res = parsePlainText(text);
    assert.strictEqual(res.questions.length, 4);
    assert.strictEqual(res.metadata.sectionsDetected.length, 2);
    assert.strictEqual(res.questions[0].number, 1);
    assert.strictEqual(res.questions[1].number, 2);
    // Preserves sequential numbering or distinct question slots
    assert.strictEqual(res.questions[0].option_b, 'Abuja');
    assert.strictEqual(res.questions[2].option_c, 'in');
  });

  // TEST 5: Warning Humanization - Suppressing internal library noise
  await runTest('Warning Humanization: Suppresses internal Mammoth style notices', () => {
    const rawWarnings = [
      'Mammoth: Unrecognised paragraph style: List Paragraph',
      'Mammoth: Did not understand this style mapping: sup => sup',
      'Unrecognised table style',
      'An unrecognised element was ignored',
      'Question 5: No answer key detected.',
    ];
    const humanized = humanizeParserWarnings(rawWarnings);
    assert.strictEqual(humanized.length, 1);
    assert.strictEqual(
      humanized[0],
      "Question 5: No answer key found (e.g., 'Ans: B'). You can select the correct key manually in the dropdown above before importing."
    );
  });

  // TEST 6: Warning Humanization - Translating unparsed block errors for teachers
  await runTest('Warning Humanization: Translates "Could not parse question block" into teacher guidance', () => {
    const rawWarnings = [
      'Could not parse question block for Question 14',
    ];
    const humanized = humanizeParserWarnings(rawWarnings);
    assert.strictEqual(humanized.length, 1);
    assert.strictEqual(
      humanized[0],
      "Question 14: Could not detect all 4 options (A-D) clearly. Please check the spacing and option letters in your Word document."
    );
  });

  // TEST 7: Warning Humanization - Detecting collapsed / merged options
  await runTest('Warning Humanization: Detects when options C and D are merged into B', () => {
    const questions = [
      {
        number: 11,
        options: {
          A: 'salutation',
          B: 'address of the addressee C title of the letter D signature',
          C: '',
          D: '',
        },
      },
    ];
    const humanized = humanizeParserWarnings([], questions);
    assert.strictEqual(humanized.length, 1);
    assert.strictEqual(
      humanized[0],
      "Question 11: Options C and D appear to be merged into Option B. Ensure each option letter (A, B, C, D) is clearly marked."
    );
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL PARSER RESILIENCE TESTS PASSED PERFECTLY!\n');
  }
}

runSuite();
