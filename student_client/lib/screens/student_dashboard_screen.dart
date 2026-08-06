import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import 'exam_screen.dart';
import 'login_screen.dart';

class StudentDashboardScreen extends StatefulWidget {
  final Map<String, dynamic> studentData;
  final int initialSessionId;

  const StudentDashboardScreen({
    super.key,
    required this.studentData,
    required this.initialSessionId,
  });

  @override
  State<StudentDashboardScreen> createState() => _StudentDashboardScreenState();
}

class _StudentDashboardScreenState extends State<StudentDashboardScreen> {
  late Map<String, dynamic> _currentStudentData;
  late String _serverIp;
  late int _studentId;

  bool _isLoading = true;
  List<Map<String, dynamic>> _subjects = [];

  @override
  void initState() {
    super.initState();
    _currentStudentData = Map<String, dynamic>.from(widget.studentData);
    _extractStudentInfo();
    _loadDashboardData();
  }

  void _extractStudentInfo() {
    final rawIp = (_currentStudentData['server_ip'] ?? '127.0.0.1').toString().trim();
    _serverIp = rawIp.isEmpty ? '127.0.0.1' : rawIp;

    final rawStudentId = _currentStudentData['id'] ?? _currentStudentData['student_id'];
    _studentId = (rawStudentId is int) ? rawStudentId : int.tryParse(rawStudentId?.toString() ?? '0') ?? 0;
  }

  /// Fetches latest profile data and subject statuses from backend
  Future<void> _loadDashboardData() async {
    setState(() {
      _isLoading = true;
    });

    final dashboardResult = await AuthService.fetchStudentDashboard(
      studentId: _studentId,
      serverIp: _serverIp,
    );

    if (!mounted) return;

    if (dashboardResult != null && dashboardResult['success'] == true) {
      final rawStudent = dashboardResult['student'] as Map<String, dynamic>?;
      if (rawStudent != null) {
        _currentStudentData.addAll(rawStudent);
      }

      final rawSubjects = dashboardResult['subjects'] as List?;
      if (rawSubjects != null) {
        _subjects = rawSubjects.map((s) => Map<String, dynamic>.from(s)).toList();
      }

      setState(() {
        _isLoading = false;
      });
    } else {
      // Fallback local subjects if network check is delayed
      _subjects = _getFallbackSubjects();
      setState(() {
        _isLoading = false;
      });
    }
  }

  List<Map<String, dynamic>> _getFallbackSubjects() {
    final assigned = (_currentStudentData['assigned_subject'] ?? 'Mathematics').toString();
    return [
      {
        'name': assigned.isNotEmpty ? assigned : 'Mathematics',
        'code': 'MTH101',
        'schedule': 'Now Available',
        'status': 'available',
        'message': 'Ready to Start',
      },
      {
        'name': 'English Language',
        'code': 'ENG101',
        'schedule': 'Now Available',
        'status': 'available',
        'message': 'Ready to Start',
      },
      {
        'name': 'Computer Studies',
        'code': 'CSC101',
        'schedule': 'Now Available',
        'status': 'available',
        'message': 'Ready to Start',
      },
      {
        'name': 'Further Mathematics',
        'code': 'MTH102',
        'schedule': 'Scheduled for 2:00 PM - 3:00 PM',
        'status': 'not_scheduled',
        'message': 'Scheduled for 2:00 PM - 3:00 PM. Sorry, you are not scheduled for this exam yet.',
      },
    ];
  }

  /// Starts exam session for chosen subject paper
  Future<void> _startSubjectExam(Map<String, dynamic> subjectItem) async {
    final subjectName = subjectItem['name'].toString();

    // Show loading modal
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: CircularProgressIndicator(color: AppTheme.primaryOrange),
      ),
    );

    final sessionId = await AuthService.startSubjectSession(
      studentId: _studentId,
      subject: subjectName,
      serverIp: _serverIp,
    ) ?? widget.initialSessionId;

    if (!mounted) return;
    Navigator.of(context).pop(); // Close loading modal

    // Prepare updated studentData with current selected subject paper
    final studentDataForExam = Map<String, dynamic>.from(_currentStudentData);
    studentDataForExam['assigned_subject'] = subjectName;
    studentDataForExam['server_ip'] = _serverIp;

    // Navigate to Exam Screen and await return
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ExamScreen(
          studentData: studentDataForExam,
          sessionId: sessionId,
        ),
      ),
    );

    // Upon return from ExamScreen, refresh subject statuses
    _loadDashboardData();
  }

  /// Confirms and executes Log Out action
  void _confirmLogout() {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Row(
          children: [
            Icon(Icons.logout_rounded, color: AppTheme.primaryOrange),
            SizedBox(width: 10),
            Text('Log Out Confirmation', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
        content: const Text(
          'Are you sure you want to log out of your student session?',
          style: TextStyle(fontSize: 14, color: AppTheme.darkCharcoal),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('CANCEL', style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.bold)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryOrange),
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              await AuthService.logout();
              if (!mounted) return;
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (context) => const LoginScreen()),
              );
            },
            child: const Text('LOG OUT'),
          ),
        ],
      ),
    );
  }

  IconData _getSubjectIcon(String name) {
    final lower = name.toLowerCase();
    if (lower.contains('math')) return Icons.calculate_rounded;
    if (lower.contains('eng')) return Icons.menu_book_rounded;
    if (lower.contains('comp') || lower.contains('tech')) return Icons.computer_rounded;
    if (lower.contains('bio') || lower.contains('chem') || lower.contains('phys')) return Icons.science_rounded;
    if (lower.contains('civic') || lower.contains('gov')) return Icons.gavel_rounded;
    return Icons.school_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final surname = (_currentStudentData['surname'] ?? '').toString().toUpperCase();
    final regNumber = (_currentStudentData['reg_number'] ?? '').toString();
    final studentClass = (_currentStudentData['class'] ?? 'SS3').toString();

    return Scaffold(
      backgroundColor: AppTheme.backgroundGrey,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.bottomLeft,
            end: Alignment.topRight,
            colors: [
              Color(0xFF1A0B2E),
              Color(0xFF311042),
              Color(0xFF6B21A8),
              Color(0xFFD97706),
              Color(0xFFF96302),
            ],
            stops: [0.0, 0.25, 0.52, 0.82, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Top Bar Header
              _buildTopHeader(surname, regNumber, studentClass),

              // Main Body Content
              Expanded(
                child: _isLoading
                    ? const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadDashboardData,
                        color: AppTheme.primaryOrange,
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
                          physics: const AlwaysScrollableScrollPhysics(),
                          child: Center(
                            child: Container(
                              constraints: const BoxConstraints(maxWidth: 1040),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Welcome Banner & Profile Card
                                  _buildProfileHeaderCard(surname, regNumber, studentClass),

                                  const SizedBox(height: 28),

                                  // Dashboard Section Title
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      const Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'Assigned Exam Papers',
                                            style: TextStyle(
                                              fontSize: 22,
                                              fontWeight: FontWeight.bold,
                                              color: Colors.white,
                                              letterSpacing: -0.4,
                                            ),
                                          ),
                                          SizedBox(height: 4),
                                          Text(
                                            'Select an available paper below to launch your CBT session',
                                            style: TextStyle(
                                              fontSize: 13,
                                              color: Colors.white70,
                                            ),
                                          ),
                                        ],
                                      ),
                                      IconButton(
                                        onPressed: _loadDashboardData,
                                        icon: const Icon(Icons.refresh_rounded, color: Colors.white),
                                        tooltip: 'Refresh Subject Statuses',
                                      ),
                                    ],
                                  ),

                                  const SizedBox(height: 20),

                                  // Subjects Grid / Cards
                                  _buildSubjectsGrid(),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Top Bar with School Name Branding & Log Out
  Widget _buildTopHeader(String surname, String regNumber, String studentClass) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      color: Colors.black.withValues(alpha: 0.25),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                ),
                child: ClipOval(
                  child: Image.asset(
                    'assets/school_logo.jpg',
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => const Icon(
                      Icons.school_rounded,
                      size: 22,
                      color: AppTheme.primaryOrange,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'ANTHONY WHITEBRIDGE ACADEMY',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: 0.8,
                    ),
                  ),
                  Text(
                    'CBT Examination Portal',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Log Out Button
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white.withValues(alpha: 0.2),
              foregroundColor: Colors.white,
              elevation: 0,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
                side: BorderSide(color: Colors.white.withValues(alpha: 0.3)),
              ),
            ),
            onPressed: _confirmLogout,
            icon: const Icon(Icons.logout_rounded, size: 16),
            label: const Text(
              'LOG OUT',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5),
            ),
          ),
        ],
      ),
    );
  }

  /// Student Profile Header Card
  Widget _buildProfileHeaderCard(String surname, String regNumber, String studentClass) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.2),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          // Student Avatar Icon
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppTheme.primaryOrange, Color(0xFFFF8A3D)],
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppTheme.primaryOrange.withValues(alpha: 0.3),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Center(
              child: Text(
                surname.isNotEmpty ? surname[0] : 'S',
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
          ),

          const SizedBox(width: 20),

          // Student Details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Welcome, $surname',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.darkCharcoal,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 12,
                  runSpacing: 6,
                  children: [
                    _buildProfileBadge(Icons.badge_outlined, 'Reg No: $regNumber'),
                    _buildProfileBadge(Icons.class_outlined, 'Class: $studentClass'),
                    _buildProfileBadge(Icons.verified_user_outlined, 'Status: Verified Student'),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProfileBadge(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.backgroundGrey,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.borderGrey),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: AppTheme.textSecondary),
          const SizedBox(width: 6),
          Text(
            text,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppTheme.darkCharcoal,
            ),
          ),
        ],
      ),
    );
  }

  /// Subjects Grid Builder
  Widget _buildSubjectsGrid() {
    if (_subjects.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Center(
          child: Text(
            'No examination papers assigned yet. Please consult your supervisor.',
            style: TextStyle(fontSize: 15, color: AppTheme.textSecondary),
          ),
        ),
      );
    }

    final screenWidth = MediaQuery.of(context).size.width;
    final crossAxisCount = screenWidth > 900 ? 2 : 1;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        mainAxisExtent: 185,
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
      ),
      itemCount: _subjects.length,
      itemBuilder: (context, index) {
        final item = _subjects[index];
        return _buildSubjectCard(item);
      },
    );
  }

  /// Individual Subject Card with 3 Explicit Status States
  Widget _buildSubjectCard(Map<String, dynamic> item) {
    final name = (item['name'] ?? 'Subject').toString();
    final code = (item['code'] ?? 'SUB101').toString();
    final status = (item['status'] ?? 'available').toString(); // 'available', 'not_scheduled', 'completed'
    final message = (item['message'] ?? '').toString();

    final isAvailable = status == 'available';
    final isCompleted = status == 'completed';
    final isNotScheduled = status == 'not_scheduled';

    Color badgeBgColor;
    Color badgeTextColor;
    String statusLabel;
    IconData statusIcon;

    if (isCompleted) {
      badgeBgColor = Colors.green.withValues(alpha: 0.12);
      badgeTextColor = Colors.green.shade800;
      statusLabel = 'COMPLETED';
      statusIcon = Icons.check_circle_rounded;
    } else if (isNotScheduled) {
      badgeBgColor = Colors.amber.withValues(alpha: 0.15);
      badgeTextColor = Colors.amber.shade900;
      statusLabel = 'NOT SCHEDULED YET';
      statusIcon = Icons.schedule_rounded;
    } else {
      badgeBgColor = AppTheme.primaryOrange.withValues(alpha: 0.12);
      badgeTextColor = AppTheme.primaryOrange;
      statusLabel = 'AVAILABLE';
      statusIcon = Icons.play_circle_fill_rounded;
    }

    return Card(
      elevation: 6,
      shadowColor: Colors.black.withValues(alpha: 0.12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      clipBehavior: Clip.antiAlias,
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Subject Title & Status Pill Badge
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryOrange.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(_getSubjectIcon(name), color: AppTheme.primaryOrange, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.darkCharcoal,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        code,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: badgeBgColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(statusIcon, size: 13, color: badgeTextColor),
                      const SizedBox(width: 4),
                      Text(
                        statusLabel,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: badgeTextColor,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            // Middle Info Notice Message
            if (isNotScheduled)
              Container(
                margin: const EdgeInsets.symmetric(vertical: 4),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.withValues(alpha: 0.25)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded, size: 14, color: Colors.amber),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        message,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: AppTheme.darkCharcoal,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              )
            else if (isCompleted)
              Container(
                margin: const EdgeInsets.symmetric(vertical: 4),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.withValues(alpha: 0.2)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.check_circle_outline_rounded, size: 14, color: Colors.green),
                    SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Exam paper completed and submitted to server.',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Colors.green),
                      ),
                    ),
                  ],
                ),
              )
            else
              const Text(
                'Status: Ready to launch examination paper.',
                style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
              ),

            // Bottom Action Trigger
            SizedBox(
              width: double.infinity,
              height: 42,
              child: isAvailable
                  ? ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryOrange,
                        foregroundColor: Colors.white,
                        elevation: 2,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () => _startSubjectExam(item),
                      icon: const Icon(Icons.play_arrow_rounded, size: 18),
                      label: const Text(
                        'START EXAM',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                      ),
                    )
                  : isCompleted
                      ? OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.green,
                            side: const BorderSide(color: Colors.green),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          onPressed: null, // Disabled
                          icon: const Icon(Icons.check_circle_rounded, size: 18),
                          label: const Text(
                            '✅ EXAM COMPLETED',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        )
                      : OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppTheme.textSecondary,
                            side: const BorderSide(color: AppTheme.borderGrey),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          onPressed: null, // Disabled
                          icon: const Icon(Icons.lock_clock_rounded, size: 18),
                          label: const Text(
                            'NOT SCHEDULED YET',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
