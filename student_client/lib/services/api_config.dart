import 'package:flutter/foundation.dart';

class ApiConfig {
  static const String defaultPort = '3000';

  /// Normalizes and formats base API URL from server input
  static String getBaseUrl(String serverIpInput) {
    String input = serverIpInput.trim();

    // If input is empty, fallback intelligently
    if (input.isEmpty) {
      input = '127.0.0.1';
    }

    // Remove leading protocol if present
    if (input.startsWith('http://')) {
      input = input.substring(7);
    } else if (input.startsWith('https://')) {
      input = input.substring(8);
    }

    // Remove trailing slashes and /api suffix if present
    if (input.endsWith('/')) {
      input = input.substring(0, input.length - 1);
    }
    if (input.endsWith('/api')) {
      input = input.substring(0, input.length - 4);
    }

    // If no port is specified, append defaultPort
    if (!input.contains(':')) {
      input = '$input:$defaultPort';
    }

    return 'http://$input/api';
  }

  /// Builds a full API endpoint URL for a given path
  static Uri getUri(String serverIpInput, String path) {
    final base = getBaseUrl(serverIpInput);
    final cleanPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$cleanPath');
  }
}
