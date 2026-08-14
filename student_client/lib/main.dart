import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'screens/student_dashboard_screen.dart';
import 'services/auth_service.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CBTStudentApp());
}

class CBTStudentApp extends StatefulWidget {
  const CBTStudentApp({super.key});

  @override
  State<CBTStudentApp> createState() => _CBTStudentAppState();
}

class _CBTStudentAppState extends State<CBTStudentApp> {
  bool _isLoadingSession = true;
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
          // 2. Fetch fresh student profile & subject statuses
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
                _isLoadingSession = false;
              });
            }
            return;
          }
        }
      }
    } catch (_) {}

    // Explicitly purge stale local storage tokens when verification fails
    await AuthService.logout();

    if (mounted) {
      setState(() {
        _activeStudentData = null;
        _activeSessionId = null;
        _isLoadingSession = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Anthony White Bridge Academy CBT Portal',
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
              ? StudentDashboardScreen(
                  studentData: _activeStudentData!,
                  initialSessionId: _activeSessionId!,
                )
              : const LoginScreen()),
    );
  }
}
