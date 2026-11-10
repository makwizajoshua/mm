import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/config.dart';
import 'core/session.dart';
import 'ui/home_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient(store: SecureKeyValueStore(), baseUrl: kDefaultApiUrl);
  final session = SessionController(api);
  runApp(MarketMeshApp(session: session));
  await session.start();
}
