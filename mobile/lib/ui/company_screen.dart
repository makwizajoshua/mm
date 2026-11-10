import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/session.dart';
import 'widgets.dart';

/// Shown to people who belong to more than one company.
class CompanyScreen extends StatefulWidget {
  const CompanyScreen({super.key, required this.session});

  final SessionController session;

  @override
  State<CompanyScreen> createState() => _CompanyScreenState();
}

class _CompanyScreenState extends State<CompanyScreen> {
  int? _opening;

  Future<void> _open(Company company) async {
    setState(() => _opening = company.id);
    try {
      await widget.session.selectCompany(company);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _opening = null);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Choose a company'),
          actions: [TextButton(onPressed: widget.session.signOut, child: const Text('Sign out'))],
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final company in widget.session.companies)
              Card(
                child: ListTile(
                  leading: CircleAvatar(child: Text(company.name.isEmpty ? '?' : company.name[0].toUpperCase())),
                  title: Text(company.name),
                  trailing: _opening == company.id ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.chevron_right),
                  onTap: _opening == null ? () => _open(company) : null,
                ),
              ),
          ],
        ),
      );
}
