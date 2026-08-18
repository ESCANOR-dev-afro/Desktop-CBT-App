import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'screens/student_dashboard_screen.dart';
import 'screens/exam_screen.dart';
import 'services/auth_service.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Global Error Boundary to prevent blank white screens on runtime/rendering errors
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: Scaffold(
        backgroundColor: AppTheme.darkCharcoal,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.warning_amber_rounded, size: 56, color: AppTheme.primaryOrange),
                const SizedBox(height: 16),
                const Text(
                  'CBT Portal Initialization Notice',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 8),
                Text(
                  details.exceptionAsString(),
                  textAlign: TextAlign.center,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Colors.white70),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryOrange,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  ),
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  label: const Text('RESET & RETRY', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  onPressed: () {
                    AuthService.logout();
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  };

  runApp(const CBTStudentApp());
}

class CBTStudentApp extends StatefulWidget {
  const CBTStudentApp({super.key});

  @override
  State<CBTStudentApp> createState() => _CBTStudentAppState();
}

class _CBTStudentAppState extends State<CBTStudentApp> {
  bool _isLoadingSession = true;
  bool _directToExamScreen = false;
  Map<String, dynamic>? _activeStudentData;
  int? _activeSessionId;

  @override
  void initState() {
    super.initState();
    _checkActiveSession();
  }

  Future<void> _checkActiveSession() async {
    try {
      final session = await AuthService.getStoredSession();
      if (session != null &&
          session['student_id'] != null &&
          session['session_id'] != null &&
          session['server_ip'] != null) {
        final studentId = session['student_id'] as int;
        final sessionId = session['session_id'] as int;
        final serverIp = session['server_ip'] as String;

        // 1. Verify active session token against server
        final isValidSession = await AuthService.verifySession(
          studentId: studentId,
          sessionId: sessionId,
          serverIp: serverIp,
        );

        if (isValidSession) {
          // 2. Fetch active session via GET /api/student/active-session
          final activeSessionResult = await AuthService.checkActiveExamSession(
            studentId: studentId,
            serverIp: serverIp,
          );

          if (activeSessionResult != null &&
              (activeSessionResult['hasActiveSession'] == true || activeSessionResult['has_active_session'] == true)) {
            final rawSes = activeSessionResult['session'] ?? activeSessionResult['active_session'];
            if (rawSes != null) {
              final activeSes = Map<String, dynamic>.from(rawSes);
              final status = activeSes['status']?.toString();
              final activeSubject = (activeSes['subject_name'] ?? activeSes['subject'])?.toString();
              final expiresAtStr = activeSes['expires_at']?.toString();

              bool isUnexpired = true;
              if (expiresAtStr != null && expiresAtStr.isNotEmpty) {
                try {
                  final expiresAt = DateTime.parse(expiresAtStr).toUtc();
                  final nowUtc = DateTime.now().toUtc();
                  if (expiresAt.isBefore(nowUtc) || expiresAt.isAtSameMomentAs(nowUtc)) {
                    isUnexpired = false;
                  }
                } catch (_) {}
              }

              if (status == 'IN_PROGRESS' && isUnexpired && activeSubject != null && activeSubject.isNotEmpty) {
                // Fetch student profile metadata
                final dashboardData = await AuthService.fetchStudentDashboard(
                  studentId: studentId,
                  serverIp: serverIp,
                  sessionId: sessionId,
                );

                final student = (dashboardData != null && dashboardData['student'] != null)
                    ? Map<String, dynamic>.from(dashboardData['student'])
                    : <String, dynamic>{
                        'id': studentId,
                        'reg_number': session['reg_number'],
                        'surname': session['surname'],
                        'class': session['class'],
                      };

                student['server_ip'] = serverIp;
                student['assigned_subject'] = activeSubject;
                student['current_question_index'] = (activeSes['current_question_index'] as num?)?.toInt() ?? 0;
                student['selected_answers'] = activeSes['selected_answers'];
                student['expires_at'] = expiresAtStr;

                final activeSessionId = (activeSes['session_id'] ?? activeSes['id'] as num?)?.toInt() ?? sessionId;

                if (mounted) {
                  setState(() {
                    _activeStudentData = student;
                    _activeSessionId = activeSessionId;
                    _directToExamScreen = true;
                    _isLoadingSession = false;
                  });
                }
                return;
              }
            }
          }

          // 3. If no active IN_PROGRESS session, load student dashboard data
          final dashboardData = await AuthService.fetchStudentDashboard(
            studentId: studentId,
            serverIp: serverIp,
            sessionId: sessionId,
          );

          if (dashboardData != null && dashboardData['student'] != null) {
            final student = Map<String, dynamic>.from(dashboardData['student']);
            student['server_ip'] = serverIp;

            if (mounted) {
              setState(() {
                _activeStudentData = student;
                _activeSessionId = sessionId;
                _directToExamScreen = false;
                _isLoadingSession = false;
              });
            }
            return;
          }
        }
      }
    } catch (e) {
      debugPrint('⚠️ Error checking active session: $e');
    }

    // Explicitly purge stale local storage tokens when verification fails
    try {
      await AuthService.logout();
    } catch (_) {}

    if (mounted) {
      setState(() {
        _activeStudentData = null;
        _activeSessionId = null;
        _directToExamScreen = false;
        _isLoadingSession = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Anthony Whitebridge Academy CBT Portal',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: _isLoadingSession
          ? Scaffold(
              backgroundColor: AppTheme.darkCharcoal,
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 80,
                      height: 80,
                      padding: const EdgeInsets.all(12),
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                      ),
                      child: Image.asset(
                        'assets/school_logo.jpg',
                        fit: BoxFit.contain,
                        errorBuilder: (context, error, stackTrace) => const Icon(
                          Icons.school_rounded,
                          size: 40,
                          color: AppTheme.primaryOrange,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    const CircularProgressIndicator(
                      color: AppTheme.primaryOrange,
                      strokeWidth: 3,
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Restoring Examination Session...',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            )
          : (_activeStudentData != null && _activeSessionId != null
              ? (_directToExamScreen
                  ? ExamScreen(
                      studentData: _activeStudentData!,
                      sessionId: _activeSessionId!,
                    )
                  : StudentDashboardScreen(
                      studentData: _activeStudentData!,
                      initialSessionId: _activeSessionId!,
                    ))
              : const LoginScreen()),
    );
  }
}
