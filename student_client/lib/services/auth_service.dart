import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

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

  AuthResult({
    required this.success,
    this.errorType,
    this.errorMessage,
    this.studentData,
    this.sessionId,
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
      final formattedIp = serverIp.trim().isEmpty ? '127.0.0.1' : serverIp.trim();
      final url = Uri.parse('http://$formattedIp:3000/api/login');

      // Attempt to get workstation hostname / IP
      String workstationIdentifier = '127.0.0.1';
      try {
        workstationIdentifier = Platform.localHostname;
      } catch (_) {}

      final response = await http
          .post(
            url,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'reg_number': regNumber.trim(),
              'surname': surname.trim().toUpperCase(),
              'workstation_ip': workstationIdentifier,
            }),
          )
          .timeout(const Duration(seconds: 8));

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode == 200 && data['success'] == true) {
        final student = data['student'] as Map<String, dynamic>;
        final sessionId = data['session_id'] as int;

        // Persist session & student data locally in SharedPreferences
        final prefs = await SharedPreferences.getInstance();
        await prefs.setInt('session_id', sessionId);
        await prefs.setInt('student_id', student['id']);
        await prefs.setString('reg_number', student['reg_number']);
        await prefs.setString('surname', student['surname']);
        await prefs.setString('student_class', student['class']);
        await prefs.setString('assigned_subject', student['assigned_subject']);
        await prefs.setString('server_ip', formattedIp);

        return AuthResult(
          success: true,
          studentData: student,
          sessionId: sessionId,
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
    } on SocketException {
      return AuthResult(
        success: false,
        errorType: AuthErrorType.networkError,
        errorMessage: 'Network Error: Cannot connect to CBT Server.',
      );
    } on TimeoutException {
      return AuthResult(
        success: false,
        errorType: AuthErrorType.networkError,
        errorMessage: 'Connection timed out.',
      );
    } on HttpException {
      return AuthResult(
        success: false,
        errorType: AuthErrorType.networkError,
        errorMessage: 'HTTP response error.',
      );
    } on FormatException {
      return AuthResult(
        success: false,
        errorType: AuthErrorType.networkError,
        errorMessage: 'Data format error.',
      );
    } catch (e) {
      return AuthResult(
        success: false,
        errorType: AuthErrorType.networkError,
        errorMessage: e.toString(),
      );
    }
  }

  /// Clears active stored student session
  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }

  /// Retrieves stored session details
  static Future<Map<String, dynamic>?> getStoredSession() async {
    final prefs = await SharedPreferences.getInstance();
    if (!prefs.containsKey('session_id')) return null;

    return {
      'session_id': prefs.getInt('session_id'),
      'student_id': prefs.getInt('student_id'),
      'reg_number': prefs.getString('reg_number'),
      'surname': prefs.getString('surname'),
      'class': prefs.getString('student_class'),
      'assigned_subject': prefs.getString('assigned_subject'),
      'server_ip': prefs.getString('server_ip'),
    };
  }
}
