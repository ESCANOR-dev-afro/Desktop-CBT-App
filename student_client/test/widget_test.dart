import 'package:flutter_test/flutter_test.dart';
import 'package:student_client/main.dart';

void main() {
  testWidgets('App initialization test', (WidgetTester tester) async {
    await tester.pumpWidget(const CBTStudentApp());
    expect(find.text('Anthony White Bridge Academy'), findsOneWidget);
  });
}
