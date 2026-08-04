import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import '../utils/uppercase_formatter.dart';
import 'exam_screen.dart';

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
      // Smooth navigation to Exam Screen
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (context) => ExamScreen(
            studentData: result.studentData!,
            sessionId: result.sessionId!,
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
      barrierDismissible: false, // Non-dismissible until student clicks Try Again
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundGrey,
      body: Center(
        child: SingleChildScrollView(
          child: Container(
            constraints: const BoxConstraints(maxWidth: 460),
            padding: const EdgeInsets.all(24.0),
            child: Card(
              elevation: 8,
              shadowColor: Colors.black.withValues(alpha: 0.12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              child: Padding(
                padding: const EdgeInsets.all(36.0),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // School Branding Logo
                      Container(
                        width: 100,
                        height: 100,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.primaryOrange.withValues(alpha: 0.2),
                              blurRadius: 16,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: ClipOval(
                          child: Image.asset(
                            'assets/school_logo.jpg',
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) {
                              return Container(
                                color: AppTheme.primaryOrange.withValues(alpha: 0.1),
                                child: const Icon(Icons.school, size: 50, color: AppTheme.primaryOrange),
                              );
                            },
                          ),
                        ),
                      ),

                      const SizedBox(height: 20),

                      // Institution Title
                      const Text(
                        'Anthony White Bridge Academy',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.darkCharcoal,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryOrange.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text(
                          'CBT PORTAL',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.primaryOrange,
                            letterSpacing: 1.2,
                          ),
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

                      // Surname Input (Forces UPPERCASE automatically)
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

                      const SizedBox(height: 16),

                      // Optional Server IP Configuration Toggle
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: () {
                            setState(() {
                              _showServerIpConfig = !_showServerIpConfig;
                            });
                          },
                          icon: Icon(
                            _showServerIpConfig ? Icons.tune : Icons.dns_outlined,
                            size: 14,
                            color: AppTheme.textSecondary,
                          ),
                          label: Text(
                            _showServerIpConfig ? 'Hide LAN Config' : 'Server Config (${_serverIpController.text})',
                            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                          ),
                        ),
                      ),

                      if (_showServerIpConfig) ...[
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _serverIpController,
                          decoration: const InputDecoration(
                            labelText: 'CBT Server IP Address',
                            hintText: 'e.g. 192.168.1.100 or 127.0.0.1',
                            prefixIcon: Icon(Icons.wifi_outlined, color: AppTheme.textSecondary),
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],

                      const SizedBox(height: 20),

                      // Start Exam Button
                      SizedBox(
                        width: double.infinity,
                        height: 54,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _handleLogin,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.primaryOrange,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor: AppTheme.primaryOrange.withValues(alpha: 0.6),
                            elevation: 4,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
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
              ),
            ),
          ),
        ),
      ),
    );
  }
}
