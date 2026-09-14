/**
 * test_english_passage_scoping.js
 *
 * Comprehensive Test Suite for Scoped English Comprehension and Cloze Passages:
 * 1. Junior Secondary (JSS 1) 50-question paper:
 *    - Section A Comprehension: Questions 1–5 bound to PASSAGE 1.
 *    - Section A Comprehension: Questions 6–10 bound to PASSAGE 2.
 *    - Section B & C Grammar / Lexis / Structure: Questions 11–50 have passage_text: null,
 *      passage: null, and ZERO [PASSAGE: ...] leakage.
 * 2. Senior Secondary (SS3) 80-question paper (SS3 ENG IST TERM MIDTERM EXAM 2026. TYPE 3 (1).docx):
 *    - Questions 1–70 (Antonyms, Synonyms, Lexis, Structure) have passage_text: null.
 *    - Questions 71–80 (Cloze Passage) retain gap-fill passage context.
 * 3. Science Profile Zero Regression (PHYSICS SSS 2.docx):
 *    - Confirms Math/Science profile activates with OMML formula parsing and diagram extraction.
 *    - Zero English boundary logic triggered.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseEnglishPassageDocx } = require('../services/parsers/englishPassageParser');
const { parseDocxBuffer, resolveProfile } = require('../services/parsers/index');

console.log('======================================================================');
console.log('🧪 RUNNING TEST SUITE: ENGLISH PASSAGE SCOPING & BOUNDARY ISOLATION');
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
  // ──────────────────────────────────────────────────────────────────
  // TEST 1: Junior Secondary School Structure (JSS 1 - 50 Questions)
  // ──────────────────────────────────────────────────────────────────
  await runTest('JSS 1: Questions 1-5 have Passage 1, Q6-10 have Passage 2, Q11-50 have zero passage leakage', async () => {
    // Generate synthetic 50-question JSS 1 exam paper
    const lines = [
      'JUNIOR SECONDARY SCHOOL 1 (JSS 1) FIRST MIDTERM TEST',
      'SUBJECT: ENGLISH STUDIES / ENGLISH LANGUAGE',
      'TIME ALLOWED: 1 HOUR',
      '',
      'SECTION A: COMPREHENSION',
      '',
      'PASSAGE 1',
      'Once upon a time in the ancient kingdom of Benin, there lived a skilled bronze caster named Osa. Osa was renowned throughout the realm for his magnificent sculptures that captured the royal history of the Oba.',
      '',
      'Questions to passage 1',
      '1. Where did Osa live?',
      'A. Ancient kingdom of Benin',
      'B. Kingdom of Oyo',
      'C. Calabar',
      'D. Kano',
      'ANSWER: A',
      '',
      '2. What was Osa famous for?',
      'A. Farming yam',
      'B. Magnificent bronze sculptures',
      'C. Hunting lions',
      'D. Weaving kente cloth',
      'ANSWER: B',
      '',
      '3. Whose royal history did Osa capture in his work?',
      'A. The Emir',
      'B. The Oba',
      'C. The Alafin',
      'D. The Obi',
      'ANSWER: B',
      '',
      '4. The word "renowned" in the passage means:',
      'A. unknown',
      'B. famous',
      'C. feared',
      'D. wealthy',
      'ANSWER: B',
      '',
      '5. What material did Osa use for casting?',
      'A. Gold',
      'B. Silver',
      'C. Bronze',
      'D. Clay',
      'ANSWER: C',
      '',
      'PASSAGE 2',
      'Renewable energy comes from natural resources that replenish themselves without depleting the Earth. Solar energy from the sun and wind energy harnessed by wind turbines are two prime examples of clean power.',
      '',
      'Questions to passage 2',
      '6. What is renewable energy according to the passage?',
      'A. Energy from burning coal',
      'B. Energy from natural self-replenishing resources',
      'C. Electricity from diesel generators',
      'D. Nuclear power',
      'ANSWER: B',
      '',
      '7. Which of the following is an example of renewable energy mentioned in the text?',
      'A. Petroleum',
      'B. Solar energy from the sun',
      'C. Coal power',
      'D. Natural gas',
      'ANSWER: B',
      '',
      '8. Wind energy is harnessed using:',
      'A. Solar panels',
      'B. Wind turbines',
      'C. Water dams',
      'D. Steam engines',
      'ANSWER: B',
      '',
      '9. The word "replenish" as used in the passage means to:',
      'A. exhaust completely',
      'B. restore or renew',
      'C. destroy slowly',
      'D. store underground',
      'ANSWER: B',
      '',
      '10. Why is renewable energy referred to as clean power?',
      'A. It is cheap to import',
      'B. It does not deplete natural resources',
      'C. It only works at night',
      'D. It requires no maintenance',
      'ANSWER: B',
      '',
      'SECTION B: GRAMMAR AND LEXIS',
      'INSTRUCTION: Choose the correct preposition or tense to complete each sentence.',
      ''
    ];

    // Generate standalone grammar questions 11 to 50
    for (let q = 11; q <= 50; q++) {
      lines.push(`${q}. Complete the sentence for question ${q}: She went _______ the market yesterday.`);
      lines.push('A. to');
      lines.push('B. in');
      lines.push('C. at');
      lines.push('D. for');
      lines.push('ANSWER: A');
      lines.push('');
    }

    const docText = lines.join('\n');
    const questions = await parseEnglishPassageDocx(docText);

    assert.strictEqual(questions.length, 50, `Expected 50 parsed questions, got ${questions.length}`);

    // Verify Questions 1 to 5 (Passage 1)
    for (let i = 0; i < 5; i++) {
      const q = questions[i];
      assert.strictEqual(q.number, i + 1);
      assert.ok(q.passage, `Question ${q.number} must have passage`);
      assert.ok(q.passage_text, `Question ${q.number} must have passage_text`);
      assert.ok(q.passage.includes('ancient kingdom of Benin'), `Question ${q.number} must contain Passage 1 text`);
      assert.ok(q.question_text.includes('[PASSAGE:'), `Question ${q.number} question_text must include [PASSAGE: prefix`);
      assert.strictEqual(q.passage.includes('Questions to passage 1'), false, `Question ${q.number} passage must NOT contain header anchor text`);
      assert.strictEqual(q.passage.includes('Renewable energy'), false, `Question ${q.number} must NOT contain Passage 2 text`);
    }

    // Verify Questions 6 to 10 (Passage 2)
    for (let i = 5; i < 10; i++) {
      const q = questions[i];
      assert.strictEqual(q.number, i + 1);
      assert.ok(q.passage, `Question ${q.number} must have passage`);
      assert.ok(q.passage_text, `Question ${q.number} must have passage_text`);
      assert.ok(q.passage.includes('Renewable energy comes from natural resources'), `Question ${q.number} must contain Passage 2 text`);
      assert.ok(q.question_text.includes('[PASSAGE:'), `Question ${q.number} question_text must include [PASSAGE: prefix`);
      assert.strictEqual(q.passage.includes('Questions to passage 2'), false, `Question ${q.number} passage must NOT contain header anchor text`);
      assert.strictEqual(q.passage.includes('kingdom of Benin'), false, `Question ${q.number} must NOT contain Passage 1 text`);
    }

    // Verify Questions 11 to 50 (Section B Grammar - ZERO PASSAGE LEAKAGE)
    for (let i = 10; i < 50; i++) {
      const q = questions[i];
      assert.strictEqual(q.number, i + 1);
      assert.strictEqual(q.passage, null, `Question ${q.number} passage must be null`);
      assert.strictEqual(q.passage_text, null, `Question ${q.number} passage_text must be null`);
      assert.strictEqual(q.question_text.includes('[PASSAGE:'), false, `Question ${q.number} question_text must NOT contain [PASSAGE: prefix`);
      assert.strictEqual(q.stem.includes('[PASSAGE:'), false, `Question ${q.number} stem must NOT contain [PASSAGE: prefix`);
      assert.ok(q.question_text.includes('[INSTRUCTION:'), `Question ${q.number} question_text must contain [INSTRUCTION: prefix`);
      assert.strictEqual(q.instruction, 'Choose the correct preposition or tense to complete each sentence.');
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // TEST 2: Real DOCX Ingestion (SS3 English Midterm Exam 2026 Type 3)
  // ──────────────────────────────────────────────────────────────────
  await runTest('SS3 Real DOCX: Questions 1-70 have passage_text: null, Questions 71-80 retain Cloze passage', async () => {
    const candidatePaths = [
      'C:/Users/ESCANOR/Downloads/SS3 ENG IST TERM MIDTERM EXAM 2026. TYPE 3 (1).docx',
      'C:/Users/ESCANOR/Downloads/SS3 ENG IST TERM MIDTERM EXAM 2026. TYPE 3.docx',
      'C:/Users/ESCANOR/Downloads/English/SS3 ENG IST TERM MIDTERM EXAM 2026. TYPE 3 - Copy.docx',
    ];

    const ss3DocxPath = candidatePaths.find(p => fs.existsSync(p));
    assert.ok(ss3DocxPath, 'SS3 English DOCX test file must exist');

    const buffer = fs.readFileSync(ss3DocxPath);
    const result = await parseEnglishPassageDocx(buffer, {
      subject: 'English Language',
      docContext: { subject: 'English Language', classLevel: 'SSS 3', term: 'First Term' },
    });

    assert.strictEqual(result.questions.length, 80, `Expected 80 questions in SS3 exam paper, got ${result.questions.length}`);

    // Verify Questions 1 to 70 have NO passage
    for (let i = 0; i < 70; i++) {
      const q = result.questions[i];
      assert.strictEqual(
        q.passage,
        null,
        `Question ${q.number} (index ${i}) must have passage: null`
      );
      assert.strictEqual(
        q.passage_text,
        null,
        `Question ${q.number} (index ${i}) must have passage_text: null`
      );
      assert.strictEqual(
        q.question_text.includes('[PASSAGE:'),
        false,
        `Question ${q.number} question_text must NOT contain [PASSAGE: ...]`
      );
    }

    // Verify Questions 71 to 80 retain the Cloze gap-fill passage context
    for (let i = 70; i < 80; i++) {
      const q = result.questions[i];
      assert.ok(q.passage, `Question ${q.number} (index ${i}) must retain passage`);
      assert.ok(q.passage_text, `Question ${q.number} (index ${i}) must retain passage_text`);
      assert.ok(
        q.passage.includes('Homo Sapiens') || q.passage.includes('Africa') || q.passage.includes('__71__'),
        `Question ${q.number} passage must contain Cloze narrative`
      );
      assert.ok(
        q.question_text.includes('[PASSAGE:'),
        `Question ${q.number} question_text must include [PASSAGE: prefix`
      );
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // TEST 3: Science Profile Isolation & Zero Regression (PHYSICS SSS 2)
  // ──────────────────────────────────────────────────────────────────
  await runTest('Science Profile Zero Regression: PHYSICS SSS 2.docx parses untouched with Math/Science strategy', async () => {
    const physicsPath = 'C:/Users/ESCANOR/Downloads/physics/PHYSICS SSS 2.docx';
    assert.ok(fs.existsSync(physicsPath), 'PHYSICS SSS 2.docx test file must exist');

    const buffer = fs.readFileSync(physicsPath);
    const profile = resolveProfile('auto', 'Physics', buffer);
    assert.strictEqual(profile, 'math_science', 'Physics file must resolve to math_science profile');

    const result = await parseDocxBuffer(buffer, {
      subject: 'Physics',
      targetSubject: 'Physics',
    });

    assert.strictEqual(result.questions.length, 30, `Expected 30 physics questions, got ${result.questions.length}`);
    assert.strictEqual(result.metadata.profileApplied, 'Maths & Physical Sciences Profile');

    // Confirm diagram extraction and formulas are intact
    assert.ok(result.images.length > 0, 'Physics document must extract diagrams');
    const diagramQuestions = result.questions.filter(q => q.has_diagram);
    assert.ok(diagramQuestions.length > 0, 'Physics questions must bind diagrams');

    // Verify no English passage prefix was injected
    for (const q of result.questions) {
      assert.strictEqual(
        (q.question_text || '').includes('[PASSAGE:'),
        false,
        `Physics question ${q.number} must not contain [PASSAGE:`
      );
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // TEST 4: Explicit Directives & Non-Comprehension Boundary Reset
  // ──────────────────────────────────────────────────────────────────
  await runTest('Boundary Resets: Reset passage on standalone grammar instructions without SECTION keyword', async () => {
    const text = [
      'PASSAGE A',
      'The eagle soared majestically across the northern sky.',
      '',
      'Questions to passage A',
      '1. How did the eagle soar?',
      'A. majestically  B. slowly  C. weakly  D. clumsily',
      'ANSWER: A',
      '',
      'INSTRUCTION: Choose the word that is opposite in meaning to the underlined word.',
      '2. He is very <u>haughty</u>.',
      'A. humble  B. proud  C. bold  D. arrogant',
      'ANSWER: A',
      '',
      'From the alternatives provided, select the best option:',
      '3. Neither the boy nor his friends _______ present.',
      'A. were  B. was  C. is  D. are',
      'ANSWER: A'
    ].join('\n');

    const questions = await parseEnglishPassageDocx(text);
    assert.strictEqual(questions.length, 3);

    // Q1 has passage
    assert.ok(questions[0].passage);
    assert.ok(questions[0].passage.includes('The eagle soared majestically'));
    assert.ok(questions[0].question_text.includes('[PASSAGE:'));

    // Q2 has reset passage
    assert.strictEqual(questions[1].passage, null, 'Q2 passage must be null');
    assert.strictEqual(questions[1].passage_text, null, 'Q2 passage_text must be null');
    assert.strictEqual(questions[1].question_text.includes('[PASSAGE:'), false);
    assert.strictEqual(questions[1].instruction, 'Choose the word that is opposite in meaning to the underlined word.');

    // Q3 has reset passage
    assert.strictEqual(questions[2].passage, null, 'Q3 passage must be null');
    assert.strictEqual(questions[2].passage_text, null, 'Q3 passage_text must be null');
    assert.strictEqual(questions[2].question_text.includes('[PASSAGE:'), false);
    assert.strictEqual(questions[2].instruction, 'From the alternatives provided, select the best option:');
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL ENGLISH PASSAGE SCOPING TESTS PASSED PERFECTLY!\n');
  }
}

runAll();
