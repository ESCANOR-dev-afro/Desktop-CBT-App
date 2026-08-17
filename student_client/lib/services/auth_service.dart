import 'package:flutter/foundation.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'api_config.dart';

enum AuthErrorType {
  networkError,
  invalidCredentials,
  alreadySubmitted,
  unknown,
}

class AuthResult {
  final bool success;
  final AuthErrorType? errorType;
  final String? errorMessage;
  final Map<String, dynamic>? studentData;
  final int? sessionId;
  final bool hasActiveSession;
  final Map<String, dynamic>? activeSession;

  AuthResult({
    required this.success,
    this.errorType,
    this.errorMessage,
    this.studentData,
    this.sessionId,
    this.hasActiveSession = false,
    this.activeSession,
  });
}

class AuthService {
  /// Authenticates student against the Node.js backend server
  static Future<AuthResult> login({
    required String serverIp,
    required String regNumber,
    required String surname,
  }) async {
    try {
      final url = ApiConfig.getUri(serverIp, '/student/login');

      // Attempt to get workstation hostname / IP (web safe)
      String workstationIdentifier = 'Web Workstation';
      if (!kIsWeb) {
        try {
          workstationIdentifier = Platform.localHostname;
        } catch (_) {}
      }

      final response = await http
          .post(
            url,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'registration_no': regNumber.trim().toUpperCase(),
              'reg_number': regNumber.trim().toUpperCase(),
              'surname': surname.trim().toUpperCase(),
              'password': surname.trim().toUpperCase(),
              'workstation_ip': workstationIdentifier,
            }),
          )
          .timeout(const Duration(seconds: 8));

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode == 200 && data['success'] == true) {
        final student = data['student'] as Map<String, dynamic>;
        final sessionId = data['session_id'] as int;
        final hasActiveSession = data['has_active_session'] == true;
        final activeSession = data['active_session'] as Map<String, dynamic>?;

        // Persist session & student data locally in SharedPreferences
        final prefs = await SharedPreferences.getInstance();
        await prefs.setInt('session_id', sessionId);
        await prefs.setInt('student_id', student['id']);
        await prefs.setString('reg_number', student['reg_number']);
        await prefs.setString('surname', student['surname']);
        await prefs.setString('student_class', student['class']);
        await prefs.setString('assigned_subject', student['assigned_subject']);
        await prefs.setString('server_ip', serverIp);

        return AuthResult(
          success: true,
          studentData: student,
          sessionId: sessionId,
          hasActiveSession: hasActiveSession,
          activeSession: activeSession,
        );
      } else if (response.statusCode == 403 || (data['message'] != null && data['message'].toString().toLowerCase().contains('already'))) {
        return AuthResult(
          success: false,
          errorType: AuthErrorType.alreadySubmitted,
          errorMessage: data['message'] ?? 'Exam already taken or session locked.',
        );
      } else if (response.statusCode == 401 || (data['message'] != null && data['message'].toString().toLowerCase().contains('invalid'))) {
        return AuthResult(
          success: false,
          errorType: AuthErrorType.invalidCredentials,
          errorMessage: data['message'] ?? 'Invalid Registration Number or Surname.',
        );
      } else {
        return AuthResult(
          success: false,
          errorType: AuthErrorType.invalidCredentials,
          errorMessage: data['message'] ?? 'Authentication failed.',
        );
      }
    } catch (e) {
      return AuthResult(
        success: false,
        errorType: AuthErrorType.networkError,
        errorMessage: 'Network Error: Cannot connect to CBT Server (${e.toString().replaceAll("Exception: ", "")}).',
      );
    }
  }

  /// Dynamically fetches available exam subjects from backend GET /api/subjects?class=...
  static Future<List<String>> fetchSubjects({
    required String serverIp,
    String? className,
  }) async {
    try {
      final path = (className != null && className.isNotEmpty)
          ? '/subjects?class=${Uri.encodeComponent(className)}'
          : '/subjects';
      final url = ApiConfig.getUri(serverIp, path);
      final response = await http.get(url).timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        if (data['success'] == true && data['subjects'] != null) {
          final List rawList = data['subjects'];
          return rawList.map((s) => s.toString()).toList();
        }
      }
    } catch (e) {
      debugPrint('⚠️ Failed to fetch subjects dynamically: $e');
    }
    return [
      'Mathematics',
      'English Language',
      'Biology',
      'Chemistry',
      'Physics',
      'Civic Education',
      'Digital Technology',
      'Economics',
      'Geography',
      'Agricultural Science'
    ];
  }

  /// Clears active stored student session
  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }

  /// Verifies active session token against server
  static Future<bool> verifySession({
    required int studentId,
    required int sessionId,
    required String serverIp,
  }) async {
    try {
      final url = ApiConfig.getUri(serverIp, '/student/verify-session');
      final response = await http
          .post(
            url,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'student_id': studentId,
              'session_id': sessionId,
            }),
          )
          .timeout(const Duration(seconds: 4));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        return data['success'] == true && data['valid'] == true;
      }
    } catch (e) {
      debugPrint('⚠️ Session verification failed: $e');
    }
    return false;
  }

  /// Retrieves stored session details
  static Future<Map<String, dynamic>?> getStoredSession() async {
    final prefs = await SharedPreferences.getInstance();
    if (!prefs.containsKey('session_id') || !prefs.containsKey('student_id')) return null;

    final sessionId = prefs.getInt('session_id');
    final studentId = prefs.getInt('student_id');
    if (sessionId == null || studentId == null) return null;

    return {
      'session_id': sessionId,
      'student_id': studentId,
      'reg_number': prefs.getString('reg_number'),
      'surname': prefs.getString('surname'),
      'class': prefs.getString('student_class'),
      'assigned_subject': prefs.getString('assigned_subject'),
      'server_ip': prefs.getString('server_ip'),
    };
  }

  /// Fetches real-time student profile and subject status list for Student Exam Portal Hub
  static Future<Map<String, dynamic>?> fetchStudentDashboard({
    required int studentId,
    required String serverIp,
    int? sessionId,
  }) async {
    try {
      final path = sessionId != null
          ? '/student/$studentId/dashboard?session_id=$sessionId'
          : '/student/$studentId/dashboard';
      final url = ApiConfig.getUri(serverIp, path);
      final response = await http.get(url).timeout(const Duration(seconds: 6));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        if (data['success'] == true) {
          return data;
        }
      }
    } catch (e) {
      debugPrint('⚠️ Failed to fetch student dashboard: $e');
    }
    return null;
  }

  /// Initializes or resumes an active exam session for a specific subject paper
  static Future<int?> startSubjectSession({
    required int studentId,
    required String subject,
    required String serverIp,
  }) async {
    try {
      final url = ApiConfig.getUri(serverIp, '/exam/start-session');

      String workstationIdentifier = 'Web Workstation';
      if (!kIsWeb) {
        try {
          workstationIdentifier = Platform.localHostname;
        } catch (_) {}
      }

      final response = await http
          .post(
            url,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'student_id': studentId,
              'subject': subject,
              'workstation_ip': workstationIdentifier,
            }),
          )
          .timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        if (data['success'] == true && data['session_id'] != null) {
          return data['session_id'] as int;
        }
      }
    } catch (e) {
      debugPrint('⚠️ Failed to start subject session: $e');
    }
    return null;
  }

  /// Real-time progress saving for crash recovery and power loss protection
  static Future<bool> saveExamProgress({
    required String serverIp,
    required int sessionId,
    required int studentId,
    required Map<int, String> selectedAnswers,
    int? questionId,
    String? selectedOption,
  }) async {
    try {
      final url = ApiConfig.getUri(serverIp, '/student/exam/save-progress');
      final formattedAnswers = <String, String>{};
      selectedAnswers.forEach((k, v) => formattedAnswers[k.toString()] = v);

      final response = await http
          .post(
            url,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'session_id': sessionId,
              'student_id': studentId,
              'selected_answers': formattedAnswers,
              if (questionId != null) 'question_id': questionId,
              if (selectedOption != null) 'selected_option': selectedOption,
            }),
          )
          .timeout(const Duration(seconds: 4));

      return response.statusCode == 200;
    } catch (e) {
      debugPrint('⚠️ Failed to save exam progress: $e');
      return false;
    }
  }

  /// Checks for an unexpired active exam session for auto-resume
  static Future<Map<String, dynamic>?> fetchActiveSession({
    required String serverIp,
    required int studentId,
  }) async {
    try {
      final url = ApiConfig.getUri(serverIp, '/student/active-session?student_id=$studentId');
      final response = await http.get(url).timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        if (data['success'] == true && data['has_active_session'] == true) {
          return data['active_session'] as Map<String, dynamic>?;
        }
      }
      return null;
    } catch (e) {
      debugPrint('⚠️ Failed to fetch active session: $e');
      return null;
    }
  }
}
