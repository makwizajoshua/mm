import 'package:flutter/foundation.dart';

const String _configuredApiUrl = String.fromEnvironment('API_URL');

/// The API address baked in at build time:
/// `flutter build apk --release --dart-define=API_URL=https://api.example.com/api`
///
/// Debug builds fall back to the Android emulator's route to the host machine. A release build without
/// `API_URL` starts with no address, and the user enters their company's server on the sign-in screen.
String get kDefaultApiUrl => _configuredApiUrl.isNotEmpty ? _configuredApiUrl : (kDebugMode ? 'http://10.0.2.2:3000/api' : '');

/// Release builds only talk to servers over HTTPS; Android blocks plain HTTP for them anyway.
bool get kRequireHttps => !kDebugMode;
