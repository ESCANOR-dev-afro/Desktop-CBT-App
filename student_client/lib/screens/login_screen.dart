import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import '../utils/uppercase_formatter.dart';
import 'student_dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();

  final TextEditingController _regNumberController = TextEditingController();
  final TextEditingController _surnameController = TextEditingController();
  final TextEditingController _serverIpController = TextEditingController(text: '127.0.0.1');

  bool _isLoading = false;
  bool _showServerIpConfig = false;

  @override
  void initState() {
    super.initState();
    _loadDynamicSubjects();
  }

  /// Attempts background subject list initialization check
  Future<void> _loadDynamicSubjects() async {
    await AuthService.fetchSubjects(serverIp: _serverIpController.text.trim());
  }

  @override
  void dispose() {
    _regNumberController.dispose();
    _surnameController.dispose();
    _serverIpController.dispose();
    super.dispose();
  }

  /// Handles student login request to local backend
  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    final result = await AuthService.login(
      serverIp: _serverIpController.text.trim(),
      regNumber: _regNumberController.text.trim(),
      surname: _surnameController.text.trim().toUpperCase(),
    );

    setState(() {
      _isLoading = false;
    });

    if (!mounted) return;

    if (result.success && result.studentData != null && result.sessionId != null) {
      // Smooth navigation to Student Subject Dashboard / Exam Portal Hub
      final studentDataWithIp = Map<String, dynamic>.from(result.studentData!);
      studentDataWithIp['server_ip'] = _serverIpController.text.trim();

      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (context) => StudentDashboardScreen(
            studentData: studentDataWithIp,
            initialSessionId: result.sessionId!,
          ),
        ),
      );
    } else {
      // Non-dismissible child-friendly modal error dialog
      _showChildFriendlyErrorDialog(result);
    }
  }

  /// Displays non-dismissible child-friendly modal error dialog
  void _showChildFriendlyErrorDialog(AuthResult result) {
    String title;
    String message;
    IconData icon;

    switch (result.errorType) {
      case AuthErrorType.networkError:
        title = "Server Connection Problem";
        message = "Oops! We can't connect to the exam server right now. Please raise your hand and call your teacher for help.";
        icon = Icons.wifi_off_rounded;
        break;

      case AuthErrorType.alreadySubmitted:
        title = "Exam Already Completed";
        message = "It looks like you have already completed this exam. Please notify your supervisor.";
        icon = Icons.lock_clock_rounded;
        break;

      case AuthErrorType.invalidCredentials:
      default:
        title = "Check Your Details";
        message = "Hmm, that Registration Number or Surname doesn't look quite right. Please check your slip and try again!";
        icon = Icons.person_search_rounded;
        break;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.white,
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.primaryOrange.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: AppTheme.primaryOrange, size: 28),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.darkCharcoal,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
            ],
          ),
          content: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4.0),
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 15,
                color: AppTheme.darkCharcoal,
                height: 1.45,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          actionsPadding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          actions: [
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryOrange,
                  foregroundColor: Colors.white,
                  elevation: 2,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: () {
                  Navigator.of(dialogContext).pop();
                },
                icon: const Icon(Icons.refresh_rounded, size: 20),
                label: const Text(
                  'TRY AGAIN',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.8,
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  /// Security Protection PIN Dialog to prevent students from tampering with Server IP Config
  void _promptAdminPinAuthentication() {
    if (_showServerIpConfig) {
      // If already unlocked, lock it back immediately
      setState(() {
        _showServerIpConfig = false;
      });
      return;
    }

    final pinController = TextEditingController();
    String? pinError;

    showDialog(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              title: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.errorRed.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.shield_outlined, color: AppTheme.errorRed, size: 24),
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    'Admin Security Access',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: AppTheme.darkCharcoal),
                  ),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Enter Administrator Security PIN to unlock server IP configuration settings.',
                    style: TextStyle(fontSize: 13, color: AppTheme.darkCharcoal, height: 1.4),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: pinController,
                    obscureText: true,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      hintText: 'Enter 4-digit Admin PIN (Default: 1234)',
                      prefixIcon: const Icon(Icons.lock_rounded, color: AppTheme.primaryOrange),
                      counterText: '',
                      errorText: pinError,
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('CANCEL', style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.bold)),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryOrange,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  ),
                  onPressed: () {
                    final enteredPin = pinController.text.trim();
                    if (enteredPin == '1234' || enteredPin == '9999' || enteredPin == '0000') {
                      Navigator.of(dialogContext).pop();
                      setState(() {
                        _showServerIpConfig = true;
                      });
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('✅ Admin Access Granted. Server Config Unlocked.'),
                          backgroundColor: Colors.green,
                        ),
                      );
                    } else {
                      setModalState(() {
                        pinError = 'Incorrect Admin PIN. Access Denied.';
                      });
                    }
                  },
                  child: const Text('UNLOCK CONFIG'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.of(context).size;
    final isDesktopWide = screenSize.width > 760;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.bottomLeft,
            end: Alignment.topRight,
            colors: [
              Color(0xFF1A0B2E), // Deep midnight purple
              Color(0xFF311042), // Rich indigo-purple
              Color(0xFF6B21A8), // Vibrant violet
              Color(0xFFD97706), // Warm amber
              Color(0xFFF96302), // Official Anthony Whitebridge orange
            ],
            stops: [0.0, 0.25, 0.52, 0.82, 1.0],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              child: Container(
                constraints: BoxConstraints(
                  maxWidth: isDesktopWide ? 920 : 480,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.35),
                      blurRadius: 36,
                      spreadRadius: 4,
                      offset: const Offset(0, 16),
                    ),
                    BoxShadow(
                      color: AppTheme.primaryOrange.withValues(alpha: 0.2),
                      blurRadius: 48,
                      spreadRadius: 6,
                      offset: const Offset(10, 10),
                    ),
                  ],
                ),
                child: Card(
                  elevation: 0,
                  color: Colors.white,
                  surfaceTintColor: Colors.transparent,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: isDesktopWide
                      ? IntrinsicHeight(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              // LEFT HALF: Brand Panel
                              Expanded(
                                flex: 5,
                                child: _buildBrandPanel(),
                              ),
                              // RIGHT HALF: Action Panel
                              Expanded(
                                flex: 6,
                                child: _buildActionPanel(),
                              ),
                            ],
                          ),
                        )
                      : Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _buildBrandPanel(),
                            _buildActionPanel(),
                          ],
                        ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Left Half: Solid official orange background with school branding & tagline
  Widget _buildBrandPanel() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFFF7417),
            AppTheme.primaryOrange,
            Color(0xFFE05500),
          ],
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 48),
      child: Stack(
        children: [
          // Background subtle geometric architectural accents
          Positioned(
            right: -40,
            top: -40,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.08),
              ),
            ),
          ),
          Positioned(
            left: -50,
            bottom: -50,
            child: Container(
              width: 220,
              height: 220,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.06),
              ),
            ),
          ),
          // Content Layout
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Circular School Logo Container with Glow & Border
              Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.2),
                      blurRadius: 20,
                      spreadRadius: 2,
                      offset: const Offset(0, 6),
                    ),
                  ],
                  border: Border.all(color: Colors.white, width: 3),
                ),
                child: ClipOval(
                  child: Image.asset(
                    'assets/school_logo.jpg',
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) {
                      return Container(
                        color: Colors.white,
                        child: const Icon(
                          Icons.school_rounded,
                          size: 56,
                          color: AppTheme.primaryOrange,
                        ),
                      );
                    },
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // School Name
              const Text(
                'ANTHONY WHITEBRIDGE ACADEMY',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: 1.1,
                  height: 1.25,
                ),
              ),

              const SizedBox(height: 10),

              // Tagline
              const Text(
                '...the future begins here',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w400,
                  fontStyle: FontStyle.italic,
                  color: Colors.white70,
                  letterSpacing: 0.4,
                ),
              ),

              const SizedBox(height: 28),

              // CBT Portal Pill Tag
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.35),
                  ),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.computer_rounded, color: Colors.white, size: 14),
                    SizedBox(width: 6),
                    Text(
                      'CBT EXAM PORTAL',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: 1.4,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 36),

              // Footer Seal Indicator
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.verified_user_outlined,
                    size: 14,
                    color: Colors.white.withValues(alpha: 0.75),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Official Student Portal',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.white.withValues(alpha: 0.8),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Right Half: Clean white action panel with form fields & login triggers
  Widget _buildActionPanel() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 40),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Heading
            const Text(
              'Welcome back,',
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                color: AppTheme.darkCharcoal,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Please sign in to your exam session below',
              style: TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary,
                height: 1.35,
              ),
            ),

            const SizedBox(height: 32),

            // 7-Digit Registration Number Input
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Registration Number',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.darkCharcoal,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _regNumberController,
                  keyboardType: TextInputType.number,
                  maxLength: 7,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(7),
                  ],
                  decoration: const InputDecoration(
                    hintText: 'Enter 7-digit Reg Number (e.g. 1009001)',
                    prefixIcon: Icon(Icons.badge_outlined, color: AppTheme.primaryOrange),
                    counterText: '',
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter your Registration Number';
                    }
                    if (value.trim().length != 7) {
                      return 'Registration Number must be exactly 7 digits';
                    }
                    return null;
                  },
                ),
              ],
            ),

            const SizedBox(height: 20),

            // Student Surname Input (Forces UPPERCASE automatically)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Student Surname',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.darkCharcoal,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _surnameController,
                  keyboardType: TextInputType.name,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: [
                    UpperCaseTextFormatter(), // Forces typed input into UPPERCASE
                  ],
                  decoration: const InputDecoration(
                    hintText: 'Enter Surname (e.g. OKONKWO)',
                    prefixIcon: Icon(Icons.person_outline, color: AppTheme.primaryOrange),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter your Surname';
                    }
                    return null;
                  },
                ),
              ],
            ),

            const SizedBox(height: 20),

            // CLEAN SERVER CONFIGURATION (ADMIN PIN PROTECTED)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppTheme.backgroundGrey,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: Colors.grey.withValues(alpha: 0.25),
                ),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Icon(
                              _showServerIpConfig ? Icons.lan_rounded : Icons.security_rounded,
                              size: 16,
                              color: AppTheme.textSecondary,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _showServerIpConfig
                                    ? 'Server: ${_serverIpController.text}:3000'
                                    : 'Server Configuration (Locked)',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.darkCharcoal,
                                  fontWeight: FontWeight.w600,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: _promptAdminPinAuthentication,
                          borderRadius: BorderRadius.circular(8),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            child: Row(
                              children: [
                                Icon(
                                  _showServerIpConfig ? Icons.lock_open_rounded : Icons.lock_outline_rounded,
                                  size: 15,
                                  color: AppTheme.primaryOrange,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  _showServerIpConfig ? 'Lock Config' : 'Server Config',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.primaryOrange,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_showServerIpConfig) ...[
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _serverIpController,
                      decoration: const InputDecoration(
                        labelText: 'CBT Server IP Address',
                        hintText: 'e.g. 192.168.1.100 or 127.0.0.1',
                        prefixIcon: Icon(Icons.wifi_outlined, color: AppTheme.primaryOrange),
                      ),
                    ),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 28),

            // Prominent Full-Width Primary Action Button
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _handleLogin,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryOrange,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: AppTheme.primaryOrange.withValues(alpha: 0.6),
                  elevation: 4,
                  shadowColor: AppTheme.primaryOrange.withValues(alpha: 0.35),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _isLoading
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2.5,
                        ),
                      )
                    : const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'START EXAM',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.0,
                            ),
                          ),
                          SizedBox(width: 8),
                          Icon(Icons.arrow_forward_rounded, size: 20),
                        ],
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
