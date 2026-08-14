import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../services/auth_service.dart';
import '../services/api_config.dart';
import '../theme/app_theme.dart';
import 'login_screen.dart';
import 'student_dashboard_screen.dart';

class ExamScreen extends StatefulWidget {
  final Map<String, dynamic> studentData;
  final int sessionId;

  const ExamScreen({
    super.key,
    required this.studentData,
    required this.sessionId,
  });

  @override
  State<ExamScreen> createState() => _ExamScreenState();
}

class _ExamScreenState extends State<ExamScreen> {
  // Exam Questions & Answers State
  List<Map<String, dynamic>> _questions = [];
  final Map<int, String> _userAnswers = {}; // questionId -> selectedOption ('A', 'B', 'C', 'D')
  int _currentQuestionIndex = 0;

  // Question Fetching & Loading State
  bool _isLoadingQuestions = true;
  String? _questionsErrorMessage;

  // 60-Minute Timer State (3600 seconds)
  Timer? _examTimer;
  int _secondsRemaining = 3600;

  // Submission & Reset State
  bool _isSubmitting = false;
  bool _isExamSubmitted = false;
  Timer? _autoResetTimer;
  int _resetCountdownSeconds = 15;

  // Extracted Student & Session Context
  late String _serverIp;
  late int _studentId;
  late String _assignedSubject;
  late String _studentSurname;
  late String _studentFirstName;
  late String _studentDisplayName;
  late String _regNumber;
  late String _studentClass;
  int _durationMinutes = 45;

  @override
  void initState() {
    super.initState();
    _extractSessionDetails();
    _fetchQuestionsAndRestoreAnswers();
  }

  /// Extracts and sanitizes student information from widget props
  void _extractSessionDetails() {
    final rawIp = (widget.studentData['server_ip'] ?? '127.0.0.1').toString().trim();
    _serverIp = rawIp.isEmpty ? '127.0.0.1' : rawIp;

    final rawStudentId = widget.studentData['id'] ?? widget.studentData['student_id'];
    _studentId = (rawStudentId is int) ? rawStudentId : int.tryParse(rawStudentId?.toString() ?? '0') ?? 0;

    _assignedSubject = (widget.studentData['assigned_subject'] ?? 'Mathematics').toString();
    _studentSurname = (widget.studentData['surname'] ?? '').toString().toUpperCase();
    _studentFirstName = (widget.studentData['first_name'] ?? '').toString();
    _studentDisplayName = _studentFirstName.isNotEmpty ? '$_studentSurname, $_studentFirstName' : _studentSurname;
    _regNumber = (widget.studentData['reg_number'] ?? '').toString();
    _studentClass = (widget.studentData['class'] ?? '').toString();
    final rawDuration = widget.studentData['duration_minutes'] ?? widget.studentData['duration'];
    if (rawDuration != null) {
      _durationMinutes = (rawDuration is num) ? rawDuration.toInt() : int.tryParse(rawDuration.toString()) ?? 45;
    }
  }

  @override
  void dispose() {
    _examTimer?.cancel();
    _autoResetTimer?.cancel();
    super.dispose();
  }

  // ===========================================================================
  // 1. FETCH QUESTIONS ON LOAD
  // ===========================================================================
  Future<void> _fetchQuestionsAndRestoreAnswers() async {
    setState(() {
      _isLoadingQuestions = true;
      _questionsErrorMessage = null;
    });

    try {
      final encodedSubject = Uri.encodeComponent(_assignedSubject.trim());
      final url = ApiConfig.getUri(_serverIp, '/exam/questions/$encodedSubject', queryParameters: {
        if (_studentClass.isNotEmpty) 'class': _studentClass.trim(),
      });

      final response = await http.get(url).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        if (data['success'] == true && data['questions'] != null) {
          final List rawQuestions = data['questions'];
          _questions = rawQuestions.map((q) => Map<String, dynamic>.from(q)).toList();

          if (data['duration_minutes'] != null) {
            _durationMinutes = (data['duration_minutes'] as num).toInt();
          }

          // Restore locally cached answers if session was interrupted
          await _restoreCachedAnswers();

          if (mounted) {
            setState(() {
              _isLoadingQuestions = false;
            });
            _startExamTimer(_durationMinutes);
          }
          return;
        }
      }

      if (mounted) {
        setState(() {
          _isLoadingQuestions = false;
          _questionsErrorMessage = 'Failed to retrieve examination paper from server. (HTTP ${response.statusCode})';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoadingQuestions = false;
          _questionsErrorMessage = 'Network Error: Unable to connect to CBT Server at ${ApiConfig.getBaseUrl(_serverIp)}.\nPlease verify network connection or server status.';
        });
      }
    }
  }

  // ===========================================================================
  // 2. DYNAMIC EXAM DURATION COUNTDOWN TIMER & AUTO SUBMISSION
  // ===========================================================================
  Future<void> _startExamTimer(int durationMinutes) async {
    _examTimer?.cancel();

    try {
      final prefs = await SharedPreferences.getInstance();
      final timerKey = 'cbt_timer_end_session_${widget.sessionId}_student_$_studentId';
      final savedEndTime = prefs.getInt(timerKey);
      final now = DateTime.now().millisecondsSinceEpoch;

      final totalSeconds = durationMinutes * 60;

      if (savedEndTime != null) {
        final remainingMs = savedEndTime - now;
        if (remainingMs <= 0) {
          _secondsRemaining = 0;
          _handleTimeExpiredAutoSubmit();
          return;
        } else {
          _secondsRemaining = (remainingMs / 1000).ceil();
        }
      } else {
        // Set new end timestamp dynamically based on configured duration minutes
        final endTime = now + (totalSeconds * 1000);
        await prefs.setInt(timerKey, endTime);
        _secondsRemaining = totalSeconds;
      }
    } catch (e) {
      debugPrint('Timer persistence error: $e');
    }

    _examTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      setState(() {
        if (_secondsRemaining > 0) {
          _secondsRemaining--;
        } else {
          timer.cancel();
          _handleTimeExpiredAutoSubmit();
        }
      });
    });
  }

  String _formatRemainingTime(int totalSeconds) {
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    final mStr = minutes.toString().padLeft(2, '0');
    final sStr = seconds.toString().padLeft(2, '0');
    return '$mStr:$sStr';
  }

  void _handleTimeExpiredAutoSubmit() {
    if (_isExamSubmitted || _isSubmitting) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.alarm_off_rounded, color: AppTheme.errorRed, size: 30),
            SizedBox(width: 12),
            Text(
              'Time Has Expired!',
              style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.darkCharcoal),
            ),
          ],
        ),
        content: const Text(
          'Your allotted 60 minutes for this examination paper have elapsed.\n\n'
          'Your answers are being automatically finalized and submitted to the server now.',
          style: TextStyle(fontSize: 14, color: AppTheme.darkCharcoal, height: 1.5),
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryOrange,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            ),
            onPressed: () {
              Navigator.of(dialogContext).pop();
              _submitExamToBackend(isAutoSubmitted: true);
            },
            child: const Text('SUBMIT NOW'),
          ),
        ],
      ),
    ).then((_) {
      _submitExamToBackend(isAutoSubmitted: true);
    });
  }

  // ===========================================================================
  // 3. LOCAL CACHING & BACKGROUND AUTO-SAVE
  // ===========================================================================
  Future<void> _restoreCachedAnswers() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cacheKey = 'cbt_answers_session_${widget.sessionId}_student_$_studentId';
      final cachedString = prefs.getString(cacheKey);

      if (cachedString != null && cachedString.isNotEmpty) {
        final Map<String, dynamic> decoded = jsonDecode(cachedString);
        decoded.forEach((key, value) {
          final qId = int.tryParse(key);
          if (qId != null && value is String) {
            _userAnswers[qId] = value;
          }
        });
      }
    } catch (e) {
      debugPrint('Local caching restoration error: $e');
    }
  }

  Future<void> _onOptionSelected(int questionId, String option) async {
    if (_isExamSubmitted || _isSubmitting) return;

    // Instant local state update
    setState(() {
      _userAnswers[questionId] = option;
    });

    // 1. Instant local persistence to SharedPreferences
    try {
      final prefs = await SharedPreferences.getInstance();
      final cacheKey = 'cbt_answers_session_${widget.sessionId}_student_$_studentId';
      final mapToSave = _userAnswers.map((qId, opt) => MapEntry(qId.toString(), opt));
      await prefs.setString(cacheKey, jsonEncode(mapToSave));
    } catch (e) {
      debugPrint('SharedPreferences auto-save failed: $e');
    }

    // 2. Silent background POST request to sync with SQLite server database
    _sendBackgroundAutosave(questionId, option);
  }

  Future<void> _sendBackgroundAutosave(int questionId, String option) async {
    try {
      final url = ApiConfig.getUri(_serverIp, '/exam/autosave');
      await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'student_id': _studentId,
          'question_id': questionId,
          'selected_option': option,
        }),
      ).timeout(const Duration(seconds: 4));
    } catch (e) {
      // Silent failover - answer is safely stored in local device cache
      debugPrint('Background autosave network retry pending: $e');
    }
  }

  // ===========================================================================
  // 4. MANUAL SUBMIT BUTTON & FINAL SUBMISSION ROUTINE
  // ===========================================================================
  void _promptManualSubmitConfirmation() {
    if (_isExamSubmitted || _isSubmitting) return;

    final totalCount = _questions.length;
    final answeredCount = _userAnswers.length;
    final unansweredCount = totalCount - answeredCount;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.primaryOrange.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.assignment_turned_in_rounded, color: AppTheme.primaryOrange, size: 28),
              ),
              const SizedBox(width: 14),
              const Text(
                'Submit Examination?',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: AppTheme.darkCharcoal),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Are you sure you want to submit your test paper? You cannot change your answers after submission.',
                style: TextStyle(fontSize: 14, color: AppTheme.darkCharcoal, height: 1.4),
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.backgroundGrey,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppTheme.borderGrey),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildSummaryStatItem('Answered', answeredCount, Colors.green),
                    Container(height: 36, width: 1, color: AppTheme.borderGrey),
                    _buildSummaryStatItem('Unanswered', unansweredCount, unansweredCount > 0 ? AppTheme.errorRed : AppTheme.textSecondary),
                    Container(height: 36, width: 1, color: AppTheme.borderGrey),
                    _buildSummaryStatItem('Total', totalCount, AppTheme.darkCharcoal),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('CANCEL & REVIEW', style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.bold)),
            ),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryOrange,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () {
                Navigator.of(dialogContext).pop();
                _submitExamToBackend(isAutoSubmitted: false);
              },
              icon: const Icon(Icons.check_circle_rounded, size: 20),
              label: const Text('CONFIRM SUBMISSION', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  Widget _buildSummaryStatItem(String label, int value, Color color) {
    return Column(
      children: [
        Text(
          '$value',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: color),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  Future<void> _submitExamToBackend({required bool isAutoSubmitted}) async {
    if (_isSubmitting || _isExamSubmitted) return;

    _examTimer?.cancel();

    setState(() {
      _isSubmitting = true;
    });

    try {
      final url = ApiConfig.getUri(_serverIp, '/exam/submit');
      final response = await http
          .post(
            url,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'student_id': _studentId,
              'session_id': widget.sessionId,
            }),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        if (data['success'] == true) {
          // Clear local session answers cache from disk
          final prefs = await SharedPreferences.getInstance();
          await prefs.remove('cbt_answers_session_${widget.sessionId}_student_$_studentId');

          if (mounted) {
            setState(() {
              _isSubmitting = false;
              _isExamSubmitted = true;
            });
            _startAutoResetTimer();
          }
          return;
        }
      }

      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
        _showSubmissionFailureDialog('Server returned status code ${response.statusCode}. Please notify the invigilator.');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
        _showSubmissionFailureDialog('Network error submitting paper: ${e.toString().replaceAll("Exception: ", "")}');
      }
    }
  }

  void _showSubmissionFailureDialog(String details) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.error_outline_rounded, color: AppTheme.errorRed, size: 28),
            SizedBox(width: 10),
            Text('Submission Error', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: Text(
          '$details\n\nDon\'t worry, your answers are saved locally on this machine. Click Retry to re-submit.',
          style: const TextStyle(fontSize: 14, height: 1.4),
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryOrange),
            onPressed: () {
              Navigator.of(dialogContext).pop();
              _submitExamToBackend(isAutoSubmitted: false);
            },
            child: const Text('RETRY SUBMISSION'),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // 5. SESSION RESET & RETURN TO CLEAN LOGIN SCREEN FOR NEXT STUDENT
  // ===========================================================================
  void _startAutoResetTimer() {
    _autoResetTimer?.cancel();
    _autoResetTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      setState(() {
        if (_resetCountdownSeconds > 1) {
          _resetCountdownSeconds--;
        } else {
          timer.cancel();
          _returnToPortalHub();
        }
      });
    });
  }

  Future<void> _returnToPortalHub() async {
    _autoResetTimer?.cancel();
    _examTimer?.cancel();

    if (!mounted) return;

    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (context) => StudentDashboardScreen(
            studentData: widget.studentData,
            initialSessionId: widget.sessionId,
          ),
        ),
      );
    }
  }

  Future<void> _resetSessionAndReturnToLogin() async {
    _autoResetTimer?.cancel();
    _examTimer?.cancel();

    // Clear local storage (SharedPreferences) wiping session ID and student token
    await AuthService.logout();

    // Reset component local state
    _userAnswers.clear();
    _questions.clear();

    if (!mounted) return;

    // Navigate completely back to clean LoginScreen
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (context) => const LoginScreen()),
      (route) => false,
    );
  }

  // ===========================================================================
  // MAIN BUILD DISPATCHER
  // ===========================================================================
  @override
  Widget build(BuildContext context) {
    if (_isExamSubmitted) {
      return _buildSubmittedSuccessView();
    }

    return Scaffold(
      backgroundColor: AppTheme.backgroundGrey,
      appBar: _buildTopAppBar(),
      body: Stack(
        children: [
          if (_isLoadingQuestions)
            _buildLoadingStateView()
          else if (_questionsErrorMessage != null)
            _buildErrorStateView()
          else if (_questions.isEmpty)
            _buildEmptyStateView()
          else
            _buildExamDesktopSplitLayout(),

          if (_isSubmitting)
            Container(
              color: Colors.black.withValues(alpha: 0.5),
              child: Center(
                child: Card(
                  elevation: 10,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircularProgressIndicator(color: AppTheme.primaryOrange, strokeWidth: 3.5),
                        const SizedBox(height: 24),
                        const Text(
                          'Submitting Examination...',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.darkCharcoal),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Encrypting responses & locking session on server',
                          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ===========================================================================
  // TOP APP BAR WITH BRANDING & TIMER
  // ===========================================================================
  PreferredSizeWidget _buildTopAppBar() {
    final isTimerLow = _secondsRemaining < 300; // Under 5 minutes remaining

    return AppBar(
      elevation: 2,
      backgroundColor: AppTheme.primaryOrange,
      foregroundColor: Colors.white,
      toolbarHeight: 70,
      automaticallyImplyLeading: false,
      title: Row(
        children: [
          // School Logo Badge
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.15),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ClipOval(
              child: Image.asset(
                'assets/school_logo.jpg',
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => const Icon(
                  Icons.school,
                  size: 26,
                  color: AppTheme.primaryOrange,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),

          // Institution & Subject Title
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Anthony White Bridge Academy',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.2,
                  color: Colors.white,
                ),
              ),
              Row(
                children: [
                  Text(
                    'OFFLINE CBT EXAM PORTAL',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Colors.white.withValues(alpha: 0.85),
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.25),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      _assignedSubject.toUpperCase(),
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      actions: [
        if (!_isLoadingQuestions && _questions.isNotEmpty && !_isExamSubmitted) ...[
          // 60-Minute Countdown Timer Display
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            margin: const EdgeInsets.only(right: 16),
            decoration: BoxDecoration(
              color: isTimerLow ? AppTheme.errorRed : Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: isTimerLow ? AppTheme.errorRed.withValues(alpha: 0.4) : Colors.black.withValues(alpha: 0.1),
                  blurRadius: 8,
                  spreadRadius: isTimerLow ? 2 : 0,
                ),
              ],
            ),
            child: Row(
              children: [
                Icon(
                  isTimerLow ? Icons.warning_amber_rounded : Icons.timer_outlined,
                  color: isTimerLow ? Colors.white : AppTheme.primaryOrange,
                  size: 22,
                ),
                const SizedBox(width: 8),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'TIME REMAINING',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: isTimerLow ? Colors.white.withValues(alpha: 0.9) : AppTheme.textSecondary,
                      ),
                    ),
                    Text(
                      _formatRemainingTime(_secondsRemaining),
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'monospace',
                        color: isTimerLow ? Colors.white : AppTheme.darkCharcoal,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Header Submit Button
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.darkCharcoal,
                foregroundColor: Colors.white,
                elevation: 3,
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: _promptManualSubmitConfirmation,
              icon: const Icon(Icons.send_rounded, size: 18),
              label: const Text('SUBMIT EXAM', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ],
    );
  }

  // ===========================================================================
  // DESKTOP SPLIT-SCREEN LAYOUT (MAIN AREA + SIDEBAR)
  // ===========================================================================
  Widget _buildExamDesktopSplitLayout() {
    final currentQuestion = _questions[_currentQuestionIndex];
    final questionId = currentQuestion['id'] as int;
    final selectedOption = _userAnswers[questionId];

    return Row(
      children: [
        // ---------------------------------------------------------------------
        // LEFT MAIN AREA: QUESTION TEXT & OPTIONS CARDS
        // ---------------------------------------------------------------------
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Indicator Header
                Card(
                  elevation: 0,
                  color: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: const BorderSide(color: AppTheme.borderGrey),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: AppTheme.primaryOrange,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                'Question ${_currentQuestionIndex + 1} of ${_questions.length}',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: selectedOption != null
                                    ? Colors.green.withValues(alpha: 0.12)
                                    : AppTheme.textSecondary.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    selectedOption != null ? Icons.check_circle : Icons.circle_outlined,
                                    size: 14,
                                    color: selectedOption != null ? Colors.green : AppTheme.textSecondary,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    selectedOption != null ? 'ANSWERED ($selectedOption)' : 'UNANSWERED',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: selectedOption != null ? Colors.green : AppTheme.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),

                        Text(
                          'SESSION #${widget.sessionId}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // Question Card & Options Scrollable Container
                Expanded(
                  child: Card(
                    elevation: 4,
                    shadowColor: Colors.black.withValues(alpha: 0.06),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(28.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Question Prompt Text
                          Text(
                            currentQuestion['question_text'] ?? '',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.darkCharcoal,
                              height: 1.5,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 24),
                          const Divider(height: 1),
                          const SizedBox(height: 24),

                          // Selectable Options List (A, B, C, D)
                          Expanded(
                            child: ListView(
                              children: [
                                _buildOptionCard(
                                  questionId: questionId,
                                  letter: 'A',
                                  text: currentQuestion['option_a'] ?? '',
                                  isSelected: selectedOption == 'A',
                                ),
                                const SizedBox(height: 14),
                                _buildOptionCard(
                                  questionId: questionId,
                                  letter: 'B',
                                  text: currentQuestion['option_b'] ?? '',
                                  isSelected: selectedOption == 'B',
                                ),
                                const SizedBox(height: 14),
                                _buildOptionCard(
                                  questionId: questionId,
                                  letter: 'C',
                                  text: currentQuestion['option_c'] ?? '',
                                  isSelected: selectedOption == 'C',
                                ),
                                const SizedBox(height: 14),
                                _buildOptionCard(
                                  questionId: questionId,
                                  letter: 'D',
                                  text: currentQuestion['option_d'] ?? '',
                                  isSelected: selectedOption == 'D',
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // Bottom Navigation Bar (Previous, Clear, Next)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
                        side: const BorderSide(color: AppTheme.borderGrey),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _currentQuestionIndex > 0
                          ? () => setState(() => _currentQuestionIndex--)
                          : null,
                      icon: const Icon(Icons.arrow_back_rounded, size: 18),
                      label: const Text('PREVIOUS QUESTION', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),

                    if (selectedOption != null)
                      TextButton.icon(
                        style: TextButton.styleFrom(foregroundColor: AppTheme.textSecondary),
                        onPressed: () {
                          setState(() {
                            _userAnswers.remove(questionId);
                          });
                        },
                        icon: const Icon(Icons.clear_rounded, size: 16),
                        label: const Text('Clear Selection', style: TextStyle(fontSize: 13)),
                      ),

                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryOrange,
                        padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () {
                        if (_currentQuestionIndex < _questions.length - 1) {
                          setState(() => _currentQuestionIndex++);
                        } else {
                          _promptManualSubmitConfirmation();
                        }
                      },
                      label: Text(
                        _currentQuestionIndex < _questions.length - 1 ? 'NEXT QUESTION' : 'FINISH & SUBMIT',
                        style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.5),
                      ),
                      icon: Icon(
                        _currentQuestionIndex < _questions.length - 1 ? Icons.arrow_forward_rounded : Icons.check_circle_rounded,
                        size: 18,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),

        // ---------------------------------------------------------------------
        // RIGHT SIDEBAR AREA: QUICK-JUMP QUESTION GRID & PROFILE
        // ---------------------------------------------------------------------
        Container(
          width: 320,
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(left: BorderSide(color: AppTheme.borderGrey)),
          ),
          child: Column(
            children: [
              // Student Header Profile Summary
              Container(
                padding: const EdgeInsets.all(20),
                color: AppTheme.backgroundGrey,
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryOrange.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.person, color: AppTheme.primaryOrange, size: 24),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _studentDisplayName,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.darkCharcoal,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            'Reg: $_regNumber  •  Class: $_studentClass',
                            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const Divider(height: 1),

              // Question Navigator Progress Tracker
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Question Grid Navigator',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.darkCharcoal,
                          ),
                        ),
                        Text(
                          '${_userAnswers.length}/${_questions.length}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.primaryOrange,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: _questions.isEmpty ? 0 : _userAnswers.length / _questions.length,
                        backgroundColor: AppTheme.backgroundGrey,
                        color: AppTheme.primaryOrange,
                        minHeight: 8,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Grid Legend
                    Row(
                      children: [
                        _buildLegendItem(color: AppTheme.primaryOrange, label: 'Answered'),
                        const SizedBox(width: 12),
                        _buildLegendItem(color: const Color(0xFFE2E8F0), label: 'Unanswered', textColor: AppTheme.textSecondary),
                      ],
                    ),
                  ],
                ),
              ),

              const Divider(height: 1),

              // Quick Jump Grid (Numbered 1 to 50)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: GridView.builder(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 5,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 1.0,
                    ),
                    itemCount: _questions.length,
                    itemBuilder: (context, index) {
                      final q = _questions[index];
                      final qId = q['id'] as int;
                      final isAnswered = _userAnswers.containsKey(qId);
                      final isCurrent = index == _currentQuestionIndex;

                      return InkWell(
                        onTap: () {
                          setState(() {
                            _currentQuestionIndex = index;
                          });
                        },
                        borderRadius: BorderRadius.circular(10),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          decoration: BoxDecoration(
                            color: isAnswered
                                ? AppTheme.primaryOrange
                                : (isCurrent ? AppTheme.primaryOrange.withValues(alpha: 0.12) : const Color(0xFFF1F5F9)),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: isCurrent
                                  ? AppTheme.primaryOrange
                                  : (isAnswered ? AppTheme.primaryOrange : const Color(0xFFCBD5E1)),
                              width: isCurrent ? 2.5 : 1.0,
                            ),
                            boxShadow: isCurrent
                                ? [
                                    BoxShadow(
                                      color: AppTheme.primaryOrange.withValues(alpha: 0.3),
                                      blurRadius: 6,
                                    )
                                  ]
                                : null,
                          ),
                          child: Center(
                            child: Text(
                              '${index + 1}',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: isCurrent || isAnswered ? FontWeight.bold : FontWeight.w600,
                                color: isAnswered
                                    ? Colors.white
                                    : (isCurrent ? AppTheme.primaryOrange : AppTheme.darkCharcoal),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),

              // Bottom Actions in Sidebar
              Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primaryOrange,
                      side: const BorderSide(color: AppTheme.primaryOrange, width: 1.5),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    onPressed: _promptManualSubmitConfirmation,
                    icon: const Icon(Icons.check_circle_outline, size: 18),
                    label: const Text('SUBMIT PAPER', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ===========================================================================
  // SELECTABLE OPTION CARD (A, B, C, D)
  // ===========================================================================
  Widget _buildOptionCard({
    required int questionId,
    required String letter,
    required String text,
    required bool isSelected,
  }) {
    return InkWell(
      onTap: () => _onOptionSelected(questionId, letter),
      borderRadius: BorderRadius.circular(14),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryOrange.withValues(alpha: 0.08) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? AppTheme.primaryOrange : AppTheme.borderGrey,
            width: isSelected ? 2.0 : 1.0,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: AppTheme.primaryOrange.withValues(alpha: 0.12),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  )
                ]
              : null,
        ),
        child: Row(
          children: [
            // Option Indicator Circle
            AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: isSelected ? AppTheme.primaryOrange : const Color(0xFFF1F5F9),
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? AppTheme.primaryOrange : const Color(0xFFCBD5E1),
                ),
              ),
              child: Center(
                child: Text(
                  letter,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: isSelected ? Colors.white : AppTheme.darkCharcoal,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 16),

            // Option Content Text
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                  color: isSelected ? AppTheme.darkCharcoal : const Color(0xFF334155),
                  height: 1.4,
                ),
              ),
            ),

            if (isSelected)
              const Icon(Icons.check_circle_rounded, color: AppTheme.primaryOrange, size: 22),
          ],
        ),
      ),
    );
  }

  Widget _buildLegendItem({required Color color, required String label, Color? textColor}) {
    return Row(
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: textColor ?? AppTheme.darkCharcoal),
        ),
      ],
    );
  }

  // ===========================================================================
  // LOADING / ERROR / EMPTY / SUBMITTED SUCCESS VIEWS
  // ===========================================================================
  Widget _buildLoadingStateView() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: AppTheme.primaryOrange, strokeWidth: 3.5),
          const SizedBox(height: 20),
          Text(
            'Retrieving $_assignedSubject Paper...',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.darkCharcoal),
          ),
          const SizedBox(height: 6),
          const Text(
            'Connecting to local CBT server database',
            style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorStateView() {
    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 480),
        padding: const EdgeInsets.all(24),
        child: Card(
          elevation: 4,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.wifi_off_rounded, size: 54, color: AppTheme.errorRed),
                const SizedBox(height: 16),
                const Text(
                  'Examination Load Error',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.darkCharcoal),
                ),
                const SizedBox(height: 12),
                Text(
                  _questionsErrorMessage ?? 'Unable to connect to the CBT Server.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.4),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryOrange,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                  ),
                  onPressed: _fetchQuestionsAndRestoreAnswers,
                  icon: const Icon(Icons.refresh_rounded, size: 20),
                  label: const Text('RETRY CONNECTION'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyStateView() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.menu_book_rounded, size: 54, color: AppTheme.textSecondary),
          const SizedBox(height: 16),
          Text(
            'No Questions Found for $_assignedSubject',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.darkCharcoal),
          ),
          const SizedBox(height: 8),
          const Text(
            'Please ask the exam invigilator to verify question upload for this subject.',
            style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }

  /// Clean, secure completion view showing submission confirmation WITHOUT score
  Widget _buildSubmittedSuccessView() {
    return Scaffold(
      backgroundColor: AppTheme.backgroundGrey,
      body: Center(
        child: SingleChildScrollView(
          child: Container(
            constraints: const BoxConstraints(maxWidth: 620),
            padding: const EdgeInsets.all(24),
            child: Card(
              elevation: 8,
              shadowColor: Colors.black.withValues(alpha: 0.1),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Green Checkmark Header Icon
                    Container(
                      width: 90,
                      height: 90,
                      decoration: BoxDecoration(
                        color: Colors.green.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check_circle_rounded, size: 58, color: Colors.green),
                    ),
                    const SizedBox(height: 24),

                    // Success Headline
                    const Text(
                      'Exam Submitted Successfully!',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.darkCharcoal,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Child-friendly instruction notice (STRICTLY NO SCORE SHOWN)
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryOrange.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppTheme.primaryOrange.withValues(alpha: 0.25)),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.front_hand_rounded, color: AppTheme.primaryOrange, size: 28),
                          SizedBox(width: 14),
                          Expanded(
                            child: Text(
                              'Thank you, Anthony White Bridge Academy student. Please raise your hand and wait quietly for your supervisor.',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.darkCharcoal,
                                height: 1.45,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 28),

                    // Submission Session Summary
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppTheme.backgroundGrey,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppTheme.borderGrey),
                      ),
                      child: Column(
                        children: [
                          _buildSubmittedDetailRow('Student Name:', _studentDisplayName),
                          const Divider(height: 16),
                          _buildSubmittedDetailRow('Registration Number:', _regNumber),
                          const Divider(height: 16),
                          _buildSubmittedDetailRow('Class:', _studentClass),
                          const Divider(height: 16),
                          _buildSubmittedDetailRow('Subject Paper:', _assignedSubject.toUpperCase()),
                          const Divider(height: 16),
                          _buildSubmittedDetailRow('Questions Answered:', '${_userAnswers.length} / ${_questions.length}'),
                          const Divider(height: 16),
                          _buildSubmittedDetailRow('Session Status:', 'LOCKED & RECORDED'),
                        ],
                      ),
                    ),

                    const SizedBox(height: 24),

                    // Auto-Reset Countdown Banner
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.timer_outlined, size: 16, color: AppTheme.textSecondary),
                        const SizedBox(width: 6),
                        Text(
                          'Returning to Exam Portal Hub in $_resetCountdownSeconds seconds...',
                          style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary, fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),

                    const SizedBox(height: 20),

                    // Action Buttons (Return to Portal Hub / Log Out)
                    Row(
                      children: [
                        Expanded(
                          child: SizedBox(
                            height: 52,
                            child: ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.primaryOrange,
                                foregroundColor: Colors.white,
                                elevation: 3,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              onPressed: _returnToPortalHub,
                              icon: const Icon(Icons.dashboard_rounded, size: 20),
                              label: const Text(
                                'RETURN TO EXAM PORTAL HUB',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, letterSpacing: 0.5),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        SizedBox(
                          height: 52,
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppTheme.textSecondary,
                              side: const BorderSide(color: AppTheme.borderGrey),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: _resetSessionAndReturnToLogin,
                            icon: const Icon(Icons.logout_rounded, size: 18),
                            label: const Text(
                              'LOG OUT',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSubmittedDetailRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
        ),
        Text(
          value,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.darkCharcoal),
        ),
      ],
    );
  }
}
