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

  /// Builds a full API endpoint URL for a given path with optional query parameters
  static Uri getUri(String serverIpInput, String path, {Map<String, dynamic>? queryParameters}) {
    final base = getBaseUrl(serverIpInput);
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final uri = Uri.parse('$base$cleanPath');
    if (queryParameters != null && queryParameters.isNotEmpty) {
      return uri.replace(
        queryParameters: queryParameters.map((k, v) => MapEntry(k, v.toString())),
      );
    }
    return uri;
  }
}
