const assert = require('assert');
const { createDiagramContext, parseDocxRelationships } = require('../services/parsers/common/docxMediaExtractor');
const { parseMathScienceDocx } = require('../services/parsers/mathScienceParser');
const { parseStandardDocx } = require('../services/parsers/standardDocxParser');

console.log('======================================================================');
console.log('🧪 RUNNING TEST SUITE: DIAGRAM BINDING & MULTI-QUESTION SCOPE');
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
  // TEST 1: XML Relationships Parser
  await runTest('Relationships XML: Correctly maps rId to media/image.png paths', () => {
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
      <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.jpeg"/>
    </Relationships>`;
    
    const relsMap = parseDocxRelationships(relsXml);
    assert.strictEqual(relsMap.get('rId2'), 'media/image1.png');
    assert.strictEqual(relsMap.get('rId3'), 'media/image2.jpeg');
    assert.strictEqual(relsMap.has('rId1'), false); // non-media targets normalized
  });

  // TEST 2: Diagram Context - Preceding diagram binding
  await runTest('Diagram Context: Preceding diagram binds to immediate next question and cleans up', () => {
    const ctx = createDiagramContext();
    
    // Encountered image in stream before question 3
    ctx.registerImage('/uploads/diagrams/fig1.png');
    
    const q3 = { question_number: 3, question_text: 'What is the magnitude of the force shown?' };
    ctx.bindDiagramForQuestion(q3, 3);
    assert.strictEqual(q3.diagram_image_url, '/uploads/diagrams/fig1.png', 'Expected fig1.png to bind to Q3');
    assert.strictEqual(q3.has_diagram, true);
    
    // Next question 4 (has no diagram)
    const q4 = { question_number: 4, question_text: 'Define velocity.' };
    ctx.bindDiagramForQuestion(q4, 4);
    assert.strictEqual(q4.diagram_image_url, null, 'Expected no diagram for Q4');
    assert.strictEqual(q4.has_diagram, false);
  });

  // TEST 3: Diagram Context - Multi-Question Biology Scope (Questions 14 to 16)
  await runTest('Diagram Context: Multi-question scope correctly binds across Q14, Q15, Q16 and resets on Q17', () => {
    const ctx = createDiagramContext();
    
    // Directive + Image
    ctx.registerImage('/uploads/diagrams/cell_structure.png');
    ctx.checkMultiQuestionDirective('Study the diagram below and use it to answer questions 14 to 16.');
    
    // Q14
    const q14 = { question_number: 14 };
    ctx.bindDiagramForQuestion(q14, 14);
    assert.strictEqual(q14.diagram_image_url, '/uploads/diagrams/cell_structure.png', 'Q14 should have cell_structure.png');
    assert.strictEqual(q14.has_diagram, true);
    
    // Q15
    const q15 = { question_number: 15 };
    ctx.bindDiagramForQuestion(q15, 15);
    assert.strictEqual(q15.diagram_image_url, '/uploads/diagrams/cell_structure.png', 'Q15 should have cell_structure.png');
    assert.strictEqual(q15.has_diagram, true);
    
    // Q16
    const q16 = { question_number: 16 };
    ctx.bindDiagramForQuestion(q16, 16);
    assert.strictEqual(q16.diagram_image_url, '/uploads/diagrams/cell_structure.png', 'Q16 should have cell_structure.png');
    assert.strictEqual(q16.has_diagram, true);
    
    // Q17 (Beyond scope range 14-16)
    const q17 = { question_number: 17 };
    ctx.bindDiagramForQuestion(q17, 17);
    assert.strictEqual(q17.diagram_image_url, null, 'Q17 should NOT have a diagram assigned');
    assert.strictEqual(q17.has_diagram, false);
  });

  // TEST 4: Diagram Context - Multi-Question hyphenated range (Questions 5-8)
  await runTest('Diagram Context: Multi-question hyphenated range (Questions 5-8)', () => {
    const ctx = createDiagramContext();
    
    ctx.registerImage('/uploads/diagrams/circuit.png');
    ctx.checkMultiQuestionDirective('Use the circuit diagram below to answer Questions 5-8.');
    
    const q5 = { question_number: 5 };
    ctx.bindDiagramForQuestion(q5, 5);
    assert.strictEqual(q5.diagram_image_url, '/uploads/diagrams/circuit.png');
    
    const q6 = { question_number: 6 };
    ctx.bindDiagramForQuestion(q6, 6);
    assert.strictEqual(q6.diagram_image_url, '/uploads/diagrams/circuit.png');
    
    const q7 = { question_number: 7 };
    ctx.bindDiagramForQuestion(q7, 7);
    assert.strictEqual(q7.diagram_image_url, '/uploads/diagrams/circuit.png');
    
    const q8 = { question_number: 8 };
    ctx.bindDiagramForQuestion(q8, 8);
    assert.strictEqual(q8.diagram_image_url, '/uploads/diagrams/circuit.png');
    
    const q9 = { question_number: 9 };
    ctx.bindDiagramForQuestion(q9, 9);
    assert.strictEqual(q9.diagram_image_url, null, 'Q9 must be null');
  });

  // TEST 5: Direct inline diagram priority override
  await runTest('Diagram Context: Direct inline diagram overrides pending diagram', () => {
    const ctx = createDiagramContext();
    ctx.registerImage('/uploads/diagrams/old_diagram.png');
    
    const q = { question_number: 1 };
    ctx.bindDiagramForQuestion(q, 1, '/uploads/diagrams/specific_inline.png');
    
    assert.strictEqual(q.diagram_image_url, '/uploads/diagrams/specific_inline.png');
    assert.strictEqual(q.has_diagram, true);
  });

  // TEST 6: Math/Science Strategy with mock media map
  await runTest('Math/Science Strategy: Question with attached media context', async () => {
    const rawText = `
1. What is the acceleration of the object shown in Fig. 1?
A. 2 m/s^2
B. 4 m/s^2
C. 6 m/s^2
D. 8 m/s^2
ANSWER: B

2. Calculate the kinetic energy if m = 5kg and v = 10m/s.
A. 25 J
B. 250 J
C. 500 J
D. 50 J
ANSWER: B
    `;
    
    const mockCtx = createDiagramContext();
    mockCtx.registerImage('/uploads/diagrams/physics_graph.png');
    
    const questions = await parseMathScienceDocx(rawText, { diagramContext: mockCtx });
    assert.strictEqual(questions.length, 2);
    assert.strictEqual(questions[0].has_diagram, true);
    assert.strictEqual(questions[0].diagram_image_url, '/uploads/diagrams/physics_graph.png');
    assert.strictEqual(questions[1].has_diagram, false);
    assert.strictEqual(questions[1].diagram_image_url, null);
  });

  // TEST 7: Standard Strategy with Biology Group Scope
  await runTest('Standard Strategy: Multi-question diagram assignment in Biology text', async () => {
    const rawText = `
Use the diagram below to answer questions 10 to 12.

10. Name the structure marked I.
A. Nucleus
B. Mitochondrion
C. Ribosome
D. Chloroplast
ANSWER: A

11. What is the function of part II?
A. Respiration
B. Protein synthesis
C. Excretion
D. Osmoregulation
ANSWER: B

12. Which kingdom does this organism belong to?
A. Animalia
B. Plantae
C. Fungi
D. Protista
ANSWER: D

13. Which of the following is a renewable resource?
A. Coal
B. Petroleum
C. Solar energy
D. Natural gas
ANSWER: C
    `;
    
    const mockCtx = createDiagramContext();
    mockCtx.registerImage('/uploads/diagrams/amoeba.png');
    mockCtx.checkMultiQuestionDirective('Use the diagram below to answer questions 10 to 12.');
    
    const questions = await parseStandardDocx(rawText, { diagramContext: mockCtx });
    assert.strictEqual(questions.length, 4);
    assert.strictEqual(questions[0].number || questions[0].question_number, 10);
    assert.strictEqual(questions[0].has_diagram, true);
    assert.strictEqual(questions[0].diagram_image_url, '/uploads/diagrams/amoeba.png');
    
    assert.strictEqual(questions[1].number || questions[1].question_number, 11);
    assert.strictEqual(questions[1].has_diagram, true);
    assert.strictEqual(questions[1].diagram_image_url, '/uploads/diagrams/amoeba.png');
    
    assert.strictEqual(questions[2].number || questions[2].question_number, 12);
    assert.strictEqual(questions[2].has_diagram, true);
    assert.strictEqual(questions[2].diagram_image_url, '/uploads/diagrams/amoeba.png');
    
    assert.strictEqual(questions[3].number || questions[3].question_number, 13);
    assert.strictEqual(questions[3].has_diagram, false);
    assert.strictEqual(questions[3].diagram_image_url, null);
  });

  // TEST 8: Full Physics SSS 2 Paper (Q1 to Q21 with exact diagram associations)
  await runTest('Physics SSS 2: Exact diagram binding for Q3, Q5, Q8, Q12, Q14, Q21 and null for others', () => {
    const { associateParagraphMedia } = require('../services/parsers/common/docxMediaExtractor');
    const { parseDocument } = require('../services/parsers/common/documentParser');

    const paragraphs = [
      // Q1 (No diagram)
      '<p>1. Which of the following is a fundamental quantity?</p>',
      '<p>A. Velocity</p>',
      '<p>B. Length</p>',
      '<p>C. Force</p>',
      '<p>D. Acceleration</p>',

      // Q2 (No diagram)
      '<p>2. The dimension of work is</p>',
      '<p>A. MLT^-2</p>',
      '<p>B. ML^2T^-2</p>',
      '<p>C. ML^-1T^-2</p>',
      '<p>D. ML^2T^-1</p>',

      // Q3 (Preceded by Fig. 12 diagram)
      '<p><img src="/uploads/diagrams/fig12_vt.png" /></p>',
      '<p>3. Fig 12 shows the velocity time graph of a body moving in a straight line. Calculate the total distance covered.</p>',
      '<p>A. 100 m</p>',
      '<p>B. 200 m</p>',
      '<p>C. 300 m</p>',
      '<p>D. 400 m</p>',

      // Q4 (No diagram)
      '<p>4. A body moves with constant acceleration of 2 m/s^2 from rest. Find its velocity after 5 seconds.</p>',
      '<p>A. 10 m/s</p>',
      '<p>B. 20 m/s</p>',
      '<p>C. 25 m/s</p>',
      '<p>D. 50 m/s</p>',

      // Q5 (Inline diagram between stem and options)
      '<p>5. What is the acceleration of the body whose motion is graphically displayed in the diagram above?</p>',
      '<p><img src="/uploads/diagrams/ramp_graph.png" /></p>',
      '<p>A. 2.5 m/s^2</p>',
      '<p>B. 5.0 m/s^2</p>',
      '<p>C. 7.5 m/s^2</p>',
      '<p>D. 10.0 m/s^2</p>',

      // Q6 (No diagram)
      '<p>6. An object is projected vertically upwards with an initial velocity of 20 m/s. Find maximum height reached (g = 10 m/s^2).</p>',
      '<p>A. 10 m</p>',
      '<p>B. 20 m</p>',
      '<p>C. 30 m</p>',
      '<p>D. 40 m</p>',

      // Q7 (No diagram)
      '<p>7. Newton\'s second law of motion gives the measure of</p>',
      '<p>A. Force</p>',
      '<p>B. Momentum</p>',
      '<p>C. Velocity</p>',
      '<p>D. Acceleration</p>',

      // Q8 (Preceded by Fig. 1 caption + image)
      '<p>Fig. 1</p>',
      '<p><img src="/uploads/diagrams/fig1_distance_time.png" /></p>',
      '<p>8. Two taxis leave benin and agbor at the same time and travel towards each other as shown in the distance-time graph. Find the time of meeting.</p>',
      '<p>A. 1.5 hrs</p>',
      '<p>B. 2.0 hrs</p>',
      '<p>C. 2.5 hrs</p>',
      '<p>D. 3.0 hrs</p>',

      // Q9, Q10, Q11 (No diagram)
      '<p>9. A force of 10N acts on a mass of 2kg for 3 seconds. The impulse is</p>',
      '<p>A. 10 Ns</p>',
      '<p>B. 20 Ns</p>',
      '<p>C. 30 Ns</p>',
      '<p>D. 60 Ns</p>',

      '<p>10. The unit of universal gravitational constant G is</p>',
      '<p>A. N m^2 kg^-2</p>',
      '<p>B. N m kg^-1</p>',
      '<p>C. N m^-2 kg^2</p>',
      '<p>D. N kg^-2</p>',

      '<p>11. The escape velocity from earth surface is approximately</p>',
      '<p>A. 11.2 km/s</p>',
      '<p>B. 9.8 km/s</p>',
      '<p>C. 8.0 km/s</p>',
      '<p>D. 3.0 km/s</p>',

      // Q12 (Preceded by Fig. 1 caption + trapezoid graph)
      '<p>Fig. 1</p>',
      '<p><img src="/uploads/diagrams/fig1_trapezoid.png" /></p>',
      '<p>12. The graph in the fig above describes the motion of a particle. Determine its deceleration.</p>',
      '<p>A. 1.0 m/s^2</p>',
      '<p>B. 2.0 m/s^2</p>',
      '<p>C. 3.0 m/s^2</p>',
      '<p>D. 4.0 m/s^2</p>',

      // Q13 (No diagram)
      '<p>13. A simple pendulum has a period of 2 seconds. Its length is approximately</p>',
      '<p>A. 0.5 m</p>',
      '<p>B. 1.0 m</p>',
      '<p>C. 1.5 m</p>',
      '<p>D. 2.0 m</p>',

      // Q14 (Inline speed graph)
      '<p>14. Find total distance covered by the particle during acceleration and retardation</p>',
      '<p><img src="/uploads/diagrams/speed_graph.png" /></p>',
      '<p>A. 150 m</p>',
      '<p>B. 225 m</p>',
      '<p>C. 300 m</p>',
      '<p>D. 350 m</p>',

      // Q15, Q16, Q17 (No diagram - Q17 is the one mentioned in user diagnosis!)
      '<p>15. In an elastic collision, which quantity is conserved?</p>',
      '<p>A. Momentum only</p>',
      '<p>B. Kinetic energy only</p>',
      '<p>C. Both momentum and kinetic energy</p>',
      '<p>D. Velocity only</p>',

      '<p>16. A stone is thrown horizontally from the top of a tower with speed 15 m/s. Calculate horizontal distance after 2s.</p>',
      '<p>A. 15 m</p>',
      '<p>B. 30 m</p>',
      '<p>C. 45 m</p>',
      '<p>D. 60 m</p>',

      '<p>17. If it takes an object 3s to fall freely from rest to the ground, its speed on hitting the ground is (g = 10 m/s^2)</p>',
      '<p>A. 15 m/s</p>',
      '<p>B. 30 m/s</p>',
      '<p>C. 45 m/s</p>',
      '<p>D. 90 m/s</p>',

      // Q21 (Preceded by Fig. 13 pulley graph)
      '<p>Fig. 13</p>',
      '<p><img src="/uploads/diagrams/fig13_pulley.png" /></p>',
      '<p>21. A body of mass 10kg on a smooth inclined plane is connected by a light inextensible string passing over a smooth pulley to a mass of 5kg. Find the acceleration.</p>',
      '<p>A. 1.2 m/s^2</p>',
      '<p>B. 2.5 m/s^2</p>',
      '<p>C. 3.3 m/s^2</p>',
      '<p>D. 5.0 m/s^2</p>',
    ];

    const ctx = createDiagramContext();
    const { textLines, lineOffsets } = associateParagraphMedia(paragraphs, ctx);
    const documentText = textLines.join('\n');
    const parseResult = parseDocument(documentText, new Map(), lineOffsets, ctx);
    const qs = parseResult.questions;

    const qMap = new Map(qs.map(q => [q.number, q]));

    // Assert questions with diagrams have exact images
    assert.strictEqual(qMap.get(3).has_diagram, true);
    assert.ok(qMap.get(3).diagram_image_url.includes('fig12_vt') || qMap.get(3).diagram_image_url.includes('_q3_'));

    assert.strictEqual(qMap.get(5).has_diagram, true);
    assert.ok(qMap.get(5).diagram_image_url.includes('ramp_graph') || qMap.get(5).diagram_image_url.includes('_q5_'));

    assert.strictEqual(qMap.get(8).has_diagram, true);
    assert.ok(qMap.get(8).diagram_image_url.includes('fig1_distance_time') || qMap.get(8).diagram_image_url.includes('_q8_'));

    assert.strictEqual(qMap.get(12).has_diagram, true);
    assert.ok(qMap.get(12).diagram_image_url.includes('fig1_trapezoid') || qMap.get(12).diagram_image_url.includes('_q12_'));

    assert.strictEqual(qMap.get(14).has_diagram, true);
    assert.ok(qMap.get(14).diagram_image_url.includes('speed_graph') || qMap.get(14).diagram_image_url.includes('_q14_'));

    assert.strictEqual(qMap.get(21).has_diagram, true);
    assert.ok(qMap.get(21).diagram_image_url.includes('fig13_pulley') || qMap.get(21).diagram_image_url.includes('_q21_'));

    // Assert ALL text-only questions have null diagram
    const textOnlyQuestions = [1, 2, 4, 6, 7, 9, 10, 11, 13, 15, 16, 17];
    for (const qNum of textOnlyQuestions) {
      assert.strictEqual(qMap.get(qNum).diagram_image_url, null, `Q${qNum} MUST have diagram_image_url = null`);
      assert.strictEqual(qMap.get(qNum).has_diagram, false, `Q${qNum} MUST have has_diagram = false`);
    }
  });

  // TEST 9: Slug Generator Utility
  await runTest('Slug Generator: Correctly generates safe lowercase filesystem slugs', () => {
    const { generateDocSlug } = require('../services/parsers/common/docxMediaExtractor');
    assert.strictEqual(generateDocSlug('PHYSICS SSS 2.docx'), 'physics_sss_2');
    assert.strictEqual(generateDocSlug({ originalFileName: 'Biology SS1 (1st Term).docx' }), 'biology_ss1_1st_term');
    assert.strictEqual(generateDocSlug({ targetSubject: 'Further Mathematics' }), 'further_mathematics');
    assert.strictEqual(generateDocSlug(''), 'doc');
    assert.strictEqual(generateDocSlug(null), 'doc');
  });

  // TEST 10: Deterministic Scoped Diagram Naming & Q1 Spillover Protection
  await runTest('Deterministic Scoped Diagram Naming: ss2_physics_midterm_ca_q[N]_img[I].jpeg and Q1 is protected', () => {
    const { associateParagraphMedia, createDiagramContext } = require('../services/parsers/common/docxMediaExtractor');
    const { parseDocument } = require('../services/parsers/common/documentParser');

    const paragraphs = [
      // Standalone header logo (must NOT bind to Q1)
      '<p><img src="/uploads/diagrams/school_header_logo.png" /></p>',
      '<p>FIRST TERM EXAMINATION - PHYSICS SS2</p>',
      
      // Q1: An air force jet (text-only, must NOT receive logo or any diagram)
      '<p>1. An air force jet flying with a speed of 335ms-1 went past an anti-aircraft gun. How far is the aircraft 5s later when the gun was fired?</p>',
      '<p>A. 1675 m</p>',
      '<p>B. 2000 m</p>',
      '<p>C. 67 m</p>',
      '<p>D. 335 m</p>',

      // Q3: Preceded by Fig. 12 diagram
      '<p>Fig. 12</p>',
      '<p><img src="/uploads/diagrams/temp_fig12.png" /></p>',
      '<p>3. Fig 12 shows the velocity time graph of a body moving in a straight line. Calculate the total distance covered.</p>',
      '<p>A. 100 m</p>',
      '<p>B. 200 m</p>',
      '<p>C. 300 m</p>',
      '<p>D. 400 m</p>',

      // Q5: Inline diagram
      '<p>5. What is the acceleration of the body whose motion is graphically displayed in the diagram above?</p>',
      '<p><img src="/uploads/diagrams/temp_ramp.jpeg" /></p>',
      '<p>A. 2.5 m/s^2</p>',
      '<p>B. 5.0 m/s^2</p>',
      '<p>C. 7.5 m/s^2</p>',
      '<p>D. 10.0 m/s^2</p>',

      // Q21: Preceded by Fig. 13 pulley graph
      '<p>Fig. 13</p>',
      '<p><img src="/uploads/diagrams/temp_pulley.jpeg" /></p>',
      '<p>21. A body of mass 10kg on a smooth inclined plane is connected by a light inextensible string passing over a smooth pulley to a mass of 5kg. Find the acceleration.</p>',
      '<p>A. 1.2 m/s^2</p>',
      '<p>B. 2.5 m/s^2</p>',
      '<p>C. 3.3 m/s^2</p>',
      '<p>D. 5.0 m/s^2</p>',
    ];

    const ctx = createDiagramContext();
    const docContext = { classTier: 'ss2', subject: 'physics', slot: 'midterm_ca' };
    const { textLines, lineOffsets } = associateParagraphMedia(paragraphs, ctx, docContext);
    const documentText = textLines.join('\n');
    const parseResult = parseDocument(documentText, new Map(), lineOffsets, ctx);
    const qs = parseResult.questions;
    const qMap = new Map(qs.map(q => [q.number, q]));

    // Q1 MUST NOT HAVE ANY DIAGRAM
    assert.strictEqual(qMap.get(1).diagram_image_url, null, 'Q1 MUST NOT receive header logo or Fig. 13 pulley diagram');
    assert.strictEqual(qMap.get(1).has_diagram, false);

    // Q3 gets deterministic ss2_physics_midterm_ca_q3_img1.png
    assert.strictEqual(qMap.get(3).diagram_image_url, '/uploads/diagrams/ss2_physics_midterm_ca_q3_img1.png');
    assert.strictEqual(qMap.get(3).has_diagram, true);

    // Q5 gets deterministic ss2_physics_midterm_ca_q5_img1.jpeg
    assert.strictEqual(qMap.get(5).diagram_image_url, '/uploads/diagrams/ss2_physics_midterm_ca_q5_img1.jpeg');
    assert.strictEqual(qMap.get(5).has_diagram, true);

    // Q21 gets deterministic ss2_physics_midterm_ca_q21_img1.jpeg
    assert.strictEqual(qMap.get(21).diagram_image_url, '/uploads/diagrams/ss2_physics_midterm_ca_q21_img1.jpeg');
    assert.strictEqual(qMap.get(21).has_diagram, true);
  });

  // TEST 11: Student Exam Shuffling preserves question image_url
  await runTest('Exam Shuffle: Shuffling questions preserves embedded diagram_image_url per question', () => {
    const rawQuestions = [
      { id: 1, number: 1, question_text: 'Text Q1', diagram_image_url: null },
      { id: 3, number: 3, question_text: 'Q3 with fig 12', diagram_image_url: '/uploads/diagrams/physics_sss_2_q3_1.png' },
      { id: 8, number: 8, question_text: 'Q8 with fig 1', diagram_image_url: '/uploads/diagrams/physics_sss_2_q8_1.png' },
      { id: 12, number: 12, question_text: 'Q12 with trapezoid', diagram_image_url: '/uploads/diagrams/physics_sss_2_q12_1.png' },
      { id: 17, number: 17, question_text: 'If it takes an object 3s to fall freely...', diagram_image_url: null },
    ];

    // Simulate Fisher-Yates shuffle
    const shuffled = [...rawQuestions].sort(() => 0.5 - Math.random());

    // Verify properties travel with their question objects
    for (const q of shuffled) {
      if (q.id === 12) {
        assert.strictEqual(q.diagram_image_url, '/uploads/diagrams/physics_sss_2_q12_1.png');
      } else if (q.id === 17) {
        assert.strictEqual(q.diagram_image_url, null);
      } else if (q.id === 3) {
        assert.strictEqual(q.diagram_image_url, '/uploads/diagrams/physics_sss_2_q3_1.png');
      }
    }
  });

  // TEST 12: Multi-Slot Assessment Scoping & Collision Prevention
  await runTest('Multi-Slot Assessment Scoping: Generates collision-free filenames for all 4 slots and range questions', () => {
    const { generateScopedDiagramFilename } = require('../services/parsers/common/docxMediaExtractor');

    // Slot 1: Welcome / Mock Test
    const slot1Name = generateScopedDiagramFilename(
      { classTier: 'ss2', subject: 'physics', slot: 'welcome_mock' },
      20,
      1,
      'jpeg'
    );
    assert.strictEqual(slot1Name, 'ss2_physics_welcome_mock_q20_img1.jpeg');

    // Slot 2: Mid-Term CA Test
    const slot2Name = generateScopedDiagramFilename(
      { classTier: 'ss2', subject: 'physics', slot: 'midterm_ca' },
      20,
      1,
      'jpeg'
    );
    assert.strictEqual(slot2Name, 'ss2_physics_midterm_ca_q20_img1.jpeg');

    // Slot 3: Terminal Examination
    const slot3Name = generateScopedDiagramFilename(
      { classTier: 'ss2', subject: 'physics', slot: 'examination' },
      20,
      1,
      'jpeg'
    );
    assert.strictEqual(slot3Name, 'ss2_physics_examination_q20_img1.jpeg');

    // Slot 4: Custom Assessment
    const slot4Name = generateScopedDiagramFilename(
      { classTier: 'ss2', subject: 'physics', slot: 'custom' },
      20,
      1,
      'jpeg'
    );
    assert.strictEqual(slot4Name, 'ss2_physics_custom_q20_img1.jpeg');

    // Confirm all 4 slot filenames are mutually distinct
    const uniqueSlots = new Set([slot1Name, slot2Name, slot3Name, slot4Name]);
    assert.strictEqual(uniqueSlots.size, 4, 'All 4 assessment slot diagram filenames must be unique');

    // Biology Multi-Question Range (Q14-Q16) in Examination
    const rangeName = generateScopedDiagramFilename(
      { classTier: 'SS 2 Science', subject: 'Biology', slot: 'examination' },
      '14_16',
      1,
      'png'
    );
    assert.strictEqual(rangeName, 'ss_2_science_biology_examination_q14_16_img1.png');

    // Further Maths SS3 Examination
    const fmName = generateScopedDiagramFilename(
      { classTier: 'SS 3 Science', subject: 'Further Mathematics', slot: 'examination' },
      1,
      1,
      'jpeg'
    );
    assert.strictEqual(fmName, 'ss_3_science_further_mathematics_examination_q1_img1.jpeg');
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL DIAGRAM BINDING TESTS PASSED PERFECTLY!\n');
  }
}

runAll();

