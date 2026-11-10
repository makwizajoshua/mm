import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/session.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.session});

  final SessionController session;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  late final TextEditingController _server = TextEditingController(text: widget.session.api.baseUrl);
  bool _busy = false;
  bool _hidePassword = true;
  late bool _showServer = widget.session.api.baseUrl.isEmpty;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _server.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_showServer) await widget.session.api.setServer(_server.text);
      await widget.session.signIn(_identifier.text, _password.text);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final notice = widget.session.notice;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: CircleAvatar(
                      radius: 28,
                      backgroundColor: scheme.primary,
                      child: Text('M', style: TextStyle(color: scheme.onPrimary, fontSize: 28, fontWeight: FontWeight.w800)),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text('MarketMesh', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text('Sign in with your employee login to start work.', style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 24),
                  if (notice != null) _Banner(notice, isError: false),
                  if (_error != null) _Banner(_error!, isError: true),
                  TextFormField(
                    controller: _identifier,
                    enabled: !_busy,
                    autofillHints: const [AutofillHints.username],
                    textInputAction: TextInputAction.next,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Username or email', prefixIcon: Icon(Icons.person_outline)),
                    validator: (value) => (value ?? '').trim().isEmpty ? 'Enter your username or email' : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _password,
                    enabled: !_busy,
                    obscureText: _hidePassword,
                    autofillHints: const [AutofillHints.password],
                    onFieldSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        tooltip: _hidePassword ? 'Show password' : 'Hide password',
                        icon: Icon(_hidePassword ? Icons.visibility : Icons.visibility_off),
                        onPressed: () => setState(() => _hidePassword = !_hidePassword),
                      ),
                    ),
                    validator: (value) => (value ?? '').isEmpty ? 'Enter your password' : null,
                  ),
                  if (_showServer) ...[
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _server,
                      enabled: !_busy,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(labelText: 'Server address', prefixIcon: Icon(Icons.dns_outlined), helperText: 'Provided by your company, e.g. https://api.example.com'),
                      validator: (value) {
                        final text = (value ?? '').trim();
                        if (text.isEmpty) return 'Enter the server address';
                        if (kRequireHttps && text.toLowerCase().startsWith('http://')) return 'Use a secure https:// address';
                        return null;
                      },
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Sign in'),
                    ),
                  ),
                  TextButton(
                    onPressed: _busy || widget.session.api.baseUrl.isEmpty ? null : () => setState(() => _showServer = !_showServer),
                    child: Text(_showServer ? 'Hide server settings' : 'Server settings'),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner(this.message, {required this.isError});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isError ? scheme.errorContainer : scheme.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(message, style: TextStyle(color: isError ? scheme.onErrorContainer : scheme.onSecondaryContainer), semanticsLabel: isError ? 'Error: $message' : message),
    );
  }
}
