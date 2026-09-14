/**
 * test_trailing_option_answers.js
 *
 * Dedicated verification suite for auto-detecting and extracting inline trailing answer keys on options:
 * E.g., "D. 1675m Ans C", "D. None of the above [Ans: B]", "D. were Ans D"
 *
 * 100% Offline native Node.js test runner.
 */

const assert = require('assert');
const { parsePlainText, parseStandardDocx } = require('../services/parsers/standardDocxParser');
const { parseEnglishPassageDocx } = require('../services/parsers/englishPassageParser');
const { parseMathScienceDocx } = require('../services/parsers/mathScienceParser');
const { parseDocxBuffer } = require('../services/parsers/index');
const { parseQuestionBlock } = require('../services/parsers/common/optionConverter');

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     ${err.message}`);
        console.error(err.stack);
    }
}

async function runSuite() {
    console.log('======================================================================');
    console.log('🧪 RUNNING TEST SUITE: INLINE TRAILING ANSWER KEYS ON OPTIONS');
    console.log('======================================================================\n');

    // TEST 1: Direct parseQuestionBlock verification for "D. 1675m Ans C"
    await runTest('parseQuestionBlock: "D. 1675m Ans C" -> option D is "1675m" and correct_option is "C"', async () => {
        const text = '1. A train travels at 60km/h for 2.5 minutes. What is the distance covered?\nA. 1000m\nB. 1250m\nC. 1500m\nD. 1675m Ans C';
        const q = parseQuestionBlock(text, 1);
        
        assert.ok(q, 'Question should be parsed');
        assert.strictEqual(q.options.D, '1675m', 'Option D text must be stripped of trailing answer marker');
        assert.strictEqual(q.options.C, '1500m');
        assert.strictEqual(q.answer, 'C');
        assert.strictEqual(q.correct_answer, 'C');
        assert.strictEqual(q.correct_option, 'C');
    });

    // TEST 2: Direct parseQuestionBlock verification for "D. None of the above [Ans: B]"
    await runTest('parseQuestionBlock: "D. None of the above [Ans: B]" -> option D is "None of the above" and correct_option is "B"', async () => {
        const text = '2. Which of the following is a prime number?\nA. 4\nB. 7\nC. 9\nD. None of the above [Ans: B]';
        const q = parseQuestionBlock(text, 2);

        assert.ok(q, 'Question should be parsed');
        assert.strictEqual(q.options.D, 'None of the above', 'Option D text must be stripped of [Ans: B]');
        assert.strictEqual(q.options.B, '7');
        assert.strictEqual(q.answer, 'B');
        assert.strictEqual(q.correct_answer, 'B');
        assert.strictEqual(q.correct_option, 'B');
    });

    // TEST 3: Direct parseQuestionBlock verification for "D. were Ans D"
    await runTest('parseQuestionBlock: "D. were Ans D" -> option D is "were" and correct_option is "D"', async () => {
        const text = '3. Neither of the boys _____ present at the meeting yesterday.\nA. is\nB. are\nC. was\nD. were Ans D';
        const q = parseQuestionBlock(text, 3);

        assert.ok(q, 'Question should be parsed');
        assert.strictEqual(q.options.D, 'were', 'Option D text must be stripped of Ans D');
        assert.strictEqual(q.answer, 'D');
        assert.strictEqual(q.correct_answer, 'D');
        assert.strictEqual(q.correct_option, 'D');
    });

    // TEST 4: Standard PlainText Multi-Question Parser with various trailing answer formats
    await runTest('Standard PlainText Parser: Parses multi-question document with trailing option answer keys', async () => {
        const docText = `
1. Calculate the velocity when distance is 500m and time is 20s.
A. 15 m/s
B. 20 m/s
C. 25 m/s
D. 30 m/s Ans C

2. The capital of Nigeria is
A. Lagos
B. Abuja (Ans: B)
C. Kano
D. Ibadan

3. Which gas is essential for photosynthesis?
A. Oxygen
B. Nitrogen
C. Carbon dioxide Ans: C
D. Hydrogen
`;
        const res = parsePlainText(docText);
        assert.strictEqual(res.questions.length, 3);

        // Q1
        assert.strictEqual(res.questions[0].option_d, '30 m/s');
        assert.strictEqual(res.questions[0].correct_answer, 'C');
        assert.strictEqual(res.questions[0].correct_option, 'C');
        assert.strictEqual(res.questions[0].has_answer, true);

        // Q2
        assert.strictEqual(res.questions[1].option_b, 'Abuja');
        assert.strictEqual(res.questions[1].correct_answer, 'B');
        assert.strictEqual(res.questions[1].correct_option, 'B');
        assert.strictEqual(res.questions[1].has_answer, true);

        // Q3
        assert.strictEqual(res.questions[2].option_c, 'Carbon dioxide');
        assert.strictEqual(res.questions[2].correct_answer, 'C');
        assert.strictEqual(res.questions[2].correct_option, 'C');
        assert.strictEqual(res.questions[2].has_answer, true);
    });

    // TEST 5: English Passage Parser with trailing answer keys
    await runTest('English Passage Parser: Preserves passage and strips trailing answer keys cleanly', async () => {
        const englishDoc = `
SECTION A: COMPREHENSION
Read the following passage carefully:
Language is a system of conventional spoken, manual, or written symbols.

Questions 1 to 2 are based on the passage.

1. According to the passage, language is
A. arbitrary
B. conventional Ans B
C. chaotic
D. useless

2. The passage describes symbols as
A. written only
B. manual only
C. spoken, manual, or written [Answer: C]
D. non-existent
`;
        const questions = await parseEnglishPassageDocx(englishDoc);
        assert.strictEqual(questions.length, 2);

        // Q1
        assert.strictEqual(questions[0].option_b, 'conventional');
        assert.strictEqual(questions[0].correct_answer, 'B');
        assert.strictEqual(questions[0].correct_option, 'B');
        assert.strictEqual(questions[0].has_answer, true);

        // Q2
        assert.strictEqual(questions[1].option_c, 'spoken, manual, or written');
        assert.strictEqual(questions[1].correct_answer, 'C');
        assert.strictEqual(questions[1].correct_option, 'C');
        assert.strictEqual(questions[1].has_answer, true);
    });

    // TEST 6: Math & Science Parser with trailing answer keys
    await runTest('Math & Science Parser: Resolves trailing answer keys while protecting KaTeX equations', async () => {
        const mathDoc = `
1. Solve for $x$: $2x + 6 = 14$
A. $x = 2$
B. $x = 3$
C. $x = 4$ Ans C
D. $x = 5$

2. If $f(x) = x^2 - 4$, find $f(3)$
A. 5 Ans A
B. 9
C. 13
D. 0
`;
        const questions = await parseMathScienceDocx(mathDoc);
        assert.strictEqual(questions.length, 2);

        // Q1
        assert.strictEqual(questions[0].option_c, '$x = 4$');
        assert.strictEqual(questions[0].correct_answer, 'C');
        assert.strictEqual(questions[0].correct_option, 'C');
        assert.strictEqual(questions[0].has_answer, true);

        // Q2
        assert.strictEqual(questions[1].option_a, '5');
        assert.strictEqual(questions[1].correct_answer, 'A');
        assert.strictEqual(questions[1].correct_option, 'A');
        assert.strictEqual(questions[1].has_answer, true);
    });

    // TEST 7: Single-line inline options with trailing answer key
    await runTest('Inline single-line options with trailing answer key', async () => {
        const text = '1. What is the SI unit of force? A. Joule B. Newton C. Pascal D. Watt Ans: B';
        const q = parseQuestionBlock(text, 1);

        assert.ok(q);
        assert.strictEqual(q.options.A, 'Joule');
        assert.strictEqual(q.options.B, 'Newton');
        assert.strictEqual(q.options.C, 'Pascal');
        assert.strictEqual(q.options.D, 'Watt');
        assert.strictEqual(q.correct_answer, 'B');
        assert.strictEqual(q.correct_option, 'B');
    });

    // TEST 8: 5-option conversion with trailing answer on option E
    await runTest('5-option question with trailing answer on option E (promoted to D)', async () => {
        const text = `
1. Identify the odd one out.
A. Iron
B. Copper
C. Zinc
D. Aluminium
E. Plastic Ans E
`;
        const res = parsePlainText(text);
        assert.strictEqual(res.questions.length, 1);
        const q = res.questions[0];

        assert.strictEqual(q.option_d, 'Plastic', 'Option E swapped to D with trailing answer stripped');
        assert.strictEqual(q.correct_answer, 'D');
        assert.strictEqual(q.correct_option, 'D');
    });

    // TEST 9: Header Stripping and Instruction Isolation on SS3 English Docx
    await runTest('SS3 English Docx: Top-of-document header metadata stripped from Q1 instruction', async () => {
        const filePath = 'C:/Users/ESCANOR/Downloads/SS3 ENG IST TERM MIDTERM EXAM 2026. TYPE 3 (1).docx';
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
            const buffer = fs.readFileSync(filePath);
            const result = await parseEnglishPassageDocx(buffer, { fileName: 'SS3 ENG IST TERM MIDTERM EXAM 2026. TYPE 3 (1).docx' });
            assert.strictEqual(result.questions.length, 80, 'Must parse 80 questions');
            const q1 = result.questions[0];

            // Verify school/subject/class headers are NOT present in instruction or stem
            assert.strictEqual(q1.instruction.includes('ANTHONY WHITEBRIDGE'), false, 'School header must not be in instruction');
            assert.strictEqual(q1.instruction.includes('SUBJECT:'), false, 'Subject must not be in instruction');
            assert.strictEqual(q1.instruction.includes('CLASS:'), false, 'Class must not be in instruction');
            assert.strictEqual(q1.stem.includes('ANTHONY WHITEBRIDGE'), false, 'School header must not be in stem');
            assert.strictEqual(q1.clean_stem.includes('ANTHONY WHITEBRIDGE'), false, 'School header must not be in clean_stem');

            // Verify exact instruction
            assert.ok(
                q1.instruction.startsWith('In each of the following sentences; there is one underlined word and one gap.'),
                'Instruction must match test directions'
            );

            // Verify Q1 clean options and stem
            assert.strictEqual(q1.clean_stem, 'The recently conducted election was <u>inconclusive</u>.');
            assert.strictEqual(q1.option_a, 'incomplete');
            assert.strictEqual(q1.option_b, 'disputable');
            assert.strictEqual(q1.option_c, 'comprehensive');
            assert.strictEqual(q1.option_d, 'controversial');
        } else {
            console.log('       (SS3 Docx file not found at path, skipping docx test)');
        }
    });

    // TEST 10: Ingest question with "D. controversial Ans C"
    await runTest('Ingest question containing "D. controversial Ans C" -> correct_option = "C", option D = "controversial"', async () => {
        const text = `
1. The recently conducted election was inconclusive.
A. incomplete
B. disputable
C. comprehensive
D. controversial Ans C
`;
        const res = parsePlainText(text);
        assert.strictEqual(res.questions.length, 1);
        const q = res.questions[0];
        assert.strictEqual(q.correct_option, 'C');
        assert.strictEqual(q.correct_answer, 'C');
        assert.strictEqual(q.answer, 'C');
        assert.strictEqual(q.option_d, 'controversial');
    });

    // TEST 11: Ingest question with "D. controversial [Ans: C]" and "D. controversial Key C"
    await runTest('Ingest questions with various trailing key syntaxes (A-D strict)', async () => {
        const text = `
1. Question 1 stem
A. opt A
B. opt B
C. opt C
D. controversial [Ans: C]

2. Question 2 stem
A. opt A
B. opt B
C. opt C
D. controversial Key A

3. Question 3 stem
A. opt A
B. opt B
C. opt C
D. controversial (Key: D)
`;
        const res = parsePlainText(text);
        assert.strictEqual(res.questions.length, 3);
        assert.strictEqual(res.questions[0].correct_option, 'C');
        assert.strictEqual(res.questions[0].option_d, 'controversial');

        assert.strictEqual(res.questions[1].correct_option, 'A');
        assert.strictEqual(res.questions[1].option_d, 'controversial');

        assert.strictEqual(res.questions[2].correct_option, 'D');
        assert.strictEqual(res.questions[2].option_d, 'controversial');
    });

    console.log('\n----------------------------------------------------------------------');
    console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log('======================================================================');

    if (passedTests === totalTests) {
        console.log('🎉 ALL TRAILING OPTION ANSWER TESTS PASSED PERFECTLY!\n');
    } else {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
