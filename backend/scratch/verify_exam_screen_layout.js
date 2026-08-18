/**
 * verify_exam_screen_layout.js
 * 
 * Static Code & Viewport Architecture Verification Suite for Student Exam Screen:
 * 1. Verifies that nested scroll containers (ListView / isolated SingleChildScrollView) are eradicated from option cards.
 * 2. Verifies that main question area is wrapped in a unified SingleChildScrollView + Scrollbar(thumbVisibility: true).
 * 3. Verifies diagram max-height constraint is set to 260px to prevent viewport overflow before scrolling.
 * 4. Verifies option cards (A, B, C, D) and navigation footer (Previous / Next / Submit) are top-to-bottom scrollable in main flow.
 */

const fs = require('fs');
const path = require('path');

async function runExamScreenLayoutVerificationSuite() {
    console.log("==================================================================");
    console.log("⚡ CBT AGENTIC TEST SUITE: STUDENT EXAM VIEWPORT SCROLLING LAYOUT");
    console.log("==================================================================\n");

    const filePath = path.join(__dirname, '../../student_client/lib/screens/exam_screen.dart');
    if (!fs.existsSync(filePath)) {
        console.error(`❌ exam_screen.dart not found at ${filePath}`);
        process.exit(1);
    }

    const code = fs.readFileSync(filePath, 'utf8');

    // 1. Audit for Faulty Micro-Scrolls / Nested ListViews around options
    console.log("1️⃣ Auditing for micro-scrolls and nested ListViews around options...");
    const hasNestedOptionListView = /_buildOptionCard[\s\S]*?ListView/.test(code) || /ListView[\s\S]*?_buildOptionCard/.test(code);
    if (hasNestedOptionListView) {
        console.error("❌ Faulty nested ListView detected around option cards!");
        process.exit(1);
    }
    console.log("  ✅ No nested ListView micro-scrolls found around option cards.");

    // 2. Audit Main Scroll Container Architecture
    console.log("\n2️⃣ Verifying unified SingleChildScrollView & Scrollbar architecture...");
    const hasScrollbar = code.includes('Scrollbar(') && code.includes('thumbVisibility: true');
    const hasSingleChildScrollView = code.includes('SingleChildScrollView(');
    const hasBouncingPhysics = code.includes('BouncingScrollPhysics');

    if (!hasScrollbar || !hasSingleChildScrollView || !hasBouncingPhysics) {
        console.error("❌ Main scroll view architecture missing required SingleChildScrollView / Scrollbar / BouncingScrollPhysics!", {
            hasScrollbar,
            hasSingleChildScrollView,
            hasBouncingPhysics
        });
        process.exit(1);
    }
    console.log("  ✅ Unified SingleChildScrollView with active Scrollbar(thumbVisibility: true) and BouncingScrollPhysics verified!");

    // 3. Audit Diagram Responsive Height Constraint
    console.log("\n3️⃣ Verifying diagram responsive height constraint safeguard...");
    const hasDiagramConstraint = code.includes('constraints: const BoxConstraints(maxHeight: 260)');
    if (!hasDiagramConstraint) {
        console.error("❌ Diagram max-height constraint (BoxConstraints(maxHeight: 260)) missing in exam_screen.dart!");
        process.exit(1);
    }
    console.log("  ✅ Diagram max-height constraint set to 260px (BoxConstraints(maxHeight: 260)) verified!");

    // 4. Verify Unified Flow inside _buildExamDesktopSplitLayout
    console.log("\n4️⃣ Verifying top-to-bottom layout flow sequence within main layout...");
    const layoutStartIndex = code.indexOf('_buildExamDesktopSplitLayout()');
    const layoutCode = code.substring(layoutStartIndex);

    const headerPos = layoutCode.indexOf('Question ${_currentQuestionIndex + 1}');
    const stemPos = layoutCode.indexOf("currentQuestion['question_text']");
    const diagramPos = layoutCode.indexOf('_getDiagramUrl(currentQuestion)');
    const optionAPos = layoutCode.indexOf("letter: 'A'");
    const optionDPos = layoutCode.indexOf("letter: 'D'");
    const footerPos = layoutCode.indexOf("PREVIOUS QUESTION");

    console.log(`  - Header Pos: ${headerPos}`);
    console.log(`  - Question Stem Pos: ${stemPos}`);
    console.log(`  - Diagram Invocation Pos: ${diagramPos}`);
    console.log(`  - Option A Pos: ${optionAPos}`);
    console.log(`  - Option D Pos: ${optionDPos}`);
    console.log(`  - Footer Prev/Next Pos: ${footerPos}`);

    if (headerPos < stemPos && stemPos < diagramPos && diagramPos < optionAPos && optionAPos < optionDPos && optionDPos < footerPos) {
        console.log("  ✅ Top-to-bottom layout flow sequence verified 100% OK!");
    } else {
        console.error("❌ Layout sequence order broken!", { headerPos, stemPos, diagramPos, optionAPos, optionDPos, footerPos });
        process.exit(1);
    }

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED: STUDENT EXAM VIEWPORT SCROLLING LAYOUT VERIFIED OK!");
    console.log("==================================================================\n");
}

runExamScreenLayoutVerificationSuite().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
