const assert = require('assert');
const { parseEnglishPassageDocx } = require('../services/parsers/englishPassageParser');
const { parseDocument, parseClozeMatrixRow } = require('../services/parsers/common/documentParser');

console.log('======================================================================');
console.log('🧪 RUNNING TEST SUITE: ENGLISH & LANGUAGES PARSER STRATEGY');
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
  // TEST 1: Section Instruction Propagation
  await runTest('Section Instruction: Prepends [INSTRUCTION: ...] to questions under section', async () => {
    const text = `
SECTION 2
INSTRUCTION: Choose the word opposite in meaning to the underlined word.

1. The manager was quite lenient with the defaulting staff.
A. severe
B. soft
C. tolerant
D. gentle
ANSWER: A

2. The room was spacious and well lit.
A. wide
B. cramped
C. large
D. airy
ANSWER: B
    `;

    const questions = await parseEnglishPassageDocx(text);
    assert.strictEqual(questions.length, 2);
    assert.strictEqual(questions[0].stem.includes('[INSTRUCTION: Choose the word opposite in meaning'), true);
    assert.strictEqual(questions[1].stem.includes('[INSTRUCTION: Choose the word opposite in meaning'), true);
  });

  // TEST 2: Tabular Cloze Matrix Row Parsing with multi-word tokens
  await runTest('Tabular Cloze Rows: Preserves multi-word options with tabs or multiple spaces', () => {
    const rowLine = '75) piece of advice\tword of caution\tband of musicians\tset of tools\tpack of cards';
    const parsed = parseClozeMatrixRow(rowLine, 75);
    assert.ok(parsed, 'Row 75 should be parsed');
    assert.strictEqual(parsed.number, 75);
    assert.strictEqual(parsed.options.A, 'piece of advice');
    assert.strictEqual(parsed.options.B, 'word of caution');
    assert.strictEqual(parsed.options.C, 'band of musicians');
    assert.strictEqual(parsed.options.D, 'set of tools');
    assert.strictEqual(parsed.options.E, 'pack of cards');
  });

  // TEST 3: Unnumbered Paragraphs with Sentence Punctuation Split
  await runTest('Unnumbered Paragraphs: Auto-numbers and parses implicit Option A', async () => {
    const text = `
The economic policy of the government has been criticized by the opposition. overruling  B. rejection  C. appreciation  D. condemnation  E. commendation

Some crops were destroyed by a swarm of locusts.A. band  B. shoal  C. swarm  D. school  E. troupe
    `;

    const questions = await parseEnglishPassageDocx(text);
    assert.strictEqual(questions.length, 2);
    assert.strictEqual(questions[0].number, 1);
    assert.strictEqual(questions[0].options.A, 'overruling');
    assert.strictEqual(questions[0].options.B, 'rejection');
    
    assert.strictEqual(questions[1].number, 2);
    assert.strictEqual(questions[1].options.A, 'band');
    assert.strictEqual(questions[1].options.B, 'shoal');
    assert.strictEqual(questions[1].options.C, 'swarm');
  });

  // TEST 4: 5-to-4 Option Reduction with E swapped to D when E is answer
  await runTest('5-to-4 Reduction: Swaps E to D when E is the correct answer', async () => {
    const text = `
1. Choose the correct spelling:
A. Accomodation
B. Acommodation
C. Accomodasion
D. Acomodation
E. Accommodation
ANSWER: E
    `;

    const questions = await parseEnglishPassageDocx(text);
    assert.strictEqual(questions.length, 1);
    assert.strictEqual(questions[0].options.D, 'Accommodation', 'Option E should be swapped to D');
    assert.strictEqual(questions[0].answer, 'D', 'Answer E should be mapped to D');
  });

  // TEST 5: Underlined Text Preservation (<u>word</u>) in Question Stems
  await runTest('Underlined Formatting: Preserves <u>word</u> tags in synonyms/antonyms questions', async () => {
    const text = `
SECTION 3
INSTRUCTION: Choose the word nearest in meaning to the underlined word.

1. He was <u>estranged</u> from his immediate family.
A. separated
B. united
C. connected
D. protected
ANSWER: A

2. The young politician was described as being <u>avaricious</u>.
A. greedy
B. generous
C. humble
D. polite
ANSWER: A
    `;

    const questions = await parseEnglishPassageDocx(text);
    assert.strictEqual(questions.length, 2);
    assert.strictEqual(questions[0].stem.includes('<u>estranged</u>'), true, 'Stem should retain <u>estranged</u>');
    assert.strictEqual(questions[1].stem.includes('<u>avaricious</u>'), true, 'Stem should retain <u>avaricious</u>');
  });

  // TEST 6: Section 4 Instruction with Typo & En-Dash Persistence across Q31-Q70
  await runTest('Section 4 Directive: Persists across unnumbered and numbered questions (Q42, Q53)', async () => {
    const text = `
SECTION 4
INSTRUCTION
From the word to group of words lettered A– D ,chose the word or group of words that best completes each of the following sentences.

The manager gave a stern warning to the staff.A. verbal  B. written  C. polite  D. mild

A ________ of ladies attended the grand occasion.A. galaxy  B. bevy  C. flock  D. herd

53. The prime suspect divulged some confidential information.
A. leaked
B. hid
C. gathered
D. recorded
ANSWER: A

The committee was dissolved immediately.A. disbanded  B. assembled  C. retained  D. upgraded
    `;

    const questions = await parseEnglishPassageDocx(text);
    assert.strictEqual(questions.length, 4);
    
    // Check that every question in Section 4 has the instruction prepended
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      assert.strictEqual(
        q.stem.includes('[INSTRUCTION: From the word to group of words lettered A– D ,chose the word or group of words that best completes each of the following sentences.]'),
        true,
        `Question index ${i} (number ${q.number}) must contain the Section 4 instruction`
      );
      assert.strictEqual(
        q.instruction,
        'From the word to group of words lettered A– D ,chose the word or group of words that best completes each of the following sentences.',
        `Question ${q.number} must have dedicated instruction field`
      );
    }
  });

  // TEST 7: Dedicated Fields & Clean Stem Extraction (Contract Alignment)
  await runTest('Dedicated Fields: instruction, passage, and clean_stem are cleanly separated', async () => {
    const text = `
SECTION 5
INSTRUCTION: In the following passage, the numbered gaps indicate missing words.
PASSAGE
The advancement of technology has revolutionized human existence. In medicine, sophisticated equipment has saved millions of lives.

71) animal\thuman\tmammal\tmortal\tprimate
72) clubs\tclusters\tgangs\tgroups\tpacks
    `;

    const questions = await parseEnglishPassageDocx(text);
    assert.strictEqual(questions.length, 2);
    
    // Q71
    const q71 = questions[0];
    assert.strictEqual(q71.number, 71);
    assert.strictEqual(q71.instruction, 'In the following passage, the numbered gaps indicate missing words.');
    assert.ok(q71.passage.includes('The advancement of technology has revolutionized human existence.'));
    assert.strictEqual(q71.clean_stem, 'Choose the most appropriate word for gap (71)');
    assert.ok(q71.question_text.includes('[INSTRUCTION:'));
    assert.ok(q71.question_text.includes('[PASSAGE:'));
    assert.strictEqual(q71.options.A, 'animal');
    assert.strictEqual(q71.options.B, 'human');
    assert.strictEqual(q71.options.C, 'mammal');
    assert.strictEqual(q71.options.D, 'mortal');

    // Q72
    const q72 = questions[1];
    assert.strictEqual(q72.number, 72);
    assert.strictEqual(q72.instruction, 'In the following passage, the numbered gaps indicate missing words.');
    assert.ok(q72.passage.includes('The advancement of technology has revolutionized human existence.'));
    assert.strictEqual(q72.clean_stem, 'Choose the most appropriate word for gap (72)');
    assert.strictEqual(q72.options.A, 'clubs');
    assert.strictEqual(q72.options.B, 'clusters');
  });

  // TEST 8: Glued Inline <b>Passage</b> Tag inside Instruction (image_3fbfdb.png case)
  await runTest('Glued Inline Passage: Splits at <b>Passage</b> so instruction is clean and passage is extracted', async () => {
    const text = `
SECTION 5
In the following passage, the numbered gaps indicate missing words. Against each numbers in the list below, four options are offered in columns lettered A – D. Choose the word that is the most suitable to fill the numbered gaps in the passages. <b>Passage</b> The first modern __71__, called Homo Sapiens, emerged in East Africa around 300,000 years ago.

71) human\tanimal\tmammal\tprimate
72) groups\tclusters\tgangs\tpacks
    `;

    const questions = await parseEnglishPassageDocx(text);
    assert.strictEqual(questions.length, 2);

    const q71 = questions[0];
    assert.strictEqual(
      q71.instruction,
      'In the following passage, the numbered gaps indicate missing words. Against each numbers in the list below, four options are offered in columns lettered A – D. Choose the word that is the most suitable to fill the numbered gaps in the passages.'
    );
    assert.strictEqual(q71.instruction.includes('Passage'), false, 'Instruction should NOT contain the word Passage or story');
    assert.strictEqual(q71.instruction.includes('Homo Sapiens'), false, 'Instruction should NOT contain the story text');

    assert.ok(q71.passage, 'Passage must be populated');
    assert.ok(q71.passage.includes('The first modern __71__, called Homo Sapiens, emerged in East Africa'));
    assert.strictEqual(q71.passage.includes('<b>Passage</b>'), false, 'Passage should NOT contain <b>Passage</b> tags');
    assert.strictEqual(q71.clean_stem, 'Choose the most appropriate word for gap (71)');
    assert.ok(q71.question_text.includes('[INSTRUCTION: In the following passage'));
    assert.ok(q71.question_text.includes('[PASSAGE: The first modern __71__'));

    const q72 = questions[1];
    assert.strictEqual(q72.instruction, q71.instruction);
    assert.strictEqual(q72.passage, q71.passage);
  });

  // TEST 9: Oral English Phonetic Transcriptions, IPA Symbols & Stress Patterns
  await runTest('Oral English: 100% preservation of IPA symbols, slash boundaries (/θ/, /ð/, /iː/), and stress patterns', async () => {
    const text = `
SECTION 1: ORAL ENGLISH
INSTRUCTION: In each of the following questions, choose the option that has the same vowel sound as the one represented by the phonetic symbol.

1. /iː/
A. sit
B. seat
C. set
D. sight
ANSWER: B

2. From the options lettered A to D, choose the word that contains the consonant sound /θ/ as in <u>th</u>ink:
A. mother
B. breathe
C. author
D. feather
ANSWER: C

3. Which of the words has the consonant sound represented by [tʃ]?
A. machine
B. champagne
C. anchor
D. church
ANSWER: D

4. In the following question, the syllable with the primary stress is written in CAPITAL letters. Choose the option with the correct stress pattern for <b>photographer</b>:
A. PHO-to-graph-er
B. pho-TO-graph-er
C. pho-to-GRAPH-er
D. pho-to-graph-ER
ANSWER: B

5. Identify the word with the correct stress placement for the noun form:
A. ˈrecord
B. reˈcord
C. re-CORD
D. ˌre-cord
ANSWER: A
    `;

    const questions = await parseEnglishPassageDocx(text);
    assert.strictEqual(questions.length, 5, 'Must parse all 5 Oral English questions');

    // Q1: /iː/ stem
    const q1 = questions[0];
    assert.strictEqual(q1.number, 1);
    assert.ok(q1.question_text.includes('/iː/'), 'Q1 must preserve /iː/');
    assert.strictEqual(q1.options.A, 'sit');
    assert.strictEqual(q1.options.B, 'seat');
    assert.strictEqual(q1.answer, 'B');

    // Q2: /θ/ and <u>th</u>ink
    const q2 = questions[1];
    assert.strictEqual(q2.number, 2);
    assert.ok(q2.question_text.includes('/θ/'), 'Q2 must preserve /θ/');
    assert.ok(q2.question_text.includes('<u>th</u>ink'), 'Q2 must preserve <u>th</u>ink');
    assert.strictEqual(q2.options.A, 'mother');
    assert.strictEqual(q2.options.C, 'author');
    assert.strictEqual(q2.answer, 'C');

    // Q3: [tʃ]
    const q3 = questions[2];
    assert.strictEqual(q3.number, 3);
    assert.ok(q3.question_text.includes('[tʃ]'), 'Q3 must preserve [tʃ]');
    assert.strictEqual(q3.options.D, 'church');
    assert.strictEqual(q3.answer, 'D');

    // Q4: Stress pattern in capitals & <b>photographer</b>
    const q4 = questions[3];
    assert.strictEqual(q4.number, 4);
    assert.ok(q4.question_text.includes('<b>photographer</b>'), 'Q4 must preserve bold tag');
    assert.strictEqual(q4.options.A, 'PHO-to-graph-er');
    assert.strictEqual(q4.options.B, 'pho-TO-graph-er');
    assert.strictEqual(q4.options.C, 'pho-to-GRAPH-er');
    assert.strictEqual(q4.options.D, 'pho-to-graph-ER');
    assert.strictEqual(q4.answer, 'B');

    // Q5: Stress marks ˈrecord and ˌre-cord
    const q5 = questions[4];
    assert.strictEqual(q5.number, 5);
    assert.strictEqual(q5.options.A, 'ˈrecord', 'Q5 Option A must preserve primary stress mark');
    assert.strictEqual(q5.options.B, 'reˈcord', 'Q5 Option B must preserve primary stress mark');
    assert.strictEqual(q5.options.D, 'ˌre-cord', 'Q5 Option D must preserve secondary stress mark');
    assert.strictEqual(q5.answer, 'A');
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL ENGLISH/LANGUAGES TESTS PASSED PERFECTLY!\n');
  }
}

runAll();
